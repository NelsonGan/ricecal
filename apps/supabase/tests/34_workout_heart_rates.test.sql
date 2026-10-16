-- ---------------------------------------------------------------------------
-- A workout's Apple Watch heart rate: saved beside the workout, its figures
-- worked out here, kept apart between accounts, and gone with the workout.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

\set user_a '77777777-7777-4777-8777-777777777771'
\set user_b '77777777-7777-4777-8777-777777777772'
\set lift   'b0000000-0000-4000-8000-000000000001'
\set later  'b0000000-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'user_a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hra@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hrb@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
set local role authenticated;

-- The trace often reaches the phone before the workout has left its outbox.
select is(
  public.save_workout_heart_rate(jsonb_build_object(
    'workout_id', :'lift', 'started_at', '2026-10-01T10:00:00Z', 'interval_s', 5,
    'bpm', jsonb_build_array(100, 120))),
  'missing',
  'a trace for a workout not saved yet is missing, not an error'
);
select is((select count(*)::integer from public.workout_heart_rates), 0, 'and nothing is stored');

select public.save_workout(jsonb_build_object(
  'id', :'lift', 'name', 'Push',
  'started_at', '2026-10-01T10:00:00Z', 'ended_at', '2026-10-01T11:00:00Z', 'log_date', '2026-10-01',
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
      'tracking', 'weight_reps', 'sets', jsonb_build_array(jsonb_build_object('weight_kg', 60, 'reps', 5))))
));

select is(
  public.save_workout_heart_rate(jsonb_build_object(
    'workout_id', :'lift', 'started_at', '2026-10-01T10:00:00Z', 'interval_s', 5,
    'bpm', jsonb_build_array(90, null, 120.4, 150, null),
    'active_kcal', 212.6, 'health_workout_id', 'WATCH-UUID')),
  'saved',
  'once the workout is there the trace is saved'
);

select results_eq(
  $$select avg_bpm::integer, max_bpm::integer, min_bpm::integer, active_kcal, cardinality(bpm)
      from public.workout_heart_rates where workout_id = 'b0000000-0000-4000-8000-000000000001'$$,
  $$values (120, 150, 90, 213, 5)$$,
  'the figures are worked out from the readings, gaps left out'
);
select is(
  (select bpm[2] from public.workout_heart_rates where workout_id = :'lift'),
  null,
  'a gap stays a gap'
);
select is(
  (select health_workout_id from public.workouts where id = :'lift'),
  'WATCH-UUID',
  'the watch''s Health copy is recorded on a workout that had none'
);

select is(
  (select kcal from public.workouts where id = :'lift'),
  213,
  'the workout carries the energy the watch measured, which is what Health holds'
);

-- Sent again, as a retry would: one row, the newer trace.
select public.save_workout_heart_rate(jsonb_build_object(
  'workout_id', :'lift', 'started_at', '2026-10-01T10:00:00Z', 'interval_s', 5,
  'bpm', jsonb_build_array(100, 110), 'active_kcal', 212.6, 'health_workout_id', 'OTHER'));
select is((select count(*)::integer from public.workout_heart_rates), 1, 'saving twice is one trace');
select is((select max_bpm::integer from public.workout_heart_rates), 110, 'and the second one wins');
select is(
  (select health_workout_id from public.workouts where id = :'lift'),
  'WATCH-UUID',
  'a Health copy already on record is kept'
);

-- An edit rewrites the workout and leaves its trace alone. Sent as an older
-- build, or a save retried after the trace landed, would send it: the phone's
-- estimate and no Health copy.
select public.save_workout(jsonb_build_object(
  'id', :'lift', 'name', 'Push day', 'kcal', 50, 'health_workout_id', null,
  'started_at', '2026-10-01T10:00:00Z', 'ended_at', '2026-10-01T11:00:00Z', 'log_date', '2026-10-01',
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
      'tracking', 'weight_reps', 'sets', jsonb_build_array(jsonb_build_object('weight_kg', 62.5, 'reps', 5))))
));
select is((select count(*)::integer from public.workout_heart_rates), 1, 'editing the workout keeps its trace');
select is((select name from public.workouts where id = :'lift'), 'Push day', 'and still saves the edit');
select results_eq(
  $$select kcal, health_workout_id from public.workouts where id = 'b0000000-0000-4000-8000-000000000001'$$,
  $$values (213, 'WATCH-UUID'::text)$$,
  'but keeps the energy the watch measured and the Health copy it saved'
);

select throws_ok(
  format($$select public.save_workout_heart_rate(%L::jsonb)$$, jsonb_build_object(
    'workout_id', :'lift', 'started_at', '2026-10-01T10:00:00Z', 'interval_s', 5,
    'bpm', jsonb_build_array(80, 400))),
  '22003', null,
  'a reading that is not a heartbeat is refused'
);
-- A watch that read no pulse (a loose strap, heart rate not allowed) still
-- recorded the workout, and its Health copy and energy still count.
select public.save_workout(jsonb_build_object(
  'id', :'later', 'name', 'Pull',
  'started_at', '2026-10-02T10:00:00Z', 'ended_at', '2026-10-02T11:00:00Z', 'log_date', '2026-10-02',
  'exercises', jsonb_build_array(
    jsonb_build_object('exercise_id', 'pull-up', 'exercise_name', 'Pull Up',
      'tracking', 'reps', 'sets', jsonb_build_array(jsonb_build_object('reps', 8))))
));
select is(
  public.save_workout_heart_rate(jsonb_build_object(
    'workout_id', :'later', 'started_at', '2026-10-02T10:00:00Z', 'interval_s', 5,
    'bpm', jsonb_build_array(null, null), 'active_kcal', 80, 'health_workout_id', 'QUIET')),
  'saved',
  'a trace with no reading is still kept'
);
select results_eq(
  $$select h.avg_bpm, h.max_bpm, w.kcal, w.health_workout_id
      from public.workout_heart_rates h join public.workouts w on w.id = h.workout_id
     where h.workout_id = 'b0000000-0000-4000-8000-000000000002'$$,
  $$values (null::smallint, null::smallint, 80, 'QUIET'::text)$$,
  'with no figures, and the watch''s Health copy and energy on the workout'
);
delete from public.workouts where id = :'later';
select throws_ok(
  $$insert into public.workout_heart_rates (workout_id, user_id, started_at, interval_s, bpm, avg_bpm, max_bpm, min_bpm)
    values ('b0000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777771', now(), 5, '{60}', 60, 60, 60)$$,
  '42501', null,
  'clients cannot write the table directly'
);

-- Another account sees nothing and cannot attach a trace to this workout.
select set_config('request.jwt.claims',
  json_build_object('sub', :'user_b', 'role', 'authenticated')::text, true);

select is((select count(*)::integer from public.workout_heart_rates), 0, 'another account reads no trace');
select is(
  public.save_workout_heart_rate(jsonb_build_object(
    'workout_id', :'lift', 'started_at', '2026-10-01T10:00:00Z', 'interval_s', 5,
    'bpm', jsonb_build_array(70))),
  'missing',
  'nor can it write one onto a workout it does not own'
);

select set_config('request.jwt.claims',
  json_build_object('sub', :'user_a', 'role', 'authenticated')::text, true);
select is((select max_bpm::integer from public.workout_heart_rates), 110, 'the owner''s trace is untouched');

delete from public.workouts where id = :'lift';
select is((select count(*)::integer from public.workout_heart_rates), 0, 'deleting the workout deletes its trace');

select * from finish();
rollback;
