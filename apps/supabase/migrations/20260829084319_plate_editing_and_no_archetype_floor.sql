-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.seed_archetype_foods();

DROP POLICY "archetypes: read" ON public.archetypes;

DROP TABLE public.archetypes;

CREATE FUNCTION public.add_ingredient (
  p_food_log_id   uuid,
  p_name          text,
  p_kcal          numeric,
  p_carbs_g       numeric,
  p_protein_g     numeric,
  p_fat_g         numeric,
  p_quantity      numeric DEFAULT 1,
  p_grams         numeric DEFAULT NULL::numeric,
  p_food_id       uuid    DEFAULT NULL::uuid,
  p_serving_id    text    DEFAULT NULL::text,
  p_serving_label text    DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_entry public.food_logs;
  v_parts integer;
  v_name  text := left(btrim(coalesce(p_name, '')), 120);
  v_label text := left(btrim(coalesce(p_serving_label, '')), 120);
  v_id    uuid;
begin
  select * into v_entry from public.food_logs where id = p_food_log_id;
  if v_entry.id is null or v_entry.user_id is distinct from auth.uid() then
    raise exception 'entry not found';
  end if;

  if v_name = '' then
    raise exception 'ingredient needs a name';
  end if;
  if p_kcal is null or p_kcal < 0 or p_kcal > 20000 then
    raise exception 'kcal out of range';
  end if;
  if p_quantity is null or p_quantity < 0.25 or p_quantity > 20 then
    raise exception 'quantity out of range';
  end if;
  if p_grams is not null and (p_grams <= 0 or p_grams > 20000) then
    raise exception 'grams out of range';
  end if;

  select count(*) into v_parts
  from public.food_log_ingredients
  where food_log_id = v_entry.id;

  -- A plate is a handful of things. The ceiling is here so a stuck client
  -- cannot grow one row's breakdown without limit.
  if v_parts >= 30 then
    raise exception 'too many ingredients on this entry';
  end if;

  if v_parts = 0 then
    if v_entry.override_kcal is not null then
      raise exception 'entry has typed figures';
    end if;
    if v_entry.quantity < 0.25 or v_entry.quantity > 20 then
      raise exception 'entry portion is too large to break down';
    end if;

    insert into public.food_log_ingredients (
      food_log_id, food_id, serving_id, quantity, item_name,
      base_kcal, base_carbs_g, base_protein_g, base_fat_g,
      serving_label, serving_factor, display_label, grams, position
    )
    values (
      v_entry.id, v_entry.food_id, v_entry.serving_id, v_entry.quantity,
      -- The two names copied as the two names, not folded into one. A part
      -- coalesces them exactly as the parent does, so keeping them apart is
      -- what makes the seeded row read back as the entry it came from.
      v_entry.item_name,
      v_entry.base_kcal, v_entry.base_carbs_g, v_entry.base_protein_g, v_entry.base_fat_g,
      v_entry.serving_label, v_entry.serving_factor,
      v_entry.display_label,
      -- What one of the parent serving weighs, at the factor it was logged at.
      -- Null rather than clamped where that lands outside what the column
      -- accepts: a weight nobody can store is not a weight worth guessing.
      case
        when v_entry.serving_grams is null then null
        when round(v_entry.serving_grams * v_entry.serving_factor, 1) between 0.1 and 20000
          then round(v_entry.serving_grams * v_entry.serving_factor, 1)
      end,
      0
    );
  end if;

  insert into public.food_log_ingredients (
    food_log_id, food_id, serving_id, quantity, item_name,
    base_kcal, base_carbs_g, base_protein_g, base_fat_g,
    serving_label, serving_factor, display_label, grams, position
  )
  values (
    v_entry.id,
    p_food_id,
    nullif(left(btrim(coalesce(p_serving_id, '')), 200), ''),
    round(p_quantity, 2),
    v_name,
    round(p_kcal),
    least(2000, greatest(0, round(coalesce(p_carbs_g, 0), 1))),
    least(2000, greatest(0, round(coalesce(p_protein_g, 0), 1))),
    least(2000, greatest(0, round(coalesce(p_fat_g, 0), 1))),
    nullif(v_label, ''),
    -- One, always. The figures above are per ONE of this part, which is what
    -- the caller was shown; a factor as well would be a second place for the
    -- portion to live and a second chance to count it twice.
    1,
    v_name,
    case when p_grams is null then null else round(p_grams, 1) end,
    -- After whatever is already there, read off the rows rather than off the
    -- count: a plate somebody has removed the middle of has fewer parts than
    -- its highest position, and a new row numbered by the count would land on
    -- top of one that is still there.
    (select coalesce(max(i.position), -1) + 1
     from public.food_log_ingredients i where i.food_log_id = v_entry.id)
  )
  returning id into v_id;

  return v_id;
end;
$function$;

COMMENT ON FUNCTION public.add_ingredient(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,uuid,text,text) IS 'Put one food on a logged entry''s plate. Seeds the entry itself as the first part when it has no breakdown yet, so the totals the view sums stay the entry''s own. Owner-checked.';

GRANT ALL ON FUNCTION public.add_ingredient(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.add_ingredient(uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, text) TO service_role;
-- Hand-written: `db diff` emits the grants a function ends up with and not the
-- REVOKE that shaped them, so without this line `create function`'s default
-- EXECUTE-to-PUBLIC survives into the migration and `anon` keeps a grant the
-- schema file has already taken away. See "Things a diff cannot see".
REVOKE EXECUTE ON FUNCTION public.add_ingredient(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, uuid, text, text
) FROM public, anon;
