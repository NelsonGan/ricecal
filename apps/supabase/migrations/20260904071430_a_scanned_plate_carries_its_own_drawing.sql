-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

CREATE OR REPLACE VIEW public.food_log_details WITH (security_invoker=on) AS SELECT id,
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
    COALESCE(icon_set, item_icon_set) AS icon_set,
    COALESCE(icon_name, item_icon_name) AS icon_name,
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