/**
 * The warning before the photograph sweep: a free account is pushed once a
 * window, a few days early, about the meal photos `retention` will take.
 *
 * Postgres decides who hears it and marks them warned in the same call
 * (`photo_removal_push_targets`), so a cron delivered twice pushes nobody
 * twice. The cost of that order is that a push Expo refuses is not retried;
 * the app's own notice on Today says the same thing on the next launch.
 */
import { sendPushes } from '../expo.ts'
import type { Job } from '../job.ts'
import { type WarningTarget, warningPush } from './photo-warnings-copy.ts'

/** How far ahead a warning looks, and so how often one account can get one. */
const WINDOW_DAYS = 6

/** Accounts per call. The call marks them, so the next call gets the next ones. */
const BATCH = 200

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

      const pushed = await sendPushes(
        env,
        targets.map((target) => warningPush(target, scheduledAt)),
        log,
      )
      sent += pushed.sent
      failed += pushed.failed
      if (pushed.gone.length > 0) await rpc('forget_push_tokens', { p_tokens: pushed.gone })
    }

    if (!drained) log('stopped with accounts still to warn; tomorrow continues', { batches })
    return { accounts, sent, failed, batches, drained }
  },
}
