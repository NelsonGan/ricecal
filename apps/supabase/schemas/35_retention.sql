-- ---------------------------------------------------------------------------
-- What a free account's photographs are kept for.
--
-- Thirty days, and only the picture. The entry stays for ever: its name, its
-- macros and its place in the diary are what a calorie history is. What goes is
-- the plate, the one part of an entry that costs a real amount to store and that
-- the model has already finished reading.
--
-- Pro keeps every photograph. That is the one line of the comparison table that
-- cannot be walked back later, so the free window is written down here and in
-- `packages/shared` and nowhere else.
--
-- Postgres owns the policy and not the work: it cannot reach R2, and a row whose
-- `photo_path` was nulled by a statement that could not delete the object would
-- leave the bytes behind for good. The sweep itself is
-- `apps/cloudflare/workers/jobs/src/jobs/retention.ts`.

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
-- theirs. Sixty days, twice the free window.
--
-- Not part of the `free_*` family and deliberately named apart from it: those say
-- what the free tier gets, and this says what somebody who used to pay is spared.
--
-- A subscription ends for reasons that are not a decision. A card expires, a
-- renewal webhook is lost, a support cancellation lands early, and the account
-- reads as free the same day either way. Sixty days is long enough for a failed
-- payment to be noticed and for a wrongly dropped webhook to be repaired by
-- `reconcileEntitlement` on the next request.
--
-- The cliff is bounded: at expiry plus sixty, at most a month of post-expiry
-- photographs go in one batch.
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
-- By `logged_at`, not by `log_date`. Only one of them is about elapsed time: a
-- user may set `log_date` to anything, so a meal back-dated to last year would be
-- swept the moment it was written.
--
-- What was paid for stays paid for, and the second date condition is what makes
-- that true. Entitlement is checked per row at sweep time, so a lapsed
-- subscription would otherwise hand the sweep a year of somebody's photographs on
-- the night it lapsed. The ugliest version is a renewal webhook lost past
-- RevenueCat's retries, which leaves a paying account reading as expired.
--
-- So the window is bounded at both ends: a photograph is swept only if it was
-- logged after the last paid period ended. `current_period_end` is null for an
-- account that never subscribed, coalesced to -infinity so all of theirs are in
-- scope.
--
-- A third condition is the grace period, written as one comparison rather than a
-- branch on "did they ever subscribe": `-infinity` is less than every date, so an
-- account that never paid passes it unconditionally.
--
-- It returns the dish name too, so the caller can put a drawing where each
-- photograph was without a second query against `food_logs`.
--
-- `security definer` and `service_role` only: it reads across every account.
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
-- placeholder tile, so a swept month would be a column of identical grey squares,
-- which reads as the app having lost the diary. A name `icon-match.ts` cannot
-- place passes null and keeps the placeholder.
--
-- Takes ids rather than keys, and is called after the delete: a crash between the
-- two leaves a row naming an object that is gone, and the next sweep asks R2 to
-- delete a key that is already absent and clears it. The other order would orphan
-- the bytes for ever.
--
-- One statement rather than a loop, because a sweep is hundreds of rows.
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
-- The sweep is a Cloudflare Worker on a Cron Trigger (`apps/cloudflare/workers/jobs`)
-- which is not addressable over HTTP at all. The old arrangement could not be: a
-- sweep acts for every account and so has no user to authenticate, which meant
-- `verify_jwt = false` and a shared secret in front of an endpoint that deletes
-- photographs.
--
-- The two functions above are unchanged and are still the whole of the policy.
-- They are called over PostgREST by the Worker, which is why
-- `expired_meal_photos` returns `item_name`.
-- ---------------------------------------------------------------------------
