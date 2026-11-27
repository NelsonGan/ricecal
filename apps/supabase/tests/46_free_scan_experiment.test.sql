-- ---------------------------------------------------------------------------
-- The free-scan experiment: which accounts are in it, which arm each is in,
-- and whether `claim_scan` enforces that arm's ceiling rather than the copy's.
--
-- The assertion that matters is the third scan. An account in `two` must be
-- refused it and an account in `control` must not, or the experiment measures
-- nothing; and an account made before the window must still get three, or the
-- experiment has changed the app for everybody already using it.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

-- Ids chosen by their last hex digit, which is what decides the arm.
\set two_user     'e1000000-0000-4000-8000-00000000000a'
\set control_user 'e1000000-0000-4000-8000-00000000000b'
\set early_user   'e1000000-0000-4000-8000-00000000000c'
\set late_user    'e1000000-0000-4000-8000-00000000000e'
\set pro_user     'e1000000-0000-4000-8000-000000000010'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'two_user', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', '{}'::jsonb, '{}'::jsonb, '2026-12-05 10:00+08', now()),
  (:'control_user', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'control@example.test', '{}'::jsonb, '{}'::jsonb, '2026-12-05 10:00+08', now()),
  (:'early_user', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'early@example.test', '{}'::jsonb, '{}'::jsonb, '2026-11-30 23:59+08', now()),
  (:'late_user', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'late@example.test', '{}'::jsonb, '{}'::jsonb, '2027-02-01 00:00+08', now()),
  (:'pro_user', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pro@example.test', '{}'::jsonb, '{}'::jsonb, '2026-12-05 10:00+08', now());

insert into public.subscriptions (user_id, status, plan, current_period_end)
values (:'pro_user', 'active', 'yearly', now() + interval '30 days');

-- A fixed window, whatever the migration wrote on deploy, so the edges are
-- the test's own.
delete from public.scan_experiment_window;
insert into public.scan_experiment_window (starts_at, ends_at)
values ('2026-12-01 00:00+08', '2027-02-01 00:00+08');

-- -- WHO IS IN IT ------------------------------------------------------------

select is(public.scan_experiment_arm(:'two_user'), 'two',
  'an account made in the window with an even last digit is in two');
select is(public.scan_experiment_arm(:'control_user'), 'control',
  'and one with an odd last digit is the control');
select is(public.scan_experiment_arm(:'early_user'), null,
  'an account made before the window is not in it, even with an even digit');
select is(public.scan_experiment_arm(:'late_user'), null,
  'and nor is one made at the moment the window closes');

-- -- THE CEILING -------------------------------------------------------------

select is(public.free_daily_scans_for(:'two_user'), 2, 'two gets two free scans');
select is(public.free_daily_scans_for(:'control_user'), 3, 'the control keeps three');
select is(public.free_daily_scans_for(:'early_user'), 3, 'and so does everybody outside the window');
select is(public.scan_daily_limit(:'pro_user'), public.pro_daily_scans(),
  'a Pro account in the window is on the Pro ceiling, whatever its arm');

-- Driven to the edge: two scans each, then the third.
select public.claim_scan(:'two_user');
select public.claim_scan(:'two_user');
select public.claim_scan(:'control_user');
select public.claim_scan(:'control_user');

select is((select allowed from public.claim_scan(:'two_user')), false,
  'two is refused its third scan');
select is((select daily_limit from public.claim_scan(:'two_user')), 2,
  'and the refusal names two, which is the figure the toast prints');
select is((select allowed from public.claim_scan(:'control_user')), true,
  'the control is allowed its third');

-- -- WHAT THE APP CAN ASK ----------------------------------------------------

select ok(
  not (select bool_or(pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('scan_experiment_arm', 'free_daily_scans_for')),
  'the two that take a uuid are not executable by a signed-in user'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'two_user', 'role', 'authenticated')::text, true);

select results_eq(
  'select arm, free_daily_scans from public.scan_experiment()',
  $$values ('two'::text, 2)$$,
  'scan_experiment answers the caller''s own arm and ceiling'
);
select is((select daily_limit from public.scan_usage_today()), 2,
  'and the meter on the camera agrees with it');

-- -- ENDING IT ---------------------------------------------------------------

reset role;

update public.scan_experiment_window set stopped = true;
select is(public.free_daily_scans_for(:'two_user'), 3,
  'stopping the experiment puts two back on three at once');
select is(public.scan_experiment_arm(:'two_user'), 'two',
  'while the account keeps its arm, so the readout still splits by it');

delete from public.scan_experiment_window;
select is(public.scan_experiment_arm(:'two_user'), null,
  'and with no window row nobody is in it');

select ok(
  not has_table_privilege('authenticated', 'public.scan_experiment_window', 'SELECT')
  and not has_table_privilege('anon', 'public.scan_experiment_window', 'SELECT'),
  'the window is the server''s alone'
);

select * from finish();
rollback;
