/**
 * What a periodic job is, and what happens around one.
 *
 * The whole framework is this file plus `postgres.ts`. A job is a name, a cron
 * and a function; everything else — claiming the run, recording the outcome,
 * refusing to start on top of a run already going — happens here, once, for
 * all of them.
 *
 * See `../README.md` for how to add one.
 */
import type { Env } from './env.ts'
import { postgres, type Rpc } from './postgres.ts'

/**
 * Whatever the job wants remembered in `job_runs.detail`. Shapeless on
 * purpose: it is read by a person running a query, not by code.
 */
export type JobDetail = Record<string, unknown>

export type JobContext = {
  env: Env

  /** Postgres, RPCs only. See `postgres.ts` for why that is the whole surface. */
  rpc: Rpc

  /** A log line, prefixed with the job's name so a shared Worker stays readable. */
  log: (message: string, fields?: Record<string, unknown>) => void

  /**
   * When this run was SCHEDULED, from `controller.scheduledTime`.
   *
   * Prefer it over `Date.now()` for anything a job writes down or decides on:
   * a retry of a failed invocation carries the original scheduled time, so a
   * job that reads the clock instead will disagree with itself about which run
   * it is.
   */
  scheduledAt: Date
}

export type Job = {
  /**
   * Stable identifier, written to `job_runs.job`.
   *
   * Renaming it does not move the history, it orphans it — the old rows keep
   * the old name and the monitoring query stops finding them. Treat it as a
   * key rather than a label.
   */
  name: string

  /**
   * The UTC cron expression, which MUST also appear in `wrangler.jsonc`'s
   * `triggers.crons`. `scripts/check-crons.mjs` fails the typecheck if it does
   * not, because the failure it prevents is silent and permanent.
   */
  cron: string

  /**
   * How long this run may be considered in flight before another is allowed to
   * start. Defaults to Cloudflare's own wall-clock ceiling for a cron-triggered
   * Worker, so a run cannot outlive its lease. Only worth setting for a job
   * that is deliberately shorter and wants a tighter guard.
   */
  leaseSeconds?: number

  /**
   * A job MUST BE IDEMPOTENT. Cron delivery is at-least-once and Cloudflare
   * retries an invocation that threw, so "did this already happen" is a
   * question every job has to be able to answer with a shrug. `claim_job_run`
   * is a guard in front of that, not a substitute for it.
   *
   * The detail is REQUIRED rather than optional, so that every closed run in
   * `job_runs` says what it did. A null there would be ambiguous in exactly the
   * case it matters — a job that ran and found nothing reads identically to one
   * that forgot to say. A job with genuinely nothing to report returns `{}`.
   */
  run(ctx: JobContext): Promise<JobDetail>
}

/** Cloudflare's wall-clock ceiling for a cron-triggered Worker. */
const DEFAULT_LEASE_SECONDS = 900

/**
 * Claim, run, record. The one place a job's outcome is written down.
 *
 * IT RETHROWS. A caught-and-swallowed failure would be visible only in
 * `job_runs`, and a job that breaks in a way that also stops it writing there
 * would then be invisible everywhere. Thrown, the invocation is marked failed
 * in Cloudflare's Cron Events as well, so there are two independent places a
 * broken job shows up — and the retry that earns is safe, because idempotence
 * is a requirement of being a job at all.
 */
export async function runJob(job: Job, scheduledAt: Date, env: Env): Promise<void> {
  const rpc = postgres(env)
  const log: JobContext['log'] = (message, fields) => {
    if (fields) console.log(`[${job.name}] ${message}`, JSON.stringify(fields))
    else console.log(`[${job.name}] ${message}`)
  }

  const runId = await rpc<number | null>('claim_job_run', {
    p_job: job.name,
    p_lease_seconds: job.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
  })

  // Refused, which is an ordinary answer rather than a failure: a previous run
  // is still going, or died without closing its row and its lease has not run
  // out yet. Either way this delivery has nothing to do.
  if (runId === null) {
    log('a run is already in flight, skipping this one')
    return
  }

  try {
    const detail = await job.run({ env, rpc, log, scheduledAt })
    await rpc('finish_job_run', { p_id: runId, p_ok: true, p_detail: detail })
    log('done', detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Recorded before the rethrow, and its own failure is swallowed: if
    // Postgres is what broke, the original error is the one worth keeping and
    // a second exception here would replace it with the wrong story.
    await rpc('finish_job_run', { p_id: runId, p_ok: false, p_error: message }).catch(
      (recordError: unknown) =>
        console.error(`[${job.name}] could not record the failure:`, recordError),
    )
    throw error
  }
}
