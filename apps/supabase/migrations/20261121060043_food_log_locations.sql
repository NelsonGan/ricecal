-- Meal locations: where an entry was eaten (README: Meal locations).
--
-- Six nullable columns on `food_logs`, a partial index for the food map's
-- reads, and the same six at the end of `food_log_details`. All additive: a
-- build already in a store never writes them, the check constraint is
-- satisfied by a row with none, and the view only grows at its end, so every
-- column an older build reads by name is where it was.
--
-- Hand-arranged from `pnpm db:diff`, which dropped and recreated
-- `food_log_details` and with it `daily_nutrition`. The view only gains
-- columns at its end, which `create or replace` allows, so both keep their
-- grants and nothing built on them is touched.

-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

-- Lock the view before the table, in the order a diary read takes them. The
-- first deploy deadlocked: the ALTERs held `food_logs` while the view's
-- replacement waited on a read that held `food_log_details` and was waiting
-- on `food_logs`. Locking the view first locks what it reads too, so a read
-- either finishes before this starts or waits for it.
--
-- Inside a DO block because a bare LOCK is an error outside a transaction,
-- which is how the CLI applies migrations to a local stack. There it locks
-- nothing and costs nothing; the hosted deploy runs the file in one
-- transaction, and holds the lock until it commits.
DO $$ BEGIN LOCK TABLE public.food_log_details IN ACCESS EXCLUSIVE MODE; END $$;

ALTER TABLE public.food_logs
  ADD COLUMN latitude double precision;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_latitude_check CHECK (latitude >= '-90'::integer::double precision AND latitude <= 90::double precision);

ALTER TABLE public.food_logs
  ADD COLUMN longitude double precision;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_longitude_check CHECK (longitude >= '-180'::integer::double precision AND longitude <= 180::double precision);

ALTER TABLE public.food_logs
  ADD COLUMN location_name text;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_location_complete CHECK ((latitude IS NULL) = (longitude IS NULL) AND (latitude IS NULL) = (location_name IS NULL));

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_location_name_check CHECK (char_length(location_name) >= 1 AND char_length(location_name) <= 200);

ALTER TABLE public.food_logs
  ADD COLUMN location_address text;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_location_address_check CHECK (char_length(location_address) <= 300);

ALTER TABLE public.food_logs
  ADD COLUMN location_id text;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_location_id_check CHECK (char_length(location_id) <= 200);

ALTER TABLE public.food_logs
  ADD COLUMN location_category text;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_location_category_check CHECK (char_length(location_category) <= 64);

CREATE INDEX food_logs_user_located_idx ON public.food_logs (user_id, log_date DESC)
  WHERE latitude IS NOT NULL;

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
    round((((e.serving_grams * e.serving_factor) * e.quantity) * plate.portion), 1) AS grams,
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
    plate.portion AS plate_quantity,
    e.serving_ml AS base_serving_ml,
    e.latitude,
    e.longitude,
    e.location_name,
    e.location_address,
    e.location_id,
    e.location_category
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
