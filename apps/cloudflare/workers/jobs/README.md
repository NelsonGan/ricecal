# Periodic jobs

Everything this project does on a schedule. One Worker, one job per file, woken
by Cloudflare Cron Triggers.

```
src/
  index.ts        the dispatcher: scheduled() → the jobs whose cron just fired
  job.ts          what a job IS, and the claim → run → record wrapper
  postgres.ts     the only way a job talks to Postgres
  env.ts          bindings, vars and the one secret
  jobs/
    index.ts      the registry
    retention.ts  the photograph sweep
scripts/
  check-crons.mjs the registry and wrangler.jsonc must agree
```

## Why this is not a Supabase edge function

Because a Supabase edge function is a public URL and a scheduled job does not
need one.

The retention sweep lived there until it moved here, on `pg_cron` calling it
over `pg_net`. It had `verify_jwt = false` — it has no user to authenticate, it
runs across every account — so the platform checked nothing, and the only thing
between the open internet and a batch of R2 deletes was a shared secret held in
two places that had to be rotated together. Everything else about that design
existed to prop the arrangement up: the secret in the vault (because
`cron.job.command` is plain text), the `retention_runs` table (because a
fire-and-forget POST cannot read its own answer), and a drain loop that had to
be abandoned for the same reason.

A `scheduled()` handler has no route. With `workers_dev: false` and no
`routes`, this Worker has no hostname at all, so there is nothing to POST to
and no secret to protect it with. R2 is a binding rather than four credentials.
And the job knows its own outcome, so recording a run is one call at the end
rather than a note for the next hour to pick up.

## Adding a job

Three things, and the tooling shouts if you forget the third.

**1. A file in `src/jobs/`.**

```ts
import type { Job } from '../job.ts'

export const digest: Job = {
  name: 'weekly-digest',      // stable: it is the key in job_runs.job
  cron: '0 2 * * MON',        // UTC
  async run({ rpc, log, scheduledAt }) {
    const sent = await rpc<number>('send_weekly_digests', { p_asof: scheduledAt })
    log('sent', { sent })
    return { sent }           // lands in job_runs.detail
  },
}
```

**2. A line in `src/jobs/index.ts`.**

```ts
export const JOBS: Job[] = [retention, digest]
```

**3. The cron in `wrangler.jsonc`.**

```jsonc
"triggers": { "crons": ["17 * * * *", "0 2 * * MON"] }
```

No new package, no new secret, no workflow edit — `cloudflare.yml` discovers
Workers by globbing `apps/cloudflare/workers/*`, so this directory deploys
itself on a merge to `main`.

## The three rules

**A job reaches Postgres through `service_role` RPCs, and nothing else.**
`postgres.ts` gives a job `rpc()` and no table access, so the SQL has to live in
`apps/supabase/schemas` where it is granted deliberately, tested by pgTAP, and
covered by the grant checks the `migrations` workflow runs. It also keeps the
division the project already draws: Postgres owns the numbers and the rules, and
a job is the part that has to reach something Postgres cannot.

**A job must be idempotent.** Cron delivery is at-least-once, and Cloudflare
retries an invocation that threw. `claim_job_run` is a guard in front of that,
not a replacement for it — a lease can expire while a run is genuinely still
going. Ask "what happens if this runs twice" before writing anything down.

**A job's cron must be in `wrangler.jsonc`.** The silent failure of this whole
design is a job that is never delivered to: no error, no log, no run, for ever.
`check-crons.mjs` runs inside `pnpm typecheck` and compares the registry against
the config in both directions.

## What the runtime does for you

`runJob` in `job.ts` wraps every job:

1. `claim_job_run(name, leaseSeconds)` — returns null if a run is already in
   flight, in which case this delivery does nothing and says so.
2. the job runs, with `{ env, rpc, log, scheduledAt }`.
3. `finish_job_run(id, ok, detail, error)`.

A failure is recorded **and rethrown**. Thrown, it also marks the invocation
failed in Cloudflare's Cron Events, so a broken job shows up in two independent
places rather than only in a table it may have been unable to write to.

Prefer `scheduledAt` over `Date.now()`. A retried invocation carries the
original scheduled time, so a job reading the clock will disagree with itself
about which run it is.

## Limits worth knowing

| | |
|---|---|
| CPU, cron interval ≥ 1 hour | 15 min |
| CPU, cron interval < 1 hour | 30 s |
| Wall clock | 15 min |
| Subrequests per invocation (paid) | 10,000 — **binding calls count**, so each `R2.delete()`, `KV.get()` and `D1` query is one |
| Cron triggers | 250 per **account** on paid, 5 on free |
| Propagation after a deploy | up to 15 min |

Two traps in there. Moving a job from hourly to half-hourly cuts its CPU
ceiling by thirty times. And `R2.delete()` takes an **array** — one subrequest
for up to 1,000 keys, against one per key if you loop.

`placement: { mode: "smart" }` means something different on a cron Worker than
it does on the catalogue's: it enables Green Compute, which may delay a run by
up to 24 hours. Do not copy that block across.

## Running one locally

```sh
pnpm exec wrangler dev
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=17+*+*+*+*"
```

Spaces in the cron are `+`. `wrangler dev` binds a **simulated** R2 bucket, so a
local run cannot touch real objects. Point it at the local Supabase stack with a
gitignored `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<the local service role key from `supabase status`>
```

## Monitoring

One query, and it is the whole of it:

```sql
select job, started_at, finished_at, ok, error, detail
  from public.job_runs
 order by started_at desc
 limit 24;
```

Worth looking at: `ok = false`; a null `finished_at` on anything but the newest
row, which is a run that died without closing its own record; or a gap wider
than the job's own interval. Workers Logs and the Cron Events tab are the second
signal, and they are independent of Postgres being reachable at all.

## Secrets

One, set by hand, once per environment:

```sh
pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

It bypasses RLS, which is what a job needs and why `postgres.ts` narrows what
can be done with it. `SUPABASE_URL` is a `var` in `wrangler.jsonc` — it is
public.
