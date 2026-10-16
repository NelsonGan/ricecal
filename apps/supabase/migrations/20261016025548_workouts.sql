-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION private.social_feed_candidates(IN p_mode text, IN p_before_at timestamp WITH time zone, IN p_before_id uuid, IN p_limit integer);

DROP FUNCTION public.social_feed(p_mode text, p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer);

DROP FUNCTION public.social_post(p_id uuid);

DROP FUNCTION public.social_profile_posts(p_user_id uuid, p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer);

DROP VIEW public.social_post_details;

CREATE FUNCTION private.social_insert_workout_post (
  p_workout_id uuid,
  p_records    integer,
  p_caption    text,
  p_audience   public.social_audience,
  p_auto       boolean
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := (select auth.uid());
  v_private boolean := false;
  v_id uuid;
begin
  if p_auto then
    -- Lock the profile before the rate row, as sharing a meal does.
    select p.is_private into v_private from public.profiles p
    where p.id = v_user and p.auto_post_workouts and p.social_joined_at is not null
      and p.review_status = 'approved' and not p.quarantined
    for update;
    if not found then return null; end if;
  else
    v_user := private.social_require_user();
  end if;

  -- An automatic post is for a workout that just happened. A past workout
  -- logged today from last month would otherwise top everyone's feed.
  perform 1 from public.workouts w
  where w.id = p_workout_id and w.user_id = v_user
    and (not p_auto or w.ended_at > now() - interval '24 hours')
  for share;
  if not found then
    if p_auto then return null; end if;
    raise exception 'Workout unavailable' using errcode = '42501';
  end if;

  select p.id into v_id from public.social_posts p
  where p.source_workout_id = p_workout_id and p.author_id = v_user;
  if found then return v_id; end if;

  if not private.social_claim(v_user, 'post', 30) then
    if p_auto then return null; end if;
    raise exception 'Try again later' using errcode = 'P0001';
  end if;

  insert into public.social_posts (
    author_id, kind, source_workout_id, workout_records, caption, audience,
    review_status, published_at
  ) values (
    v_user, 'workout', p_workout_id, least(greatest(coalesce(p_records, 0), 0), 32767),
    btrim(coalesce(p_caption, '')),
    coalesce(p_audience, case when v_private then 'followers'::public.social_audience
                              else 'public'::public.social_audience end),
    'approved', now()
  )
  on conflict (source_workout_id) do nothing
  returning id into v_id;
  if v_id is null then
    select p.id into v_id from public.social_posts p
    where p.source_workout_id = p_workout_id and p.author_id = v_user;
  end if;
  return v_id;
end;
$function$;

GRANT ALL ON FUNCTION private.social_insert_workout_post(uuid, integer, text, public.social_audience, boolean) TO authenticated;

GRANT ALL ON FUNCTION private.social_insert_workout_post(uuid, integer, text, public.social_audience, boolean) TO service_role;

CREATE OR REPLACE FUNCTION private.social_post_food (
  p_post_id uuid
)
  RETURNS TABLE (
    food_name  text,
    icon_set   public.icon_set,
    icon_name  text,
    photo_path text,
    kcal       integer,
    carbs_g    numeric,
    protein_g  numeric,
    fat_g      numeric
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_entry_id uuid;
  v_author_id uuid;
  v_photo_path text;
begin
  select p.source_entry_id, p.author_id, p.photo_path
    into v_entry_id, v_author_id, v_photo_path
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'food' and private.social_can_view_post(p.id);
  if not found then return; end if;

  -- Look up the one entry by primary key. Joining the expanded diary view to
  -- posts made Postgres scan every logged meal belonging to a busy author.
  return query select left(d.food_name, 160), d.icon_set, d.icon_name,
    -- A replacement photo must pass the existing review and signing path.
    case when d.photo_path = v_photo_path then d.photo_path end,
    d.kcal, d.carbs_g, d.protein_g, d.fat_g
  from public.food_log_details d
  where d.id = v_entry_id and d.user_id = v_author_id;
end;
$function$;

CREATE FUNCTION private.social_post_workout (
  p_post_id uuid
)
  RETURNS TABLE (
    workout_name       text,
    workout_started_at timestamp with time zone,
    workout_duration_s integer,
    workout_sets       integer,
    workout_volume_kg  numeric,
    workout_exercises  jsonb
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_workout_id uuid;
  v_author_id uuid;
begin
  select p.source_workout_id, p.author_id into v_workout_id, v_author_id
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'workout' and private.social_can_view_post(p.id);
  if not found then return; end if;

  return query select w.name, w.started_at, w.duration_s,
    coalesce(stats.set_count, 0), coalesce(stats.volume_kg, 0),
    coalesce(list.exercises, '[]'::jsonb)
  from public.workouts w
  left join lateral (
    select count(*)::integer as set_count, sum(v.volume_kg) as volume_kg
    from public.workout_set_values v where v.workout_id = w.id
  ) stats on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'exercise_id', e.exercise_id,
      'exercise_name', e.exercise_name,
      'sets', (select count(*) from public.workout_sets s where s.workout_exercise_id = e.id)
    ) order by e.position) as exercises
    from public.workout_exercises e where e.workout_id = w.id
  ) list on true
  where w.id = v_workout_id and w.user_id = v_author_id;
end;
$function$;

GRANT ALL ON FUNCTION private.social_post_workout(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.social_post_workout(uuid) TO service_role;

CREATE TYPE public.exercise_tracking AS ENUM (
  'weight_reps',
  'reps',
  'weighted_reps',
  'assisted_reps',
  'duration',
  'distance_duration',
  'weight_distance'
);

CREATE TYPE public.social_post_kind AS ENUM (
  'food',
  'workout'
);

CREATE FUNCTION private.social_feed_candidates (
  p_mode      text,
  p_before_at timestamp with time zone,
  p_before_id uuid,
  p_limit     integer,
  p_kinds     public.social_post_kind[] DEFAULT '{food}'::public.social_post_kind[]
)
  RETURNS TABLE (
    id         uuid,
    created_at timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid());
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  if p_mode not in ('following', 'discover') or p_mode is null then raise exception 'Invalid feed' using errcode = '22023'; end if;
  if p_kinds is null or cardinality(p_kinds) = 0 then raise exception 'Invalid feed' using errcode = '22023'; end if;
  if v_user is null then return; end if;
  if p_mode = 'following' then
    return query
      with hidden_authors as materialized (
        select b.author_id as user_id from public.blocked_authors b where b.user_id = v_user
        union select b.user_id from public.blocked_authors b where b.author_id = v_user
        union select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'profile'
      ), hidden_posts as materialized (
        select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'post'
      ), authors as materialized (
        select v_user as user_id
        union all
        select f.followed_id from public.social_follows f
          join public.profiles a on a.id = f.followed_id
        where f.follower_id = v_user and a.social_joined_at is not null
          and a.review_status = 'approved' and not a.quarantined
          and f.followed_id not in (select h.user_id from hidden_authors h)
      ), candidates as materialized (
        select p.id, p.created_at from authors a cross join lateral (
          select sp.id, sp.created_at from public.social_posts sp
          where sp.author_id = a.user_id and sp.review_status = 'approved' and not sp.quarantined
            and sp.kind = any(p_kinds)
            and (p_before_at is null or (sp.created_at, sp.id) < (p_before_at, p_before_id))
            and (sp.author_id = v_user or sp.id not in (select h.content_id from hidden_posts h))
          order by sp.created_at desc, sp.id desc limit p_limit + 1
        ) p
      )
      select c.id, c.created_at from candidates c order by c.created_at desc, c.id desc limit p_limit + 1;
  else
    return query
      with excluded_authors as materialized (
        select v_user as user_id
        union select f.followed_id from public.social_follows f where f.follower_id = v_user
        union select b.author_id from public.blocked_authors b where b.user_id = v_user
        union select b.user_id from public.blocked_authors b where b.author_id = v_user
        union select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'profile'
      )
      select sp.id, sp.created_at from public.social_posts sp
        join public.profiles a on a.id = sp.author_id
      where sp.audience = 'public' and sp.review_status = 'approved' and not sp.quarantined
        and sp.kind = any(p_kinds)
        and not a.is_private and a.review_status = 'approved' and not a.quarantined
        and sp.author_id not in (select e.user_id from excluded_authors e)
        and sp.id not in (select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'post')
        and (p_before_at is null or (sp.created_at, sp.id) < (p_before_at, p_before_id))
      order by sp.created_at desc, sp.id desc limit p_limit + 1;
  end if;
end;
$function$;

GRANT ALL ON FUNCTION private.social_feed_candidates(text, timestamp WITH time zone, uuid, integer, public.social_post_kind[]) TO authenticated;

GRANT ALL ON FUNCTION private.social_feed_candidates(text, timestamp WITH time zone, uuid, integer, public.social_post_kind[]) TO service_role;

CREATE TYPE public.workout_set_kind AS ENUM (
  'normal',
  'warmup',
  'drop',
  'failure'
);

CREATE FUNCTION public.create_social_workout_post (
  p_workout_id uuid,
  p_caption    text,
  p_audience   public.social_audience
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare v_records integer;
begin
  select s.pr_count into v_records from public.workout_summaries s where s.id = p_workout_id;
  if not found then raise exception 'Workout unavailable' using errcode = '42501'; end if;
  return private.social_insert_workout_post(p_workout_id, v_records, p_caption, p_audience, false);
end;
$function$;

GRANT ALL ON FUNCTION public.create_social_workout_post(uuid, text, public.social_audience) TO authenticated;

GRANT ALL ON FUNCTION public.create_social_workout_post(uuid, text, public.social_audience) TO service_role;

CREATE FUNCTION public.exercise_bests (
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

COMMENT ON FUNCTION public.exercise_bests(text) IS 'Personal bests per exercise (all exercises when the id is null): heaviest set, best estimated 1RM, best set and session volume, most reps, longest duration and distance. Warm-ups excluded.';

GRANT ALL ON FUNCTION public.exercise_bests(text) TO authenticated;

CREATE FUNCTION public.exercise_history (
  p_exercise_id text,
  p_limit       integer DEFAULT 200
)
  RETURNS TABLE (
    workout_id     uuid,
    workout_name   text,
    started_at     timestamp with time zone,
    sets           jsonb,
    best_weight_kg numeric,
    best_e1rm_kg   numeric,
    volume_kg      numeric,
    reps           integer,
    duration_s     integer,
    distance_m     numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    d.workout_id,
    w.name,
    d.started_at,
    jsonb_agg(
      jsonb_build_object(
        'kind', d.kind,
        'weight_kg', d.weight_kg,
        'reps', d.reps,
        'duration_s', d.duration_s,
        'distance_m', d.distance_m,
        'rpe', d.rpe,
        'is_pr', d.is_weight_pr or d.is_e1rm_pr or d.is_volume_pr
          or d.is_reps_pr or d.is_duration_pr or d.is_distance_pr
      )
      order by d.exercise_position, d.position
    ),
    max(d.weight_kg) filter (where d.kind <> 'warmup'),
    max(d.e1rm_kg) filter (where d.kind <> 'warmup'),
    coalesce(sum(d.volume_kg), 0),
    coalesce(sum(d.reps), 0)::integer,
    coalesce(sum(d.duration_s), 0)::integer,
    sum(d.distance_m)
  from public.workout_set_details d
  join public.workouts w on w.id = d.workout_id
  where d.user_id = (select auth.uid()) and d.exercise_id = p_exercise_id
  group by d.workout_id, w.name, d.started_at
  order by d.started_at desc
  limit least(greatest(p_limit, 1), 500);
$function$;

COMMENT ON FUNCTION public.exercise_history(text,integer) IS 'One row per workout containing the exercise, newest first, with its sets and that session''s best weight, best estimated 1RM and totals.';

GRANT ALL ON FUNCTION public.exercise_history(text, integer) TO authenticated;

CREATE FUNCTION public.exercise_last_sets (
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

COMMENT ON FUNCTION public.exercise_last_sets(text[]) IS 'The sets of the most recent workout entry for each exercise asked for: the logger''s PREVIOUS column.';

GRANT ALL ON FUNCTION public.exercise_last_sets(text[]) TO authenticated;

CREATE FUNCTION public.exercise_rep_bests (
  p_exercise_id text
)
  RETURNS TABLE (
    reps       smallint,
    weight_kg  numeric,
    started_at timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with best as (
    select distinct on (v.reps) v.reps, v.weight_kg, v.started_at
    from public.workout_set_values v
    where v.user_id = (select auth.uid())
      and v.exercise_id = p_exercise_id
      and v.tracking in ('weight_reps', 'weighted_reps')
      and v.weight_counts
      and v.reps <= 30
    order by v.reps, v.weight_kg desc, v.started_at
  ),
  beaten as (
    select
      b.*,
      max(b.weight_kg) over (order by b.reps desc rows between unbounded preceding and 1 preceding) as above
    from best b
  )
  select x.reps, x.weight_kg, x.started_at
  from beaten x
  where x.above is null or x.weight_kg > x.above
  order by x.reps;
$function$;

COMMENT ON FUNCTION public.exercise_rep_bests(text) IS 'The heaviest weight lifted for each rep count up to 30 of a weighted exercise, keeping only counts that nothing as heavy at more reps has matched. Warm-ups excluded.';

GRANT ALL ON FUNCTION public.exercise_rep_bests(text) TO authenticated;

CREATE FUNCTION public.save_workout (
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
    kcal = excluded.kcal,
    health_workout_id = excluded.health_workout_id
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
  -- score every account's.
  if v_inserted and coalesce((p_workout ->> 'post')::boolean, true) and exists (
    select 1 from public.profiles p
    where p.id = v_user and p.auto_post_workouts and p.social_joined_at is not null
  ) then
    perform private.social_insert_workout_post(
      v_id, (select s.pr_count from public.workout_summaries s where s.id = v_id), '', null, true
    );
  end if;

  return v_id;
end;
$function$;

COMMENT ON FUNCTION public.save_workout(jsonb) IS 'Writes a whole workout (exercises and sets included) under the id the phone minted, replacing any earlier save of the same id. Idempotent, so a retried save converges on one workout.';

GRANT ALL ON FUNCTION public.save_workout(jsonb) TO authenticated;

CREATE FUNCTION public.social_workout_post (
  p_workout_id uuid
)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select p.id from public.social_posts p
  where p.source_workout_id = p_workout_id and p.author_id = (select auth.uid());
$function$;

GRANT ALL ON FUNCTION public.social_workout_post(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.social_workout_post(uuid) TO service_role;

CREATE FUNCTION public.social_workout_stats (
  p_user_id uuid
)
  RETURNS TABLE (
    workouts   integer,
    duration_s bigint,
    volume_kg  numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select count(*)::integer, coalesce(sum(w.duration_s), 0)::bigint,
    coalesce(sum(volume.kg), 0)
  from public.social_posts p
  join public.workouts w on w.id = p.source_workout_id and w.user_id = p.author_id
  left join lateral (
    select sum(v.volume_kg) as kg from public.workout_set_values v where v.workout_id = w.id
  ) volume on true
  where p.author_id = p_user_id and p.kind = 'workout' and private.social_can_view_post(p.id);
$function$;

GRANT ALL ON FUNCTION public.social_workout_stats(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.social_workout_stats(uuid) TO service_role;

CREATE FUNCTION public.workout_exercise_totals (
  p_from date,
  p_to   date
)
  RETURNS TABLE (
    exercise_id text,
    sets        integer,
    volume_kg   numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select e.exercise_id,
         count(s.id) filter (where s.kind <> 'warmup')::integer,
         coalesce(sum(s.weight_kg * s.reps) filter (
           where e.tracking in ('weight_reps', 'weighted_reps') and s.weight_kg > 0 and s.reps > 0
         ), 0)
  from public.workouts w
  join public.workout_exercises e on e.workout_id = w.id
  join public.workout_sets s on s.workout_exercise_id = e.id
  where w.user_id = (select auth.uid())
    and w.log_date between p_from and p_to
  group by e.exercise_id;
$function$;

COMMENT ON FUNCTION public.workout_exercise_totals(date,date) IS 'Working sets (warm-ups excluded) and volume per exercise between two local dates, inclusive. The app spreads them across muscles.';

GRANT ALL ON FUNCTION public.workout_exercise_totals(date, date) TO authenticated;

CREATE FUNCTION public.workout_overview()
  RETURNS TABLE (
    total_workouts      integer,
    week_streak         integer,
    this_week_workouts  integer,
    this_week_seconds   integer,
    this_week_volume_kg numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with me as (
    select (select auth.uid()) as id,
           date_trunc('week', public.local_today((select auth.uid())))::date as monday
  ),
  weeks as (
    select distinct date_trunc('week', w.log_date)::date as week
    from public.workouts w, me
    where w.user_id = me.id
  ),
  start as (
    select case
      when exists (select 1 from weeks, me where weeks.week = me.monday) then me.monday
      else me.monday - 7
    end as week
    from me
  ),
  ranked as (
    select weeks.week, row_number() over (order by weeks.week desc) as n
    from weeks, start
    where weeks.week <= start.week
  )
  select
    (select count(*)::integer from public.workouts w, me where w.user_id = me.id),
    (select count(*)::integer from ranked, start where ranked.week = start.week - 7 * (ranked.n - 1)::integer),
    (select count(*)::integer from public.workouts w, me
      where w.user_id = me.id and w.log_date >= me.monday and w.log_date < me.monday + 7),
    (select coalesce(sum(w.duration_s), 0)::integer from public.workouts w, me
      where w.user_id = me.id and w.log_date >= me.monday and w.log_date < me.monday + 7),
    (select coalesce(sum(v.volume_kg), 0) from public.workout_set_values v, me
      where v.user_id = me.id and v.log_date >= me.monday and v.log_date < me.monday + 7);
$function$;

COMMENT ON FUNCTION public.workout_overview() IS 'All-time workout count, the streak of consecutive weeks with a workout (ending this week or last), and this week''s workouts, seconds and volume.';

GRANT ALL ON FUNCTION public.workout_overview() TO authenticated;

CREATE FUNCTION public.workout_weeks (
  p_weeks integer DEFAULT 12
)
  RETURNS TABLE (
    week       date,
    workouts   integer,
    duration_s integer,
    volume_kg  numeric,
    sets       integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with this_week as (
    select date_trunc('week', public.local_today((select auth.uid())))::date as monday
  ),
  calendar as (
    select (t.monday - 7 * n)::date as week
    from this_week t, generate_series(0, least(greatest(p_weeks, 1), 104) - 1) as n
  ),
  per_workout as (
    select
      date_trunc('week', w.log_date)::date as week,
      w.duration_s,
      coalesce(t.volume_kg, 0) as volume_kg,
      coalesce(t.sets, 0) as sets
    from public.workouts w
    left join (
      select v.workout_id, sum(v.volume_kg) as volume_kg, count(*) as sets
      from public.workout_set_values v
      where v.user_id = (select auth.uid())
        and v.log_date >= (select min(c.week) from calendar c)
      group by v.workout_id
    ) t on t.workout_id = w.id
    where w.user_id = (select auth.uid())
      and w.log_date >= (select min(c.week) from calendar c)
  )
  select
    c.week,
    count(p.week)::integer,
    coalesce(sum(p.duration_s), 0)::integer,
    coalesce(sum(p.volume_kg), 0),
    coalesce(sum(p.sets), 0)::integer
  from calendar c
  left join per_workout p on p.week = c.week
  group by c.week
  order by c.week;
$function$;

COMMENT ON FUNCTION public.workout_weeks(integer) IS 'Workouts, seconds, volume and sets per Monday-to-Sunday week for the last p_weeks weeks (at most 104), oldest first, empty weeks included.';

GRANT ALL ON FUNCTION public.workout_weeks(integer) TO authenticated;

ALTER TABLE public.social_posts
  ALTER COLUMN food_name DROP NOT NULL;

ALTER TABLE public.social_posts
  ALTER COLUMN source_entry_id DROP NOT NULL;

CREATE TABLE public.custom_exercises (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id    uuid                     NOT NULL,
  name       text                     NOT NULL,
  tracking   public.exercise_tracking DEFAULT 'weight_reps'::public.exercise_tracking NOT NULL,
  equipment  text                     DEFAULT 'other'::text NOT NULL,
  category   text                     DEFAULT 'fullBody'::text NOT NULL,
  muscles    jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.custom_exercises
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.custom_exercises
  ADD CONSTRAINT custom_exercises_category_check CHECK (char_length(category) >= 1 AND char_length(category) <= 40);

ALTER TABLE public.custom_exercises
  ADD CONSTRAINT custom_exercises_equipment_check CHECK (char_length(equipment) >= 1 AND char_length(equipment) <= 40);

ALTER TABLE public.custom_exercises
  ADD CONSTRAINT custom_exercises_muscles_check CHECK (jsonb_typeof(muscles) = 'object'::text);

ALTER TABLE public.custom_exercises
  ADD CONSTRAINT custom_exercises_name_check CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 80);

ALTER TABLE public.custom_exercises
  ADD CONSTRAINT custom_exercises_pkey PRIMARY KEY (id);

ALTER TABLE public.custom_exercises
  ADD CONSTRAINT custom_exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.custom_exercises TO authenticated;

GRANT ALL ON public.custom_exercises TO service_role;

CREATE UNIQUE INDEX custom_exercises_user_name_key ON public.custom_exercises (user_id, lower(btrim(name)));

CREATE TRIGGER custom_exercises_set_updated_at
  BEFORE UPDATE ON public.custom_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "custom_exercises: delete own" ON public.custom_exercises
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "custom_exercises: insert own" ON public.custom_exercises
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "custom_exercises: read own" ON public.custom_exercises
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "custom_exercises: update own" ON public.custom_exercises
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

ALTER TABLE public.profiles
  ADD COLUMN auto_post_workouts boolean DEFAULT true NOT NULL;

REVOKE UPDATE
  (activity_level, auto_post_foods, avatar_path, bio, birth_date, display_name, food_styles, handle, height_cm, is_private, onboarded_at, referral_source, sex, target_weight_kg,
  timezone) ON public.profiles FROM authenticated;

GRANT UPDATE
  (activity_level, auto_post_foods, auto_post_workouts, avatar_path, bio, birth_date, display_name, food_styles, handle, height_cm, is_private, onboarded_at, referral_source, sex,
  target_weight_kg, timezone) ON public.profiles TO authenticated;

ALTER TABLE public.social_posts
  ADD COLUMN kind public.social_post_kind DEFAULT 'food'::public.social_post_kind NOT NULL;

ALTER TABLE public.social_posts
  ADD COLUMN source_workout_id uuid;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_source CHECK (
CASE kind
    WHEN 'food'::public.social_post_kind THEN source_entry_id IS NOT NULL AND source_workout_id IS NULL AND food_name IS NOT NULL
    ELSE source_workout_id IS NOT NULL AND source_entry_id IS NULL AND food_name IS NULL AND photo_path IS NULL
END);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_source_workout_id_key UNIQUE (source_workout_id);

ALTER TABLE public.social_posts
  ADD COLUMN workout_records smallint;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_workout_records_check CHECK (workout_records >= 0);

REVOKE SELECT
  (audience, author_id, caption, carbs_g, created_at, fat_g, food_name, icon_name, icon_set, id, kcal, photo_etag, photo_path, protein_g, published_at, quarantined, review_reason,
  review_status, revision, updated_at) ON public.social_posts FROM authenticated;

GRANT SELECT
  (audience, author_id, caption, carbs_g, created_at, fat_g, food_name, icon_name, icon_set, id, kcal, kind, photo_etag, photo_path, protein_g, published_at, quarantined,
  review_reason, review_status, revision, updated_at, workout_records) ON public.social_posts TO authenticated;

ALTER TABLE public.user_settings
  ADD COLUMN workout_rest_s integer DEFAULT 90 NOT NULL;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_workout_rest_s_check CHECK (workout_rest_s >= 0 AND workout_rest_s <= 600);

ALTER TABLE public.user_settings
  ADD COLUMN workout_reminder_days smallint[] DEFAULT '{}'::smallint[] NOT NULL;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_workout_reminder_days_check CHECK (workout_reminder_days <@ '{0,1,2,3,4,5,6}'::smallint[]);

ALTER TABLE public.user_settings
  ADD COLUMN workout_reminder_at time without time zone DEFAULT '18:00:00'::time WITHOUT time zone NOT NULL;

CREATE TABLE public.workout_exercises (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workout_id    uuid                     NOT NULL,
  user_id       uuid                     NOT NULL,
  "position"    smallint                 NOT NULL,
  exercise_id   text                     NOT NULL,
  exercise_name text                     NOT NULL,
  tracking      public.exercise_tracking NOT NULL,
  superset      smallint,
  rest_s        integer,
  notes         text
);

ALTER TABLE public.workout_exercises
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_exercise_id_check CHECK (char_length(exercise_id) >= 1 AND char_length(exercise_id) <= 80);

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_exercise_name_check CHECK (char_length(btrim(exercise_name)) >= 1 AND char_length(btrim(exercise_name)) <= 120);

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_id_user_key UNIQUE (id, user_id);

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_notes_check CHECK (char_length(notes) <= 1000);

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_pkey PRIMARY KEY (id);

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_position_check CHECK ("position" >= 0 AND "position" <= 99);

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_position_key UNIQUE (workout_id, "position");

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_rest_s_check CHECK (rest_s >= 0 AND rest_s <= 3600);

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_superset_check CHECK (superset >= 0 AND superset <= 99);

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.workout_exercises TO authenticated;

GRANT ALL ON public.workout_exercises TO service_role;

CREATE INDEX workout_exercises_user_exercise_idx ON public.workout_exercises (user_id, exercise_id);

CREATE POLICY "workout_exercises: delete own" ON public.workout_exercises
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workout_exercises: insert own" ON public.workout_exercises
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workout_exercises: read own" ON public.workout_exercises
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workout_exercises: update own" ON public.workout_exercises
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.workout_routines (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     NOT NULL,
  name         text                     NOT NULL,
  notes        text,
  exercises    jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  template_id  text,
  "position"   integer                  DEFAULT 0 NOT NULL,
  last_used_at timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.workout_routines
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workout_routines
  ADD CONSTRAINT workout_routines_exercises_check CHECK (jsonb_typeof(exercises) = 'array'::text AND jsonb_array_length(exercises) <= 40);

ALTER TABLE public.workout_routines
  ADD CONSTRAINT workout_routines_id_user_key UNIQUE (id, user_id);

ALTER TABLE public.workout_routines
  ADD CONSTRAINT workout_routines_name_check CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 80);

ALTER TABLE public.workout_routines
  ADD CONSTRAINT workout_routines_notes_check CHECK (char_length(notes) <= 1000);

ALTER TABLE public.workout_routines
  ADD CONSTRAINT workout_routines_pkey PRIMARY KEY (id);

ALTER TABLE public.workout_routines
  ADD CONSTRAINT workout_routines_template_id_check CHECK (char_length(template_id) <= 80);

ALTER TABLE public.workout_routines
  ADD CONSTRAINT workout_routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.workout_routines TO authenticated;

GRANT ALL ON public.workout_routines TO service_role;

CREATE INDEX workout_routines_user_idx ON public.workout_routines (user_id, "position");

CREATE TRIGGER workout_routines_set_updated_at
  BEFORE UPDATE ON public.workout_routines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "workout_routines: delete own" ON public.workout_routines
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workout_routines: insert own" ON public.workout_routines
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workout_routines: read own" ON public.workout_routines
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workout_routines: update own" ON public.workout_routines
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.workout_sets (
  id                  uuid                    DEFAULT gen_random_uuid() NOT NULL,
  workout_exercise_id uuid                    NOT NULL,
  user_id             uuid                    NOT NULL,
  "position"          smallint                NOT NULL,
  kind                public.workout_set_kind DEFAULT 'normal'::public.workout_set_kind NOT NULL,
  weight_kg           numeric(6,2),
  reps                smallint,
  duration_s          integer,
  distance_m          numeric(9,1),
  rpe                 numeric(3,1)
);

ALTER TABLE public.workout_sets
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_distance_m_check CHECK (distance_m >= 0::numeric AND distance_m <= 1000000::numeric);

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_duration_s_check CHECK (duration_s >= 0 AND duration_s <= 86400);

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_exercise_fkey FOREIGN KEY (workout_exercise_id, user_id) REFERENCES public.workout_exercises(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_pkey PRIMARY KEY (id);

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_position_check CHECK ("position" >= 0 AND "position" <= 99);

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_position_key UNIQUE (workout_exercise_id, "position");

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_reps_check CHECK (reps >= 0 AND reps <= 1000);

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_rpe_check CHECK (rpe >= 1::numeric AND rpe <= 10::numeric);

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_weight_kg_check CHECK (weight_kg >= 0::numeric AND weight_kg <= 1000::numeric);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.workout_sets TO authenticated;

GRANT ALL ON public.workout_sets TO service_role;

CREATE INDEX workout_sets_user_idx ON public.workout_sets (user_id);

CREATE POLICY "workout_sets: delete own" ON public.workout_sets
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workout_sets: insert own" ON public.workout_sets
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workout_sets: read own" ON public.workout_sets
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workout_sets: update own" ON public.workout_sets
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.workouts (
  id                uuid                     NOT NULL,
  user_id           uuid                     NOT NULL,
  name              text                     NOT NULL,
  notes             text,
  started_at        timestamp with time zone NOT NULL,
  ended_at          timestamp with time zone NOT NULL,
  duration_s        integer                  GENERATED ALWAYS AS ((EXTRACT(epoch FROM (ended_at - started_at)))::integer) STORED,
  log_date          date                     NOT NULL,
  routine_id        uuid,
  kcal              integer,
  health_workout_id text,
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  updated_at        timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.workouts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_at_most_a_day CHECK ((ended_at - started_at) <= '24:00:00'::interval);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_ends_after_start CHECK (ended_at >= started_at);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_health_workout_id_check CHECK (char_length(health_workout_id) <= 200);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_id_user_key UNIQUE (id, user_id);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_workout_owned FOREIGN KEY (source_workout_id, author_id) REFERENCES public.workouts(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.workout_exercises
  ADD CONSTRAINT workout_exercises_workout_fkey FOREIGN KEY (workout_id, user_id) REFERENCES public.workouts(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_kcal_check CHECK (kcal >= 0 AND kcal <= 10000);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_log_date_near_start
    CHECK (log_date >= ((started_at AT TIME ZONE 'UTC'::text)::date - 1) AND log_date <= ((started_at AT TIME ZONE 'UTC'::text)::date + 1));

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_name_check CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 80);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_notes_check CHECK (char_length(notes) <= 2000);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_pkey PRIMARY KEY (id);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_routine_fkey FOREIGN KEY (routine_id, user_id) REFERENCES public.workout_routines(id, user_id) ON DELETE SET NULL (routine_id);

ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.workouts TO authenticated;

GRANT ALL ON public.workouts TO service_role;

CREATE INDEX workouts_routine_idx ON public.workouts (routine_id)
  WHERE routine_id IS NOT NULL;

CREATE INDEX workouts_user_started_idx ON public.workouts (user_id, started_at DESC);

CREATE INDEX workouts_user_date_idx ON public.workouts (user_id, log_date);

CREATE TRIGGER workouts_set_updated_at
  BEFORE UPDATE ON public.workouts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "workouts: delete own" ON public.workouts
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workouts: insert own" ON public.workouts
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workouts: read own" ON public.workouts
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "workouts: update own" ON public.workouts
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE VIEW public.social_post_details WITH (security_invoker=true) AS SELECT p.id,
    p.author_id,
    a.handle,
    a.display_name,
    a.avatar_path,
    food.food_name,
    food.icon_set,
    food.icon_name,
    food.photo_path,
    food.kcal,
    food.carbs_g,
    food.protein_g,
    food.fat_g,
    p.caption,
    p.audience,
    p.review_status,
    p.review_reason,
    p.revision,
    p.quarantined,
    p.created_at,
    p.published_at,
    private.social_count(p.id, 'likes'::public.social_counter_metric) AS like_count,
    private.social_count(p.id, 'comments'::public.social_counter_metric) AS comment_count,
    COALESCE(( SELECT true
           FROM public.social_likes l
          WHERE ((l.post_id = p.id) AND (l.user_id = ( SELECT auth.uid() AS uid)))
         LIMIT 1), false) AS is_liked,
    COALESCE(( SELECT true
           FROM public.social_follows f
          WHERE ((f.follower_id = ( SELECT auth.uid() AS uid)) AND (f.followed_id = p.author_id))
         LIMIT 1), false) AS is_following,
    p.kind,
    workout.workout_name,
    workout.workout_started_at,
    workout.workout_duration_s,
    workout.workout_sets,
    workout.workout_volume_kg,
    workout.workout_exercises,
    p.workout_records
   FROM (((public.social_posts p
     JOIN public.social_profiles a ON ((a.user_id = p.author_id)))
     LEFT JOIN LATERAL private.social_post_food(p.id) food(food_name, icon_set, icon_name, photo_path, kcal, carbs_g, protein_g, fat_g) ON (true))
     LEFT JOIN LATERAL private.social_post_workout(p.id) workout(workout_name, workout_started_at, workout_duration_s, workout_sets, workout_volume_kg, workout_exercises) ON (true))
  WHERE ((food.food_name IS NOT NULL) OR (workout.workout_name IS NOT NULL));

CREATE FUNCTION public.social_feed (
  p_mode      text                      DEFAULT 'following'::text,
  p_before_at timestamp with time zone  DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                      DEFAULT NULL::uuid,
  p_limit     integer                   DEFAULT 20,
  p_kinds     public.social_post_kind[] DEFAULT '{food}'::public.social_post_kind[]
)
  RETURNS SETOF public.social_post_details
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  return query
    with page as materialized (
      select c.id, c.created_at from private.social_feed_candidates(p_mode, p_before_at, p_before_id, p_limit, p_kinds) c
    )
    select d.* from page p join public.social_post_details d on d.id = p.id order by p.created_at desc, p.id desc;
end;
$function$;

GRANT ALL ON FUNCTION public.social_feed(text, timestamp WITH time zone, uuid, integer, public.social_post_kind[]) TO authenticated;

GRANT ALL ON FUNCTION public.social_feed(text, timestamp WITH time zone, uuid, integer, public.social_post_kind[]) TO service_role;

CREATE FUNCTION public.social_post (
  p_id    uuid,
  p_kinds public.social_post_kind[] DEFAULT '{food}'::public.social_post_kind[]
)
  RETURNS SETOF public.social_post_details
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select * from public.social_post_details where id = p_id and kind = any(p_kinds);
$function$;

GRANT ALL ON FUNCTION public.social_post(uuid, public.social_post_kind[]) TO authenticated;

GRANT ALL ON FUNCTION public.social_post(uuid, public.social_post_kind[]) TO service_role;

CREATE FUNCTION public.social_profile_posts (
  p_user_id   uuid,
  p_before_at timestamp with time zone  DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                      DEFAULT NULL::uuid,
  p_limit     integer                   DEFAULT 20,
  p_kinds     public.social_post_kind[] DEFAULT '{food}'::public.social_post_kind[]
)
  RETURNS SETOF public.social_post_details
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  return query select d.* from public.social_post_details d where d.author_id = p_user_id
    and d.kind = any(p_kinds)
    and (p_before_at is null or (d.created_at, d.id) < (p_before_at, p_before_id))
    order by d.created_at desc, d.id desc limit p_limit + 1;
end;
$function$;

GRANT ALL ON FUNCTION public.social_profile_posts(uuid, timestamp WITH time zone, uuid, integer, public.social_post_kind[]) TO authenticated;

GRANT ALL ON FUNCTION public.social_profile_posts(uuid, timestamp WITH time zone, uuid, integer, public.social_post_kind[]) TO service_role;

GRANT SELECT ON public.social_post_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.social_post_details TO service_role;

CREATE VIEW public.workout_set_values WITH (security_invoker=true) AS SELECT s.id,
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

CREATE VIEW public.workout_set_details WITH (security_invoker=true) AS WITH bests AS (
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

COMMENT ON VIEW public.workout_set_details IS 'Every saved set with its volume, Epley estimated 1RM and personal-record flags. A record beats every earlier workout and is the best of its kind in its own workout; warm-ups never set one.';

GRANT SELECT ON public.workout_set_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.workout_set_details TO service_role;

COMMENT ON VIEW public.workout_set_values IS 'Every saved set with its volume and Epley estimated 1RM, and whether it can hold a weight record. No records: those are workout_set_details.';

GRANT SELECT ON public.workout_set_values TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.workout_set_values TO service_role;

CREATE VIEW public.workout_summaries WITH (security_invoker=true) AS SELECT w.id,
    w.user_id,
    w.name,
    w.notes,
    w.started_at,
    w.ended_at,
    w.duration_s,
    w.log_date,
    w.routine_id,
    w.kcal,
    w.health_workout_id,
    w.created_at,
    w.updated_at,
    COALESCE(stats.exercise_count, 0) AS exercise_count,
    COALESCE(stats.set_count, 0) AS set_count,
    COALESCE(stats.volume_kg, (0)::numeric) AS volume_kg,
    COALESCE(prs.pr_count, 0) AS pr_count,
    COALESCE(list.exercises, '[]'::jsonb) AS exercises
   FROM (((public.workouts w
     LEFT JOIN LATERAL ( SELECT (count(DISTINCT v.workout_exercise_id))::integer AS exercise_count,
            (count(*))::integer AS set_count,
            sum(v.volume_kg) AS volume_kg
           FROM public.workout_set_values v
          WHERE (v.workout_id = w.id)) stats ON (true))
     LEFT JOIN ( SELECT d.workout_id,
            (count(*) FILTER (WHERE (d.is_weight_pr OR d.is_e1rm_pr OR d.is_volume_pr OR d.is_reps_pr OR d.is_duration_pr OR d.is_distance_pr)))::integer AS pr_count
           FROM public.workout_set_details d
          GROUP BY d.workout_id) prs ON ((prs.workout_id = w.id)))
     LEFT JOIN LATERAL ( SELECT jsonb_agg(jsonb_build_object('exercise_id', e.exercise_id, 'exercise_name', e.exercise_name, 'tracking', e.tracking, 'sets', ( SELECT count(*) AS count
                   FROM public.workout_sets s
                  WHERE (s.workout_exercise_id = e.id))) ORDER BY e."position") AS exercises
           FROM public.workout_exercises e
          WHERE (e.workout_id = w.id)) list ON (true));

COMMENT ON VIEW public.workout_summaries IS 'One row per workout with its totals, record count and exercise list.';

GRANT SELECT ON public.workout_summaries TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.workout_summaries TO service_role;
-- `supabase db diff` emits the grants a function ends up with and not the
-- revoke that shaped them, so `create function`'s default EXECUTE to PUBLIC
-- would survive without these. See "Things a diff cannot see" in the README.
REVOKE ALL ON FUNCTION public.save_workout(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exercise_bests(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exercise_history(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exercise_last_sets(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exercise_rep_bests(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.workout_weeks(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.workout_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.workout_exercise_totals(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_social_workout_post(uuid, text, public.social_audience) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_workout_post(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_workout_stats(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_feed(text, timestamp with time zone, uuid, integer, public.social_post_kind[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_post(uuid, public.social_post_kind[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.social_profile_posts(uuid, timestamp with time zone, uuid, integer, public.social_post_kind[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.social_feed_candidates(text, timestamp with time zone, uuid, integer, public.social_post_kind[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.social_post_workout(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.social_insert_workout_post(uuid, integer, text, public.social_audience, boolean) FROM PUBLIC, anon;

-- And the table grants 98_client_table_privileges.sql takes back from every
-- client table, which the diff does not repeat for tables it creates.
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.custom_exercises FROM anon, authenticated;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workout_routines FROM anon, authenticated;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workouts FROM anon, authenticated;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workout_exercises FROM anon, authenticated;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workout_sets FROM anon, authenticated;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workout_set_values FROM anon, authenticated;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workout_set_details FROM anon, authenticated;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workout_summaries FROM anon, authenticated;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_post_details FROM anon, authenticated;
