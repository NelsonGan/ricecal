-- ---------------------------------------------------------------------------
-- How many recipe reviews an account has asked for in the current hour.
--
-- The AI meter used to be this ceiling and stopped being one. Every request to
-- OpenRouter was claimed against a monthly allowance, so the publish review was
-- bounded along with everything else. The quota counts scans now, and the review
-- is deliberately not one: it is the app's own moderation, and charging a user's
-- daily allowance for a check they did not ask for would be the app billing them
-- for it.
--
-- Which leaves the review as the one model call in the system with nothing in
-- front of it: `{action: 'review'}` takes a recipe id, and a signed-in caller
-- with one public recipe of their own can call it in a loop. That is a
-- denial-of-wallet rather than a data risk, so the control is the same one the
-- barcode path uses: a plain per-account rate limit, one row per hour, an atomic
-- claim, no client write grant.
--
-- Ten an hour is far above any real use. A publish is one, an edit to something
-- already public is one, and a free account may only keep three recipes at all.
-- It is an abuse ceiling rather than a quota, so nothing in the app prints it.
-- ---------------------------------------------------------------------------

create table public.recipe_review_usage (
  user_id      uuid not null references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  reviews      integer not null default 0 check (reviews >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, window_start)
);

create trigger recipe_review_usage_set_updated_at
  before update on public.recipe_review_usage
  for each row execute function public.set_updated_at();

alter table public.recipe_review_usage enable row level security;

grant select on public.recipe_review_usage to authenticated;
grant select, insert, update, delete on public.recipe_review_usage to service_role;

create policy "recipe_review_usage: read own"
  on public.recipe_review_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.recipe_review_hourly_limit()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 10;
$$;

revoke execute on function public.recipe_review_hourly_limit from public, anon;
grant execute on function public.recipe_review_hourly_limit to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Take one review's worth of budget, or refuse. Atomic, for the reason
-- `claim_scan` is: a read-then-write limit is one two requests can both walk
-- through. The guard is a `where` on the `on conflict do update`, so the check
-- and the increment are one statement under one row lock.
-- ---------------------------------------------------------------------------
create or replace function public.claim_recipe_review(p_user uuid)
returns table (
  allowed      boolean,
  used         integer,
  hourly_limit integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit  integer     := public.recipe_review_hourly_limit();
  v_window timestamptz := date_trunc('hour', (now() at time zone 'utc')) at time zone 'utc';
  v_used   integer;
begin
  insert into public.recipe_review_usage as u (user_id, window_start, reviews)
  values (p_user, v_window, 1)
  on conflict (user_id, window_start) do update
     set reviews = u.reviews + 1
   where u.reviews + 1 <= v_limit
  returning u.reviews into v_used;

  if v_used is null then
    select u.reviews into v_used
      from public.recipe_review_usage u
     where u.user_id = p_user and u.window_start = v_window;
    return query select false, coalesce(v_used, 0), v_limit;
    return;
  end if;

  return query select true, v_used, v_limit;
end;
$$;

revoke execute on function public.claim_recipe_review from public, anon, authenticated;
grant execute on function public.claim_recipe_review to service_role;
