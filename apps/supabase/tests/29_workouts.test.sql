-- ---------------------------------------------------------------------------
-- Workouts: saving a whole workout, keeping accounts apart, and what counts as
-- a personal record.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

\set user_a '44444444-4444-4444-4444-444444444444'
\set user_b '55555555-5555-5555-5555-555555555555'
\set user_c '66666666-6666-6666-6666-666666666666'
\set first  'a0000000-0000-4000-8000-000000000001'
\set second 'a0000000-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wa@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wb@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wc@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

-- The first bench session: the baseline, which wins nothing.
select is(
  public.save_workout(jsonb_build_object(
    'id', :'first',
    'name', 'Push',
    'started_at', '2026-10-01T10:00:00Z',
    'ended_at', '2026-10-01T11:00:00Z',
    'log_date', '2026-10-01',
    'exercises', jsonb_build_array(
      jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
        'tracking', 'weight_reps', 'rest_s', 120,
        'sets', jsonb_build_array(
          jsonb_build_object('kind', 'warmup', 'weight_kg', 40, 'reps', 10),
          jsonb_build_object('weight_kg', 60, 'reps', 5),
          jsonb_build_object('weight_kg', 60, 'reps', 5))),
      jsonb_build_object('exercise_id', 'plank', 'exercise_name', 'Plank', 'tracking', 'duration',
        'sets', jsonb_build_array(jsonb_build_object('duration_s', 60)))
    )
  )),
  :'first'::uuid,
  'save_workout returns the id the phone minted'
);

select is((select duration_s from public.workouts where id = :'first'), 3600, 'duration is worked out from the times');
select is((select count(*)::integer from public.workout_sets), 4, 'every set is saved');

-- The same document again, edited: a retry or an edit converges on one workout.
select public.save_workout(jsonb_build_object(
  'id', :'first',
  'name', 'Push day',
  'started_at', '2026-10-01T10:00:00Z',
  'ended_at', '2026-10-01T11:05:00Z',
  'log_date', '2026-10-01',
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
      'tracking', 'weight_reps',
      'sets', jsonb_build_array(
        jsonb_build_object('kind', 'warmup', 'weight_kg', 40, 'reps', 10),
        jsonb_build_object('weight_kg', 60, 'reps', 5),
        jsonb_build_object('weight_kg', 60, 'reps', 5)))
  )
));

select is((select count(*)::integer from public.workouts), 1, 'saving the same id twice is one workout');
select is((select name from public.workouts where id = :'first'), 'Push day', 'the second save wins');
select is((select count(*)::integer from public.workout_sets), 3, 'and its sets replace the old ones');
select is(
  (select count(*)::integer from public.workout_set_details where workout_id = :'first'
     and (is_weight_pr or is_e1rm_pr or is_volume_pr)),
  0,
  'the first workout of an exercise sets the baseline and wins nothing'
);

-- The second session. 62.5 x 5 is the best estimated 1RM (72.9) and 65 x 3 the
-- heaviest; the 100 kg warm-up is neither.
select public.save_workout(jsonb_build_object(
  'id', :'second',
  'name', 'Push',
  'started_at', '2026-10-08T10:00:00Z',
  'ended_at', '2026-10-08T11:00:00Z',
  'log_date', '2026-10-08',
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
      'tracking', 'weight_reps',
      'sets', jsonb_build_array(
        jsonb_build_object('kind', 'warmup', 'weight_kg', 100, 'reps', 1),
        jsonb_build_object('weight_kg', 62.5, 'reps', 5),
        jsonb_build_object('weight_kg', 65, 'reps', 3)))
  )
));

select is(
  (select array_agg(weight_kg order by position) from public.workout_set_details
    where workout_id = :'second' and is_weight_pr),
  array[65.00]::numeric[],
  'only the heaviest working set of the day is the weight record'
);
select is(
  (select array_agg(weight_kg order by position) from public.workout_set_details
    where workout_id = :'second' and is_e1rm_pr),
  array[62.50]::numeric[],
  'the estimated 1RM record goes to the set with the best estimate'
);
select is(
  (select count(*)::integer from public.workout_set_details
    where workout_id = :'second' and kind = 'warmup'
      and (is_weight_pr or is_e1rm_pr or is_volume_pr or is_reps_pr)),
  0,
  'a warm-up is never a record, however heavy'
);
select is(
  (select pr_count from public.workout_summaries where id = :'second'),
  2,
  'the summary counts sets that set a record, not records: 62.5 x 5 holds two'
);
select is(
  (select volume_kg from public.workout_summaries where id = :'second'),
  607.5::numeric,
  'volume counts every set, warm-ups included'
);

select is(
  (select best_weight_kg from public.exercise_bests('barbell-bench-press')),
  65.00::numeric,
  'exercise_bests reports the heaviest working set'
);
select is(
  (select best_e1rm_kg from public.exercise_bests('barbell-bench-press')),
  72.9::numeric,
  'and the best estimated 1RM'
);
select is(
  (select array_agg(reps || ' x ' || weight_kg order by reps)
     from public.exercise_rep_bests('barbell-bench-press')),
  array['3 x 65.00', '5 x 62.50'],
  'rep records take each rep count''s heaviest working set, never a warm-up'
);
select is(
  (select count(*)::integer from public.exercise_history('barbell-bench-press', 50)),
  2,
  'exercise_history has one row per workout'
);
select is(
  (select array_agg(weight_kg order by set_position)
     from public.exercise_last_sets(array['barbell-bench-press'])),
  array[100.00, 62.50, 65.00]::numeric[],
  'the PREVIOUS column reads the most recent workout'
);
select is(
  (select total_workouts from public.workout_overview()),
  2,
  'the overview counts every workout'
);
select is(
  (select sets from public.workout_exercise_totals('2026-10-01', '2026-10-31')
    where exercise_id = 'barbell-bench-press'),
  4,
  'the muscle split counts working sets only'
);

-- A missed rep is not a lift: 150 kg x 0 holds no weight record.
select public.save_workout(jsonb_build_object(
  'id', 'a0000000-0000-4000-8000-000000000003',
  'name', 'Push',
  'started_at', '2026-10-10T10:00:00Z',
  'ended_at', '2026-10-10T11:00:00Z',
  'log_date', '2026-10-10',
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
      'tracking', 'weight_reps',
      'sets', jsonb_build_array(
        jsonb_build_object('weight_kg', 150, 'reps', 0),
        jsonb_build_object('weight_kg', 50, 'reps', 5)))
  )
));

select is(
  (select count(*)::integer from public.workout_set_details
    where workout_id = 'a0000000-0000-4000-8000-000000000003' and is_weight_pr),
  0,
  'a missed rep is not the heaviest weight'
);
select is(
  (select best_weight_kg from public.exercise_bests('barbell-bench-press')),
  65.00::numeric,
  'and does not move the best weight either'
);

-- Two workouts logged at the same minute are still one before the other, so
-- the same 70 kg cannot be a record twice.
select public.save_workout(jsonb_build_object(
  'id', id::text, 'name', 'Push', 'started_at', '2026-10-12T10:00:00Z',
  'ended_at', '2026-10-12T11:00:00Z', 'log_date', '2026-10-12',
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
      'tracking', 'weight_reps',
      'sets', jsonb_build_array(jsonb_build_object('weight_kg', 70, 'reps', 3))))
))
from (values ('a0000000-0000-4000-8000-000000000004'::uuid), ('a0000000-0000-4000-8000-000000000005'::uuid)) as twins (id);

select is(
  (select count(*)::integer from public.workout_set_details
    where workout_id in ('a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000005')
      and is_weight_pr),
  1,
  'two workouts at the same start share one record, not two'
);

insert into public.workout_routines (id, user_id, name)
values ('b0000000-0000-4000-8000-000000000001', :'user_a', 'Push');

-- AS USER C: weeks and the streak, against the real calendar -----------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_c', 'role', 'authenticated')::text, true);

-- This week, last week and three weeks ago, plus one dated next week.
select public.save_workout(jsonb_build_object(
  'id', gen_random_uuid()::text, 'name', 'Run',
  'started_at', (day::timestamp + interval '8 hours') at time zone 'UTC',
  'ended_at', (day::timestamp + interval '9 hours') at time zone 'UTC',
  'log_date', day,
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'running', 'exercise_name', 'Running', 'tracking', 'distance_duration',
      'sets', jsonb_build_array(jsonb_build_object('distance_m', 5000, 'duration_s', 1800))))
))
from (
  select date_trunc('week', public.local_today())::date + offset_days as day
  from unnest(array[0, -7, -21, 8]) as offset_days
) days;

select is(
  (select week_streak from public.workout_overview()),
  2,
  'the streak counts consecutive weeks back from this one'
);
select is(
  (select this_week_workouts from public.workout_overview()),
  1,
  'this week ends on Sunday: a workout dated next week is not in it'
);
select is(
  (select array_agg(workouts order by week) from public.workout_weeks(4)),
  array[1, 0, 1, 1],
  'workout_weeks has a row for every week, empty ones included'
);

-- AS USER B ------------------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);

select is((select count(*)::integer from public.workout_summaries), 0, 'a user sees none of another''s workouts');

select throws_ok(
  format($$select public.save_workout(jsonb_build_object(
    'id', %L, 'name', 'Mine now', 'started_at', '2026-10-01T10:00:00Z',
    'ended_at', '2026-10-01T11:00:00Z', 'log_date', '2026-10-01', 'exercises', '[]'::jsonb))$$, :'first'),
  '42501',
  null,
  'nor can they overwrite one by reusing its id'
);

select throws_ok(
  format($$insert into public.workout_exercises (workout_id, user_id, position, exercise_id, exercise_name, tracking)
    values (%L, %L, 5, 'squat', 'Squat', 'weight_reps')$$, :'first', :'user_b'),
  '23503',
  null,
  'nor attach an exercise of their own to it'
);

select throws_ok(
  format($$insert into public.workouts (id, user_id, name, started_at, ended_at, log_date, routine_id)
    values (gen_random_uuid(), %L, 'Theirs', now(), now(), current_date, %L)$$,
    :'user_b', 'b0000000-0000-4000-8000-000000000001'),
  '23503',
  null,
  'nor point a workout of their own at another account''s routine'
);

-- AS USER A, deleting ----------------------------------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);

delete from public.workouts where id = :'second';
select is(
  (select count(*)::integer from public.workout_sets where workout_exercise_id in (
     select id from public.workout_exercises where workout_id in (:'first', :'second'))),
  3,
  'deleting a workout takes its sets with it'
);

-- Rep records keep only the counts nothing as heavy at more reps has matched:
-- 95 x 3 and 100 x 3 go, because 100 x 5 was lifted. The missed 120, the
-- warm-up and the 40 typed into the reps field are not in the table.
select public.save_workout(jsonb_build_object(
  'id', gen_random_uuid()::text, 'name', 'Legs', 'started_at', '2026-10-14T10:00:00Z',
  'ended_at', '2026-10-14T11:00:00Z', 'log_date', '2026-10-14',
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-squat', 'exercise_name', 'Squat (Barbell)',
      'tracking', 'weight_reps',
      'sets', jsonb_build_array(
        jsonb_build_object('kind', 'warmup', 'weight_kg', 130, 'reps', 1),
        jsonb_build_object('weight_kg', 110, 'reps', 1),
        jsonb_build_object('weight_kg', 95, 'reps', 3),
        jsonb_build_object('weight_kg', 100, 'reps', 3),
        jsonb_build_object('weight_kg', 100, 'reps', 5),
        jsonb_build_object('weight_kg', 40, 'reps', 40),
        jsonb_build_object('weight_kg', 90, 'reps', 8),
        jsonb_build_object('weight_kg', 120, 'reps', 0))))
));
select is(
  (select array_agg(reps || ' x ' || weight_kg order by reps)
     from public.exercise_rep_bests('barbell-squat')),
  array['1 x 110.00', '5 x 100.00', '8 x 90.00'],
  'a rep count matched or beaten at more reps is not a rep record'
);

-- The same 110 x 1 a week later: the record is still dated the first time.
select public.save_workout(jsonb_build_object(
  'id', gen_random_uuid()::text, 'name', 'Legs', 'started_at', '2026-10-21T10:00:00Z',
  'ended_at', '2026-10-21T11:00:00Z', 'log_date', '2026-10-21',
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-squat', 'exercise_name', 'Squat (Barbell)',
      'tracking', 'weight_reps',
      'sets', jsonb_build_array(jsonb_build_object('weight_kg', 110, 'reps', 1))))
));
select is(
  (select started_at from public.exercise_rep_bests('barbell-squat') where reps = 1),
  '2026-10-14T10:00:00Z'::timestamptz,
  'a repeated rep record keeps the date it was first lifted'
);

select is(
  (select count(*)::integer
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('save_workout', 'exercise_bests', 'exercise_rep_bests', 'exercise_history',
       'exercise_last_sets', 'workout_weeks', 'workout_overview', 'workout_exercise_totals')
     and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'no workout function is callable signed out'
);

select * from finish();

rollback;
