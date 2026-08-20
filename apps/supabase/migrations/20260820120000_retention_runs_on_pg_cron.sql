-- The retention sweep's schedule moves from GitHub Actions into Postgres.
--
-- WHAT DID NOT CHANGE: the sweep itself. `functions/retention` still reads the
-- backlog, deletes the objects from R2 and only then clears `photo_path`, and
-- that order is still the whole reason it is an edge function. What moved is
-- the clock.
--
-- WHY IT MOVED. A scheduled workflow is disabled by GitHub after sixty days of
-- repository inactivity, and nothing about that failure is loud: the sweep
-- simply stops, free accounts keep their photographs for ever, and the first
-- sign of it is a storage bill. The schedule now sits in the database it acts
-- on, where nothing outside this project can switch it off.
--
-- WHAT IT COST, because the old comment in `.github/workflows/retention.yml`
-- argued the other way and was not wrong. Three things, all mitigated here
-- rather than merely accepted:
--
--   1. A failed run no longer turns anything red. `pg_net` is asynchronous, so
--      the POST is fire-and-forget and its response is garbage collected within
--      hours. `retention_runs` is the answer: each run records its request and
--      settles the previous one's outcome, so the history outlives pg_net's.
--   2. The token would have been readable in `cron.job.command`. It is in the
--      vault instead, which is why the schedule calls a function rather than
--      doing the POST itself.
--   3. The twenty-batch drain loop cannot survive a call that cannot read its
--      own response. Hourly instead of daily replaces it: twenty-four batches
--      of five hundred a day, against a backlog that only ever happens once.
--
-- HAND-WRITTEN, and it has to be. `supabase db diff` does not track extensions
-- at all — verified: pg_cron installed locally and absent from `schemas/` still
-- diffs clean — and a cron schedule is a ROW in `cron.job`, which a diff would
-- never emit either. The table and the function below ARE structure and are
-- declared in `schemas/35_retention.sql`; they are copied here verbatim, down
-- to the comments, because Postgres stores `prosrc` as written and a body that
-- differs by a reflowed sentence is a function no migration produces.
--
-- The one thing this migration cannot do is set the secrets. See the README.

-- Outbound HTTP from inside Postgres. Already present on a local stack, absent
-- on the hosted project, which is why it is stated rather than assumed.
create extension if not exists pg_net with schema extensions;

-- The scheduler. Lands in `pg_catalog` with no `with schema` clause, creates
-- its own `cron` schema, and runs jobs only in the database named by
-- `cron.database_name` — `postgres`, here and on the hosted project.
create extension if not exists pg_cron;


-- ---------------------------------------------------------------------------
-- What each run of the sweep turned into.
--
-- THE SCHEDULE MOVED INTO THE DATABASE, AND THIS IS WHAT PAYS FOR IT. The sweep
-- used to be a GitHub Action, which had one property this does not get for
-- free: a run that failed went red and sent somebody an email. `pg_net` is
-- asynchronous — `http_post` returns an id and the answer lands in
-- `net._http_response` seconds later, long after the statement that fired it
-- has returned — so a scheduled call is fire-and-forget, and pg_net garbage
-- collects its own response table within hours. Left at that, a sweep that has
-- been refused since Tuesday would look exactly like a sweep that has been
-- working, and the one job in this project that deletes user data would be the
-- one with no history.
--
-- So each run records the request it fired, and the NEXT run writes down what
-- the last one came back as. Hourly, the previous request has always settled by
-- the time the next one starts.
--
-- `select * from public.retention_runs order by started_at desc limit 24` is
-- the whole of the monitoring, and `where error is not null or status_code <> 200`
-- is the question worth asking. It grows by 24 rows a day, which is under two
-- megabytes a year against a 500 MB ceiling, so nothing prunes it.
--
-- service_role only, RLS on with no policies, exactly as `food_scan_items` is:
-- this is the sweep's own working notes and no client has any business in it.
-- ---------------------------------------------------------------------------

create table public.retention_runs (
  id          bigint generated always as identity primary key,

  -- The `net._http_response` id this run is waiting on. Not a foreign key:
  -- pg_net owns that table and clears it out from under us, which is the whole
  -- reason this one exists.
  request_id  bigint not null,

  started_at  timestamptz not null default now(),

  -- Filled in by the FOLLOWING run. Null in the newest row is ordinary — it
  -- means the request is still in flight — and null in an older one means the
  -- response had already been garbage collected when we went looking.
  status_code integer,
  -- Text rather than jsonb on purpose. The body is the function's own JSON
  -- nearly always, but a gateway error or a timeout is HTML or nothing at all,
  -- and a cast that throws here would make the logging break the sweep.
  body        text,
  error       text,
  settled_at  timestamptz
);

create index retention_runs_started_idx on public.retention_runs (started_at desc);

alter table public.retention_runs enable row level security;

grant select, insert, update, delete on public.retention_runs to service_role;


-- ---------------------------------------------------------------------------
-- Fire one sweep, and write down what the last one did.
--
-- This is what `cron.schedule` calls, and it is the whole of the scheduler.
-- Postgres cannot reach R2 and cannot reach the edge function either, so the
-- work is still `functions/retention` and this only rings the bell.
--
-- THE CREDENTIALS COME FROM THE VAULT, NEVER FROM THIS FILE. A pg_cron job is a
-- row in `cron.job` whose `command` column is plain text readable by anything
-- with a SQL connection, so a token pasted into the schedule would be a token
-- published to every holder of `service_role`. `vault.decrypted_secrets` is the
-- one place it can sit encrypted at rest, which is why the schedule calls a
-- function rather than doing the POST itself.
--
-- IT RAISES RATHER THAN RETURNING QUIETLY when a secret is missing. A silent
-- no-op there is a sweep that stops for ever the moment somebody renames a
-- secret, with `retention_runs` simply not growing and nothing to say why; the
-- exception lands in `cron.job_run_details` with a message that names the fix.
-- A local stack with no secrets set will therefore log this once an hour, which
-- is the intended noise: see the README.
--
-- NO DRAIN LOOP, AND NONE IS NEEDED. The Action this replaced called the
-- endpoint up to twenty times in a row while it reported a backlog, because it
-- could read the response and this cannot. An hourly schedule does the same job
-- over a day instead of over a minute — 24 batches of 500 is twelve thousand
-- photographs — and a backlog that size only ever happens once.
-- ---------------------------------------------------------------------------
create or replace function public.sweep_meal_photos()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_token   text;
  v_request bigint;
begin
  -- Last run's outcome, before this one's is started. Only rows still open are
  -- touched, so a response that outlived two runs is not written twice.
  update public.retention_runs r
     set status_code = x.status_code,
         body        = pg_catalog.left(x.content, 2000),
         error       = x.error_msg,
         settled_at  = pg_catalog.now()
    from net._http_response x
   where x.id = r.request_id
     and r.settled_at is null;

  select v.decrypted_secret into v_url
    from vault.decrypted_secrets v
   where v.name = 'retention_functions_url';

  select v.decrypted_secret into v_token
    from vault.decrypted_secrets v
   where v.name = 'retention_token';

  if v_url is null or v_token is null then
    raise exception
      'sweep_meal_photos: retention_functions_url or retention_token is not in the vault'
      using hint =
        'insert them with vault.create_secret(); see apps/supabase/README.md';
  end if;

  select net.http_post(
           url     => v_url || '/retention',
           body    => '{}'::jsonb,
           headers => pg_catalog.jsonb_build_object(
                        'Content-Type',      'application/json',
                        'x-retention-token', v_token
                      ),
           -- Generous, because the endpoint deletes up to five hundred objects
           -- from R2 before it answers. pg_net gives up at this point and marks
           -- the row timed out; the sweep itself carries on server-side and its
           -- work is not lost, so a timeout here costs the log entry and
           -- nothing else.
           timeout_milliseconds => 180000
         )
    into v_request;

  insert into public.retention_runs (request_id) values (v_request);

  return v_request;
end;
$$;

revoke execute on function public.sweep_meal_photos from public, anon, authenticated;
grant execute on function public.sweep_meal_photos to service_role;


-- ---------------------------------------------------------------------------
-- The schedule itself, which is DATA and so could never have come from a diff.
--
-- `cron.schedule` upserts on the job name, so re-running this migration moves
-- the existing job rather than creating a second one that sweeps twice.
--
-- Seventeen minutes past, rather than on the hour, because every naive cron
-- entry in the world fires at :00 and the hosted database has better things to
-- do with that minute. The hour no longer matters the way it did when this ran
-- once a day and was deliberately put at 03:00 in Kuala Lumpur: a sweep is a
-- few hundred rows off a partial index and some DELETEs against R2, and it now
-- happens every hour regardless.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'sweep-meal-photos',
  '17 * * * *',
  $cron$select public.sweep_meal_photos();$cron$
);
