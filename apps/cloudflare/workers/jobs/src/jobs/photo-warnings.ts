/**
 * The warning before the photograph sweep: a free account is pushed once a
 * window, a few days early, about the meal photos `retention` will take.
 *
 * Postgres decides who hears it and marks them warned in the same call
 * (`photo_removal_push_targets`), so a cron delivered twice pushes nobody
 * twice. The cost of that order is that a push Expo refuses is not retried;
 * the app's own notice on Today says the same thing on the next launch.
 *
 * The push is posted here rather than through the groups function so the job
 * needs no endpoint and no second credential. Expo takes it without a token
 * until enhanced push security is switched on for the project, and then this
 * Worker needs `EXPO_ACCESS_TOKEN` as the groups function does.
 */
import type { Job } from '../job.ts'
import { type WarningTarget, warningPush } from './photo-warnings-copy.ts'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/** How far ahead a warning looks, and so how often one account can get one. */
const WINDOW_DAYS = 6

/** Accounts per call. The call marks them, so the next call gets the next ones. */
const BATCH = 200

/** Expo's ceiling on messages in one request. */
const EXPO_CHUNK = 100

/** Calls in one run before stopping, with a note, as the sweep does. */
const MAX_BATCHES = 25

type Target = WarningTarget & { user_id: string }

export const photoWarnings: Job = {
  name: 'photo-warnings',
  // 03:07 UTC is 11:07 in Kuala Lumpur and Singapore, where most accounts
  // are: late enough not to wake anybody, early enough to act on that day.
  cron: '7 3 * * *',

  async run({ env, rpc, log, scheduledAt }) {
    let accounts = 0
    let sent = 0
    let failed = 0
    let batches = 0
    let drained = false

    // Where the last call stopped, so each account is read once a run.
    let after: string | null = null
    while (batches < MAX_BATCHES) {
      const targets: Target[] = await rpc<Target[]>('photo_removal_push_targets', {
        p_days: WINDOW_DAYS,
        p_limit: BATCH,
        p_after: after,
      })
      batches += 1
      if (targets.length === 0) {
        drained = true
        break
      }
      accounts += new Set(targets.map((target) => target.user_id)).size
      after = targets.reduce((last, target) => (target.user_id > last ? target.user_id : last), '')

      const messages = targets.map((target) => warningPush(target, scheduledAt))
      const gone: string[] = []
      for (let i = 0; i < messages.length; i += EXPO_CHUNK) {
        const chunk = messages.slice(i, i + EXPO_CHUNK)
        try {
          const headers: Record<string, string> = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }
          if (env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`
          const response = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(chunk),
          })
          if (!response.ok) throw new Error(`expo push ${response.status}`)
          const tickets = ((await response.json()) as { data?: TicketShape[] })?.data ?? []
          tickets.forEach((ticket, index) => {
            if (ticket?.status === 'ok') sent += 1
            else failed += 1
            // A phone that uninstalled the app answers this for ever.
            if (ticket?.details?.error === 'DeviceNotRegistered') gone.push(chunk[index].to)
          })
        } catch (error) {
          failed += chunk.length
          log('could not post a chunk of warnings', {
            size: chunk.length,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      if (gone.length > 0) await rpc('forget_push_tokens', { p_tokens: gone })
    }

    if (!drained) log('stopped with accounts still to warn; tomorrow continues', { batches })
    return { accounts, sent, failed, batches, drained }
  },
}

type TicketShape = { status?: string; details?: { error?: string } }
