-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.save_workout_heart_rate (
  p_trace jsonb
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user      uuid := (select auth.uid());
  v_id        uuid;
  v_interval  integer;
  v_bpm       smallint[];
  v_avg       numeric;
  v_max       integer;
  v_min       integer;
  v_kcal      integer;
  v_health    text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_trace is null or jsonb_typeof(p_trace) <> 'object' then
    raise exception 'Expected a heart rate trace' using errcode = '22023';
  end if;
  if jsonb_typeof(p_trace -> 'bpm') is distinct from 'array' then
    raise exception 'Expected a list of readings' using errcode = '22023';
  end if;

  v_id := (p_trace ->> 'workout_id')::uuid;
  if v_id is null or p_trace ->> 'started_at' is null then
    raise exception 'Expected a workout and a start' using errcode = '22023';
  end if;
  v_interval := (p_trace ->> 'interval_s')::integer;
  if v_interval is null or v_interval not between 1 and 60 then
    raise exception 'Readings must be 1 to 60 seconds apart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_trace -> 'bpm') not between 1 and 86400 / v_interval + 1 then
    raise exception 'Too many readings for one workout' using errcode = '22023';
  end if;

  -- A null element is a gap; anything else has to be a heartbeat.
  select array_agg(
           case when jsonb_typeof(value) = 'number' then round(value::text::numeric)::smallint end
           order by ordinality
         )
    into v_bpm
    from jsonb_array_elements(p_trace -> 'bpm') with ordinality;

  select avg(b), max(b), min(b) into v_avg, v_max, v_min
    from unnest(v_bpm) as b
   where b is not null;

  if v_min < 25 or v_max > 250 then
    raise exception 'A reading is not a heartbeat' using errcode = '22003';
  end if;

  v_kcal := round((p_trace ->> 'active_kcal')::numeric)::integer;
  if v_kcal is not null and v_kcal not between 0 and 10000 then
    v_kcal := null;
  end if;
  v_health := nullif(left(p_trace ->> 'health_workout_id', 200), '');

  if not exists (select 1 from public.workouts w where w.id = v_id and w.user_id = v_user) then
    return 'missing';
  end if;

  insert into public.workout_heart_rates as h (
    workout_id, user_id, started_at, interval_s, bpm, avg_bpm, max_bpm, min_bpm, active_kcal
  )
  values (
    v_id, v_user, (p_trace ->> 'started_at')::timestamptz, v_interval, v_bpm,
    round(v_avg), v_max, v_min, v_kcal
  )
  on conflict (workout_id) do update set
    started_at = excluded.started_at,
    interval_s = excluded.interval_s,
    bpm = excluded.bpm,
    avg_bpm = excluded.avg_bpm,
    max_bpm = excluded.max_bpm,
    min_bpm = excluded.min_bpm,
    active_kcal = excluded.active_kcal
  where h.user_id = v_user;

  -- The watch saved the workout to Apple Health, so that copy is the one an
  -- iPad or an older build reading Health back must recognise as this
  -- workout. Only filled when empty: a copy the phone already wrote wins.
  if v_health is not null then
    update public.workouts w
       set health_workout_id = v_health
     where w.id = v_id and w.user_id = v_user and w.health_workout_id is null;
  end if;

  -- And the energy in that copy is the watch's measurement, which is what
  -- reaches the budget by way of Health. The workout's `kcal` is what Today
  -- shows beside it, so it is that figure rather than the phone's estimate.
  if v_kcal is not null then
    update public.workouts w
       set kcal = v_kcal
     where w.id = v_id and w.user_id = v_user and w.kcal is distinct from v_kcal;
  end if;

  return 'saved';
end;
$function$;

COMMENT ON FUNCTION public.save_workout_heart_rate(jsonb) IS 'Stores the Apple Watch heart rate trace of one of the caller''s workouts, working out its average, maximum and minimum. Answers missing, rather than failing, while the workout itself has not been saved.';

GRANT ALL ON FUNCTION public.save_workout_heart_rate(jsonb) TO authenticated;

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
  v_inserted  boolean;
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
    -- A workout the Apple Watch recorded keeps the energy it measured and
    -- the Health copy it saved (43_workout_heart_rates.sql). A save sent
    -- before the watch's trace landed, retried after it, or an older build
    -- editing the workout, would otherwise put the phone's estimate and no
    -- Health copy back over them.
    kcal = case
      when exists (select 1 from public.workout_heart_rates h
                    where h.workout_id = w.id and h.active_kcal is not null)
        then w.kcal
      else excluded.kcal
    end,
    health_workout_id = case
      when exists (select 1 from public.workout_heart_rates h where h.workout_id = w.id)
        then coalesce(w.health_workout_id, excluded.health_workout_id)
      else excluded.health_workout_id
    end
  where w.user_id = v_user
  -- A row with no previous version was inserted rather than updated: a retry
  -- or an edit of the same workout is not a new workout to post.
  returning (xmax = 0) into v_inserted;

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

  -- A new workout goes to the feed for someone who is on it and shares
  -- workouts, which is the default (98_social_workout_posts.sql). An import
  -- sends "post": false, since years of history at once is not news. The
  -- record count is taken here, where row security limits the scoring to this
  -- account's own sets; the posting function runs as its owner and would
  -- score every account's. Scoring reads the whole history, so the posting
  -- function's own checks (ended in the last day, a profile in good standing)
  -- are made first, and a workout that will not be posted is not scored.
  if v_inserted and coalesce((p_workout ->> 'post')::boolean, true)
     and (p_workout ->> 'ended_at')::timestamptz > now() - interval '24 hours'
     and exists (
       select 1 from public.profiles p
       where p.id = v_user and p.auto_post_workouts and p.social_joined_at is not null
         and p.review_status = 'approved' and not p.quarantined
     ) then
    perform private.social_insert_workout_post(
      v_id, (select s.pr_count from public.workout_summaries s where s.id = v_id), '', null, true
    );
  end if;

  return v_id;
end;
$function$;

CREATE TABLE public.workout_heart_rates (
  workout_id  uuid                     NOT NULL,
  user_id     uuid                     NOT NULL,
  started_at  timestamp with time zone NOT NULL,
  interval_s  smallint                 NOT NULL,
  bpm         smallint[]               NOT NULL,
  avg_bpm     smallint,
  max_bpm     smallint,
  min_bpm     smallint,
  active_kcal integer,
  source      text                     DEFAULT 'apple_watch'::text NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.workout_heart_rates
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workout_heart_rates
  ADD CONSTRAINT workout_heart_rates_active_kcal_check CHECK (active_kcal >= 0 AND active_kcal <= 10000);

ALTER TABLE public.workout_heart_rates
  ADD CONSTRAINT workout_heart_rates_avg_bpm_check CHECK (avg_bpm >= 25 AND avg_bpm <= 250);

ALTER TABLE public.workout_heart_rates
  ADD CONSTRAINT workout_heart_rates_interval_s_check CHECK (interval_s >= 1 AND interval_s <= 60);

ALTER TABLE public.workout_heart_rates
  ADD CONSTRAINT workout_heart_rates_length CHECK (cardinality(bpm) >= 1 AND cardinality(bpm) <= (86400 / interval_s + 1));

ALTER TABLE public.workout_heart_rates
  ADD CONSTRAINT workout_heart_rates_max_bpm_check CHECK (max_bpm >= 25 AND max_bpm <= 250);

ALTER TABLE public.workout_heart_rates
  ADD CONSTRAINT workout_heart_rates_min_bpm_check CHECK (min_bpm >= 25 AND min_bpm <= 250);

ALTER TABLE public.workout_heart_rates
  ADD CONSTRAINT workout_heart_rates_pkey PRIMARY KEY (workout_id);

ALTER TABLE public.workout_heart_rates
  ADD CONSTRAINT workout_heart_rates_source_check CHECK (source = 'apple_watch'::text);

ALTER TABLE public.workout_heart_rates
  ADD CONSTRAINT workout_heart_rates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.workout_heart_rates
  ADD CONSTRAINT workout_heart_rates_workout_fkey FOREIGN KEY (workout_id, user_id) REFERENCES public.workouts(id, user_id) ON DELETE CASCADE;

GRANT SELECT ON public.workout_heart_rates TO authenticated;

GRANT ALL ON public.workout_heart_rates TO service_role;

CREATE INDEX workout_heart_rates_user_idx ON public.workout_heart_rates (user_id);

CREATE TRIGGER workout_heart_rates_set_updated_at
  BEFORE UPDATE ON public.workout_heart_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "workout_heart_rates: read own" ON public.workout_heart_rates
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

-- `supabase db diff` emits the grants a function ends up with and not the
-- revoke that shaped them, so `create function`'s default EXECUTE to PUBLIC
-- would survive without this. See "Things a diff cannot see" in the README.
REVOKE ALL ON FUNCTION public.save_workout_heart_rate(jsonb) FROM PUBLIC, anon;

-- And the table grants 98_client_table_privileges.sql takes back from every
-- client table, which the diff does not repeat for tables it creates.
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workout_heart_rates FROM anon, authenticated;
