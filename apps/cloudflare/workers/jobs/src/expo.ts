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
 */
import type { Env } from './env.ts'
import type { JobContext } from './job.ts'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/** Expo's ceiling on messages in one request. */
const EXPO_CHUNK = 100

export type PushMessage = { to: string } & Record<string, unknown>

type Ticket = { status?: string; details?: { error?: string } }

export type PushResult = {
  sent: number
  failed: number
  /** Devices Expo says no longer have the app, for `forget_push_tokens`. */
  gone: string[]
}

export async function sendPushes(
  env: Env,
  messages: PushMessage[],
  log: JobContext['log'],
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, gone: [] }
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
      })
      if (!response.ok) throw new Error(`expo push ${response.status}`)
      const tickets = ((await response.json()) as { data?: Ticket[] })?.data ?? []
      chunk.forEach((message, index) => {
        const ticket = tickets[index]
        if (ticket?.status === 'ok') result.sent += 1
        else result.failed += 1
        // A phone that uninstalled the app answers this for ever.
        if (ticket?.details?.error === 'DeviceNotRegistered') result.gone.push(message.to)
      })
    } catch (error) {
      result.failed += chunk.length
      log('could not post a chunk of pushes', {
        size: chunk.length,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}
