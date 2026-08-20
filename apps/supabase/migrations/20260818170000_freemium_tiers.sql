-- Freemium: a free tier that can keep a diary, and a Pro tier that can reach
-- the model as often as it likes.
--
-- Four things at once, because they are one decision:
--
--   1. `ai_usage` goes, and `scan_usage` replaces it. The old meter counted
--      REQUESTS TO OPENROUTER per calendar month, which is a unit no user can
--      hold against their own week — one photographed plate is three or four of
--      them. The new one counts SCANS per local day, which is the thing the
--      user actually did, and it has two ceilings rather than one: three a day
--      free, fifty a day Pro.
--   2. `is_entitled(uuid)` states the entitlement rule in SQL for the first
--      time. It was only ever in TypeScript, on both sides of the wire; the
--      database now needs it too, because the free tier's ceilings are enforced
--      here.
--   3. A free account may keep three recipes. Enforced by a trigger because a
--      client writes `recipes` directly under RLS, with no function in between.
--   4. A free account's meal photographs are kept for thirty days.
--      `functions/retention` does the sweep; these are the two statements it
--      needs, plus the partial index that keeps a daily scan cheap.
--
-- Hand-written in full because it is applied without a local Docker stack to
-- `db diff` against; every function body below is copied verbatim from
-- schemas/ so a future diff sees no change. Same pattern as
-- 20260815121000_barcode_scan_throttle.sql.

-- ---------------------------------------------------------------------------
-- 1. The meter, in its new units.
--
-- The old table is DROPPED rather than migrated. Nothing can carry across: a
-- monthly count of model requests does not convert into a daily count of
-- scans by any arithmetic, and keeping the rows beside the new ones would
-- leave two meters in the schema with one of them dead. What it cost is the
-- per-account history of what we spent at OpenRouter, which nothing read and
-- which `food_scan_items` still records the useful half of.
-- ---------------------------------------------------------------------------
drop function if exists public.ai_usage_this_month();
drop function if exists public.claim_ai_inference(uuid, integer);
drop function if exists public.ai_monthly_limit();
drop table if exists public.ai_usage;

-- ---------------------------------------------------------------------------
-- 2. The entitlement rule, in SQL. See schemas/14_subscriptions.sql.
-- ---------------------------------------------------------------------------
create or replace function public.is_entitled(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.subscriptions s
     where s.user_id = p_user
       and s.status in ('trial', 'active')
       and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- Not granted to `authenticated`: it takes a uuid, and a signed-in caller
-- holding somebody else's would learn whether that account is subscribed. The
-- app has its own copy of this rule for its own row (`isEntitledRow`), and the
-- two functions here that need it across accounts — `scan_daily_limit` and the
-- recipe trigger — are `security definer` and reach it as the owner.
revoke execute on function public.is_entitled from public, anon, authenticated;
grant execute on function public.is_entitled to service_role;

-- ---------------------------------------------------------------------------
-- The table, the two ceilings, the claim and the read. See
-- schemas/17_scan_usage.sql for why a scan rather than a request, and why the
-- day is the user's own.
-- ---------------------------------------------------------------------------
create table public.scan_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,

  -- The user's own calendar date, from `local_today`. See above.
  usage_date date not null,

  scans      integer not null default 0 check (scans >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, usage_date)
);

create trigger scan_usage_set_updated_at
  before update on public.scan_usage
  for each row execute function public.set_updated_at();

alter table public.scan_usage enable row level security;

grant select on public.scan_usage to authenticated;
grant select, insert, update, delete on public.scan_usage to service_role;

create policy "scan_usage: read own"
  on public.scan_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- The two ceilings, in one place.
--
-- Functions rather than constants in TypeScript because the check that matters
-- happens in `claim_scan` below, and a second copy in the edge functions would
-- be the number that is wrong when somebody changes one of them. The app is
-- told what its limit is by `scan_usage_today()` and by the refusal itself,
-- for the same reason: a paywall promising 50 while the database enforces 3 is
-- a support thread.
--
-- The Pro ceiling is NOT sold as a number. The comparison table says
-- "unlimited", because 50 photographed meals in one day is not a diary and
-- nobody eating normally will meet it — it is an abuse ceiling wearing a
-- quota's clothes, and printing it would invite the one reading where it is a
-- restriction. The free one is sold exactly as it is: three a day.
-- ---------------------------------------------------------------------------
create or replace function public.free_daily_scans()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 3;
$$;

revoke execute on function public.free_daily_scans from public, anon;
grant execute on function public.free_daily_scans to authenticated, service_role;

create or replace function public.pro_daily_scans()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 50;
$$;

revoke execute on function public.pro_daily_scans from public, anon;
grant execute on function public.pro_daily_scans to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Which ceiling applies to this account.
-- ---------------------------------------------------------------------------
create or replace function public.scan_daily_limit(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_entitled(p_user) then public.pro_daily_scans()
    else public.free_daily_scans()
  end;
$$;

-- NOT GRANTED TO `authenticated`, and neither is `is_entitled`. Both take a
-- uuid, so a signed-in caller holding somebody else's id could ask whether that
-- account is subscribed — which is nobody's business and buys the client
-- nothing, since the only thing it needs is its OWN allowance and
-- `scan_usage_today()` below answers that without being asked who.
revoke execute on function public.scan_daily_limit from public, anon, authenticated;
grant execute on function public.scan_daily_limit to service_role;

-- ---------------------------------------------------------------------------
-- Take one scan's worth of budget, or refuse.
--
-- ATOMIC ON PURPOSE, and inherited from the meter this replaced. Read-then-
-- write would let two scans running at once both read the last unit and both
-- proceed, and a hard limit a second tap can walk through is not one. The
-- guard is a `where` on the `on conflict do update`, so the check and the
-- increment are the same statement and the row lock serialises them.
--
-- CLAIMED ONCE PER SCAN, at the top of the endpoint, before the photo is read
-- and before the first model call. Claimed afterwards, an account already at
-- its ceiling would still get to send the request that put it there.
--
-- Returns the outcome rather than raising. A refusal is an ordinary answer
-- here — the caller turns it into a paywall — and an exception would have to
-- be caught and re-read to find out what the number even was. `entitled` rides
-- along because the two refusals read differently: a free account that has
-- spent its three has something to buy, and a Pro account that has spent its
-- fifty has not.
-- ---------------------------------------------------------------------------
create or replace function public.claim_scan(p_user uuid)
returns table (
  allowed     boolean,
  used        integer,
  daily_limit integer,
  entitled    boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entitled boolean := public.is_entitled(p_user);
  v_limit    integer := case
                          when v_entitled then public.pro_daily_scans()
                          else public.free_daily_scans()
                        end;
  v_date     date    := public.local_today(p_user);
  v_used     integer;
begin
  -- The insert itself is unguarded, and can be: the `where` below only fires
  -- on a conflict, and both ceilings are at least one, so the first scan of a
  -- day is always within whichever applies.
  insert into public.scan_usage as u (user_id, usage_date, scans)
  values (p_user, v_date, 1)
  on conflict (user_id, usage_date) do update
     set scans = u.scans + 1
   where u.scans + 1 <= v_limit
  returning u.scans into v_used;

  -- No row came back: the account already had a row today and the guard
  -- refused the increment. Read what it stands at so the caller can say how
  -- far over the line the request was.
  if v_used is null then
    select u.scans into v_used
      from public.scan_usage u
     where u.user_id = p_user and u.usage_date = v_date;
    return query select false, coalesce(v_used, 0), v_limit, v_entitled;
    return;
  end if;

  return query select true, v_used, v_limit, v_entitled;
end;
$$;

revoke execute on function public.claim_scan from public, anon, authenticated;
grant execute on function public.claim_scan to service_role;

-- ---------------------------------------------------------------------------
-- What the account has spent today, for the app to render.
--
-- UNLIKE ITS PREDECESSOR, THIS IS SHOWN. `ai_usage_this_month()` existed for
-- support and an admin view nobody built, because the number it returned could
-- not be put in front of a user: it counted requests to a model, and no user
-- has any idea how many of those a plate costs. This one counts the thing they
-- did, so "1 of 3 scans left today" is a sentence that answers itself, and a
-- free user who cannot see the count meets the ceiling as a surprise.
--
-- Always exactly one row, including for somebody who has never scanned
-- anything — a query that returned nothing would have every caller coalescing
-- the same zeroes, and the screen would have to tell "no row yet" apart from
-- "no answer yet".
-- ---------------------------------------------------------------------------
create or replace function public.scan_usage_today()
returns table (
  used        integer,
  daily_limit integer,
  remaining   integer,
  entitled    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(u.scans, 0)                                        as used,
    public.scan_daily_limit((select auth.uid()))                as daily_limit,
    greatest(
      public.scan_daily_limit((select auth.uid())) - coalesce(u.scans, 0),
      0
    )                                                           as remaining,
    public.is_entitled((select auth.uid()))                     as entitled
  from (select 1) as one
  left join public.scan_usage u
    on u.user_id = (select auth.uid())
   and u.usage_date = public.local_today((select auth.uid()));
$$;

revoke execute on function public.scan_usage_today from public, anon;
grant execute on function public.scan_usage_today to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Three recipes on a free account.
-- ---------------------------------------------------------------------------
create or replace function public.free_recipe_limit()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 3;
$$;

revoke execute on function public.free_recipe_limit from public, anon;
grant execute on function public.free_recipe_limit to authenticated, service_role;

create or replace function public.recipes_enforce_free_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_entitled(new.owner_id) then
    return new;
  end if;

  if (
    select pg_catalog.count(*)
      from public.recipes r
     where r.owner_id = new.owner_id
  ) >= public.free_recipe_limit() then
    raise exception 'recipe_limit_reached'
      using errcode = 'P0001',
            hint = 'A free account may keep ' || public.free_recipe_limit()
                   || ' recipes. Pro removes the limit.';
  end if;

  return new;
end;
$$;

-- Stated here and applied by a hand-written migration: `db diff` does not
-- carry grants, so a revoke that only lives in a schema file never happens.
revoke execute on function public.recipes_enforce_free_limit from public, anon, authenticated;

create trigger recipes_enforce_free_limit
  before insert on public.recipes
  for each row execute function public.recipes_enforce_free_limit();


-- ---------------------------------------------------------------------------
-- 4. Thirty days of photographs on a free account. See
-- schemas/35_retention.sql, and functions/retention for the sweep itself.
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
-- README.md records as having actually happened.
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
