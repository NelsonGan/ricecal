-- ---------------------------------------------------------------------------
-- The daily ceiling on scans: who can read it, who can move it, whether it
-- stops at the limit, and whether the limit is the right one for the tier.
--
-- Two assertions here matter more than the rest. A hard limit that a second
-- tap can walk through is not a hard limit, and the guard that prevents it
-- lives in an `on conflict do update ... where`, which is the kind of SQL that
-- looks right and silently does nothing when it is wrong — so the free ceiling
-- is driven right up to its edge and pushed one past it. And the whole point of
-- the rewrite is that the ceiling DEPENDS ON THE TIER, so a Pro account is
-- driven past the free limit and must not be refused.
--
-- Runs as `authenticated` with a forged JWT claim wherever the question is
-- about what a user can reach, exactly as PostgREST does. Run as `postgres`
-- the table owner bypasses RLS and every one of those would pass while
-- proving nothing.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- -- GRANTS ------------------------------------------------------------------
-- The client may read its own meter and may never move it. Written as grants
-- rather than as policies so that a forgotten policy cannot quietly become a
-- way to zero your own usage.

select ok(
  has_table_privilege('authenticated', 'public.scan_usage', 'SELECT'),
  'a signed-in user may read their own scan count'
);

select ok(
  not has_table_privilege('authenticated', 'public.scan_usage', 'INSERT')
  and not has_table_privilege('authenticated', 'public.scan_usage', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.scan_usage', 'DELETE'),
  'and may never write it: no insert, update or delete grant at all'
);

-- The claim function is the only writer, and it is the server's alone. A
-- client that could call it could spend somebody else's allowance, or refuse
-- to spend its own.
select ok(
  not (select pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'claim_scan'),
  'claim_scan is not executable by a signed-in user'
);

select ok(
  (select pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'claim_scan'),
  'but the edge functions, as service_role, can'
);

-- PUBLIC keeps no execute right on any of them. `db diff` does not report
-- grant deltas, so this is the only thing that notices a `revoke` that never
-- reached a migration — see the note in CLAUDE.md.
select ok(
  not (select bool_or(pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('claim_scan', 'scan_usage_today', 'free_daily_scans',
                           'pro_daily_scans', 'scan_daily_limit', 'is_entitled')),
  'PUBLIC has no execute right on any of the quota functions'
);

-- -- WHICH CEILING APPLIES ----------------------------------------------------
-- `is_entitled` is the whole tiering decision, and this is the first place it
-- has existed in SQL. The three cases are the three the TypeScript copies get
-- right: a running subscription, a lifetime one with no expiry at all, and a
-- row that says `active` over a date in the past — which is what a missed
-- webhook leaves behind, and which must not go on unlocking the app for ever.

select is(
  public.scan_daily_limit(:'user_a'),
  public.free_daily_scans(),
  'an account with no subscription row gets the free ceiling'
);

insert into public.subscriptions (user_id, status, plan, current_period_end)
values (:'user_a', 'active', 'yearly', now() + interval '30 days');

select is(
  public.scan_daily_limit(:'user_a'),
  public.pro_daily_scans(),
  'a running subscription gets the Pro ceiling'
);

update public.subscriptions set current_period_end = null where user_id = :'user_a';

select ok(
  public.is_entitled(:'user_a'),
  'no expiry is lifetime, not expired'
);

update public.subscriptions
   set current_period_end = now() - interval '1 day'
 where user_id = :'user_a';

select ok(
  not public.is_entitled(:'user_a'),
  'and a period that has run out is not entitled, whatever the status says'
);

-- -- COUNTING ----------------------------------------------------------------

select is(
  (select allowed from public.claim_scan(:'user_b')),
  true,
  'the first scan of the day is allowed'
);

select is(
  (select used from public.claim_scan(:'user_b')),
  2,
  'and the meter counts up from there'
);

-- -- THE FREE CEILING --------------------------------------------------------
-- Straight to the edge. `free_daily_scans()` rather than a literal 3: the
-- number is allowed to change, and a test that hard-coded it would start
-- failing on a change that is entirely correct.

update public.scan_usage
   set scans = public.free_daily_scans() - 1
 where user_id = :'user_b'
   and usage_date = public.local_today(:'user_b');

select is(
  (select allowed from public.claim_scan(:'user_b')),
  true,
  'the scan that lands exactly on the free limit is allowed'
);

select is(
  (select allowed from public.claim_scan(:'user_b')),
  false,
  'and the one after it is refused'
);

-- The same count, on a Pro account, is nowhere near the ceiling. This is the
-- assertion the whole rewrite exists for: the limit is a property of the tier,
-- not of the table.
insert into public.subscriptions (user_id, status, plan, current_period_end)
values (:'user_b', 'active', 'monthly', now() + interval '30 days');

select is(
  (select allowed from public.claim_scan(:'user_b')),
  true,
  'and the same account, subscribed, carries straight past it'
);

-- -- ISOLATION ---------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.scan_usage),
  0,
  'one user cannot see another user''s meter'
);

-- The shape the app renders. Always one row, including for somebody who has
-- never scanned anything: a query that returned nothing would have the screen
-- telling "no row yet" apart from "no answer yet".
select is(
  (select remaining from public.scan_usage_today()),
  public.free_daily_scans(),
  'and reads a full free allowance for themselves rather than no row at all'
);

reset role;
select set_config('request.jwt.claims', null, true);

select * from finish();

rollback;
