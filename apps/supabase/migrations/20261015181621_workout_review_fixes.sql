-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.exercise_bests (
  p_exercise_id text DEFAULT NULL::text
)
  RETURNS TABLE (
    exercise_id            text,
    exercise_name          text,
    tracking               public.exercise_tracking,
    workouts               integer,
    sets                   integer,
    last_at                timestamp with time zone,
    best_weight_kg         numeric,
    best_weight_reps       smallint,
    best_weight_at         timestamp with time zone,
    best_e1rm_kg           numeric,
    best_e1rm_at           timestamp with time zone,
    best_set_volume_kg     numeric,
    best_session_volume_kg numeric,
    best_reps              smallint,
    best_duration_s        integer,
    best_distance_m        numeric,
    total_volume_kg        numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with sets as (
    select v.*
    from public.workout_set_values v
    where v.user_id = (select auth.uid())
      and (p_exercise_id is null or v.exercise_id = p_exercise_id)
  ),
  sessions as (
    select s.exercise_id, s.workout_id, s.started_at, sum(s.volume_kg) as volume_kg
    from sets s
    group by s.exercise_id, s.workout_id, s.started_at
  ),
  latest as (
    select distinct on (s.exercise_id) s.exercise_id, s.exercise_name, s.tracking
    from sets s
    order by s.exercise_id, s.started_at desc
  ),
  totals as (
    select
      x.exercise_id,
      count(*)::integer as workouts,
      max(x.started_at) as last_at,
      max(x.volume_kg) as best_session_volume_kg
    from sessions x
    group by x.exercise_id
  ),
  figures as (
    select
      s.exercise_id,
      count(*)::integer as sets,
      max(s.volume_kg) filter (where s.kind <> 'warmup') as best_set_volume_kg,
      max(s.reps) filter (where s.kind <> 'warmup' and s.tracking in ('reps', 'weighted_reps', 'assisted_reps')) as best_reps,
      max(s.duration_s) filter (where s.kind <> 'warmup' and s.tracking in ('duration', 'distance_duration')) as best_duration_s,
      max(s.distance_m) filter (where s.kind <> 'warmup' and s.tracking in ('distance_duration', 'weight_distance')) as best_distance_m,
      coalesce(sum(s.volume_kg), 0) as total_volume_kg
    from sets s
    group by s.exercise_id
  ),
  heaviest as (
    select distinct on (s.exercise_id) s.exercise_id, s.weight_kg, s.reps, s.started_at
    from sets s
    where s.weight_counts
    order by s.exercise_id, s.weight_kg desc, s.reps desc nulls last, s.started_at
  ),
  strongest as (
    select distinct on (s.exercise_id) s.exercise_id, s.e1rm_kg, s.started_at
    from sets s
    where s.kind <> 'warmup' and s.e1rm_kg is not null
    order by s.exercise_id, s.e1rm_kg desc, s.started_at
  )
  select
    l.exercise_id,
    l.exercise_name,
    l.tracking,
    t.workouts,
    f.sets,
    t.last_at,
    h.weight_kg,
    h.reps,
    h.started_at,
    st.e1rm_kg,
    st.started_at,
    f.best_set_volume_kg,
    t.best_session_volume_kg,
    f.best_reps,
    f.best_duration_s,
    f.best_distance_m,
    f.total_volume_kg
  from latest l
  join totals t on t.exercise_id = l.exercise_id
  join figures f on f.exercise_id = l.exercise_id
  left join heaviest h on h.exercise_id = l.exercise_id
  left join strongest st on st.exercise_id = l.exercise_id
  order by t.last_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.exercise_last_sets (
  p_exercise_ids text[]
)
  RETURNS TABLE (
    exercise_id  text,
    workout_id   uuid,
    started_at   timestamp with time zone,
    set_position smallint,
    kind         public.workout_set_kind,
    weight_kg    numeric,
    reps         smallint,
    duration_s   integer,
    distance_m   numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with last_entry as (
    select distinct on (e.exercise_id) e.exercise_id, e.id
    from public.workout_exercises e
    join public.workouts w on w.id = e.workout_id
    where e.user_id = (select auth.uid())
      and e.exercise_id = any (p_exercise_ids)
      -- An entry with no sets would make the column blank over older ones that have them.
      and exists (select 1 from public.workout_sets s where s.workout_exercise_id = e.id)
    order by e.exercise_id, w.started_at desc, e.position desc
  )
  select l.exercise_id, w.id, w.started_at, s.position, s.kind, s.weight_kg, s.reps, s.duration_s, s.distance_m
  from last_entry l
  join public.workout_exercises e on e.id = l.id
  join public.workouts w on w.id = e.workout_id
  join public.workout_sets s on s.workout_exercise_id = e.id
  order by l.exercise_id, s.position;
$function$;

CREATE OR REPLACE FUNCTION public.save_workout (
  p_workout jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_user      uuid := (select auth.uid());
  v_id        uuid;
  v_exercise  jsonb;
  v_set       jsonb;
  v_ex_id     uuid;
  v_ex_pos    integer := 0;
  v_set_pos   integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_workout is null or jsonb_typeof(p_workout) <> 'object' then
    raise exception 'Expected a workout' using errcode = '22023';
  end if;
  if jsonb_typeof(p_workout -> 'exercises') is distinct from 'array' then
    raise exception 'Expected a list of exercises' using errcode = '22023';
  end if;
  if jsonb_array_length(p_workout -> 'exercises') > 60 then
    raise exception 'Too many exercises' using errcode = '22023';
  end if;

  v_id := (p_workout ->> 'id')::uuid;

  insert into public.workouts as w (
    id, user_id, name, notes, started_at, ended_at, log_date, routine_id, kcal, health_workout_id
  )
  values (
    v_id,
    v_user,
    btrim(p_workout ->> 'name'),
    nullif(btrim(p_workout ->> 'notes'), ''),
    (p_workout ->> 'started_at')::timestamptz,
    (p_workout ->> 'ended_at')::timestamptz,
    (p_workout ->> 'log_date')::date,
    -- A routine deleted while the workout was running is not an error: the
    -- workout still happened, it just no longer has a plan to point at.
    (select r.id from public.workout_routines r
      where r.id = (p_workout ->> 'routine_id')::uuid and r.user_id = v_user),
    (p_workout ->> 'kcal')::integer,
    nullif(p_workout ->> 'health_workout_id', '')
  )
  on conflict (id) do update set
    name = excluded.name,
    notes = excluded.notes,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    log_date = excluded.log_date,
    routine_id = excluded.routine_id,
    kcal = excluded.kcal,
    health_workout_id = excluded.health_workout_id
  where w.user_id = v_user;

  -- The `where` above makes a foreign id a silent no-op rather than an error,
  -- so check that the row really is ours before touching its children.
  if not exists (select 1 from public.workouts w where w.id = v_id and w.user_id = v_user) then
    raise exception 'Workout belongs to another account' using errcode = '42501';
  end if;

  delete from public.workout_exercises e where e.workout_id = v_id and e.user_id = v_user;

  for v_exercise in select value from jsonb_array_elements(p_workout -> 'exercises')
  loop
    if jsonb_typeof(v_exercise -> 'sets') is distinct from 'array' then
      raise exception 'Expected a list of sets' using errcode = '22023';
    end if;
    if jsonb_array_length(v_exercise -> 'sets') > 99 then
      raise exception 'Too many sets' using errcode = '22023';
    end if;
    -- An exercise with nothing done is not part of the workout, and one saved
    -- anyway blanked that exercise's PREVIOUS column the next time.
    if jsonb_array_length(v_exercise -> 'sets') = 0 then
      raise exception 'An exercise needs a set' using errcode = '22023';
    end if;

    insert into public.workout_exercises (
      workout_id, user_id, position, exercise_id, exercise_name, tracking, superset, rest_s, notes
    )
    values (
      v_id,
      v_user,
      v_ex_pos,
      v_exercise ->> 'exercise_id',
      btrim(v_exercise ->> 'exercise_name'),
      (v_exercise ->> 'tracking')::public.exercise_tracking,
      (v_exercise ->> 'superset')::smallint,
      (v_exercise ->> 'rest_s')::integer,
      nullif(btrim(v_exercise ->> 'notes'), '')
    )
    returning id into v_ex_id;

    v_set_pos := 0;
    for v_set in select value from jsonb_array_elements(v_exercise -> 'sets')
    loop
      -- A set with no number in it counted in every total of sets and muscles.
      if jsonb_typeof(v_set) is distinct from 'object'
        or num_nonnulls(v_set ->> 'weight_kg', v_set ->> 'reps', v_set ->> 'duration_s', v_set ->> 'distance_m') = 0
      then
        raise exception 'A set needs a number' using errcode = '22023';
      end if;
      insert into public.workout_sets (
        workout_exercise_id, user_id, position, kind, weight_kg, reps, duration_s, distance_m, rpe
      )
      values (
        v_ex_id,
        v_user,
        v_set_pos,
        coalesce((v_set ->> 'kind')::public.workout_set_kind, 'normal'),
        (v_set ->> 'weight_kg')::numeric,
        (v_set ->> 'reps')::smallint,
        (v_set ->> 'duration_s')::integer,
        (v_set ->> 'distance_m')::numeric,
        (v_set ->> 'rpe')::numeric
      );
      v_set_pos := v_set_pos + 1;
    end loop;

    v_ex_pos := v_ex_pos + 1;
  end loop;

  -- The routines list is ordered by use as well as by hand: "last done 3 days
  -- ago" is how somebody running a split knows which day is next.
  update public.workout_routines r
     set last_used_at = greatest(r.last_used_at, (p_workout ->> 'started_at')::timestamptz)
   where r.id = (p_workout ->> 'routine_id')::uuid and r.user_id = v_user;

  return v_id;
end;
$function$;

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_log_date_near_start
    CHECK (log_date >= ((started_at AT TIME ZONE 'UTC'::text)::date - 1) AND log_date <= ((started_at AT TIME ZONE 'UTC'::text)::date + 1));

CREATE OR REPLACE VIEW public.workout_set_values WITH (security_invoker=true) AS SELECT s.id,
    s.user_id,
    e.workout_id,
    s.workout_exercise_id,
    e.exercise_id,
    e.exercise_name,
    e.tracking,
    e."position" AS exercise_position,
    s."position",
    s.kind,
    s.weight_kg,
    s.reps,
    s.duration_s,
    s.distance_m,
    s.rpe,
    w.started_at,
    w.log_date,
        CASE
            WHEN ((e.tracking = ANY (ARRAY['weight_reps'::public.exercise_tracking, 'weighted_reps'::public.exercise_tracking])) AND (s.weight_kg > (0)::numeric) AND (s.reps > 0)) THEN (s.weight_kg * (s.reps)::numeric)
            ELSE NULL::numeric
        END AS volume_kg,
        CASE
            WHEN ((e.tracking = 'weight_reps'::public.exercise_tracking) AND (s.weight_kg > (0)::numeric) AND (s.reps = 1)) THEN s.weight_kg
            WHEN ((e.tracking = 'weight_reps'::public.exercise_tracking) AND (s.weight_kg > (0)::numeric) AND ((s.reps >= 2) AND (s.reps <= 15))) THEN round(((s.weight_kg * ((30 + s.reps))::numeric) / 30.0), 1)
            ELSE NULL::numeric
        END AS e1rm_kg,
    (s.kind <> 'warmup'::public.workout_set_kind) AS counts,
    COALESCE(((s.kind <> 'warmup'::public.workout_set_kind) AND (s.weight_kg > (0)::numeric) AND (((e.tracking = ANY (ARRAY['weight_reps'::public.exercise_tracking, 'weighted_reps'::public.exercise_tracking])) AND (s.reps >= 1)) OR ((e.tracking = 'weight_distance'::public.exercise_tracking) AND (s.distance_m > (0)::numeric)))), false) AS weight_counts
   FROM ((public.workout_sets s
     JOIN public.workout_exercises e ON ((e.id = s.workout_exercise_id)))
     JOIN public.workouts w ON ((w.id = e.workout_id)));

CREATE OR REPLACE VIEW public.workout_set_details WITH (security_invoker=true) AS WITH bests AS (
         SELECT v.user_id,
            v.exercise_id,
            v.workout_id,
            v.started_at,
            max(v.weight_kg) FILTER (WHERE v.weight_counts) AS weight_kg,
            max(v.e1rm_kg) FILTER (WHERE v.counts) AS e1rm_kg,
            max(v.volume_kg) FILTER (WHERE v.counts) AS volume_kg,
            max(v.reps) FILTER (WHERE (v.counts AND (v.tracking = ANY (ARRAY['reps'::public.exercise_tracking, 'weighted_reps'::public.exercise_tracking, 'assisted_reps'::public.exercise_tracking])))) AS reps,
            max(v.duration_s) FILTER (WHERE (v.counts AND (v.tracking = ANY (ARRAY['duration'::public.exercise_tracking, 'distance_duration'::public.exercise_tracking])))) AS duration_s,
            max(v.distance_m) FILTER (WHERE (v.counts AND (v.tracking = ANY (ARRAY['distance_duration'::public.exercise_tracking, 'weight_distance'::public.exercise_tracking])))) AS distance_m
           FROM public.workout_set_values v
          GROUP BY v.user_id, v.exercise_id, v.workout_id, v.started_at
        ), prior AS (
         SELECT b.workout_id,
            b.exercise_id,
            max(b.weight_kg) OVER earlier AS prior_weight,
            max(b.e1rm_kg) OVER earlier AS prior_e1rm,
            max(b.volume_kg) OVER earlier AS prior_volume,
            max(b.reps) OVER earlier AS prior_reps,
            max(b.duration_s) OVER earlier AS prior_duration,
            max(b.distance_m) OVER earlier AS prior_distance
           FROM bests b
          WINDOW earlier AS (PARTITION BY b.user_id, b.exercise_id ORDER BY b.started_at, b.workout_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
        ), joined AS (
         SELECT v.id,
            v.user_id,
            v.workout_id,
            v.workout_exercise_id,
            v.exercise_id,
            v.exercise_name,
            v.tracking,
            v.exercise_position,
            v."position",
            v.kind,
            v.weight_kg,
            v.reps,
            v.duration_s,
            v.distance_m,
            v.rpe,
            v.started_at,
            v.log_date,
            v.volume_kg,
            v.e1rm_kg,
            v.counts,
            v.weight_counts,
            p.prior_weight,
            p.prior_e1rm,
            p.prior_volume,
            p.prior_reps,
            p.prior_duration,
            p.prior_distance
           FROM (public.workout_set_values v
             JOIN prior p ON (((p.workout_id = v.workout_id) AND (p.exercise_id = v.exercise_id))))
        ), ranked AS (
         SELECT j.id,
            j.user_id,
            j.workout_id,
            j.workout_exercise_id,
            j.exercise_id,
            j.exercise_name,
            j.tracking,
            j.exercise_position,
            j."position",
            j.kind,
            j.weight_kg,
            j.reps,
            j.duration_s,
            j.distance_m,
            j.rpe,
            j.started_at,
            j.log_date,
            j.volume_kg,
            j.e1rm_kg,
            j.counts,
            j.weight_counts,
            j.prior_weight,
            j.prior_e1rm,
            j.prior_volume,
            j.prior_reps,
            j.prior_duration,
            j.prior_distance,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.weight_counts DESC, j.weight_kg DESC NULLS LAST, j.reps DESC NULLS LAST, j.exercise_position, j."position") AS weight_rank,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.counts DESC, j.e1rm_kg DESC NULLS LAST, j.exercise_position, j."position") AS e1rm_rank,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.counts DESC, j.volume_kg DESC NULLS LAST, j.exercise_position, j."position") AS volume_rank,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.counts DESC, j.reps DESC NULLS LAST, j.exercise_position, j."position") AS reps_rank,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.counts DESC, j.duration_s DESC NULLS LAST, j.exercise_position, j."position") AS duration_rank,
            row_number() OVER (PARTITION BY j.workout_id, j.exercise_id ORDER BY j.counts DESC, j.distance_m DESC NULLS LAST, j.exercise_position, j."position") AS distance_rank
           FROM joined j
        )
 SELECT id,
    user_id,
    workout_id,
    workout_exercise_id,
    exercise_id,
    exercise_name,
    tracking,
    exercise_position,
    "position",
    kind,
    weight_kg,
    reps,
    duration_s,
    distance_m,
    rpe,
    started_at,
    volume_kg,
    e1rm_kg,
    COALESCE((weight_counts AND (weight_rank = 1) AND (weight_kg > prior_weight)), false) AS is_weight_pr,
    COALESCE((counts AND (e1rm_rank = 1) AND (e1rm_kg > prior_e1rm)), false) AS is_e1rm_pr,
    COALESCE((counts AND (volume_rank = 1) AND (volume_kg > prior_volume)), false) AS is_volume_pr,
    COALESCE((counts AND (reps_rank = 1) AND (tracking = ANY (ARRAY['reps'::public.exercise_tracking, 'weighted_reps'::public.exercise_tracking, 'assisted_reps'::public.exercise_tracking])) AND (reps > prior_reps)), false) AS is_reps_pr,
    COALESCE((counts AND (duration_rank = 1) AND (tracking = ANY (ARRAY['duration'::public.exercise_tracking, 'distance_duration'::public.exercise_tracking])) AND (duration_s > prior_duration)), false) AS is_duration_pr,
    COALESCE((counts AND (distance_rank = 1) AND (tracking = ANY (ARRAY['distance_duration'::public.exercise_tracking, 'weight_distance'::public.exercise_tracking])) AND (distance_m > prior_distance)), false) AS is_distance_pr
   FROM ranked r;