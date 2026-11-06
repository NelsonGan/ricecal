-- ---------------------------------------------------------------------------
-- Training in a review (`review_workouts`, `review_workout_records`,
-- `review_workout_periods`): a period counts its own workouts and the one
-- before it beside them, a record is the heaviest new best per exercise, and
-- the list has a row for every finished period.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

\set lifter '99999999-9999-4999-8999-9999999999b1'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'lifter', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'review-lifter@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claims',
  json_build_object('sub', :'lifter', 'role', 'authenticated')::text, true);
set local role authenticated;

-- A finished week, counted from `local_today()` as the review list counts it.
create temp table week as
select (date_trunc('week', public.local_today()) - interval '1 week')::date as monday;
grant select on week to authenticated;

select results_eq(
  $$select workouts, prev_workouts, cardinality(trained_on)
      from public.review_workouts('week', (select monday from week))$$,
  $$values (0, 0, 0)$$,
  'a week with no training is one row of zeros'
);

-- The week before: bench 60 x 5, which sets the baseline. The week: bench
-- 70 x 5 on Tuesday (a record) and again 65 x 8 on Thursday (not one), and a
-- second workout on the Thursday.
select public.save_workout(jsonb_build_object(
  'id', w.id,
  'name', 'Session ' || w.n,
  'started_at', (d.day + make_interval(hours => 8 + w.n))::timestamptz,
  'ended_at', (d.day + make_interval(hours => 9 + w.n))::timestamptz,
  'log_date', d.day,
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
      'tracking', 'weight_reps',
      'sets', jsonb_build_array(jsonb_build_object('weight_kg', w.kg, 'reps', w.reps))))
))
from week, (values
  (1, 'd1000000-0000-4000-8000-000000000001'::uuid, -6, 60, 5),
  (2, 'd1000000-0000-4000-8000-000000000002'::uuid, 1, 70, 5),
  (3, 'd1000000-0000-4000-8000-000000000003'::uuid, 3, 65, 8),
  (4, 'd1000000-0000-4000-8000-000000000004'::uuid, 3, 50, 10)
) as w(n, id, offset_days, kg, reps)
cross join lateral (select week.monday + w.offset_days as day) d;

select is(
  (select workouts from public.review_workouts('week', (select monday from week))),
  3,
  'the week counts its three workouts'
);

select is(
  (select prev_workouts from public.review_workouts('week', (select monday from week))),
  1,
  'and the week before has its one beside them'
);

select is(
  (select trained_on from public.review_workouts('week', (select monday from week))),
  array[(select monday + 1 from week), (select monday + 3 from week)],
  'on two days, in order'
);

select is(
  (select duration_s from public.review_workouts('week', (select monday from week))),
  10800,
  'three hours'
);

select results_eq(
  $$select exercise_name, weight_kg, reps
      from public.review_workout_records('week', (select monday from week))$$,
  $$values ('Bench Press (Barbell)'::text, 70::numeric, 5)$$,
  'one record: the heaviest new best, once per exercise'
);

select is(
  (select workouts from public.review_workout_periods('week') where starts_on = (select monday from week)),
  3,
  'the list row for the week has its workouts'
);

select is(
  (select count(*)::integer from public.review_workout_periods('week')),
  (select count(*)::integer from public.review_periods('week')),
  'and the list has a row for every finished week the reviews list has'
);

reset role;

select ok(
  not has_function_privilege('anon', 'public.review_workouts(text, date)', 'execute')
    and not has_function_privilege('anon', 'public.review_workout_records(text, date, integer)', 'execute')
    and not has_function_privilege('anon', 'public.review_workout_periods(text)', 'execute'),
  'anon cannot call any of them'
);

select * from finish();
rollback;
