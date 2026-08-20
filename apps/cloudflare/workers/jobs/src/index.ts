/**
 * Every periodic job the project runs.
 *
 * THERE IS NO `fetch` HANDLER, AND THAT IS DELIBERATE. Together with
 * `workers_dev: false` and no route in `wrangler.jsonc`, it means this Worker
 * has no hostname at all — nothing to POST to, nothing to authenticate, and
 * nothing to leave open by mistake. The sweep this replaced was a Supabase edge
 * function with `verify_jwt = false`, reachable by anyone on the internet and
 * gated by a shared secret held in two places; removing the endpoint removes
 * the whole class of question rather than answering it better.
 *
 * See `../README.md` for the format, and `job.ts` for what a job is.
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

    // Sequential rather than parallel. Nothing here runs more often than
    // hourly, one at a time keeps a shared Worker's log readable, and it keeps
    // the subrequest budget of one invocation easy to reason about. Worth
    // revisiting if two slow jobs ever share a schedule.
    for (const job of due) {
      await runJob(job, new Date(controller.scheduledTime), env)
    }
  },
}
