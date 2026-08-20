-- ---------------------------------------------------------------------------
-- What a free account's photographs are kept for.
--
-- Thirty days, and only the picture. The entry stays for ever: its name, its
-- macros, its portion and its place in the diary are what a calorie history is.
-- What goes is the plate, the one part of an entry that costs a real amount to
-- store, that nobody scrolls back to, and that the model has already finished
-- reading.
--
-- Pro keeps every photograph. That is the offer, and it is the one line of the
-- comparison table that cannot be walked back later, so the free window is
-- written down here and in `packages/shared` and nowhere else.
--
-- Postgres owns the policy and not the work. Postgres cannot reach R2, and a row
-- whose `photo_path` was nulled by a statement that could not delete the object
-- would leave the bytes behind for good, since the key is their only name. So
-- this file decides which photographs are past their window and what replaces
-- them, and the sweep itself is
-- `apps/cloudflare/workers/jobs/src/jobs/retention.ts`: it reads the keys,
-- deletes the objects, and only then clears the column. A failure anywhere in
-- that leaves the row intact and the next run picks it up.
--
-- Nothing here schedules anything any more. The clock was a `pg_cron` job calling
-- a `pg_net` POST for a while, and the note at the foot of this file says what
-- that cost.
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
-- How long a lapsed subscriber is left alone before the sweep touches anything of
-- theirs. Sixty days, which is twice the free window on purpose.
--
-- Not part of the `free_*` family, and deliberately named apart from it. Those
-- three say what the free tier gets; this one says what somebody who used to pay
-- is spared. Somebody who has never subscribed has no grace to be given.
--
-- Why a grace period at all: a subscription ends for reasons that are not a
-- decision. A card expires, a renewal webhook is lost past RevenueCat's retries,
-- a support cancellation lands early. The account reads as free the same day
-- either way, and the first thing that happens to a former subscriber should not
-- be the deletion of their photographs. Sixty days is long enough for a failed
-- payment to be noticed, and for a wrongly dropped webhook to be repaired by
-- `reconcileEntitlement` on their next request.
--
-- The cliff it leaves is bounded: at expiry plus sixty, the post-expiry
-- photographs already over thirty days old go in one batch, which is at most a
-- month of them. That is the price of a grace period having an end.
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
-- By `logged_at`, not by `log_date`. The two answer different questions and only
-- one is about elapsed time: `log_date` is which day an entry counts towards and
-- a user may set it to anything they like, so a meal back-dated to last year
-- would be swept the moment it was written.
--
-- What was paid for stays paid for, and the second date condition is what makes
-- that true rather than merely claimed. Entitlement is checked per row at sweep
-- time, so a lapsed subscription would otherwise hand the sweep a year of
-- somebody's photographs on the night it lapsed, all deleted at once and
-- unrecoverable. The ugliest version is the one where the user has done nothing
-- at all: a renewal webhook lost past RevenueCat's retries leaves a paying
-- account reading as expired, which has actually happened.
--
-- So the window is bounded at both ends: a photograph is swept only if it was
-- logged after the last paid period ended. `current_period_end` is null for an
-- account that never subscribed, coalesced to -infinity so all of their
-- photographs are in scope, and it is the end of the last period for everybody
-- else.
--
-- What it costs is that a lapsed subscriber's Pro-era plates are kept for ever,
-- at our expense. That is the correct side to be wrong on: the alternative is
-- deleting the photographs of somebody who paid for them to be kept, on the
-- evidence of a webhook that may simply not have arrived.
--
-- And a third condition, which is the grace period. The two above still let the
-- sweep start on a former subscriber the day after they lapse, on photographs
-- that by then can already be a month old. So nothing of theirs is touched until
-- their last paid period ended more than `lapsed_photo_grace_days()` ago. Written
-- as one comparison rather than as a branch on "did they ever subscribe":
-- `-infinity` is less than every date, so an account that never paid passes it
-- unconditionally and is swept on the thirty day rule alone.
--
-- It returns the dish name too, which is not what a sweep sounds like it needs.
-- The caller has to put a drawing where each photograph was, and it works that
-- drawing out by running the entry's own name through `icon-match.ts`. Read
-- separately that was a second query against `food_logs` for rows this one has
-- already found.
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
-- The row must not go blank. An entry with no photograph and no icon draws the
-- placeholder tile, so a swept month of snapped meals would turn into a column of
-- identical grey squares, which reads as the app having lost the diary rather
-- than as a picture having aged out. `icon-match.ts` already maps a dish name
-- onto one of the app's illustrations for the barcode path, so most rows come
-- back with the drawing a typed meal would have been given in the first place. A
-- name it cannot place passes null and keeps the placeholder.
--
-- Takes ids rather than keys because an id is what an entry is, and two entries
-- have never shared a key. Called after the delete, so a crash between the two
-- leaves a row naming an object that is gone; the next sweep finds the same row,
-- asks R2 to delete a key that is already absent, and clears it. The other order
-- would orphan the bytes for ever.
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
-- Where the clock went.
--
-- `retention_runs` and `sweep_meal_photos()` used to sit here: `pg_cron` fired
-- the function hourly and it POSTed to the `retention` edge function with a token
-- out of the vault. Both are gone, along with the `pg_cron` and `pg_net`
-- extensions and the endpoint itself.
--
-- The sweep is a Cloudflare Worker on a Cron Trigger now
-- (`apps/cloudflare/workers/jobs`), which is not addressable over HTTP at all.
-- The old arrangement could not be: a sweep acts for every account and so has no
-- user to authenticate, which meant `verify_jwt = false` and a shared secret as
-- the only thing in front of an endpoint that deletes photographs.
--
-- What each piece was for, since the absence is otherwise unreadable: the token
-- lived in the vault because `cron.job.command` is plain text readable by
-- anything holding `service_role`, and `retention_runs` existed because a
-- `pg_net` POST cannot read its own response, so a run could not know its own
-- outcome and the next run had to record it. A Worker runs the job itself, so it
-- simply knows. See `job_runs` in `18_jobs.sql`.
--
-- The two functions above are unchanged and are still the whole of the policy.
-- They are called over PostgREST by the Worker now instead of by an edge
-- function, which is why `expired_meal_photos` returns `item_name`.
-- ---------------------------------------------------------------------------
