import type { Job } from '../job.ts'

const BATCH = 1000
const MAX_BATCHES = 20

type PrunedHours = { pruned: number; before: string; remaining: boolean }

/** Daily totals and workouts keep history; only the recent hourly shape expires. */
export const activityHours: Job = {
  name: 'activity-hours-retention',
  cron: '37 * * * *',

  async run({ rpc, log, scheduledAt }) {
    let pruned = 0
    let batches = 0
    let before: string | null = null
    let drained = false

    while (batches < MAX_BATCHES) {
      const result = await rpc<PrunedHours>('prune_activity_hours', {
        p_asof: scheduledAt.toISOString(),
        p_limit: BATCH,
      })
      pruned += result.pruned
      before = result.before
      batches += 1
      if (!result.remaining) {
        drained = true
        break
      }
      // SKIP LOCKED can leave a full backlog while another transaction owns
      // it. Do not spin on it or call a zero-row batch an empty table.
      if (result.pruned === 0) break
    }

    // A cap or a locked row leaves work for the next hour. Never report a cap
    // as a completed sweep; the run detail is how a growing backlog is noticed.
    if (!drained) log('expired hours remain; the next run continues', { pruned, batches, before })
    return { pruned, batches, before, drained }
  },
}
