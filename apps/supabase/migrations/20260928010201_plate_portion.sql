-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

-- Hand-edited after `pnpm db:diff`, in two places.
--
-- The revoke on `fold_plate_quantity`, which is explained where it is.
--
-- And the view. The diff engine dropped and recreated `food_log_details` and
-- `daily_nutrition` to change it, and recreated, both would have picked up
-- TRUNCATE, REFERENCES, TRIGGER and MAINTAIN for anon and authenticated from
-- the schema's default privileges, which 98_client_table_privileges.sql exists
-- to take away; the diff emits grants but never the revokes that shaped them.
-- `create or replace` keeps the view's grants and its dependants untouched
-- instead: every existing column keeps its name and type, and the two new ones
-- are appended.

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.add_ingredient (
  p_food_log_id   uuid,
  p_name          text,
  p_kcal          numeric,
  p_carbs_g       numeric,
  p_protein_g     numeric,
  p_fat_g         numeric,
  p_quantity      numeric  DEFAULT 1,
  p_grams         numeric  DEFAULT NULL::numeric,
  p_food_id       uuid     DEFAULT NULL::uuid,
  p_serving_id    text     DEFAULT NULL::text,
  p_serving_label text     DEFAULT NULL::text,
  p_position      smallint DEFAULT NULL::smallint
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

    -- And the new plate starts whole. The seeded part already carries the
    -- entry's quantity, so a portion left over from an earlier breakdown would
    -- count it twice. Nothing multiplied that value while the entry had no
    -- parts; from this row on, something does.
    update public.food_logs set plate_quantity = 1
    where id = v_entry.id and plate_quantity <> 1;
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
    -- Four decimals, matching the column. It was two, which is the same bug the
    -- column had: a part added at a typed weight would have been rounded here
    -- instead of there, and a replacement would come back weighing something
    -- else than the part it replaced.
    round(p_quantity, 4),
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
    -- Where the caller asked for, or after whatever is already there. The
    -- fallback is read off the rows rather than off the count: a plate somebody
    -- has removed the middle of has fewer parts than its highest position, and a
    -- new row numbered by the count would land on top of one that is still
    -- there.
    --
    -- A replacement DOES land on top of one that is still there, briefly, and
    -- that is the intent: the row it is replacing is removed a moment later, and
    -- until then the two are simply adjacent.
    -- NOT `coalesce(greatest(0, p_position), ...)`. `greatest` IGNORES nulls, so
    -- `greatest(0, null)` is 0 rather than null, and every part added without a
    -- position would have landed on top of the plate. The pgTAP suite caught it.
    case
      when p_position is not null then greatest(0, p_position)
      else (select coalesce(max(i.position), -1) + 1
            from public.food_log_ingredients i where i.food_log_id = v_entry.id)
    end
  )
  returning id into v_id;

  return v_id;
end;
$function$;

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
  -- The entry is locked, so two parts swiped off one plate at once are taken
  -- one after the other. Otherwise each could still see the other's row when
  -- it asks below whether the plate is empty, and neither would fold.
  select i.food_log_id, e.user_id into v_log_id, v_user_id
  from public.food_log_ingredients i
  join public.food_logs e on e.id = i.food_log_id
  where i.id = p_ingredient_id
  for update of e;

  if v_log_id is null or v_user_id is distinct from auth.uid() then
    raise exception 'ingredient not found';
  end if;

  delete from public.food_log_ingredients where id = p_ingredient_id;

  -- The last part takes the plate's portion with it, into the entry's own
  -- quantity. The entry counts as one dish again, and a plate that was half
  -- eaten is half of that dish rather than all of it. Clamped to what the
  -- column accepts, which only an absurd pair of numbers reaches.
  update public.food_logs e
  set quantity = least(100, greatest(0.01, round(e.quantity * e.plate_quantity, 2))),
      plate_quantity = 1
  where e.id = v_log_id
    and e.plate_quantity <> 1
    and not exists (select 1 from public.food_log_ingredients i where i.food_log_id = v_log_id);
end;
$function$;

CREATE FUNCTION public.fold_plate_quantity (
  p_food_log_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_portion numeric;
begin
  select e.plate_quantity into v_portion
  from public.food_logs e
  where e.id = p_food_log_id
  for update;

  -- Nothing to fold: a whole plate, an entry that is not there, or one with no
  -- parts for the portion to have been scaling.
  if v_portion is null or v_portion = 1
     or not exists (select 1 from public.food_log_ingredients i where i.food_log_id = p_food_log_id)
  then
    return;
  end if;

  update public.food_log_ingredients i
  set quantity = least(100, greatest(0.0001, round(i.quantity * v_portion, 4)))
  where i.food_log_id = p_food_log_id;

  update public.food_logs e
  set quantity = least(100, greatest(0.01, round(e.quantity * v_portion, 2))),
      plate_quantity = 1
  where e.id = p_food_log_id;
end;
$function$;

COMMENT ON FUNCTION public.fold_plate_quantity(uuid) IS 'Write an entry''s plate_quantity into its parts and its own quantity, and set it back to 1, leaving the total where it was. For scan-refine, before a correction edits the parts.';

-- Hand-written, because the diff emits the grants a function ends up with and
-- never the revoke that shaped them: `create function` gives EXECUTE to PUBLIC,
-- which anon and authenticated inherit.
REVOKE EXECUTE ON FUNCTION public.fold_plate_quantity(uuid) FROM PUBLIC, anon, authenticated;

GRANT ALL ON FUNCTION public.fold_plate_quantity(uuid) TO service_role;

ALTER TABLE public.food_logs
  ADD COLUMN plate_quantity numeric(6,2) DEFAULT 1 NOT NULL;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_plate_quantity_check CHECK (plate_quantity > 0::numeric AND plate_quantity <= 20::numeric);

CREATE OR REPLACE VIEW public.food_log_details WITH (security_invoker=on) AS SELECT e.id,
    e.user_id,
    e.log_date,
    e.quantity,
    e.logged_at,
    e.note,
    e.source,
    e.photo_path,
    e.food_id,
    e.scan_id,
    e.suggested_edits,
    COALESCE(e.display_label, e.item_name) AS food_name,
    e.item_brand AS food_brand,
    COALESCE(e.icon_set, e.item_icon_set) AS icon_set,
    COALESCE(e.icon_name, e.item_icon_name) AS icon_name,
    e.item_place AS place,
    e.serving_id,
    e.serving_label,
    e.serving_factor,
    e.override_kcal,
    e.override_carbs_g,
    e.override_protein_g,
    e.override_fat_g,
    COALESCE(e.override_kcal, (round((plate.portion * plate.kcal)))::integer, (round((((e.base_kcal)::numeric * e.serving_factor) * e.quantity)))::integer) AS kcal,
    COALESCE(e.override_carbs_g, round((plate.portion * plate.carbs_g), 1), round(((e.base_carbs_g * e.serving_factor) * e.quantity), 1)) AS carbs_g,
    COALESCE(e.override_protein_g, round((plate.portion * plate.protein_g), 1), round(((e.base_protein_g * e.serving_factor) * e.quantity), 1)) AS protein_g,
    COALESCE(e.override_fat_g, round((plate.portion * plate.fat_g), 1), round(((e.base_fat_g * e.serving_factor) * e.quantity), 1)) AS fat_g,
    round((((e.base_fibre_g * e.serving_factor) * e.quantity) * plate.portion), 1) AS fibre_g,
    round((((e.base_sugar_g * e.serving_factor) * e.quantity) * plate.portion), 1) AS sugar_g,
    (round(((((e.base_sodium_mg)::numeric * e.serving_factor) * e.quantity) * plate.portion)))::integer AS sodium_mg,
    round(((e.serving_grams * e.quantity) * plate.portion), 1) AS grams,
    e.recipe_id,
    e.item_name,
    e.item_brand,
    e.base_kcal,
    e.base_carbs_g,
    e.base_protein_g,
    e.base_fat_g,
    e.base_fibre_g,
    e.base_sugar_g,
    e.base_sodium_mg,
    e.serving_grams AS base_serving_grams,
    plate.parts AS ingredient_count,
    plate.portion AS plate_quantity
   FROM (public.food_logs e
     CROSS JOIN LATERAL ( SELECT (count(*))::integer AS parts,
                CASE
                    WHEN (count(*) > 0) THEN e.plate_quantity
                    ELSE (1)::numeric
                END AS portion,
            sum((((i.base_kcal)::numeric * i.serving_factor) * i.quantity)) AS kcal,
            sum(((i.base_carbs_g * i.serving_factor) * i.quantity)) AS carbs_g,
            sum(((i.base_protein_g * i.serving_factor) * i.quantity)) AS protein_g,
            sum(((i.base_fat_g * i.serving_factor) * i.quantity)) AS fat_g
           FROM public.food_log_ingredients i
          WHERE (i.food_log_id = e.id)) plate);
