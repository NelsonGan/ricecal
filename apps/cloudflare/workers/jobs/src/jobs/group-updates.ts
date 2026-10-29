/**
 * The food and workout update pushes, every minute.
 *
 * Postgres decides everything in one call (`group_update_digests`): who hears
 * which share, at most once a quarter hour, never at night, and it moves their
 * cursor in the same statement, so a run delivered twice sends nothing twice.
 * This only words and posts what it returns. See
 * `apps/supabase/schemas/98_group_update_pushes.sql` for the rules and why the
 * server rather than the poster's app sends these.
 *
 * Recorded only when it did something: a minute with nothing to say writes no
 * `job_runs` row (`record: 'when-busy'`).
 */
import { sendPushes } from '../expo.ts'
import type { Job } from '../job.ts'
import { type UpdateTarget, updatePush } from './group-updates-copy.ts'

export const groupUpdates: Job = {
  name: 'group-updates',
  cron: '* * * * *',
  record: 'when-busy',

  async run({ env, rpc, log }) {
    const targets = await rpc<UpdateTarget[]>('group_update_digests')
    if (targets.length === 0) return {}
    const pushed = await sendPushes(env, targets.map(updatePush), log)
    if (pushed.gone.length > 0) await rpc('forget_push_tokens', { p_tokens: pushed.gone })
    return { devices: targets.length, sent: pushed.sent, failed: pushed.failed }
  },
}
