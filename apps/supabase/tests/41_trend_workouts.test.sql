-- ---------------------------------------------------------------------------
-- Workouts on the Trends screen (`trend_workouts`, `trend_workout_summary`):
-- the columns match the other trend charts, a day with two workouts is one
-- active day, and the range before is counted beside the range, never in it.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

\set lifter '99999999-9999-4999-8999-9999999999a1'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'lifter', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'trend-lifter@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claims',
  json_build_object('sub', :'lifter', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::integer from public.trend_workouts('7d')),
  7,
  'seven days is seven columns, with nothing logged'
);

select is(
  (select count(*)::integer from public.trend_workouts('30d')),
  5,
  'thirty days is five blocks, as trend_series draws them'
);

select is(
  (select count(*)::integer from public.trend_workouts('1y')),
  12,
  'a year is twelve months'
);

select is(
  (select workouts from public.trend_workout_summary('7d')),
  0,
  'an empty range still answers one row of zeros'
);

-- Two workouts today, one an hour each with 2 x 60 kg x 5, and one eight days
-- ago, which is in the week before this one. Days are counted from
-- `local_today()`, as the functions count them.
select public.save_workout(jsonb_build_object(
  'id', w.id,
  'name', 'Session ' || w.n,
  'started_at', (w.day + make_interval(hours => 8 + w.n))::timestamptz,
  'ended_at', (w.day + make_interval(hours => 9 + w.n))::timestamptz,
  'log_date', w.day,
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
      'tracking', 'weight_reps',
      'sets', jsonb_build_array(
        jsonb_build_object('weight_kg', 60, 'reps', 5),
        jsonb_build_object('weight_kg', 60, 'reps', 5))))
))
from (values
  (1, 'c0000000-0000-4000-8000-000000000001'::uuid, public.local_today()),
  (2, 'c0000000-0000-4000-8000-000000000002'::uuid, public.local_today()),
  (3, 'c0000000-0000-4000-8000-000000000003'::uuid, public.local_today() - 8)
) as w(n, id, day);

select is(
  (select workouts from public.trend_workouts('7d') where bucket_start = public.local_today()),
  2,
  'both of today''s workouts land in today''s column'
);

select is(
  (select active_days from public.trend_workouts('7d') where bucket_start = public.local_today()),
  1,
  'and they are one active day'
);

select is(
  (select duration_s from public.trend_workouts('7d') where bucket_start = public.local_today()),
  7200,
  'with their time added up'
);

select is(
  (select volume_kg from public.trend_workouts('7d') where bucket_start = public.local_today()),
  1200::numeric,
  'and their volume'
);

select is(
  (select sum(workouts)::integer from public.trend_workouts('7d')),
  2,
  'the workout eight days ago is not in the week'
);

select results_eq(
  $$select workouts, active_days, duration_s, sets from public.trend_workout_summary('7d')$$,
  $$values (2, 1, 7200, 4)$$,
  'the week''s summary is the week''s workouts'
);

select results_eq(
  $$select prev_workouts, prev_active_days, prev_duration_s, prev_volume_kg
      from public.trend_workout_summary('7d')$$,
  $$values (1, 1, 3600, 600::numeric)$$,
  'and the week before is counted beside it'
);

select is(
  (select workouts from public.trend_workout_summary('30d')),
  3,
  'thirty days holds all three'
);

-- A year back: one workout on this day a year ago, which the year before
-- counts, and one the day after, which it does not. The year's own window
-- is only partway through its twelfth month, and the year before must stop at
-- the same point or every day but the last reads as a fall in training.
select public.save_workout(jsonb_build_object(
  'id', w.id,
  'name', 'Last year ' || w.n,
  'started_at', (w.day + make_interval(hours => 8))::timestamptz,
  'ended_at', (w.day + make_interval(hours => 9))::timestamptz,
  'log_date', w.day,
  'exercises', jsonb_build_array()
))
from (values
  (1, 'c0000000-0000-4000-8000-000000000004'::uuid, (public.local_today() - interval '12 months')::date),
  (2, 'c0000000-0000-4000-8000-000000000005'::uuid, (public.local_today() - interval '12 months')::date + 1)
) as w(n, id, day);

select is(
  (select prev_workouts from public.trend_workout_summary('1y')),
  1,
  'the year before stops on this day a year ago'
);

reset role;

select ok(
  not has_function_privilege('anon', 'public.trend_workouts(text)', 'execute')
    and not has_function_privilege('anon', 'public.trend_workout_summary(text)', 'execute'),
  'anon cannot call either'
);

select * from finish();
rollback;
