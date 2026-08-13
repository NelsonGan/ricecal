-- ---------------------------------------------------------------------------
-- How many times this account has been to the model, and the ceiling on it.
--
-- ONE ROW PER ACCOUNT PER MONTH, not a counter on `profiles`. The limit is
-- monthly, and a single mutable counter cannot express that: something has to
-- reset it, and "something" is either a cron job that can fail silently or a
-- read that compares a stored month against the current one and rewrites the
-- row — which is a counter plus a hidden state machine. A row per period is
-- the same fact with the resetting removed, and it keeps the history: what a
-- user cost us in March is still there in April, which is what any future
-- pricing conversation needs. The lifetime total per account is the sum, and
-- `ai_usage_this_month()` is the only shape the app actually reads.
--
-- WHAT COUNTS IS A REQUEST TO OPENROUTER, not a scan and not a tap. One
-- photographed plate is a vision call, often a verifier call and sometimes an
-- estimate call, and a retried 429 is another one — three to four requests for
-- what the user experienced as one shutter press. Billing is per request, so
-- the meter is per request, and `chatJSON` in the edge functions is the single
-- place that can honestly say one happened.
--
-- The client cannot write here. Like `subscriptions` there is no insert or
-- update grant for `authenticated` at all, so a forgotten policy cannot become
-- a way to zero your own meter. Every write goes through
-- `claim_ai_inference`, which is `security definer` and granted to
-- `service_role` alone — the edge functions, holding the key the client never
-- sees.
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- The first of the month, UTC. UTC rather than the user's own clock because
  -- this is a billing period and not a diary day: `meal_times.at` is local
  -- because "08:00 where you are" stays true when you fly, and a quota that
  -- moved with the traveller would give a monthly allowance a second start.
  period_start date not null,

  inferences   integer not null default 0 check (inferences >= 0),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  primary key (user_id, period_start)
);

create trigger ai_usage_set_updated_at
  before update on public.ai_usage
  for each row execute function public.set_updated_at();

alter table public.ai_usage enable row level security;

grant select on public.ai_usage to authenticated;
grant select, insert, update, delete on public.ai_usage to service_role;

create policy "ai_usage: read own"
  on public.ai_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- The ceiling, in one place.
--
-- A function rather than a constant in TypeScript because the check that
-- matters happens in `claim_ai_inference` below, and a second copy in the edge
-- functions would be the number that is wrong when somebody changes one of
-- them. The client reads it from `ai_usage_this_month()` for the same reason:
-- a paywall that says 3,000 while the database enforces 5,000 is a support
-- thread.
-- ---------------------------------------------------------------------------
create or replace function public.ai_monthly_limit()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 3000;
$$;

revoke execute on function public.ai_monthly_limit from public, anon;
grant execute on function public.ai_monthly_limit to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Take one request's worth of budget, or refuse.
--
-- ATOMIC ON PURPOSE. Read-then-write would let two scans running at once both
-- read 2,999 and both proceed, and a "hard limit" that a second tab can walk
-- through is not one. The guard is a `where` on the `on conflict do update`,
-- so the check and the increment are the same statement and the row lock
-- serialises them.
--
-- Returns the outcome rather than raising. A refusal is an ordinary answer
-- here — the caller turns it into a message about the limit — and an exception
-- would have to be caught and re-read to find out what the number even was.
-- ---------------------------------------------------------------------------
create or replace function public.claim_ai_inference(
  p_user  uuid,
  p_count integer default 1
)
returns table (
  allowed       boolean,
  used          integer,
  monthly_limit integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit  integer := public.ai_monthly_limit();
  v_period date    := date_trunc('month', (now() at time zone 'utc'))::date;
  v_used   integer;
begin
  if p_count is null or p_count < 1 then
    raise exception 'claim_ai_inference: p_count must be at least 1';
  end if;

  -- A single claim larger than the whole allowance can never be satisfied, and
  -- without this the first insert of a fresh month would write it anyway:
  -- there is no conflict to guard on when the row does not exist yet.
  if p_count > v_limit then
    select coalesce(u.inferences, 0) into v_used
      from public.ai_usage u
     where u.user_id = p_user and u.period_start = v_period;
    return query select false, coalesce(v_used, 0), v_limit;
    return;
  end if;

  insert into public.ai_usage as u (user_id, period_start, inferences)
  values (p_user, v_period, p_count)
  on conflict (user_id, period_start) do update
     set inferences = u.inferences + p_count
   where u.inferences + p_count <= v_limit
  returning u.inferences into v_used;

  -- No row came back: the account already had a row this month and the guard
  -- refused the increment. Read what it stands at so the caller can say how
  -- far over the line the request was.
  if v_used is null then
    select u.inferences into v_used
      from public.ai_usage u
     where u.user_id = p_user and u.period_start = v_period;
    return query select false, coalesce(v_used, 0), v_limit;
    return;
  end if;

  return query select true, v_used, v_limit;
end;
$$;

revoke execute on function public.claim_ai_inference from public, anon, authenticated;
grant execute on function public.claim_ai_inference to service_role;

-- ---------------------------------------------------------------------------
-- What the account has spent this month, for the app to render.
--
-- Always exactly one row, including for somebody who has never scanned
-- anything — a query that returns nothing would have every caller coalescing
-- the same three zeroes, and the settings screen would have to tell "no row
-- yet" apart from "no answer yet".
-- ---------------------------------------------------------------------------
create or replace function public.ai_usage_this_month()
returns table (
  used          integer,
  monthly_limit integer,
  remaining     integer
)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(u.inferences, 0)                                        as used,
    public.ai_monthly_limit()                                        as monthly_limit,
    greatest(public.ai_monthly_limit() - coalesce(u.inferences, 0), 0) as remaining
  from (select 1) as one
  left join public.ai_usage u
    on u.user_id = (select auth.uid())
   and u.period_start = date_trunc('month', (now() at time zone 'utc'))::date;
$$;

revoke execute on function public.ai_usage_this_month from public, anon;
grant execute on function public.ai_usage_this_month to authenticated, service_role;
