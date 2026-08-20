-- ---------------------------------------------------------------------------
-- How many scans this account has spent today, and the ceiling on it.
--
-- What counts is a scan, not a request to OpenRouter. This table replaced
-- `ai_usage`, which counted the latter, and the difference is the whole point of
-- it. One photographed plate is a vision call, often a verifier call and
-- sometimes an estimate, and a retried 429 is another: three or four requests for
-- what the user experienced as one shutter press. A ceiling written in those
-- units cannot be said out loud, and a user who has logged forty meals and been
-- refused has an objection the figure cannot answer.
--
-- What a scan means, exactly: one user-initiated pass at the model. A
-- photographed plate, a typed meal, a correction, or reading a recipe out of a
-- photograph. Each takes one unit whatever it costs underneath. Everything else
-- in the app reaches no model and takes nothing, which is what makes the free
-- tier a usable diary rather than a demo.
--
-- One row per account per local day, and the day is the user's own. `ai_usage`
-- keyed its month by UTC on the grounds that a quota is a billing period rather
-- than a diary day; a daily allowance is the other case. Refusing a fourth plate
-- at eight in the morning because a server in Virginia has not reached midnight
-- is the app being wrong about what day it is.
--
-- The client cannot write here. Like `subscriptions` there is no insert or update
-- grant for `authenticated` at all, so a forgotten policy cannot become a way to
-- zero your own meter. Every write goes through `claim_scan`, which is
-- `security definer` and granted to `service_role` alone.
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
-- happens in `claim_scan` below, and a second copy in the edge functions would be
-- the number that is wrong when somebody changes one of them. The app is told
-- what its limit is by `scan_usage_today()` and by the refusal itself, for the
-- same reason: a paywall promising 50 while the database enforces 3 is a support
-- thread.
--
-- The Pro ceiling is not sold as a number. The comparison table says "unlimited",
-- because 50 photographed meals in one day is not a diary and nobody eating
-- normally will meet it. It is an abuse ceiling wearing a quota's clothes, and
-- printing it would invite the reading where it is a restriction. The free one is
-- sold exactly as it is: three a day.
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
-- Atomic on purpose, and inherited from the meter this replaced. Read-then-write
-- would let two scans running at once both read the last unit and both proceed,
-- and a hard limit a second tap can walk through is not one. The guard is a
-- `where` on the `on conflict do update`, so the check and the increment are the
-- same statement and the row lock serialises them.
--
-- Claimed once per scan, at the top of the endpoint, before the photo is read and
-- before the first model call. Claimed afterwards, an account already at its
-- ceiling would still get to send the request that put it there.
--
-- Returns the outcome rather than raising. A refusal is an ordinary answer here,
-- and an exception would have to be caught and re-read to find out what the
-- number even was. `entitled` rides along because the two refusals read
-- differently: a free account that has spent its three has something to buy, and
-- a Pro account that has spent its fifty has not.
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
-- Unlike its predecessor, this is shown. `ai_usage_this_month()` existed for
-- support and an admin view nobody built, because the number it returned could
-- not be put in front of a user: it counted requests to a model, and no user has
-- any idea how many of those a plate costs. This one counts the thing they did,
-- so "1 of 3 scans left today" is a sentence that answers itself.
--
-- Always exactly one row, including for somebody who has never scanned anything.
-- A query that returned nothing would have every caller coalescing the same
-- zeroes, and the screen would have to tell "no row yet" apart from "no answer
-- yet".
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
