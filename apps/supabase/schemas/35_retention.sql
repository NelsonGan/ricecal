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
-- POSTGRES OWNS THE POLICY AND NOT THE WORK. Postgres cannot reach R2, and a
-- row whose `photo_path` was nulled by a statement that could not delete the
-- object would leave the bytes behind for good — the key is the only name they
-- have. So this file decides WHICH photographs are past their window and what
-- replaces them, and the sweep itself is
-- `apps/cloudflare/workers/jobs/src/jobs/retention.ts`: it reads the keys,
-- deletes the objects, and only then clears the column. A failure anywhere in
-- that leaves the row intact and the next run picks it up again.
--
-- NOTHING HERE SCHEDULES ANYTHING ANY MORE. The clock was a `pg_cron` job
-- calling a `pg_net` POST for a while, and the note at the foot of this file
-- says what that cost and why it went.
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
-- IT RETURNS THE DISH NAME TOO, which is not what a sweep sounds like it needs.
-- The caller has to put a drawing where each photograph was — see
-- `clear_meal_photos` below — and it works that drawing out by running the
-- entry's own name through `icon-match.ts`. Read separately that was a second
-- query against `food_logs` for rows this one has already found. Returned here
-- it is a column on a scan that was happening anyway, and it keeps the job's
-- whole conversation with Postgres inside `service_role` functions rather than
-- reaching into a table.
--
-- `security definer` and `service_role` only: it reads across every account,
-- which is exactly what no client may do.
-- ---------------------------------------------------------------------------
create or replace function public.expired_meal_photos(p_limit integer default 500)
returns table (
  id         uuid,
  photo_path text,
  item_name  text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.photo_path, f.item_name
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
-- WHERE THE CLOCK WENT.
--
-- `retention_runs` and `sweep_meal_photos()` used to sit here: `pg_cron` fired
-- the function hourly and it POSTed to the `retention` edge function with a
-- token out of the vault. Both are gone, along with the `pg_cron` and `pg_net`
-- extensions and the endpoint itself.
--
-- The sweep is a Cloudflare Worker on a Cron Trigger now
-- (`apps/cloudflare/workers/jobs`), which is not addressable over HTTP at all.
-- The old arrangement could not be: a sweep acts for every account and so has
-- no user to authenticate, which meant `verify_jwt = false` and a shared secret
-- as the only thing in front of an endpoint that deletes photographs.
--
-- What each piece was FOR, since the absence is otherwise unreadable: the token
-- lived in the vault because `cron.job.command` is plain text readable by
-- anything holding `service_role`, and `retention_runs` existed because a
-- `pg_net` POST cannot read its own response, so a run could not know its own
-- outcome and the NEXT run had to record it. A Worker runs the job itself, so
-- it simply knows — see `job_runs` in `18_jobs.sql`, which it writes for every
-- job rather than for this one.
--
-- The two functions above are unchanged and are still the whole of the policy.
-- They are called over PostgREST by the Worker now instead of by an edge
-- function, which is why `expired_meal_photos` returns `item_name`.
-- ---------------------------------------------------------------------------
