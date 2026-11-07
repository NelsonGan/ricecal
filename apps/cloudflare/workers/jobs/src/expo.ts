/**
 * Posting pushes to Expo, for every job that sends any.
 *
 * Pushes are posted here rather than through the groups function so a job
 * needs no endpoint and no second credential. Expo takes them without a token
 * until enhanced push security is switched on for the project, and then this
 * Worker needs `EXPO_ACCESS_TOKEN` as the groups function does.
 *
 * A chunk Expo refuses is counted as failed and not retried: the jobs that
 * send pushes mark them sent in Postgres first, so a retry would need its own
 * record of what is owed, and every push here has the app itself as a backup.
 * A job decides whether a run with failures is itself a failure.
 */
import type { Env } from './env.ts'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/** Expo's ceiling on messages in one request. */
const EXPO_CHUNK = 100

/**
 * Long enough for a slow answer, short enough that a stalled Expo cannot keep
 * an every-minute job running into the next one.
 */
const EXPO_TIMEOUT_MS = 20_000

export type PushMessage = { to: string } & Record<string, unknown>

type Ticket = { status?: string; message?: string; details?: { error?: string } }

export type PushResult = {
  sent: number
  failed: number
  /** Devices Expo says no longer have the app, for `forget_push_tokens`. */
  gone: string[]
  /**
   * Failed pushes by Expo's reason (`InvalidCredentials`, `DeviceNotRegistered`,
   * ...), `NoTicket` for one Expo's answer left out, and `Unanswered` for a
   * chunk with no usable answer at all (refused, timed out or unreadable, so
   * some may still have been delivered). Without it a refusal is only
   * a count: every Android push was refused for a week as "failed" while the
   * project had no FCM key.
   */
  refused: Record<string, number>
}

/** Expo's ticket error codes are short words; anything else is filed as one. */
function reason(ticket: Ticket | undefined): string {
  if (!ticket) return 'NoTicket'
  const code = ticket.details?.error
  return typeof code === 'string' && /^[A-Za-z]{1,40}$/.test(code) ? code : 'Other'
}

/**
 * Expo's words with any push token taken out: its DeviceNotRegistered message
 * quotes the token, and a token is all it takes to push to that phone.
 */
export function redact(text: unknown): string {
  return String(text ?? '')
    .replace(/ExponentPushToken\[[^\]]*\]/g, 'ExponentPushToken[redacted]')
    .slice(0, 200)
}

/** Adds one call's refusals into a run's running total. */
export function addRefused(into: Record<string, number>, from: Record<string, number>) {
  for (const [why, n] of Object.entries(from)) into[why] = (into[why] ?? 0) + n
}

/** The reasons as flat counts for a job's detail, which `record_job_run` sums. */
export function refusedDetail(refused: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(refused).map(([why, n]) => [`refused_${why}`, n]))
}

/** "InvalidCredentials 3, DeviceNotRegistered 1", for an error message. */
export function describeRefused(refused: Record<string, number>): string {
  return Object.entries(refused)
    .map(([why, n]) => `${why} ${n}`)
    .join(', ')
}

export async function sendPushes(env: Env, messages: PushMessage[]): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, gone: [], refused: {} }
  const refuse = (why: string, n = 1) => {
    result.failed += n
    result.refused[why] = (result.refused[why] ?? 0) + n
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`
  for (let i = 0; i < messages.length; i += EXPO_CHUNK) {
    const chunk = messages.slice(i, i + EXPO_CHUNK)
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
      })
      // Expo says why in the body (an error code such as a missing access
      // token), which is the part worth having in the log.
      if (!response.ok) {
        throw new Error(`expo push ${response.status}: ${(await response.text()).slice(0, 300)}`)
      }
      const answer = (await response.json()) as { data?: Ticket[]; errors?: unknown }
      const tickets = Array.isArray(answer?.data) ? answer.data : []
      // Expo's words, once per reason: they name the missing credential.
      const said: Record<string, string> = {}
      // A request-level refusal comes as `errors` with no tickets at all.
      if (answer?.errors) said.NoTicket = redact(JSON.stringify(answer.errors))
      chunk.forEach((message, index) => {
        const ticket = tickets[index]
        if (ticket?.status === 'ok') {
          result.sent += 1
          return
        }
        const why = reason(ticket)
        refuse(why)
        if (!(why in said)) said[why] = redact(ticket?.message)
        // A phone that uninstalled the app answers this for ever.
        if (why === 'DeviceNotRegistered') result.gone.push(message.to)
      })
      if (Object.keys(said).length > 0) {
        console.warn('[expo] pushes refused', JSON.stringify({ size: chunk.length, said }))
      }
    } catch (error) {
      refuse('Unanswered', chunk.length)
      console.error('[expo] could not post a chunk of pushes', {
        size: chunk.length,
        error: redact(error instanceof Error ? error.message : error),
      })
    }
  }
  return result
}
