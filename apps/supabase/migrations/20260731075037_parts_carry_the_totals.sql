-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.remove_ingredient (
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
begin
  select i.food_log_id, e.user_id into v_log_id, v_user_id
  from public.food_log_ingredients i
  join public.food_logs e on e.id = i.food_log_id
  where i.id = p_ingredient_id;

  if v_log_id is null or v_user_id is distinct from auth.uid() then
    raise exception 'ingredient not found';
  end if;

  delete from public.food_log_ingredients where id = p_ingredient_id;
end;
$function$;

COMMENT ON FUNCTION public.remove_ingredient(uuid) IS 'Take one ingredient off a scanned plate. The entry''s totals follow from what is left. Owner-checked.';

CREATE OR REPLACE FUNCTION public.set_ingredient_quantity (
  p_ingredient_id uuid,
  p_quantity      numeric
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_log_id  uuid;
  v_user_id uuid;
begin
  select i.food_log_id, e.user_id into v_log_id, v_user_id
  from public.food_log_ingredients i
  join public.food_logs e on e.id = i.food_log_id
  where i.id = p_ingredient_id;

  if v_log_id is null or v_user_id is distinct from auth.uid() then
    raise exception 'ingredient not found';
  end if;
  if p_quantity is null or p_quantity < 0.25 or p_quantity > 20 then
    raise exception 'quantity out of range';
  end if;

  update public.food_log_ingredients
  set quantity = p_quantity
  where id = p_ingredient_id;
end;
$function$;

COMMENT ON FUNCTION public.set_ingredient_quantity(uuid,numeric) IS 'Set one scanned ingredient''s portion. The entry''s totals follow from the sum of its parts in food_log_details, so nothing else has to be written. Owner-checked.';

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
    e.override_kcal,
    e.override_carbs_g,
    e.override_protein_g,
    e.override_fat_g,
    COALESCE(e.override_kcal, parts.kcal, (round((((f.kcal)::numeric * s.factor) * e.quantity)))::integer) AS kcal,
    COALESCE(e.override_carbs_g, parts.carbs_g, round(((f.carbs_g * s.factor) * e.quantity), 1)) AS carbs_g,
    COALESCE(e.override_protein_g, parts.protein_g, round(((f.protein_g * s.factor) * e.quantity), 1)) AS protein_g,
    COALESCE(e.override_fat_g, parts.fat_g, round(((f.fat_g * s.factor) * e.quantity), 1)) AS fat_g,
    round(((f.fibre_g * s.factor) * e.quantity), 1) AS fibre_g,
    round(((f.sugar_g * s.factor) * e.quantity), 1) AS sugar_g
   FROM (((public.food_logs e
     JOIN public.foods f ON ((f.id = e.food_id)))
     JOIN public.food_servings s ON ((s.id = e.serving_id)))
     LEFT JOIN LATERAL ( SELECT (round((sum(i.kcal))::double precision))::integer AS kcal,
            round(sum(i.carbs_g), 1) AS carbs_g,
            round(sum(i.protein_g), 1) AS protein_g,
            round(sum(i.fat_g), 1) AS fat_g
           FROM public.food_log_ingredient_details i
          WHERE (i.food_log_id = e.id)
         HAVING (count(*) > 0)) parts ON (true));