-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default
--
-- Rewrites compute_targets() against published guidance. The declarative source
-- is schemas/02_functions.sql; this is the same body, and the header comment
-- there carries the reasoning for each constant.
--
-- What changes for existing users: everyone on a lose or gain goal gets a new
-- budget, and everyone gets a new macro split. Nothing is recomputed by this
-- migration — `daily_goals` is effective-dated, so history stays measured
-- against the target that was in force at the time, and each user picks the new
-- numbers up the next time their profile or weigh-in fires the sync trigger.
-- That is the same behaviour as any other body change and needs no backfill.
--
-- Custom targets are untouched by definition: the sync trigger reads `is_custom`
-- and stops, so a user who typed their own numbers keeps them.

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.compute_targets(
  p_sex           public.sex,
  p_birth_date    date,
  p_height_cm     numeric,
  p_weight_kg     numeric,
  p_activity      public.activity_level,
  p_goal          public.weight_goal
)
RETURNS TABLE (kcal integer, carbs_g integer, protein_g integer, fat_g integer)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  with maintenance as (
    select (
      10 * p_weight_kg
      + 6.25 * p_height_cm
      - 5 * extract(year from age(current_date, p_birth_date))
      + case when p_sex = 'male' then 5 else -161 end
    ) * case p_activity
      when 'sedentary'   then 1.2
      when 'light'       then 1.375
      when 'on_feet'     then 1.55
      when 'very_active' then 1.725
    end as tdee
  ),
  delta as (
    select
      tdee,
      case p_goal
        -- 0.5 kg/week over 7700 kcal/kg, or a fifth of maintenance, whichever
        -- asks for less.
        when 'lose' then -least(0.5 * 7700 / 7, tdee * 0.2)
        when 'gain' then  least(0.25 * 7700 / 7, tdee * 0.15)
        else 0
      end as goal_delta
    from maintenance
  ),
  budget as (
    select greatest(
      round((tdee + goal_delta) / 10) * 10,
      case when p_sex = 'male' then 1500 else 1200 end
    ) as kcal
    from delta
  ),
  split as (
    select
      kcal,
      round(least(p_weight_kg * 1.6, kcal * 0.35 / 4)) as protein_g,
      round(kcal * 0.25 / 9) as fat_g
    from budget
  )
  select
    kcal::integer,
    -- Whatever energy the other two leave. Floored at zero: the caps above make
    -- that unreachable, but the floor says so rather than relying on it.
    greatest(round((kcal - protein_g * 4 - fat_g * 9) / 4), 0)::integer,
    protein_g::integer,
    fat_g::integer
  from split;
$function$;

COMMENT ON FUNCTION public.compute_targets IS
  'Daily calorie and macro budget from body stats. Loss targets 0.5 kg/week and '
  'gain 0.25 kg/week, each capped as a share of maintenance; protein is 1.6 g '
  'per kg of body weight rather than a share of energy; the budget is floored at '
  '1200 kcal for women and 1500 for men. Mirrors computeTargets() in '
  'apps/mobile/src/lib/nutrition.ts — change both together.';
