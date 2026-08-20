-- ---------------------------------------------------------------------------
-- What a free account's photographs are kept for.
--
-- THIRTY DAYS, AND ONLY THE PICTURE. The entry stays for ever: its name, its
-- macros, its portion and its place in the diary are what a calorie history
-- IS, and an app that deleted those would be deleting the user's record of
-- their own year. What goes is the plate — the one part of an entry that costs
-- a real amount to store, that nobody scrolls back to, and that the model has
-- already finished reading.
--
-- Pro keeps every photograph. That is the offer, and it is the one line of the
-- comparison table that cannot be walked back later: a promise about what is
-- kept becomes false retroactively the moment it is narrowed, so the free
-- window is written down here and in `packages/shared` and nowhere else.
--
-- THE WORK LIVES IN AN EDGE FUNCTION, AND ONLY THE CLOCK LIVES HERE. Postgres
-- cannot reach R2, and a row whose `photo_path` was nulled by a statement that
-- could not delete the object would leave the bytes behind for good — the key
-- is the only name they have. So `functions/retention` reads the keys, deletes
-- the objects, and only then clears the column; a failure anywhere in that
-- leaves the row intact and the next run picks it up again. See the function.
--
-- What Postgres does own is WHEN. `sweep_meal_photos()` at the foot of this
-- file is what `pg_cron` calls every hour, and `retention_runs` beside it is
-- the history that a fire-and-forget POST would otherwise not have. This was a
-- GitHub Action until it moved here, and the trade is written down on both.
-- ---------------------------------------------------------------------------

create or replace function public.free_photo_retention_days()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 30;
$$;

revoke execute on function public.free_photo_retention_days from public, anon;
grant execute on function public.free_photo_retention_days to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- How long a LAPSED subscriber is left alone before the sweep touches anything
-- of theirs. Sixty days, which is twice the free window on purpose.
--
-- NOT part of the `free_*` family, and deliberately named apart from it. Those
-- three say what the free tier GETS; this one says what somebody who used to
-- pay is spared, and it applies to an account the free rules would otherwise
-- already cover. Somebody who has never subscribed has no grace to be given.
--
-- WHY A GRACE PERIOD AT ALL. A subscription ends for reasons that are not a
-- decision: a card expires, a renewal webhook is lost past RevenueCat's
-- retries, a support cancellation lands early. The account reads as free the
-- same day either way, and the first thing that happens to a former subscriber
-- should not be the deletion of their photographs. Sixty days is long enough
-- for a failed payment to be noticed and fixed, and for a wrongly dropped
-- webhook to be repaired by `reconcileEntitlement` on their next request.
--
-- The cliff it leaves is bounded and worth naming: at expiry plus sixty, the
-- post-expiry photographs that are already over thirty days old go in one
-- batch, which is at most a month of them. That is a far smaller version of
-- the failure the paid-era condition below exists to prevent, and it is the
-- price of a grace period having an end at all.
-- ---------------------------------------------------------------------------
create or replace function public.lapsed_photo_grace_days()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 60;
$$;

revoke execute on function public.lapsed_photo_grace_days from public, anon;
grant execute on function public.lapsed_photo_grace_days to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Photographs that are past the free window, oldest first.
--
-- BY `logged_at`, not by `log_date`. The two answer different questions and
-- only one of them is about elapsed time: `log_date` is which day an entry
-- counts towards and a user may set it to anything they like, so a meal
-- back-dated to last year would be swept the moment it was written. `logged_at`
-- is when the row actually happened, which is the only honest basis for "we
-- kept this for thirty days".
--
-- WHAT WAS PAID FOR STAYS PAID FOR, and the second date condition is what makes
-- that true rather than merely claimed. Entitlement is checked per row at sweep
-- time, so a lapsed subscription would otherwise hand the sweep a year of
-- somebody's photographs on the night it lapsed — every one of them older than
-- thirty days, all deleted at once, unrecoverable. The ugliest version of it is
-- the one where the user has done nothing at all: a renewal webhook lost past
-- RevenueCat's retries leaves a paying account reading as expired, which
-- CLAUDE.md records as having actually happened.
--
-- So the window is bounded at BOTH ends: a photograph is swept only if it was
-- logged AFTER the last paid period ended, which is what "they age out from
-- then on like anybody else's" actually requires. `current_period_end` is null
-- for an account that never subscribed — coalesced to -infinity, so all of
-- their photographs are in scope, which is right — and it is the end of the
-- last period for everybody else, whether that was yesterday or two years ago.
--
-- What it costs is that a lapsed subscriber's Pro-era plates are kept for ever,
-- at our expense. That is the correct side to be wrong on: the alternative is
-- deleting the photographs of somebody who paid for them to be kept, on the
-- evidence of a webhook that may simply not have arrived.
--
-- AND A THIRD CONDITION, WHICH IS THE GRACE PERIOD. The two above still let the
-- sweep start on a former subscriber the day after they lapse — on the
-- photographs they logged since, which by then can already be a month old. So
-- nothing of theirs is touched until their last paid period ended more than
-- `lapsed_photo_grace_days()` ago. Written as one comparison rather than as a
-- branch on "did they ever subscribe": `-infinity` is less than every date, so
-- an account that never paid passes it unconditionally and is swept on the
-- thirty day rule alone, which is right.
--
-- `security definer` and `service_role` only: it reads across every account,
-- which is exactly what no client may do.
-- ---------------------------------------------------------------------------
create or replace function public.expired_meal_photos(p_limit integer default 500)
returns table (
  id         uuid,
  photo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.photo_path
    from public.food_logs f
    left join public.subscriptions s on s.user_id = f.user_id
   where f.photo_path is not null
     and f.logged_at < now() - pg_catalog.make_interval(
           days => public.free_photo_retention_days()
         )
     and not public.is_entitled(f.user_id)
     -- Logged AFTER the paid period ended. See the note above: without this,
     -- a lapsed subscription hands the sweep every photograph the account ever
     -- took, on the night it lapses.
     and f.logged_at > coalesce(s.current_period_end, '-infinity'::timestamptz)
     -- And the grace period: that period must ALSO be more than sixty days
     -- gone. Null coalesces to -infinity, so an account that never subscribed
     -- has nothing to wait for.
     and coalesce(s.current_period_end, '-infinity'::timestamptz)
           < now() - pg_catalog.make_interval(
               days => public.lapsed_photo_grace_days()
             )
   order by f.logged_at
   -- `least`/`greatest` are parser CONSTRUCTS rather than catalog functions, so
   -- they cannot be schema-qualified: `pg_catalog.greatest(...)` is a "function
   -- does not exist" error even though the bare form resolves fine under
   -- `search_path = ''`. They need no qualification for the reason the prefix
   -- exists elsewhere in this file — there is no schema they could be shadowed
   -- from.
   limit least(greatest(p_limit, 1), 1000);
$$;

revoke execute on function public.expired_meal_photos from public, anon, authenticated;
grant execute on function public.expired_meal_photos to service_role;

-- The sweep's own index, and the only reason it exists. `food_logs` grows for
-- ever and only a small and shrinking part of it carries a photograph, so a
-- partial index over exactly those rows keeps a daily scan proportional to the
-- pictures rather than to the diary. Declared beside the query that needs it
-- rather than with the table, because it is not part of what an entry is.
create index if not exists food_logs_photo_sweep_idx
  on public.food_logs (logged_at)
  where photo_path is not null;

-- ---------------------------------------------------------------------------
-- Forget the photographs whose objects have just been deleted, and leave a
-- drawing where each one was.
--
-- THE ROW MUST NOT GO BLANK. An entry with no photograph and no icon draws the
-- placeholder tile, so a swept month of snapped meals would turn into a column
-- of identical grey squares — which reads as the app having lost the diary
-- rather than as a picture having aged out. `icon-match.ts` already maps a dish
-- name onto one of the app's illustrations for the barcode path, and the caller
-- runs the entry's own name through it, so most rows come back with the drawing
-- a typed meal would have been given in the first place. A name it cannot place
-- passes null and keeps the placeholder, which is the honest answer.
--
-- Takes ids rather than keys because an id is what an entry is, and two entries
-- have never shared a key — `newKey` mints a uuid per upload and nothing is
-- ever written over. Called AFTER the delete, so a crash between the two leaves
-- a row naming an object that is gone; the next sweep finds the same row, asks
-- R2 to delete a key that is already absent (which S3 answers 204 to), and
-- clears it. The other order would orphan the bytes for ever.
--
-- One statement rather than a loop, because a sweep is hundreds of rows and a
-- round trip each would make the function's runtime the network's.
-- ---------------------------------------------------------------------------
create or replace function public.clear_meal_photos(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- The matched icon is only written where the row would otherwise draw
  -- NOTHING. An entry logged against a catalogue dish already carries that
  -- dish's own drawing in `item_icon_set`, which the diary reads when the
  -- override is null — overwriting it with a fuzzy match on the entry's name
  -- would replace a correct picture with a guess, and would do it as a side
  -- effect of a retention sweep.
  update public.food_logs f
     set photo_path = null,
         icon_set   = case
                        when f.item_icon_set is null
                        then nullif(r.icon_set, '')::public.icon_set
                        else f.icon_set
                      end,
         icon_name  = case
                        when f.item_icon_set is null
                        then nullif(r.icon_name, '')
                        else f.icon_name
                      end
    from pg_catalog.jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      as r(id uuid, icon_set text, icon_name text)
   where f.id = r.id
     and f.photo_path is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.clear_meal_photos from public, anon, authenticated;
grant execute on function public.clear_meal_photos to service_role;

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
