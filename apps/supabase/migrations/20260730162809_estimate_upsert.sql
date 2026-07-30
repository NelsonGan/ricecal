-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.upsert_estimate_food (
  p_name      text,
  p_kcal      integer,
  p_carbs_g   numeric,
  p_protein_g numeric,
  p_fat_g     numeric,
  p_fibre_g   numeric DEFAULT NULL::numeric,
  p_sugar_g   numeric DEFAULT NULL::numeric,
  p_sodium_mg integer DEFAULT NULL::integer
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_norm text := public.search_normalize(p_name);
  v_id   uuid;
begin
  if v_norm = '' then
    raise exception 'estimate name normalizes to nothing usable';
  end if;

  select f.id into v_id from public.foods f
  where f.is_estimate and f.name_norm = v_norm;

  if v_id is null then
    insert into public.foods
      (slug, name, place, kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g,
       sodium_mg, verified, is_estimate, source)
    values
      ('estimate-' || replace(v_norm, ' ', '-'),
       left(trim(p_name), 120), 'home',
       p_kcal, p_carbs_g, p_protein_g, p_fat_g, p_fibre_g, p_sugar_g,
       p_sodium_mg, false, true, 'llm estimate')
    on conflict (name_norm) where is_estimate do nothing
    returning id into v_id;

    -- Lost the race, or the slug collided with a differently-spelled name that
    -- normalizes the same: either way the row exists now, so reuse it.
    if v_id is null then
      select f.id into v_id from public.foods f
      where f.is_estimate and f.name_norm = v_norm;
    end if;

    if v_id is not null then
      insert into public.food_servings (food_id, slug, label, factor, is_default, position)
      values (v_id, 'serving', '1 serving', 1.0, true, 0)
      on conflict (food_id, slug) do nothing;
    end if;
  end if;

  return v_id;
end;
$function$;

COMMENT ON FUNCTION public.upsert_estimate_food(text,integer,numeric,numeric,numeric,numeric,numeric,integer) IS 'Reuse-or-create a tier-4 estimate row, deduped on the normalized name. Returns the food id. service_role only.';

GRANT ALL ON FUNCTION public.upsert_estimate_food(text, integer, numeric, numeric, numeric, numeric, numeric, integer) TO service_role;