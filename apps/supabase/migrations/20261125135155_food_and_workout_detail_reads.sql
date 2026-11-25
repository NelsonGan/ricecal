-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.group_post_food (
  p_post_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_entry uuid; v_author uuid; v_food jsonb;
begin
  select p.source_entry_id, p.author_id into v_entry, v_author
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'food' and p.review_status = 'approved' and not p.quarantined;
  if v_entry is null then return null; end if;
  select jsonb_build_object(
    'post_id', p_post_id, 'name', left(d.food_name, 160), 'icon_set', d.icon_set, 'icon_name', d.icon_name,
    'photo_path', d.photo_path,
    'serving_label', d.serving_label, 'quantity', round(d.quantity * d.plate_quantity, 2),
    'logged_at', d.logged_at,
    'kcal', d.kcal, 'carbs_g', d.carbs_g, 'protein_g', d.protein_g, 'fat_g', d.fat_g,
    -- The diary day and the catalogue row, so the owner's own card opens their
    -- entry on its day with the dish's other portions.
    'log_date', d.log_date, 'food_id', d.food_id)
  into v_food
  from public.food_log_details d
  where d.id = v_entry and d.user_id = v_author;
  return v_food;
end;
$function$;

CREATE OR REPLACE FUNCTION private.social_post_workout (
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
  -- The volume counts only what was lifted: a barbell set's volume and what
  -- was added to a bodyweight one, never the body. The post's page lists
  -- every set's reps, and with those a total carrying the body weight would
  -- give the owner's weigh-in away. social_workout_post_detail sums the same.
  left join lateral (
    select count(*)::integer as set_count,
      sum(case
        when v.tracking = 'weight_reps' then v.volume_kg
        when v.tracking = 'weighted_reps' and v.reps > 0 and v.weight_kg > 0 then v.weight_kg * v.reps
      end) as volume_kg
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

CREATE FUNCTION public.group_entry_detail (
  p_group_id uuid,
  p_entry_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id); v_owner uuid; v_day date; v_shared boolean;
begin
  select f.user_id, f.log_date into v_owner, v_day from public.food_logs f where f.id = p_entry_id;
  v_shared := exists (select 1 from public.group_messages m
    join public.social_posts p on p.id = m.post_id
    where m.group_id = p_group_id and p.source_entry_id = p_entry_id and not m.quarantined
      and p.review_status = 'approved' and not p.quarantined);
  if v_owner is null or not private.group_is_member(p_group_id, v_owner)
     or (v_owner <> v_user and private.social_pair_blocked(v_owner))
     or not (v_shared or v_day between public.local_today(v_user) - 60 and public.local_today(v_user) + 1) then
    raise exception 'Food unavailable' using errcode = '42501', hint = 'food_gone';
  end if;
  return (select jsonb_build_object(
    'owner', private.group_person(v_owner),
    'entry', jsonb_build_object(
      'id', d.id, 'name', left(d.food_name, 160), 'brand', d.food_brand,
      'photo_path', d.photo_path, 'icon_set', d.icon_set, 'icon_name', d.icon_name,
      'logged_at', d.logged_at, 'log_date', d.log_date,
      'serving_label', d.serving_label, 'quantity', d.quantity, 'plate_quantity', d.plate_quantity,
      'grams', d.grams,
      'kcal', d.kcal, 'carbs_g', d.carbs_g, 'protein_g', d.protein_g, 'fat_g', d.fat_g,
      'fibre_g', d.fibre_g, 'sugar_g', d.sugar_g, 'sodium_mg', d.sodium_mg),
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'quantity', i.quantity, 'serving_label', i.serving_label,
        'kcal', i.kcal, 'carbs_g', i.carbs_g, 'protein_g', i.protein_g, 'fat_g', i.fat_g,
        'grams', i.grams, 'position', i.position, 'display_unit', i.display_unit
      ) order by i.position, i.id)
      from public.food_log_ingredient_details i where i.food_log_id = d.id), '[]'::jsonb))
    from public.food_log_details d where d.id = p_entry_id and d.user_id = v_owner);
end;
$function$;

GRANT ALL ON FUNCTION public.group_entry_detail(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.group_entry_detail(uuid, uuid) TO service_role;

CREATE FUNCTION public.social_workout_post_detail (
  p_post_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_workout uuid; v_author uuid; v_records integer;
begin
  select p.source_workout_id, p.author_id, p.workout_records into v_workout, v_author, v_records
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'workout' and private.social_can_view_post(p.id);
  if v_workout is null or not exists (
    select 1 from public.workouts w where w.id = v_workout and w.user_id = v_author) then
    raise exception 'Post unavailable' using errcode = '42501', hint = 'post_gone';
  end if;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', a.user_id,
        'name', coalesce(nullif(btrim(a.display_name), ''), a.handle), 'handle', a.handle,
        'avatar_path', case when a.review_status = 'approved' and not a.quarantined then a.avatar_path end,
        'is_pro', private.social_is_pro(a.user_id))
      from private.social_profiles a where a.user_id = v_author),
    'records', coalesce(v_records, 0),
    'summary', (
      select jsonb_build_object('id', w.id, 'user_id', w.user_id, 'name', w.name, 'notes', null,
        'started_at', w.started_at, 'ended_at', w.ended_at, 'duration_s', w.duration_s,
        'log_date', w.log_date, 'routine_id', null, 'kcal', null, 'health_workout_id', null,
        'set_count', (select count(*) from public.workout_set_values v where v.workout_id = w.id),
        'volume_kg', coalesce((select sum(case
            when v.tracking = 'weight_reps' then v.volume_kg
            when v.tracking = 'weighted_reps' and v.reps > 0 and v.weight_kg > 0 then v.weight_kg * v.reps
          end) from public.workout_set_values v where v.workout_id = w.id), 0),
        'exercises', '[]'::jsonb)
      from public.workouts w where w.id = v_workout),
    'exercises', coalesce((
      select jsonb_agg(to_jsonb(e) - 'notes' || jsonb_build_object('notes', null) order by e.position)
      from public.workout_exercises e where e.workout_id = v_workout), '[]'::jsonb),
    -- Field by field rather than the whole row: a bodyweight exercise's load is
    -- the owner's own weigh-in, so it never goes, and its volume is only what
    -- was added (weight_kg here is what the owner typed: the added weight or
    -- the help, never the body).
    'sets', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'workout_exercise_id', v.workout_exercise_id,
          'exercise_id', v.exercise_id, 'exercise_position', v.exercise_position, 'position', v.position,
          'kind', v.kind, 'weight_kg', v.weight_kg, 'reps', v.reps, 'duration_s', v.duration_s,
          'distance_m', v.distance_m, 'rpe', v.rpe,
          'volume_kg', case
            when v.tracking = 'weight_reps' then v.volume_kg
            when v.tracking = 'weighted_reps' and v.reps > 0 and v.weight_kg > 0 then v.weight_kg * v.reps
          end,
          'e1rm_kg', v.e1rm_kg) order by v.exercise_position, v.position)
      from public.workout_set_values v where v.workout_id = v_workout), '[]'::jsonb)
  );
end;
$function$;

GRANT ALL ON FUNCTION public.social_workout_post_detail(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.social_workout_post_detail(uuid) TO service_role;

-- Not captured by the diff (see Traps in the README): a new function is
-- executable by PUBLIC until it is revoked.
REVOKE EXECUTE ON FUNCTION public.group_entry_detail(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.social_workout_post_detail(uuid) FROM public, anon;
