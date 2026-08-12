-- ---------------------------------------------------------------------------
-- Weigh-ins with two authors: the user, and a health store.
--
-- `weight_logs` is one row per user per day and both of them write it, so they
-- compete for the same key. The rule is that THE USER WINS, and it is worth a
-- file of its own because every way it can break is quiet:
--
--   1. A synced reading overwriting a typed one does not error. It shows up as
--      a correction that undoes itself, and the rolling window re-reads the
--      last seven days on every foreground, so it undoes itself about once a
--      minute for as long as the app is open. The user would blame the text
--      field.
--   2. A reading the column checks reject must be DROPPED, not raised. This
--      function runs inside the same sync pass that writes activity, so one
--      junk row in somebody's Health app — a 5 kg entry made while testing a
--      scale — would otherwise cost them their steps and their calorie budget
--      as well as their weight.
--   3. Two readings for one day in a single batch raise "cannot affect row a
--      second time", which is the same failure wearing different clothes.
--
-- And one loud consequence worth pinning: a synced weigh-in fires
-- `weight_logs_sync_daily_goals`, so a scale can move the user's calorie
-- target without anybody opening the app.
--
-- Runs as `authenticated` with a forged JWT claim, which is what PostgREST does
-- on every request — and here it is load-bearing beyond the usual RLS reason:
-- `sync_weight_readings` takes the user from `auth.uid()` rather than from an
-- argument, so as `postgres` it would have nobody to write for.
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

-- UPDATE, not insert: `on_auth_user_created` already made the profile. Filled
-- in far enough for `compute_targets` to have every input it needs, because the
-- last assertion is about the budget moving and an incomplete profile makes
-- `sync_daily_goals` return quietly — which would pass for the wrong reason.
update public.profiles
  set sex = 'female', birth_date = '1995-06-01', height_cm = 165,
      activity_level = 'light', timezone = 'Asia/Kuala_Lumpur'
  where id = :'user_a';


-- AS USER A ------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

-- The day the user typed for themselves. Everything below is about whether a
-- health store is allowed to touch this row.
insert into public.weight_logs (user_id, measured_on, weight_kg)
values (:'user_a', date '2026-03-10', 68.0);

-- And a day only the store knows about.
select public.sync_weight_readings('apple_health', jsonb_build_array(
  jsonb_build_object('measured_on', '2026-03-11', 'weight_kg', 71.5, 'body_fat_pct', 24.2)
)) as seeded \gset

select is(
  (select weight_kg from public.weight_logs where measured_on = '2026-03-11'),
  71.5::numeric,
  'a synced reading fills a day the user has nothing for'
);

select is(
  (select provider from public.weight_logs where measured_on = '2026-03-11'),
  'apple_health'::public.health_provider,
  'a synced reading records which store it came from'
);

select is(
  (select body_fat_pct from public.weight_logs where measured_on = '2026-03-11'),
  24.2::numeric,
  'body fat rides along with the weigh-in'
);

-- THE RULE. The store has a different number for a day the user typed.
select public.sync_weight_readings('apple_health', jsonb_build_array(
  jsonb_build_object('measured_on', '2026-03-10', 'weight_kg', 69.9)
)) as over_typed \gset

select is(
  (select weight_kg from public.weight_logs where measured_on = '2026-03-10'),
  68.0::numeric,
  'a synced reading NEVER overwrites one the user typed'
);

select is(
  (select provider from public.weight_logs where measured_on = '2026-03-10'),
  null::public.health_provider,
  'and the row still says the user typed it, so it survives the next sync too'
);

-- The other half: a row the sync itself wrote is its to correct. Health data
-- arrives late and arrives edited — Apple recomputes a day when a second source
-- turns up — so a sync that could not refresh its own rows would freeze the
-- first answer it ever got.
select public.sync_weight_readings('apple_health', jsonb_build_array(
  jsonb_build_object('measured_on', '2026-03-11', 'weight_kg', 70.0)
)) as refreshed \gset

select is(
  (select weight_kg from public.weight_logs where measured_on = '2026-03-11'),
  70.0::numeric,
  'a synced reading does refresh a row a previous sync wrote'
);

-- What the app does when somebody corrects a synced day by hand: the write
-- names `provider` null, which is what moves the row out of the sync's reach.
-- Without that column in the payload PostgREST would leave the old provider in
-- place and the correction would last until the next foreground.
update public.weight_logs
  set weight_kg = 65.5, provider = null
  where measured_on = '2026-03-11';

select public.sync_weight_readings('apple_health', jsonb_build_array(
  jsonb_build_object('measured_on', '2026-03-11', 'weight_kg', 70.0)
)) as after_correction \gset

select is(
  (select weight_kg from public.weight_logs where measured_on = '2026-03-11'),
  65.5::numeric,
  'correcting a synced day by hand takes it out of the sync''s reach for good'
);

-- A junk reading must not take the sync down with it. `weight_kg` is checked
-- `between 20 and 400`, and a 5 kg entry is what somebody testing a scale
-- leaves behind.
select lives_ok(
  $$select public.sync_weight_readings('apple_health', jsonb_build_array(
      jsonb_build_object('measured_on', '2026-03-12', 'weight_kg', 5),
      jsonb_build_object('measured_on', '2026-03-13', 'weight_kg', 72.0)
    ))$$,
  'a reading the column check would reject is dropped rather than raised'
);

select is(
  (select count(*)::integer from public.weight_logs where measured_on = '2026-03-12'),
  0,
  'the impossible reading is not written'
);

select is(
  (select weight_kg from public.weight_logs where measured_on = '2026-03-13'),
  72.0::numeric,
  'and the rest of the same batch still lands'
);

-- Body fat is the same idea one column over, except that dropping it must not
-- cost the weigh-in it came with. A store reporting a fraction (HealthKit's `%`
-- unit is one) would otherwise delete the weight along with it.
select public.sync_weight_readings('apple_health', jsonb_build_array(
  jsonb_build_object('measured_on', '2026-03-14', 'weight_kg', 72.4, 'body_fat_pct', 0.24)
)) as with_fraction \gset

select is(
  (select body_fat_pct from public.weight_logs where measured_on = '2026-03-14'),
  null::numeric,
  'an implausible body fat figure is dropped'
);

select is(
  (select weight_kg from public.weight_logs where measured_on = '2026-03-14'),
  72.4::numeric,
  'but the weight it arrived with is kept'
);

-- Several readings for one day in one batch. ON CONFLICT meeting the same key
-- twice raises, so this is not a preference about which one wins — it is the
-- difference between a sync and an error.
select lives_ok(
  $$select public.sync_weight_readings('apple_health', jsonb_build_array(
      jsonb_build_object('measured_on', '2026-03-15', 'weight_kg', 73.1),
      jsonb_build_object('measured_on', '2026-03-15', 'weight_kg', 72.9)
    ))$$,
  'a day appearing twice in one batch does not raise'
);

select is(
  (select weight_kg from public.weight_logs where measured_on = '2026-03-15'),
  72.9::numeric,
  'and the last reading of that day is the one kept'
);

-- The user comes from the token, so there is no argument to forge.
select is(
  (select count(*)::integer from public.weight_logs where user_id = :'user_b'),
  0,
  'the function writes only for the account that called it'
);

-- The loud consequence: a weigh-in is an input to the calorie budget, and the
-- recompute trigger fires on the function's writes like any other.
select isnt(
  (select count(*)::integer from public.daily_goals where user_id = :'user_a'),
  0,
  'a synced weigh-in recomputes the calorie budget'
);

select * from finish();
rollback;
