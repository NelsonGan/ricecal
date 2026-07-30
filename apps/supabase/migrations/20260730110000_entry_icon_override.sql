-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default
--
-- Lets a user give one logged entry an illustration.
--
-- `foods` is shared and read-only to users, and most of it has no drawing — so
-- without this there is nowhere for someone to say what a plate looked like
-- except by photographing it. Per entry rather than per food: assigning an icon
-- does not carry to the next log of the same dish.
--
-- The view resolves the two sources so no screen has to know there are two. The
-- entry's choice wins; with neither the column comes back null, which the client
-- reads as "no icon" rather than substituting a stand-in.

SET check_function_bodies = false;

ALTER TABLE public.food_logs
  ADD COLUMN icon_set public.icon_set,
  ADD COLUMN icon_name text;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_icon_complete CHECK ((icon_set IS NULL) = (icon_name IS NULL));

DROP VIEW public.food_log_details;

CREATE VIEW public.food_log_details WITH (security_invoker=on) AS SELECT e.id,
    e.user_id,
    e.log_date,
    e.meal,
    e.quantity,
    e.logged_at,
    e.note,
    e.source,
    e.photo_path,
    e.food_id,
    f.name AS food_name,
    f.brand AS food_brand,
    COALESCE(e.icon_set, f.icon_set) AS icon_set,
    COALESCE(e.icon_name, f.icon_name) AS icon_name,
    f.place,
    e.serving_id,
    s.label AS serving_label,
    s.factor AS serving_factor,
    (round(((f.kcal * s.factor) * e.quantity)))::integer AS kcal,
    round(((f.carbs_g * s.factor) * e.quantity), 1) AS carbs_g,
    round(((f.protein_g * s.factor) * e.quantity), 1) AS protein_g,
    round(((f.fat_g * s.factor) * e.quantity), 1) AS fat_g,
    round(((f.fibre_g * s.factor) * e.quantity), 1) AS fibre_g,
    round(((f.sugar_g * s.factor) * e.quantity), 1) AS sugar_g
   FROM ((public.food_logs e
     JOIN public.foods f ON ((f.id = e.food_id)))
     JOIN public.food_servings s ON ((s.id = e.serving_id)));

-- Only the privilege the schema declares. See the note in
-- 20260729033250_custom_food_image.sql: the generated diff also reproduces the
-- ambient grants for `anon` and `service_role`, and re-granting them here would
-- read as anon having been given something deliberately.
GRANT SELECT ON TABLE public.food_log_details TO authenticated;
