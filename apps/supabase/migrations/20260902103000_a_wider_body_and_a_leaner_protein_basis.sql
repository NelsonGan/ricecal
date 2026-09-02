-- The bounds the body questions answer within, and the two things the formula
-- had to learn to stay sensible inside them.
--
-- The weight field stopped at 200 kg and the age field at 100, and both turned
-- away real people. 500 and 150 are the new ceilings, which drags three column
-- checks with them: `weight_logs.weight_kg` and `profiles.target_weight_kg` both
-- stopped at 400, and `profiles.birth_date` had to be after 1900, which is an
-- age of 126 in 2026 and moves every year.
--
-- `compute_targets` follows for two reasons, both only reachable at the new
-- ceilings:
--
--   * Mifflin-St Jeor asks for 10,680 kcal for 500 kg on the very-active
--     multiplier, and `daily_goals.kcal` is checked at 10,000. The recompute
--     trigger's insert would have been rejected and the account left with no
--     budget at all.
--   * 1.6 g/kg of protein is prescribed against a body that is mostly lean, and
--     total body weight stops standing in for that above the healthy BMI band:
--     250 kg asked for 400 g a day. Adjusted body weight instead — the reference
--     weight for the height plus a quarter of the excess — which is unchanged for
--     anybody at a BMI of 25 or below.
--
-- Mifflin-St Jeor itself is untouched and still runs on ACTUAL body weight at
-- every size, which is the Academy of Nutrition and Dietetics' own recommendation
-- for obese adults as well as everyone else.

alter table public.weight_logs
  drop constraint weight_logs_weight_kg_check,
  add constraint weight_logs_weight_kg_check check (weight_kg between 20 and 500);

alter table public.profiles
  drop constraint profiles_target_weight_kg_check,
  add constraint profiles_target_weight_kg_check
    check (target_weight_kg between 20 and 500);

alter table public.profiles
  drop constraint profiles_birth_date_check,
  add constraint profiles_birth_date_check check (birth_date > date '1850-01-01');

create or replace function public.compute_targets(
  p_sex              public.sex,
  p_birth_date       date,
  p_height_cm        numeric,
  p_weight_kg        numeric,
  p_activity         public.activity_level,
  -- Null when the user has never said, which reads as maintenance. Only rows
  -- written before the target was collected are in that state.
  p_target_weight_kg numeric default null
)
returns table (kcal integer, carbs_g integer, protein_g integer, fat_g integer)
language sql
stable
set search_path = ''
as $$
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
    end as tdee,
    -- Signed the way the pace is: negative when there is weight to lose.
    p_target_weight_kg - p_weight_kg as remaining
  ),
  -- The most this direction ever asks for, before the distance is read. Loss at
  -- 0.5 kg/week and gain at 0.25; which one applies is the sign of the gap and
  -- nothing else.
  nominal as (
    select
      tdee,
      remaining,
      case when remaining < 0 then -0.5 else 0.25 end as pace
    from maintenance
  ),
  -- What the plan does, which is that pace read against the distance left.
  intent as (
    select
      tdee,
      case
        -- Nothing to work toward.
        when remaining is null    then 0
        -- Arrived — and also how a user says they have no goal at all, by
        -- putting the target where they already are.
        when abs(remaining) < 0.5 then 0
        -- The taper: never quicker than closing what is left over four weeks.
        else sign(pace) * least(abs(pace), abs(remaining) / 4)
      end as kg_per_week
    from nominal
  ),
  delta as (
    select
      tdee,
      case
        when kg_per_week = 0 then 0
        -- kg/week over 7700 kcal/kg, or a share of maintenance, whichever asks
        -- for less. The cut is allowed a fifth and the surplus 15%, because
        -- overshooting a lean gain just adds fat.
        when kg_per_week < 0 then -least(abs(kg_per_week) * 7700 / 7, tdee * 0.2)
        else                       least(kg_per_week * 7700 / 7, tdee * 0.15)
      end as goal_delta
    from intent
  ),
  budget as (
    -- Floored at the guidance, capped at what `daily_goals.kcal` will store. The
    -- ceiling is reachable: 500 kg on the very-active multiplier asks for 10,680,
    -- and the insert that followed would have been rejected by the check.
    select least(greatest(
      round((tdee + goal_delta) / 10) * 10,
      case when p_sex = 'male' then 1500 else 1200 end
    ), 10000) as kcal
    from delta
  ),
  -- The weight protein is prescribed against, which is not always the weight on
  -- the scale. Actual body weight inside the healthy BMI band, and adjusted body
  -- weight above it: the reference weight for the height plus a quarter of the
  -- excess. Fat mass carries almost no protein requirement, so 1.6 g/kg of a
  -- 250 kg body asked for 400 g a day.
  basis as (
    select
      kcal,
      greatest(25 * (p_height_cm / 100) ^ 2, 1) as reference_kg
    from budget
  ),
  split as (
    select
      kcal,
      round(least(
        (case
          when p_weight_kg <= reference_kg then p_weight_kg
          else reference_kg + (p_weight_kg - reference_kg) * 0.25
        end) * 1.6,
        kcal * 0.35 / 4
      )) as protein_g,
      round(kcal * 0.25 / 9) as fat_g
    from basis
  )
  select
    kcal::integer,
    -- Whatever energy the other two leave. Floored at zero: the caps above make
    -- that unreachable, but the floor says so rather than relying on it.
    greatest(round((kcal - protein_g * 4 - fat_g * 9) / 4), 0)::integer,
    protein_g::integer,
    fat_g::integer
  from split;
$$;
