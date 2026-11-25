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
    'logged_at', d.logged_at, 'log_date', d.log_date,
    'food_id', case when v_author = (select auth.uid()) then d.food_id end,
    'kcal', d.kcal, 'carbs_g', d.carbs_g, 'protein_g', d.protein_g, 'fat_g', d.fat_g)
  into v_food
  from public.food_log_details d
  where d.id = v_entry and d.user_id = v_author;
  return v_food;
end;
$function$;

CREATE FUNCTION public.group_food_detail (
  p_group_id uuid,
  p_post_id  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := private.group_require_member(p_group_id);
  v_entry uuid;
  v_owner uuid;
  v_shared boolean;
  v_food jsonb;
begin
  select p.source_entry_id, p.author_id into v_entry, v_owner
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'food'
    and p.review_status = 'approved' and not p.quarantined;

  v_shared := v_entry is not null and exists (
    select 1 from public.group_messages m
    where m.group_id = p_group_id and m.post_id = p_post_id
      and not m.quarantined
      and not exists (
        select 1 from public.group_message_reports r
        where r.message_id = m.id and r.reporter_id = v_user
      )
  );

  if v_entry is null or v_owner is null or not v_shared
     or not private.group_is_member(p_group_id, v_owner)
     or (v_owner <> v_user and private.social_pair_blocked(v_owner)) then
    raise exception 'Food unavailable' using errcode = '42501', hint = 'food_gone';
  end if;

  select jsonb_build_object(
    'id', d.id,
    'post_id', p_post_id,
    'name', left(d.food_name, 160),
    'brand', d.food_brand,
    'icon_set', d.icon_set,
    'icon_name', d.icon_name,
    'photo_path', d.photo_path,
    'log_date', d.log_date,
    'logged_at', d.logged_at,
    'serving_label', d.serving_label,
    'quantity', d.quantity,
    'plate_quantity', d.plate_quantity,
    'eaten', round(d.quantity * d.plate_quantity, 2),
    'grams', d.grams,
    'kcal', d.kcal,
    'carbs_g', d.carbs_g,
    'protein_g', d.protein_g,
    'fat_g', d.fat_g,
    'fibre_g', d.fibre_g,
    'sugar_g', d.sugar_g,
    'sodium_mg', d.sodium_mg
  ) || coalesce(private.group_food_reactions(p_post_id, p_group_id, v_user), '{}'::jsonb)
  into v_food
  from public.food_log_details d
  where d.id = v_entry and d.user_id = v_owner;

  if v_food is null then
    raise exception 'Food unavailable' using errcode = '42501', hint = 'food_gone';
  end if;

  return jsonb_build_object(
    'owner', private.group_person(v_owner),
    'food', v_food,
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'quantity', i.quantity,
        'serving_label', i.serving_label,
        'kcal', i.kcal,
        'carbs_g', i.carbs_g,
        'protein_g', i.protein_g,
        'fat_g', i.fat_g,
        'grams', i.grams,
        'display_unit', i.display_unit,
        'position', i.position
      ) order by i.position, i.id)
      from public.food_log_ingredient_details i
      where i.food_log_id = v_entry
    ), '[]'::jsonb)
  );
end;
$function$;

GRANT ALL ON FUNCTION public.group_food_detail(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.group_food_detail(uuid, uuid) TO service_role;

CREATE FUNCTION public.social_post_workout_detail (
  p_post_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := (select auth.uid());
  v_workout_id uuid;
  v_author uuid;
  v_records integer;
  v_summary jsonb;
begin
  if v_user is null then
    raise exception 'Sign in to continue' using errcode = '42501';
  end if;

  select p.source_workout_id, p.author_id, p.workout_records
    into v_workout_id, v_author, v_records
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'workout' and private.social_can_view_post(p.id);

  if v_workout_id is null or v_author is null then
    raise exception 'Workout unavailable' using errcode = '42501', hint = 'workout_gone';
  end if;

  select jsonb_build_object(
    'id', w.id, 'user_id', w.user_id, 'name', w.name, 'notes', null,
    'started_at', w.started_at, 'ended_at', w.ended_at, 'duration_s', w.duration_s,
    'log_date', w.log_date, 'routine_id', null, 'kcal', w.kcal, 'health_workout_id', null,
    'set_count', (select count(*) from public.workout_set_values v where v.workout_id = w.id),
    'volume_kg', coalesce((select sum(v.volume_kg) from public.workout_set_values v where v.workout_id = w.id), 0),
    'pr_count', coalesce(v_records, 0),
    'exercises', '[]'::jsonb
  )
  into v_summary
  from public.workouts w
  where w.id = v_workout_id and w.user_id = v_author;

  if v_summary is null then
    raise exception 'Workout unavailable' using errcode = '42501', hint = 'workout_gone';
  end if;

  return jsonb_build_object(
    'owner', (
      select jsonb_build_object(
        'id', p.id,
        'name', coalesce(nullif(btrim(p.display_name), ''), p.handle),
        'handle', p.handle,
        'avatar_path', case
          when p.review_status = 'approved' and not p.quarantined
            and p.avatar_path like 'avatars/' || p.id::text || '/%'
          then p.avatar_path
        end,
        'is_pro', private.social_is_pro(p.id)
      )
      from public.profiles p where p.id = v_author
    ),
    'summary', v_summary,
    'exercises', coalesce((
      select jsonb_agg(to_jsonb(e) - 'notes' || jsonb_build_object('notes', null) order by e.position)
      from public.workout_exercises e where e.workout_id = v_workout_id), '[]'::jsonb),
    'sets', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.exercise_position, v.position)
      from public.workout_set_values v where v.workout_id = v_workout_id), '[]'::jsonb),
    'heart', (
      select jsonb_build_object(
        'workout_id', h.workout_id, 'started_at', h.started_at,
        'interval_s', h.interval_s, 'bpm', h.bpm, 'avg_bpm', h.avg_bpm,
        'max_bpm', h.max_bpm, 'min_bpm', h.min_bpm, 'active_kcal', h.active_kcal
      )
      from public.workout_heart_rates h where h.workout_id = v_workout_id)
  );
end;
$function$;

GRANT ALL ON FUNCTION public.social_post_workout_detail(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.social_post_workout_detail(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION private.group_post_food(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.group_food_detail(uuid, uuid), public.social_post_workout_detail(uuid) FROM PUBLIC, anon;
