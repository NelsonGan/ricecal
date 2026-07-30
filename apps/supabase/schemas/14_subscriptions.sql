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
