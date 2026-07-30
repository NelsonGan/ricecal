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
-- The view resolves down to one picture per row so no screen has to know the
-- order. A photo suppresses both icons: the check constraint stops an ENTRY
-- holding both, but the food underneath can still carry a drawing, and returning
-- it next to a photo would hand every consumer the same precedence rule to
-- re-derive. Below that the entry's choice wins over the food's, and a row with
-- nothing comes back null rather than as a stand-in plate.

SET check_function_bodies = false;

ALTER TABLE public.food_logs
  ADD COLUMN icon_set public.icon_set,
  ADD COLUMN icon_name text;

ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_icon_complete CHECK ((icon_set IS NULL) = (icon_name IS NULL));

-- A photo or an icon, never both. They answer the same question — what was on
-- this plate — and the photo always wins when rendering, so a row holding both
-- carries a drawing nothing would ever show. No existing row can violate this:
-- the icon columns are brand new and therefore null everywhere.
ALTER TABLE public.food_logs
  ADD CONSTRAINT food_logs_one_picture CHECK (photo_path IS NULL OR icon_set IS NULL);

-- `daily_nutrition` comes down first and goes back up at the bottom, unchanged.
--
-- It selects `from food_log_details`, so Postgres refuses to drop that view while
-- this one stands: "cannot drop view food_log_details because other objects depend
-- on it". Dependents first is the same order `20260729120000_simplify_scope.sql`
-- takes them down in, and for the same reason.
--
-- By hand rather than with CASCADE. A cascade would drop whatever happens to
-- depend on the view on the day it runs, which is a different set on a database
-- that has drifted — and it drops silently, so a view that went missing would not
-- be noticed until something asked for it.
DROP VIEW public.daily_nutrition;
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
    CASE WHEN e.photo_path IS NULL THEN COALESCE(e.icon_set, f.icon_set) END AS icon_set,
    CASE WHEN e.photo_path IS NULL THEN COALESCE(e.icon_name, f.icon_name) END AS icon_name,
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

-- And `daily_nutrition` back, selecting exactly what `schemas/90_views.sql`
-- declares. Nothing about a day's totals changes here — it only had to come down
-- to let the view underneath it be replaced. The wording differs from the schema
-- file (upper case, and the parentheses a generated diff adds) and that is fine:
-- `db diff` compares two live catalogues rather than two files, so what has to
-- match is the view Postgres stores, not the text that produced it.
--
-- Its grant goes back too: dropping a view takes its privileges with it, so
-- without this line `authenticated` loses a view it had before this migration and
-- every day-total request starts coming back empty.
CREATE VIEW public.daily_nutrition WITH (security_invoker=on) AS SELECT d.user_id,
    d.log_date,
    (sum(d.kcal))::integer AS kcal,
    (sum(d.carbs_g))::numeric AS carbs_g,
    (sum(d.protein_g))::numeric AS protein_g,
    (sum(d.fat_g))::numeric AS fat_g,
    (sum(d.fibre_g))::numeric AS fibre_g,
    (sum(d.sugar_g))::numeric AS sugar_g,
    (count(*))::integer AS entry_count
   FROM public.food_log_details d
  GROUP BY d.user_id, d.log_date;

GRANT SELECT ON TABLE public.daily_nutrition TO authenticated;
