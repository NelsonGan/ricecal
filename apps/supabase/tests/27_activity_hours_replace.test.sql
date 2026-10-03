begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}', '{}'),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}', '{}');
insert into public.activity_hours (user_id, log_date, hour, steps, active_kcal, distance_m) values
  (:'user_a', '2026-09-30', 9, 50, 0, null),
  (:'user_a', '2026-10-01', 9, 100, 10, 90),
  (:'user_a', '2026-10-01', 10, 200, 20, null),
  (:'user_b', '2026-10-01', 9, 900, 90, 900);

select ok(not has_function_privilege('anon', 'public.replace_activity_hours(date,date,jsonb,uuid)', 'EXECUTE'), 'replacement is not public');
select set_config('request.jwt.claims', json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format($q$select public.replace_activity_hours('2026-10-01', '2026-10-03', '[]', %L)$q$, :'user_b'), '42501', 'Health account changed', 'a sync captured under a different account cannot clear this account');
select is(public.replace_activity_hours('2026-10-01', '2026-10-03',
  '[{"log_date":"2026-10-01","hour":9,"steps":150,"active_kcal":15,"distance_m":null},
    {"log_date":"2026-10-03","hour":11,"steps":300,"active_kcal":30,"distance_m":250}]'),
  3, 'replacement deletes vanished hours, revises changed ones and adds new ones');
select is((select steps from public.activity_hours where log_date = '2026-10-01' and hour = 9), 150, 'late step correction lands');
select is((select distance_m from public.activity_hours where log_date = '2026-10-01' and hour = 9), null::integer, 'removed distance is cleared');
select is((select count(*)::integer from public.activity_hours where hour = 10), 0, 'disappeared source hour is removed');
select is((select count(*)::integer from public.activity_hours where log_date = '2026-09-30'), 1, 'hours outside the read window remain');
reset role;
select is((select steps from public.activity_hours where user_id = :'user_b'), 900, 'another account is untouched');
create temp table unchanged as select log_date, hour, ctid::text as tuple, created_at
  from public.activity_hours where user_id = :'user_a';
grant select on unchanged to authenticated;
set local role authenticated;
select is(public.replace_activity_hours('2026-10-01', '2026-10-03',
  '[{"log_date":"2026-10-01","hour":9,"steps":150,"active_kcal":15,"distance_m":null},
    {"log_date":"2026-10-03","hour":11,"steps":300,"active_kcal":30,"distance_m":250}]'),
  0, 'identical foreground read does not delete, insert or update');
select results_eq(
  'select log_date, hour, ctid::text, created_at from public.activity_hours order by log_date, hour',
  'select log_date, hour, tuple, created_at from unchanged order by log_date, hour',
  'unchanged hours retain their physical tuples and timestamps');

select throws_ok($q$select public.replace_activity_hours('2026-10-01', '2026-10-03',
  '[{"log_date":"2026-10-02","hour":25,"steps":1}]')$q$,
  '23514', null, 'invalid measurement fails after any deletes within the transaction');
select results_eq(
  'select log_date, hour, ctid::text, created_at from public.activity_hours order by log_date, hour',
  'select log_date, hour, tuple, created_at from unchanged order by log_date, hour',
  'failed replacement leaves the previous window intact');
select throws_ok($q$select public.replace_activity_hours('2026-10-01', '2026-10-03', null)$q$, '22023', 'Expected hourly readings', 'null payload cannot erase a window');
select throws_ok($q$select public.replace_activity_hours('2026-10-01', '2026-10-03', '[{"log_date":"2026-09-30","hour":9}]')$q$, '22023', 'Hourly reading outside window', 'out-of-window readings are rejected before deleting');
select throws_ok($q$select public.replace_activity_hours('2026-10-03', '2026-10-01')$q$, '22023', 'Invalid hourly window', 'reversed window is rejected');
select throws_ok($q$select public.replace_activity_hours('2026-09-01', '2026-10-03')$q$, '22023', 'Invalid hourly window', 'replacement stays bounded to a month');

select is(public.replace_activity_hours('2026-10-01', '2026-10-03'), 2, 'empty successful read removes only its window');
select is((select count(*)::integer from public.activity_hours), 1, 'earlier history is left alone by an empty replacement');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($q$select public.replace_activity_hours('2026-10-01', '2026-10-03')$q$, '42501', 'Authentication required', 'missing session cannot modify hours');
reset role;
select is((select steps from public.activity_hours where user_id = :'user_b'), 900, 'another account survives empty and failed replacements');

select * from finish();
rollback;
