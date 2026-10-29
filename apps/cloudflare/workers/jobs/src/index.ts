/**
 * Every periodic job the project runs.
 *
 * There is deliberately no `fetch` handler. With `workers_dev: false` and no
 * route in `wrangler.jsonc`, this Worker has no hostname at all: nothing to POST
 * to, nothing to authenticate, nothing to leave open by mistake. The sweep it
 * replaced was an edge function with `verify_jwt = false`, reachable by anyone
 * and gated by a shared secret held in two places.
 *
 * See the root `README.md` for the format, and `job.ts` for what a job is.
 */
import type { Env } from './env.ts'
import { runJob } from './job.ts'
import { JOBS } from './jobs/index.ts'

export default {
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const due = JOBS.filter((job) => job.cron === controller.cron)

    // A cron registered in `wrangler.jsonc` that no job claims. Harmless in
    // itself, but it is half of the failure this design has to guard against —
    // the other half, a job whose cron was never registered, is invisible at
    // runtime and is caught by `scripts/check-crons.mjs` instead.
    if (due.length === 0) {
      console.error(`[jobs] no job is registered for cron "${controller.cron}"`)
      return
    }

    // Sequential rather than parallel. Each cron is its own invocation, and
    // only `group-updates` runs every minute, so jobs that share one are the
    // slow hourly and daily ones; one at a time keeps the log readable and the
    // subrequest budget of one invocation easy to reason about. Worth
    // revisiting if two slow jobs ever share a schedule.
    for (const job of due) {
      await runJob(job, new Date(controller.scheduledTime), env)
    }
  },
}
