-- What one of a scanned plate's parts weighs.
--
-- HAND-WRITTEN, which the declarative workflow in README.md otherwise
-- forbids. `supabase db diff` generates this change as DROP VIEW on both
-- `food_log_details` and `food_log_ingredient_details` — the first only because
-- it reads the second — followed by CREATE VIEW and a set of grants of the
-- tool's own devising. Those grants are not the ones `schemas/90_views.sql`
-- declares: they spell out the MAINTAIN/REFERENCES/TRIGGER/TRUNCATE defaults
-- that no other migration in this repo carries, they hand a slice of them to
-- `anon`, and they drop `service_role`'s SELECT on `food_log_ingredient_details`
-- — which the scan functions read. A migration that quietly rewrites who may
-- read a diary is not one to take on trust from a diff.
--
-- Replacing the view in place avoids all of it. Postgres allows
-- `create or replace view` when the change only APPENDS a column, which is why
-- `grams` is last in the select list rather than beside the other portion
-- fields; the dependent view is never dropped and no grant moves.
--
-- The view body below is copied verbatim out of `schemas/90_views.sql`, per the
-- rule in README.md about restating a block rather than retyping it.

alter table public.food_log_ingredients
  add column grams numeric(7, 1) check (grams > 0 and grams <= 20000);

create or replace view public.food_log_ingredient_details with (security_invoker = on) as
select
  i.id,
  i.food_log_id,
  i.food_id,
  i.position,
  coalesce(i.display_label, f.name) as name,
  i.quantity,
  s.label      as serving_label,
  round(f.kcal      * s.factor * i.quantity)::integer    as kcal,
  round(f.carbs_g   * s.factor * i.quantity, 1)::numeric as carbs_g,
  round(f.protein_g * s.factor * i.quantity, 1)::numeric as protein_g,
  round(f.fat_g     * s.factor * i.quantity, 1)::numeric as fat_g,
  -- What this much of the part weighs. Stored per unit and multiplied here, so
  -- it moves with the stepper the way the calories do. The serving factor is
  -- deliberately absent: the weight describes the ingredient row itself, and
  -- nothing in the app lets an ingredient change the serving it was written
  -- against.
  --
  -- LAST in the list, and that is load-bearing rather than tidy. Postgres only
  -- allows `create or replace view` to APPEND columns, so putting it here is
  -- what lets the migration replace this view in place — dropping it would take
  -- `food_log_details` with it (it reads this one), and both would come back
  -- with whatever grants the diff tool decided to write rather than the ones
  -- declared below.
  round(i.grams * i.quantity, 1)::numeric                as grams
from public.food_log_ingredients i
join public.foods f         on f.id = i.food_id
join public.food_servings s on s.id = i.serving_id;
