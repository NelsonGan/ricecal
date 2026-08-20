-- ---------------------------------------------------------------------------
-- The periodic-job run ledger, and the claim that stops two runs overlapping.
--
-- The jobs themselves are Cloudflare Workers on Cron Triggers, so nothing here
-- can exercise one. What Postgres owns is the record and the guard, and both
-- have a failure mode worth pinning down.
--
-- The claim is the interesting half. Cron delivery is at-least-once and
-- Cloudflare retries a failed invocation, so a job genuinely can be started
-- twice; but a guard written as "refuse while a run is unfinished" turns one
-- crashed run into a job that never runs again, which is the worst way a
-- scheduled task can fail. The lease is what bounds that, and the last pair of
-- assertions is the one that matters.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

-- -- GRANTS ------------------------------------------------------------------
-- This is the scheduler's own working notes. No client has any business in it,
-- and a client that could call `finish_job_run` could write a sweep's history.

select ok(
  not has_table_privilege('authenticated', 'public.job_runs', 'SELECT')
  and not has_table_privilege('authenticated', 'public.job_runs', 'INSERT')
  and not has_table_privilege('authenticated', 'public.job_runs', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.job_runs', 'DELETE'),
  'a signed-in user cannot touch job_runs at all'
);

select ok(
  (select relrowsecurity
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'job_runs'),
  'job_runs has row level security on'
);

select ok(
  not (select bool_or(pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('claim_job_run', 'finish_job_run')),
  'neither claim_job_run nor finish_job_run is executable by a signed-in user'
);

select ok(
  not (select bool_or(pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('claim_job_run', 'finish_job_run')),
  'and PUBLIC has no execute right on either'
);

-- -- CLAIMING ----------------------------------------------------------------

select isnt(
  public.claim_job_run('test-job'),
  null,
  'the first claim of a job returns a run id'
);

select is(
  public.claim_job_run('test-job'),
  null,
  'a second claim is refused while the first run is still in flight'
);

-- A different job is not blocked by this one. The advisory lock is taken on the
-- job NAME, so claims for unrelated jobs never wait on each other, and one slow
-- job cannot stop the rest of the schedule.
select isnt(
  public.claim_job_run('other-job'),
  null,
  'while a different job may start regardless'
);

-- -- THE LEASE ---------------------------------------------------------------
-- A run that died without closing its row must not block its job for ever. Age
-- the in-flight row past the lease and the next claim has to succeed, leaving
-- the old row exactly as it is, as evidence.

update public.job_runs
   set started_at = now() - interval '31 minutes'
 where job = 'test-job' and finished_at is null;

select isnt(
  public.claim_job_run('test-job', 900),
  null,
  'a run whose lease has passed no longer blocks the next one'
);

-- -- FINISHING ---------------------------------------------------------------
-- `finish_job_run` closes only an OPEN row, so a late second call cannot
-- rewrite an outcome already recorded.

-- In a DO block rather than a chain of CTEs. Every CTE in one statement reads
-- the same snapshot, so a `select` beside the writes sees the row as it was
-- before either of them — which reads exactly like the function having done
-- nothing, and cost a confident wrong assertion once already.
do $$
declare
  v_id bigint;
begin
  v_id := public.claim_job_run('finish-me');
  perform public.finish_job_run(v_id, true, '{"swept": 3}'::jsonb);
  perform public.finish_job_run(v_id, false, null, 'too late');
end $$;

select is(
  (select r.ok and r.error is null and r.detail is not null
     from public.job_runs r
    where r.job = 'finish-me'),
  true,
  'a finished run keeps its first outcome when it is closed again'
);

select * from finish();

rollback;
