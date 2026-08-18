-- ---------------------------------------------------------------------------
-- A read-only mirror of what RevenueCat says about this account.
--
-- RevenueCat is the source of truth; this table exists so that a server-side
-- check ("may this user see the weekly report") is a join and not an HTTP call
-- to a third party, and so the paywall screens have something to render before
-- the SDK finishes its first fetch.
--
-- THE CLIENT CANNOT WRITE HERE. There are no insert/update grants for
-- `authenticated` at all — not merely no policy, no grant either, so a
-- forgotten policy cannot quietly become an entitlement grant. Rows arrive
-- from the RevenueCat webhook running as `service_role`.
--
-- Until that webhook exists this table stays empty, and an empty row is
-- correctly read as "no subscription" by `subscription_status` defaulting to
-- 'none' in the client.
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  user_id             uuid primary key references auth.users (id) on delete cascade,

  status              public.subscription_status not null default 'none',
  plan                public.subscription_plan,

  -- Instants, not day counts. "3 days left" is a rendering of
  -- `trial_ends_at - now()`; a stored counter would need something to
  -- decrement it.
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,

  -- 'app_store' | 'play_store' | 'stripe' | 'promotional'. Free text because
  -- RevenueCat adds stores and an unknown value must not reject a webhook.
  store               text,
  product_id          text,
  -- RevenueCat's app_user_id, so a webhook can find the row without trusting
  -- the payload's mapping back to our uuid.
  rc_app_user_id      text unique,

  -- When the event this row was last written from HAPPENED, which is not when
  -- we wrote it. RevenueCat retries with a backoff, so a delayed EXPIRATION can
  -- arrive after the RENEWAL that superseded it, and applied blind that takes
  -- the app away from somebody who has just paid for another month.
  --
  -- This is what orders them, and it replaced ordering by `current_period_end`
  -- — which conflated "this event is stale" with "this event ends the period
  -- early". A refund, a revoked promotional grant and a support-initiated
  -- cancellation all expire a subscription BEFORE the period it had paid for,
  -- so every one of them read as stale and was dropped, and the account stayed
  -- entitled for good. Null for a row written before this column existed, and
  -- for one corrected by hand: neither came from an event, so there is nothing
  -- to order the next one against and it applies.
  last_event_at       timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

create policy "subscriptions: read own"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Is this account Pro right now?
--
-- THE SAME RULE THE EDGE FUNCTIONS AND THE APP APPLY — an entitled status, and
-- a period that has not run out — written a third time because a third place
-- now needs it and cannot ask either of the other two. `entitledBy` in
-- `functions/_shared/entitlement.ts` decides whether a request reaches the
-- model; `isEntitledRow` in the app's `data/subscription.ts` decides what the
-- buttons say; this one decides what the DATABASE lets through, which is the
-- free tier's ceiling on scans and on recipes. All three have to be changed
-- together, and each is tested against the same cases.
--
-- NULL IS NO EXPIRY, not an expired one: lifetime renews never, so RevenueCat
-- sends no date for it and reading the column the other way round would refuse
-- the one plan that cannot lapse.
--
-- `security definer` because its callers are triggers and quota claims running
-- as whoever happened to be inserting, and the row it reads is protected by an
-- RLS policy that only answers for the account itself. A trigger checking
-- somebody's tier under their own privileges would read their own subscription
-- fine and see nothing at all when a job sweeps on their behalf.
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
