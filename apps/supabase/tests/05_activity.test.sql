-- ---------------------------------------------------------------------------
-- Movement: isolation, idempotence, and the arithmetic the Activity tab draws.
--
-- Three things worth proving, and only the first is the usual RLS pass:
--
--   1. One user cannot see or write another's movement. Four new tables, and a
--      missing policy on any of them fails by returning MORE rows.
--   2. Re-reading a window converges. The whole sync design rests on every
--      write being an upsert onto a key the provider cannot collide with, and
--      that is a claim about the KEYS, which is a claim this file can check.
--   3. Null and zero stay distinct through `activity_summary`. A provider that
--      reports no stand hours must not average into a confident zero, and a day
--      with food but no watch must not count as a 2,000 kcal deficit.
--
-- Runs as `authenticated` with a forged JWT claim, which is what PostgREST does
-- on every request. As `postgres` the table owner bypasses RLS and every
-- assertion below passes while proving nothing.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

\set user_a '11111111-1111-1111-1111-111111111111'
\set user_b '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

-- UPDATE, not insert. `on_auth_user_created` already created a profile, a
-- settings row and four meal times inside the insert above — see
-- 16_new_user.sql — so inserting them here is a duplicate-key failure before
-- the first assertion runs.
--
-- `local_today()` reads profiles.timezone and every range function is anchored
-- to it; `step_goal` is what "goal days" counts against. Both already default
-- to these values, and both are pinned anyway so the arithmetic below does not
-- silently change the day a default does.
update public.profiles
  set timezone = 'Asia/Kuala_Lumpur'
  where id in (:'user_a', :'user_b');

update public.user_settings
  set step_goal = 8000
  where user_id in (:'user_a', :'user_b');

insert into public.health_connections (user_id, provider, permissions) values
  (:'user_a', 'apple_health', array['HKQuantityTypeIdentifierStepCount']),
  (:'user_b', 'health_connect', array['Steps']);

-- A's yesterday and today. Yesterday carries a resting figure and today does
-- not, which is the asymmetry the balance assertions below turn on.
insert into public.activity_days
  (user_id, log_date, provider, active_kcal, resting_kcal, steps, stand_hours)
values
  (:'user_a', public.local_today(:'user_a') - 1, 'apple_health', 400, 1500, 9000, 11),
  (:'user_a', public.local_today(:'user_a'),     'apple_health', 300, null, 6000, null);

insert into public.activity_days
  (user_id, log_date, provider, active_kcal, resting_kcal, steps)
values
  (:'user_b', public.local_today(:'user_b'), 'health_connect', 111, 1400, 2222);

insert into public.activity_sessions
  (user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s, active_kcal)
values
  (:'user_a', 'apple_health', 'workout-1', public.local_today(:'user_a') - 1,
   'run', now() - interval '1 day', now() - interval '1 day' + interval '34 minutes', 2040, 250);

insert into public.activity_hours (user_id, log_date, hour, steps)
values (:'user_a', public.local_today(:'user_a'), 15, 1200);


-- AS USER A ------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.activity_days),
  2,
  'a user sees only their own activity days'
);

select is(
  (select count(*)::integer from public.activity_sessions),
  1,
  'a user sees only their own workouts'
);

select is(
  (select count(*)::integer from public.activity_hours),
  1,
  'a user sees only their own hourly steps'
);

select is(
  (select count(*)::integer from public.health_connections),
  1,
  'a user sees only their own health connection'
);

-- The attack the with-check half of each policy exists to stop.
select throws_ok(
  format(
    $q$insert into public.activity_days (user_id, log_date, provider, active_kcal)
       values (%L, current_date - 5, 'apple_health', 999)$q$,
    :'user_b'
  ),
  '42501',
  null,
  'a user cannot write an activity day attributed to somebody else'
);

select throws_ok(
  format(
    $q$insert into public.activity_sessions
         (user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s)
       values (%L, 'apple_health', 'forged', current_date, 'run', now(), now(), 0)$q$,
    :'user_b'
  ),
  '42501',
  null,
  'a user cannot write a workout attributed to somebody else'
);


-- IDEMPOTENCE ----------------------------------------------------------------
--
-- The sync re-reads the last seven days on every foreground. These two upserts
-- are exactly what it issues the second time, and the count afterwards is the
-- whole argument for re-reading a window rather than tracking a cursor.

insert into public.activity_days
  (user_id, log_date, provider, active_kcal, resting_kcal, steps, stand_hours)
values
  (:'user_a', public.local_today() - 1, 'apple_health', 420, 1510, 9100, 11)
on conflict (user_id, log_date) do update set
  active_kcal = excluded.active_kcal,
  resting_kcal = excluded.resting_kcal,
  steps = excluded.steps;

select is(
  (select count(*)::integer from public.activity_days),
  2,
  're-reading a day updates it rather than doubling it'
);

select is(
  (select active_kcal from public.activity_days where log_date = public.local_today() - 1),
  420,
  'and the newer reading wins, because a watch revises a day after the fact'
);

insert into public.activity_sessions
  (user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s, active_kcal)
values
  (:'user_a', 'apple_health', 'workout-1', public.local_today() - 1,
   'run', now() - interval '1 day', now() - interval '1 day' + interval '34 minutes', 2040, 248)
on conflict (user_id, provider, external_id) do update set
  active_kcal = excluded.active_kcal;

select is(
  (select count(*)::integer from public.activity_sessions),
  1,
  're-reading a workout updates it rather than logging it twice'
);

-- The same session id under a DIFFERENT provider is a different session. This
-- is what makes the key three columns rather than two: neither store namespaces
-- its ids globally, and a user who changed phone holds rows from both.
insert into public.activity_sessions
  (user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s, active_kcal)
values
  (:'user_a', 'health_connect', 'workout-1', public.local_today() - 1,
   'walk', now() - interval '1 day', now() - interval '1 day' + interval '20 minutes', 1200, 80);

select is(
  (select count(*)::integer from public.activity_sessions),
  2,
  'the same external id from another provider is a separate session'
);


-- THE ARITHMETIC -------------------------------------------------------------

select is(
  (select count(*)::integer from public.activity_days_range('7d')),
  7,
  'a 7d range is seven days whether or not the watch recorded them'
);

select is(
  (select count(*)::integer from public.activity_days_range('7d') where has_data),
  2,
  'and only the days that HAVE a reading are marked as such'
);

select is(
  (select stand_hours_avg from public.activity_summary('7d')),
  11.0::numeric,
  'a null stand-hour day is skipped by the average rather than counted as zero'
);

-- Today has an active figure and no resting one, so it cannot take part in a
-- balance. Yesterday has both and no food, so it cannot either. Nothing is
-- logged, so the honest answer is zero days and a null average.
select is(
  (select balance_days from public.activity_summary('7d')),
  0,
  'a day missing either half is not counted towards the balance'
);

select is(
  (select balance_avg from public.activity_summary('7d')),
  null,
  'and with no such day the average is null rather than a fabricated zero'
);

-- Walking is active energy no session accounts for, clamped at zero. Here the
-- sessions (248 + 80 = 328) cost less than the active total (420 + 300 = 720).
select is(
  (select walking_kcal from public.activity_summary('7d')),
  392,
  'walking is the active energy the recorded sessions do not explain'
);


-- GRANTS ---------------------------------------------------------------------
--
-- `supabase db diff` misses function ACLs against a full local stack, so the
-- revoke is asserted rather than assumed. A leading `=X/postgres` in `proacl`
-- means PUBLIC still holds EXECUTE.
select set_config('request.jwt.claims', null, true);
reset role;

select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('activity_days_range', 'activity_series', 'activity_summary')
     and pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')),
  0,
  'the activity read functions are not executable by PUBLIC'
);

select * from finish();

rollback;
