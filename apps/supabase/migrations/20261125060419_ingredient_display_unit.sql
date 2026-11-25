-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP VIEW public.food_log_ingredient_details;

CREATE FUNCTION public.set_ingredient_unit (
  p_ingredient_id uuid,
  p_unit          text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid;
begin
  select e.user_id into v_user_id
  from public.food_log_ingredients i
  join public.food_logs e on e.id = i.food_log_id
  where i.id = p_ingredient_id;

  if v_user_id is null or v_user_id is distinct from auth.uid() then
    raise exception 'ingredient not found';
  end if;

  update public.food_log_ingredients
  set display_unit = p_unit
  where id = p_ingredient_id;
end;
$function$;

COMMENT ON FUNCTION public.set_ingredient_unit(uuid,text) IS 'Set the unit one ingredient is shown in. Display only: no amount or total moves. Owner-checked.';

GRANT ALL ON FUNCTION public.set_ingredient_unit(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.set_ingredient_unit(uuid, text) TO service_role;

ALTER TABLE public.food_log_ingredients
  ADD COLUMN display_unit text;

ALTER TABLE public.food_log_ingredients
  ADD CONSTRAINT food_log_ingredients_display_unit_check
    CHECK (display_unit = ANY (ARRAY['g'::text, 'kg'::text, 'oz'::text, 'lb'::text, 'ml'::text, 'l'::text, 'tsp'::text, 'tbsp'::text, 'cup'::text, 'floz'::text]));

CREATE VIEW public.food_log_ingredient_details WITH (security_invoker=on) AS SELECT id,
    food_log_id,
    food_id,
    "position",
    COALESCE(display_label, item_name) AS name,
    quantity,
    serving_label,
    (round((((base_kcal)::numeric * serving_factor) * quantity)))::integer AS kcal,
    round(((base_carbs_g * serving_factor) * quantity), 1) AS carbs_g,
    round(((base_protein_g * serving_factor) * quantity), 1) AS protein_g,
    round(((base_fat_g * serving_factor) * quantity), 1) AS fat_g,
    round((grams * quantity), 1) AS grams,
    display_unit
   FROM public.food_log_ingredients i;

GRANT SELECT ON public.food_log_ingredient_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_log_ingredient_details TO service_role;
-- Not captured by the diff (see Traps in the README): a new function is
-- executable by PUBLIC until it is revoked.
REVOKE EXECUTE ON FUNCTION public.set_ingredient_unit(uuid, text) FROM public, anon;
-- Nor are the default table grants the recreated view picks up, which
-- 98_client_table_privileges.sql takes back from every table in the schema.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.food_log_ingredient_details
  FROM public, anon, authenticated;
