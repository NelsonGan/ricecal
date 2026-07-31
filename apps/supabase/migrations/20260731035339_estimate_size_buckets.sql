-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.upsert_estimate_food (
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
  v_name text := left(trim(p_name), 120);
  v_norm text := public.search_normalize(p_name);
  -- The bucket a size-tagged name rounds to, scaled to what is being priced:
  -- 50 kcal is a rounding error on a plate and most of a satay stick, and a
  -- flat step meant a 64 kcal skewer reusing an 85 kcal row.
  v_step  integer := case when p_kcal < 200 then 10 when p_kcal < 500 then 25 else 50 end;
  -- Half a bucket: inside this the reused figure and the requested one round
  -- to the same tag, so the entry above can stay at exactly one portion.
  v_slack integer := greatest(5, v_step / 2);
  v_id   uuid;
  v_kcal integer;
begin
  if v_norm = '' then
    raise exception 'estimate name normalizes to nothing usable';
  end if;

  select f.id, f.kcal into v_id, v_kcal from public.foods f
  where f.is_estimate and f.name_norm = v_norm;

  -- The row that owns this name is for a different-sized plate. Move to a
  -- size-tagged name, rounded to the bucket so that the same plate
  -- photographed twice lands on one row rather than two a few calories apart.
  if v_id is not null and abs(v_kcal - p_kcal) > v_slack then
    v_name := left(v_name, 108) || ' (' ||
              (greatest(1, round(p_kcal::numeric / v_step)) * v_step) || ' kcal)';
    v_norm := public.search_normalize(v_name);

    select f.id, f.kcal into v_id, v_kcal from public.foods f
    where f.is_estimate and f.name_norm = v_norm;
  end if;

  if v_id is null then
    insert into public.foods
      (slug, name, place, kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g,
       sodium_mg, verified, is_estimate, source)
    values
      ('estimate-' || replace(v_norm, ' ', '-'),
       v_name, 'home',
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