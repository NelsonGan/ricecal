-- ---------------------------------------------------------------------------
-- Functions with no table dependencies.
--
-- Anything that reads a table lives in a file numbered after that table:
-- `language sql` bodies are parsed and validated at CREATE time, so a function
-- here that referenced `public.profiles` would fail when the shadow database
-- builds the schema files in order. (`language plpgsql` bodies are not
-- validated, which is a trap rather than a workaround — the failure just moves
-- to the first call at runtime.)
--
-- Every function sets `search_path = ''` and schema-qualifies every name.
-- Without it a caller can prepend a schema of their own and have a function
-- resolve to their table instead of ours; Supabase's security advisor flags
-- the omission as "Function Search Path Mutable".
-- ---------------------------------------------------------------------------


-- Keeps `updated_at` honest. Attached to every table that has the column, so
-- no write path has to remember to set it, including writes from the SQL
-- editor and from service_role jobs.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- The calorie budget.
--
-- Mifflin-St Jeor, then an activity multiplier, then a goal delta — the same
-- arithmetic as `computeTargets` in src/mock/derive.ts, moved here so there is
-- one implementation rather than two that drift. The client stops computing it
-- and reads `daily_goals` instead.
--
-- `stable`, not `immutable`: age depends on `current_date`.
--
-- The macro split is 47/22/31 by energy — carbohydrate high enough for a rice
-- based diet, protein landing near 1.7 g per kg. kcal is rounded to the
-- nearest 10 so the number on screen reads as a target and not as the output
-- of a formula.
-- ---------------------------------------------------------------------------
create or replace function public.compute_targets(
  p_sex           public.sex,
  p_birth_date    date,
  p_height_cm     numeric,
  p_weight_kg     numeric,
  p_activity      public.activity_level,
  p_goal          public.weight_goal
)
returns table (kcal integer, carbs_g integer, protein_g integer, fat_g integer)
language sql
stable
set search_path = ''
as $$
  with basal as (
    select
      10 * p_weight_kg
      + 6.25 * p_height_cm
      - 5 * extract(year from age(current_date, p_birth_date))
      + case when p_sex = 'male' then 5 else -161 end as bmr
  ),
  budget as (
    select round(
      (
        bmr * case p_activity
          when 'sedentary'   then 1.2
          when 'light'       then 1.375
          when 'on_feet'     then 1.55
          when 'very_active' then 1.725
        end
        + case p_goal
          when 'lose'     then -400
          when 'gain'     then  300
          else 0
        end
      ) / 10
    ) * 10 as kcal
    from basal
  )
  select
    greatest(kcal, 1000)::integer,
    round(greatest(kcal, 1000) * 0.47 / 4)::integer,
    round(greatest(kcal, 1000) * 0.22 / 4)::integer,
    round(greatest(kcal, 1000) * 0.31 / 9)::integer
  from budget;
$$;

comment on function public.compute_targets is
  'Daily calorie and macro budget from body stats. Floored at 1000 kcal: the '
  'inputs are user-entered and an implausible combination should produce a '
  'conservative target, not one that is unsafe to eat to.';
