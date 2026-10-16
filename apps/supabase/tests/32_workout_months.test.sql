-- ---------------------------------------------------------------------------
-- The progress page's monthly bars (`workout_months`): a year is always twelve
-- columns, all time reaches back to the first workout, and a month's totals
-- are its workouts' own.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

\set fresh '99999999-9999-4999-8999-999999999991'
\set lifter '99999999-9999-4999-8999-999999999992'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'fresh', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'months-fresh@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'lifter', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'months-lifter@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claims',
  json_build_object('sub', :'fresh', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.workout_months()),
  12,
  'an account with no workouts still gets a year of empty months'
);

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', :'lifter', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Two workouts in one month three years back, imported from another app.
select public.save_workout(jsonb_build_object(
  'id', 'b0000000-0000-4000-8000-00000000000' || n,
  'name', 'Old push ' || n,
  'started_at', (date_trunc('month', current_date) - interval '36 months' + make_interval(days => n, hours => 10))::timestamptz,
  'ended_at', (date_trunc('month', current_date) - interval '36 months' + make_interval(days => n, hours => 11))::timestamptz,
  'log_date', (date_trunc('month', current_date) - interval '36 months' + make_interval(days => n))::date,
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
      'tracking', 'weight_reps',
      'sets', jsonb_build_array(
        jsonb_build_object('weight_kg', 60, 'reps', 5),
        jsonb_build_object('weight_kg', 60, 'reps', 5))))
))
from generate_series(1, 2) as n;

select is(
  (select count(*)::integer from public.workout_months()),
  37,
  'all time reaches back to the first workout''s month'
);

select is(
  (select month from public.workout_months() limit 1),
  (date_trunc('month', current_date) - interval '36 months')::date,
  'oldest first'
);

select is(
  (select workouts from public.workout_months() order by month limit 1),
  2,
  'both workouts land in their month'
);

select is(
  (select volume_kg from public.workout_months() order by month limit 1),
  1200::numeric,
  'with their volume added up'
);

select is(
  (select sum(workouts)::integer from public.workout_months()),
  2,
  'and no other month counts them'
);

select * from finish();
rollback;
