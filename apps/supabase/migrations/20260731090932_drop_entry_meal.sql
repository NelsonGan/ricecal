-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

DROP VIEW public.daily_nutrition;

DROP VIEW public.food_log_details;

DROP VIEW public.user_food_stats;

ALTER TABLE public.food_logs
  DROP COLUMN meal;

CREATE VIEW public.food_log_details WITH (security_invoker=on) AS SELECT e.id,
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

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.food_log_details TO service_role;

CREATE VIEW public.user_food_stats WITH (security_invoker=on) AS SELECT e.user_id,
    e.food_id,
    (count(*))::integer AS times_logged,
    max(e.logged_at) AS last_logged_at
   FROM (public.food_logs e
     JOIN public.foods f ON ((f.id = e.food_id)))
  WHERE ((NOT f.is_estimate) AND (NOT f.is_archetype))
  GROUP BY e.user_id, e.food_id;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_food_stats TO anon;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.user_food_stats TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_food_stats TO service_role;