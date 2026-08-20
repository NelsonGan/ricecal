-- ---------------------------------------------------------------------------
-- What each run of a periodic job turned into.
--
-- THE JOBS THEMSELVES ARE NOT HERE, AND THAT IS THE POINT. They are Cloudflare
-- Workers on Cron Triggers, in `apps/cloudflare/workers/jobs`. Postgres owns
-- the numbers and the rules; a job is the part that has to reach something
-- Postgres cannot — R2, a third party, an object store — and it reads and
-- writes here through `service_role` RPCs and nothing else.
--
-- THIS REPLACES `retention_runs`, WHICH EXISTED FOR A REASON THAT IS GONE. The
-- sweep used to be `pg_cron` calling an edge function over `pg_net`, which is
-- fire and forget: the POST returned a request id, the answer landed in
-- `net._http_response` seconds later, and pg_net garbage collected it within
-- hours. So a run could not know its own outcome, and the following run had to
-- go and read what the last one came back as. A Worker runs the job itself, so
-- it simply knows: it claims a row before it starts and closes the same row
-- when it finishes.
--
-- WHY A TABLE AT ALL, when Cloudflare has Workers Logs. Three things it buys.
-- The history outlives whatever Cloudflare's log retention turns out to be; it
-- is queryable next to the data the job acted on, so "did the sweep run" and
-- "what did it delete" are one query rather than two systems; and the claim
-- below is the overlap guard, which needs somewhere durable to write.
--
-- Nothing prunes it, for the reason written on `retention_runs` before it: a
-- few dozen rows a day is under two megabytes a year against a 500 MB ceiling,
-- and a pruning job would be a scheduled task whose only purpose is tidying up
-- after the scheduled tasks.
--
-- `service_role` only, RLS on with no policies, exactly as `food_scan_items`
-- is: this is the scheduler's own working notes and no client has any business
-- in it.
-- ---------------------------------------------------------------------------

create table public.job_runs (
  id          bigint generated always as identity primary key,

  -- The job's stable name, from its `name` in the Worker's registry. Renaming
  -- one there orphans its history here rather than moving it, which is why the
  -- field is documented as stable on both sides.
  job         text not null,

  started_at  timestamptz not null default now(),

  -- Null means IN FLIGHT, and the claim below reads it that way. Null on an
  -- old row therefore means a run that died without closing its own record —
  -- the isolate was evicted, the job threw past its own handler, Cloudflare
  -- gave up on it. That is a run to look at, and it is deliberately
  -- distinguishable from one that finished badly (`ok = false`).
  finished_at timestamptz,
  ok          boolean,

  -- Whatever the job wants remembered: `{"swept": 412, "batches": 1} `for the
  -- retention sweep. Shapeless on purpose — the alternative is a column per
  -- job, on a table that is meant to take a second job without a migration.
  detail      jsonb,

  -- Text rather than jsonb, and truncated by `finish_job_run`. An error here
  -- is whatever was thrown, which is a message nearly always and occasionally
  -- a wall of HTML from something upstream; a cast that threw would make the
  -- logging break the job it was logging.
  error       text
);

create index job_runs_job_started_idx on public.job_runs (job, started_at desc);

alter table public.job_runs enable row level security;

grant select, insert, update, delete on public.job_runs to service_role;

-- ---------------------------------------------------------------------------
-- Start a run, or refuse because one is already going.
--
-- CRON DELIVERY IS AT-LEAST-ONCE. Cloudflare says so plainly, and it also
-- retries an invocation that threw — so the same job can be started twice, and
-- two copies of a sweep racing over the same batch is at best wasted work and
-- at worst two jobs disagreeing about what they have already done. Every job
-- in this system is required to be idempotent regardless, because that
-- requirement is the only thing that makes a retry safe at all; this function
-- is the cheaper guard in front of it.
--
-- ATOMIC, in the same sense and for the same reason `claim_scan` is. Written
-- as a check and then an insert, two deliveries arriving together both find no
-- run in flight and both insert, which is precisely the case the function
-- exists for. The advisory lock is per JOB NAME and lasts the transaction, so
-- claims for one job serialise and claims for different jobs never wait on
-- each other.
--
-- THE LEASE IS WHAT STOPS A DEAD RUN BLOCKING FOR EVER. A run that never
-- closes its row would otherwise refuse every future claim, and the failure
-- would look like the job silently stopping — the worst shape a scheduled task
-- can fail in. So "in flight" is bounded: past the lease, the old row is left
-- exactly as it is, as evidence, and a new run is allowed to start. The
-- default is fifteen minutes, which is the wall-clock ceiling Cloudflare gives
-- a cron-triggered Worker, so a run cannot outlive its own lease.
--
-- Returns null rather than raising. A refusal here is an ordinary answer — the
-- Worker logs it and stops — and nothing about it is an error worth waking up
-- to.
-- ---------------------------------------------------------------------------
create or replace function public.claim_job_run(
  p_job           text,
  p_lease_seconds integer default 900
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_job));

  -- `greatest` is a parser CONSTRUCT rather than a catalog function, so it
  -- cannot be schema-qualified under `search_path = ''` — and needs no
  -- qualification, there being no schema it could be shadowed from. The floor
  -- of one second is so that a caller passing zero does not turn the lease
  -- into "anything started before now", which is every row.
  if exists (
    select 1
      from public.job_runs r
     where r.job = p_job
       and r.finished_at is null
       and r.started_at > pg_catalog.now()
             - pg_catalog.make_interval(secs => greatest(p_lease_seconds, 1))
  ) then
    return null;
  end if;

  insert into public.job_runs (job) values (p_job) returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.claim_job_run from public, anon, authenticated;
grant execute on function public.claim_job_run to service_role;

-- ---------------------------------------------------------------------------
-- Close a run, with what it did or what went wrong.
--
-- `and finished_at is null` so that a late second call cannot rewrite an
-- outcome already recorded — a job that finishes, is retried by Cloudflare and
-- finishes again holds two ids and closes each once.
-- ---------------------------------------------------------------------------
create or replace function public.finish_job_run(
  p_id     bigint,
  p_ok     boolean,
  p_detail jsonb default null,
  p_error  text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.job_runs
     set finished_at = pg_catalog.now(),
         ok          = p_ok,
         detail      = p_detail,
         error       = pg_catalog.left(p_error, 2000)
   where id = p_id
     and finished_at is null;
$$;

revoke execute on function public.finish_job_run from public, anon, authenticated;
grant execute on function public.finish_job_run to service_role;
