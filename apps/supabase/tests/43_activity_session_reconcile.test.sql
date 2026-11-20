-- A health store that re-saves its workouts under new ids (Garmin Connect in
-- Apple Health) must not leave a copy behind per rewrite, and a workout the
-- person removed must not come back with the next sync.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);
\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}', '{}'),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}', '{}');

-- Four copies of one run, as four Connect syncs left them, one older run outside
-- the window, and another account's run at the same moment.
insert into public.activity_sessions
  (id, user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s, active_kcal, source_name, created_at)
values
  ('a0000000-0000-0000-0000-000000000001', :'user_a', 'apple_health', 'A', '2026-11-16', 'run', '2026-11-16 13:55:29+00', '2026-11-16 14:18:49+00', 1400, 153, 'Connect', '2026-11-16 14:38:00+00'),
  ('a0000000-0000-0000-0000-000000000002', :'user_a', 'apple_health', 'B', '2026-11-16', 'run', '2026-11-16 13:55:29+00', '2026-11-16 14:18:49+00', 1400, 153, 'Connect', '2026-11-16 16:47:00+00'),
  ('a0000000-0000-0000-0000-000000000003', :'user_a', 'apple_health', 'C', '2026-11-16', 'run', '2026-11-16 13:55:29+00', '2026-11-16 14:18:49+00', 1400, 153, 'Connect', '2026-11-18 14:46:00+00'),
  ('a0000000-0000-0000-0000-000000000004', :'user_a', 'apple_health', 'D', '2026-11-16', 'run', '2026-11-16 13:55:29+00', '2026-11-16 14:18:49+00', 1400, 153, 'Connect', '2026-11-19 11:37:00+00'),
  ('a0000000-0000-0000-0000-000000000005', :'user_a', 'apple_health', 'OLD', '2026-11-01', 'run', '2026-11-01 13:00:00+00', '2026-11-01 13:30:00+00', 1800, 200, 'Connect', '2026-11-01 14:00:00+00'),
  ('a0000000-0000-0000-0000-000000000006', :'user_a', 'demo', 'DEMO', '2026-11-16', 'run', '2026-11-16 08:00:00+00', '2026-11-16 08:30:00+00', 1800, 200, 'Demo', '2026-11-16 09:00:00+00'),
  ('b0000000-0000-0000-0000-000000000001', :'user_b', 'apple_health', 'B1', '2026-11-16', 'run', '2026-11-16 13:55:29+00', '2026-11-16 14:18:49+00', 1400, 153, 'Connect', '2026-11-16 14:38:00+00');

select ok(not has_function_privilege('anon', 'public.reconcile_activity_sessions(public.health_provider,timestamptz,timestamptz,jsonb,uuid)', 'EXECUTE'), 'reconciling is not public');
select ok(not has_function_privilege('anon', 'public.delete_activity_session(uuid)', 'EXECUTE'), 'deleting is not public');
select ok(not has_table_privilege('authenticated', 'public.activity_session_dismissals', 'SELECT'), 'the app cannot read the removed list');
select ok(not has_table_privilege('authenticated', 'public.activity_session_dismissals', 'INSERT'), 'the app cannot write the removed list directly');

select set_config('request.jwt.claims', json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(format($q$select public.reconcile_activity_sessions('apple_health', '2026-11-13', '2026-11-20', '[]', %L)$q$, :'user_b'),
  '42501', 'Health account changed', 'a sync captured under another account cannot prune this one');
select throws_ok($q$select public.reconcile_activity_sessions('apple_health', '2026-11-20', '2026-11-13', '[]')$q$,
  '22023', 'Invalid workout window', 'a reversed window is refused');
select throws_ok($q$select public.reconcile_activity_sessions('apple_health', '2026-11-13', '2026-11-20', null)$q$,
  '22023', 'Expected workouts', 'a null read cannot prune');
select throws_ok($q$select public.reconcile_activity_sessions('apple_health', '2026-11-13', '2026-11-20', '[{"external_id":"D"}]')$q$,
  '22023', 'Expected an id, a start and a kind', 'an identity without a start is refused before anything is deleted');

select is(public.reconcile_activity_sessions('apple_health', '2026-11-13', '2026-11-20', '[]'), 0,
  'an empty read removes nothing');
select is((select count(*)::integer from public.activity_sessions where user_id = :'user_a'), 6,
  'every row is still there after an empty read');

-- The store now holds only the latest copy.
select is(public.reconcile_activity_sessions('apple_health', '2026-11-13', '2026-11-20',
  '[{"external_id":"D","started_at":"2026-11-16T13:55:29.000Z","kind":"run"}]'), 3,
  'the three copies the store no longer holds are removed');
select results_eq($q$select external_id from public.activity_sessions where user_id = auth.uid() and provider = 'apple_health' order by started_at$q$,
  $q$values ('OLD'), ('D')$q$, 'the current copy and the run outside the window remain');
select is((select count(*)::integer from public.activity_sessions where provider = 'demo'), 1,
  'another provider is untouched');

-- Connect re-saves the run again, under a new id.
select is(public.reconcile_activity_sessions('apple_health', '2026-11-13', '2026-11-20',
  '[{"external_id":"E","started_at":"2026-11-16T13:55:29.000Z","kind":"run"}]'), 1,
  'a re-saved workout takes over the row it replaces');
select is((select id::text from public.activity_sessions where external_id = 'E'), 'a0000000-0000-0000-0000-000000000004',
  'the row keeps its id, so its group card and reactions stay');
insert into public.activity_sessions (user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s, active_kcal, source_name)
values (:'user_a', 'apple_health', 'E', '2026-11-16', 'run', '2026-11-16 13:55:29+00', '2026-11-16 14:18:49+00', 1400, 160, 'Connect')
on conflict (user_id, provider, external_id) do update set active_kcal = excluded.active_kcal;
select is((select count(*)::integer from public.activity_sessions where user_id = auth.uid() and provider = 'apple_health' and log_date = '2026-11-16'), 1,
  'the sync''s upsert then updates that row rather than adding one');

-- The person removes it.
select ok(public.delete_activity_session('a0000000-0000-0000-0000-000000000004'), 'a synced workout can be removed');
select ok(not public.delete_activity_session('a0000000-0000-0000-0000-000000000004'), 'removing it twice answers false');
select ok(not public.delete_activity_session('b0000000-0000-0000-0000-000000000001'), 'another account''s workout cannot be removed');

insert into public.activity_sessions (user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s, active_kcal)
values (:'user_a', 'apple_health', 'E', '2026-11-16', 'run', '2026-11-16 13:55:29+00', '2026-11-16 14:18:49+00', 1400, 153)
on conflict (user_id, provider, external_id) do update set active_kcal = excluded.active_kcal;
select is((select count(*)::integer from public.activity_sessions where external_id = 'E'), 0,
  'the next sync of the same workout skips it');
insert into public.activity_sessions (user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s, active_kcal)
values (:'user_a', 'apple_health', 'F', '2026-11-16', 'run', '2026-11-16 13:55:29+00', '2026-11-16 14:18:49+00', 1400, 153);
select is((select count(*)::integer from public.activity_sessions where external_id = 'F'), 0,
  'a copy re-saved under a new id is skipped too');
insert into public.activity_sessions (user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s, active_kcal)
values (:'user_a', 'apple_health', 'G', '2026-11-16', 'walk', '2026-11-16 13:55:29+00', '2026-11-16 14:18:49+00', 1400, 50);
select is((select count(*)::integer from public.activity_sessions where external_id = 'G'), 1,
  'a different workout at the same moment still lands');
reset role;

select is((select count(*)::integer from public.activity_sessions where user_id = :'user_b'), 1,
  'another account is untouched throughout');
select is((select count(*)::integer from public.activity_session_dismissals where user_id = :'user_b'), 0,
  'and has nothing removed');

select * from finish();
rollback;
