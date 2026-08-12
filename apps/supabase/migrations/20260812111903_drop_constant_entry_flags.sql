-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP VIEW public.daily_nutrition;

DROP VIEW public.food_log_details;

CREATE VIEW public.food_log_details WITH (security_invoker=on) AS SELECT id,
    user_id,
    log_date,
    quantity,
    logged_at,
    note,
    source,
    photo_path,
    food_id,
    scan_id,
    suggested_edits,
    COALESCE(display_label, item_name) AS food_name,
    item_brand AS food_brand,
        CASE
            WHEN (photo_path IS NULL) THEN COALESCE(icon_set, item_icon_set)
            ELSE NULL::public.icon_set
        END AS icon_set,
        CASE
            WHEN (photo_path IS NULL) THEN COALESCE(icon_name, item_icon_name)
            ELSE NULL::text
        END AS icon_name,
    item_place AS place,
    serving_id,
    serving_label,
    serving_factor,
    override_kcal,
    override_carbs_g,
    override_protein_g,
    override_fat_g,
    COALESCE(override_kcal, ( SELECT (round(sum((((i.base_kcal)::numeric * i.serving_factor) * i.quantity))))::integer AS round
           FROM public.food_log_ingredients i
          WHERE (i.food_log_id = e.id)), (round((((base_kcal)::numeric * serving_factor) * quantity)))::integer) AS kcal,
    COALESCE(override_carbs_g, ( SELECT round(sum(((i.base_carbs_g * i.serving_factor) * i.quantity)), 1) AS round
           FROM public.food_log_ingredients i
          WHERE (i.food_log_id = e.id)), round(((base_carbs_g * serving_factor) * quantity), 1)) AS carbs_g,
    COALESCE(override_protein_g, ( SELECT round(sum(((i.base_protein_g * i.serving_factor) * i.quantity)), 1) AS round
           FROM public.food_log_ingredients i
          WHERE (i.food_log_id = e.id)), round(((base_protein_g * serving_factor) * quantity), 1)) AS protein_g,
    COALESCE(override_fat_g, ( SELECT round(sum(((i.base_fat_g * i.serving_factor) * i.quantity)), 1) AS round
           FROM public.food_log_ingredients i
          WHERE (i.food_log_id = e.id)), round(((base_fat_g * serving_factor) * quantity), 1)) AS fat_g,
    round(((base_fibre_g * serving_factor) * quantity), 1) AS fibre_g,
    round(((base_sugar_g * serving_factor) * quantity), 1) AS sugar_g,
    (round((((base_sodium_mg)::numeric * serving_factor) * quantity)))::integer AS sodium_mg,
    round((serving_grams * quantity), 1) AS grams,
    recipe_id,
    item_name,
    item_brand,
    base_kcal,
    base_carbs_g,
    base_protein_g,
    base_fat_g,
    base_fibre_g,
    base_sugar_g,
    base_sodium_mg,
    serving_grams AS base_serving_grams
   FROM public.food_logs e;

CREATE VIEW public.daily_nutrition WITH (security_invoker=on) AS SELECT user_id,
    log_date,
    (sum(kcal))::integer AS kcal,
    sum(carbs_g) AS carbs_g,
    sum(protein_g) AS protein_g,
    sum(fat_g) AS fat_g,
    sum(fibre_g) AS fibre_g,
    sum(sugar_g) AS sugar_g,
    (count(*))::integer AS entry_count
   FROM public.food_log_details d
  GROUP BY user_id, log_date;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_nutrition TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.daily_nutrition TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.daily_nutrition TO service_role;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_details TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_log_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.food_log_details TO service_role;