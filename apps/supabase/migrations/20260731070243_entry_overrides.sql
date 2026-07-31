-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.remove_ingredient (
  p_ingredient_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_log_id  uuid;
  v_user_id uuid;
  v_sum     numeric;
  v_base    numeric;
begin
  select i.food_log_id, e.user_id into v_log_id, v_user_id
  from public.food_log_ingredients i
  join public.food_logs e on e.id = i.food_log_id
  where i.id = p_ingredient_id;

  if v_log_id is null or v_user_id is distinct from auth.uid() then
    raise exception 'ingredient not found';
  end if;

  delete from public.food_log_ingredients where id = p_ingredient_id;

  select sum(f.kcal * s.factor * i.quantity) into v_sum
  from public.food_log_ingredients i
  join public.foods f         on f.id = i.food_id
  join public.food_servings s on s.id = i.serving_id
  where i.food_log_id = v_log_id;

  select f.kcal * s.factor into v_base
  from public.food_logs e
  join public.foods f         on f.id = e.food_id
  join public.food_servings s on s.id = e.serving_id
  where e.id = v_log_id;

  if coalesce(v_base, 0) > 0 and coalesce(v_sum, 0) > 0 then
    update public.food_logs
    set quantity = greatest(0.01, least(100, round(v_sum / v_base, 2)))
    where id = v_log_id;
  end if;
end;
$function$;

COMMENT ON FUNCTION public.remove_ingredient(uuid) IS 'Take one ingredient off a scanned plate and recompute the parent entry''s quantity from what is left. Owner-checked.';

GRANT ALL ON FUNCTION public.remove_ingredient(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.remove_ingredient(uuid) TO service_role;

ALTER TABLE public.food_logs
  ADD COLUMN override_kcal integer;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_override_kcal_check CHECK (override_kcal >= 0 AND override_kcal <= 20000);

ALTER TABLE public.food_logs
  ADD COLUMN override_carbs_g numeric(7,1);

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_override_carbs_g_check CHECK (override_carbs_g >= 0::numeric AND override_carbs_g <= 2000::numeric);

ALTER TABLE public.food_logs
  ADD COLUMN override_protein_g numeric(7,1);

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_override_protein_g_check CHECK (override_protein_g >= 0::numeric AND override_protein_g <= 2000::numeric);

ALTER TABLE public.food_logs
  ADD COLUMN override_fat_g numeric(7,1);

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_override_fat_g_check CHECK (override_fat_g >= 0::numeric AND override_fat_g <= 2000::numeric);

CREATE OR REPLACE VIEW public.food_log_details WITH (security_invoker=on) AS SELECT e.id,
    e.user_id,
    e.log_date,
    e.meal,
    e.quantity,
    e.logged_at,
    e.note,
    e.source,
    e.photo_path,
    e.food_id,
    e.scan_id,
    e.suggested_edits,
    COALESCE(e.display_label, f.name) AS food_name,
    f.brand AS food_brand,
    f.verified AS food_verified,
    f.is_estimate,
    f.is_archetype,
        CASE
            WHEN (e.photo_path IS NULL) THEN COALESCE(e.icon_set, f.icon_set)
            ELSE NULL::public.icon_set
        END AS icon_set,
        CASE
            WHEN (e.photo_path IS NULL) THEN COALESCE(e.icon_name, f.icon_name)
            ELSE NULL::text
        END AS icon_name,
    f.place,
    e.serving_id,
    s.label AS serving_label,
    s.factor AS serving_factor,
    COALESCE(e.override_kcal, (round((((f.kcal)::numeric * s.factor) * e.quantity)))::integer) AS kcal,
    COALESCE(e.override_carbs_g, round(((f.carbs_g * s.factor) * e.quantity), 1)) AS carbs_g,
    COALESCE(e.override_protein_g, round(((f.protein_g * s.factor) * e.quantity), 1)) AS protein_g,
    COALESCE(e.override_fat_g, round(((f.fat_g * s.factor) * e.quantity), 1)) AS fat_g,
    round(((f.fibre_g * s.factor) * e.quantity), 1) AS fibre_g,
    round(((f.sugar_g * s.factor) * e.quantity), 1) AS sugar_g
   FROM ((public.food_logs e
     JOIN public.foods f ON ((f.id = e.food_id)))
     JOIN public.food_servings s ON ((s.id = e.serving_id)));