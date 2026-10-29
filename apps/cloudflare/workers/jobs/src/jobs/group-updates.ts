/**
 * The food and workout update pushes, every minute.
 *
 * Postgres decides everything (`group_update_digests`): who hears which share,
 * at most once every ten minutes, never at night, and it moves what they have
 * been told in the same statement, so a run delivered twice sends nothing
 * twice. This words and posts what it returns, a page at a time, since
 * PostgREST caps an answer at 1,000 rows. See
 * `apps/supabase/schemas/98_group_update_pushes.sql` for the rules and why the
 * server rather than the poster's app sends these.
 *
 * Recorded by the hour (`record: 'hourly'`), not a row a minute.
 */
import { sendPushes } from '../expo.ts'
import type { Job } from '../job.ts'
import { type UpdateTarget, updatePush } from './group-updates-copy.ts'

/** People per call. A person has at most ten devices, so a page stays under 1,000 rows. */
const PAGE = 90

/** Pages in one run. The rest wait a minute; what is owed stays owed for an hour. */
const MAX_PAGES = 10

export const groupUpdates: Job = {
  name: 'group-updates',
  cron: '* * * * *',
  record: 'hourly',

  async run({ env, rpc }) {
    let people = 0
    let devices = 0
    let sent = 0
    let failed = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const targets = await rpc<UpdateTarget[]>('group_update_digests', { p_limit: PAGE })
      const due = new Set(targets.map((target) => target.user_id)).size
      if (targets.length > 0) {
        const pushed = await sendPushes(env, targets.map(updatePush))
        if (pushed.gone.length > 0) await rpc('forget_push_tokens', { p_tokens: pushed.gone })
        people += due
        devices += targets.length
        sent += pushed.sent
        failed += pushed.failed
      }
      if (due < PAGE) break
    }
    // Every push refused is Expo down or the token missing: a failure, so it
    // shows in Cron Events and as a failed hour in `job_runs`, not as a quiet
    // count in a successful one.
    if (failed > 0 && sent === 0) {
      throw new Error(`expo refused all ${failed} update pushes`)
    }
    return { people, devices, sent, failed }
  },
}
