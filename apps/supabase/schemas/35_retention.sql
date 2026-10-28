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
  -- Entitlement once per subscription rather than once per photograph. A Pro
  -- account's old photographs are kept, so they are read again on every run,
  -- and asking `is_entitled` about each one made the sweep grow with every
  -- paying user's history: 1,381 calls to find 5 photographs on production.
  -- `is_entitled` reads nothing but this table, so an account with no row here
  -- is not entitled, which is what the coalesce below says.
  with subscribers as materialized (
    select s.user_id, s.current_period_end, public.is_entitled(s.user_id) as entitled
    from public.subscriptions s
  )
  select f.id, f.photo_path, f.item_name
   from public.food_logs f
    left join subscribers s on s.user_id = f.user_id
   where f.photo_path is not null
     -- The Worker deletes with bucket credentials. Apply the same key boundary
     -- as the photo signer before untrusted diary text can reach that credential:
     -- owned meals only, bounded, URL-safe and unable to walk out with `..`.
     and f.photo_path like 'meals/' || f.user_id::text || '/%'
     and pg_catalog.char_length(f.photo_path) <= 512
     and f.photo_path ~ '^[A-Za-z0-9/_.-]+$'
     and pg_catalog.strpos(f.photo_path, '..') = 0
     and f.logged_at < now() - pg_catalog.make_interval(
           days => public.free_photo_retention_days()
         )
     and not coalesce(s.entitled, false)
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
-- Takes both ids and the keys selected for deletion, and is called after the
-- delete. Matching both keeps a photo replaced during the R2 call from being
-- cleared even though that replacement object was never deleted. A crash between
-- the two leaves a row naming an object that is gone, and the next sweep asks R2
-- to delete a key that is already absent and clears it. The other order would
-- orphan the bytes for ever.
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
      as r(id uuid, photo_path text, icon_set text, icon_name text)
   where f.id = r.id
     and f.photo_path = r.photo_path;

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

-- ---------------------------------------------------------------------------
-- Telling somebody before their photographs go.
--
-- `photo_removal_schedule` answers, for one account, when each photograph the
-- sweep will take is due to go. It is `expired_meal_photos` turned round: the
-- same key boundary and the same three dates, but instead of asking "is this
-- past due", it says when it will be. A photograph is due at the later of
-- thirty days after it was logged and sixty days after a paid period ended, and
-- only one logged after that period ended is ever due at all.
--
-- One account at a time, through `food_logs_user_date_idx`, so neither caller
-- reads anybody else's diary.
-- ---------------------------------------------------------------------------
create or replace function public.photo_removal_schedule(p_user uuid, p_until timestamptz)
returns table (id uuid, log_date date, photo_path text, item_name text, removes_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with sub as (
    select s.current_period_end as period_end
      from public.subscriptions s where s.user_id = p_user
  ),
  rows as (
    select f.id, f.log_date, f.photo_path, f.item_name,
      greatest(
        f.logged_at + pg_catalog.make_interval(days => public.free_photo_retention_days()),
        coalesce((select period_end from sub), '-infinity'::timestamptz)
          + pg_catalog.make_interval(days => public.lapsed_photo_grace_days())
      ) as removes_at
    from public.food_logs f
    where f.user_id = p_user
      and f.photo_path is not null
      and f.photo_path like 'meals/' || f.user_id::text || '/%'
      and pg_catalog.char_length(f.photo_path) <= 512
      and f.photo_path ~ '^[A-Za-z0-9/_.-]+$'
      and pg_catalog.strpos(f.photo_path, '..') = 0
      and f.logged_at > coalesce((select period_end from sub), '-infinity'::timestamptz)
      -- Nothing logged in the last day of the window can be due before it, so
      -- the diary read stops at the oldest photographs.
      and f.logged_at < p_until - pg_catalog.make_interval(days => public.free_photo_retention_days())
  )
  select r.id, r.log_date, r.photo_path, r.item_name, r.removes_at
    from rows r
   where not public.is_entitled(p_user)
     and r.removes_at < p_until
   order by r.removes_at, r.id
   limit 500;
$$;
revoke execute on function public.photo_removal_schedule from public, anon, authenticated;

-- The caller's own photographs that go within `p_days`, soonest first. One
-- already past due is in it too: the sweep runs hourly and has not reached it.
-- A Pro account gets nothing, so the app can ask without knowing the tier.
create or replace function public.upcoming_photo_removals(p_days integer default 14)
returns table (id uuid, log_date date, photo_path text, item_name text, removes_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Sign in to continue' using errcode = '42501'; end if;
  if p_days is null or p_days not between 1 and 30 then
    raise exception 'Days must be between 1 and 30' using errcode = '22023';
  end if;
  return query select * from public.photo_removal_schedule(v_user, now() + pg_catalog.make_interval(days => p_days));
end;
$$;
revoke execute on function public.upcoming_photo_removals from public, anon;
grant execute on function public.upcoming_photo_removals to authenticated, service_role;

-- When each account was last pushed about its photographs, so the daily job
-- warns once a window rather than once a day. A daily logger has photographs
-- coming due every day, and a push every morning would be the app nagging.
create table public.photo_removal_warnings (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  warned_at timestamptz not null default now()
);
alter table public.photo_removal_warnings enable row level security;
revoke all on public.photo_removal_warnings from anon, authenticated;
grant select, insert, update, delete on public.photo_removal_warnings to service_role;
create policy "Server only" on public.photo_removal_warnings as restrictive for all to anon, authenticated
  using (false) with check (false);

-- The pushes for one run of the warning job: one row per device of every free
-- account with photographs going in the next `p_days` that has not been warned
-- in that long, so each warning covers the days up to the next one. Only
-- accounts with a device are considered, and each is marked warned here, in
-- the same statement that picks it, so a cron delivered twice pushes nobody
-- twice. A push that then fails to send is lost; the app's own notice on Today
-- still says it.
--
-- `p_limit` bounds one call. Every account it picks has something due and a
-- device, so the job calls again until a call comes back empty.
create or replace function public.photo_removal_push_targets(p_days integer default 6, p_limit integer default 200)
returns table (token text, user_id uuid, language text, timezone text, photo_count integer, removes_by timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_days is null or p_days not between 1 and 14 then
    raise exception 'Days must be between 1 and 14' using errcode = '22023';
  end if;
  return query
    with candidates as materialized (
      -- Accounts with a device and a photograph past the start of its free
      -- window, by the sweep's own index, before any per-account work.
      select distinct t.user_id
        from public.push_tokens t
       where not public.is_entitled(t.user_id)
         and not exists (
           select 1 from public.photo_removal_warnings w
            where w.user_id = t.user_id
              -- A few hours short of the window, so tomorrow's run is never
              -- a minute too early for an account warned this morning and
              -- the photos due on the window's last day still get a warning.
              and w.warned_at > now() - pg_catalog.make_interval(days => p_days)
                    + interval '3 hours'
         )
         -- The cheap test first: a photograph old enough to be in the window.
         and exists (
           select 1 from public.food_logs f
            where f.user_id = t.user_id and f.photo_path is not null
              and f.logged_at < now() + pg_catalog.make_interval(days => p_days)
                    - pg_catalog.make_interval(days => public.free_photo_retention_days())
         )
         -- Then the schedule itself, so every candidate has something due
         -- and gets a push. An empty answer then means there is nobody left,
         -- which is what the job stops on.
         and exists (
           select 1 from public.photo_removal_schedule(
             t.user_id, now() + pg_catalog.make_interval(days => p_days))
         )
       limit p_limit
    ),
    due as (
      select c.user_id, count(*)::integer as photo_count, max(s.removes_at) as removes_by
        from candidates c
        cross join lateral public.photo_removal_schedule(
          c.user_id, now() + pg_catalog.make_interval(days => p_days)) s
       group by c.user_id
    ),
    marked as (
      insert into public.photo_removal_warnings(user_id, warned_at)
      select c.user_id, now() from candidates c
      on conflict (user_id) do update set warned_at = excluded.warned_at
      returning photo_removal_warnings.user_id
    )
    select t.token, d.user_id, coalesce(us.language, 'en'), coalesce(p.timezone, 'Asia/Kuala_Lumpur'),
      d.photo_count, d.removes_by
      from due d
      join marked m on m.user_id = d.user_id
      join public.push_tokens t on t.user_id = d.user_id
      join public.profiles p on p.id = d.user_id
      left join public.user_settings us on us.user_id = d.user_id;
end;
$$;
revoke execute on function public.photo_removal_push_targets from public, anon, authenticated;
grant execute on function public.photo_removal_push_targets to service_role;
