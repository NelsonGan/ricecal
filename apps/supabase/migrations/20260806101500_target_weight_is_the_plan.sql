-- The gap between the current and target weights becomes the whole calorie plan,
-- and `profiles.weight_goal` goes.
--
-- The budget used to come from the goal enum alone: `target_weight_kg` was
-- collected, stored, and read by nothing. So one deficit was handed to someone
-- 30 kg from their target and someone 1 kg from it alike; it carried on after
-- they arrived, because nothing in the arithmetic could tell that they had; and
-- a goal of `lose` with a target ABOVE the current weight prescribed a cut that
-- moved away from it.
--
-- Reading the plan off the two weights answers all three, and removes the second
-- source of the same fact that made the third possible at all.
--
-- ORDER MATTERS HERE. The new function and trigger have to exist before the
-- backfill runs, because it is the backfill's write that recomputes everyone's
-- budget; and `weight_goal` cannot be dropped until the backfill has read it.


-- 1. The formula, without the goal argument. -------------------------------
--
-- Dropped rather than replaced: the argument list is part of the identity, and
-- an overload left behind would make every existing call ambiguous.
drop function if exists public.compute_targets(
  public.sex, date, numeric, numeric, public.activity_level, public.weight_goal
);

create or replace function public.compute_targets(
  p_sex              public.sex,
  p_birth_date       date,
  p_height_cm        numeric,
  p_weight_kg        numeric,
  p_activity         public.activity_level,
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
$$;

comment on function public.compute_targets is
  'Daily calorie and macro budget from body stats. The gap between the current '
  'and target weights is the entire plan: losing targets 0.5 kg/week and gaining '
  '0.25, tapered so the last 2 kg are not chased at full pace, and a target '
  'within half a kilo of the current weight asks for nothing at all. That figure '
  'is then capped as a share of maintenance; protein is 1.6 g per kg of body '
  'weight rather than a share of energy; the budget is floored at 1200 kcal for '
  'women and 1500 for men. A null target weight means none was stated, and reads '
  'as maintenance. Mirrors computeTargets() in apps/mobile/src/lib/nutrition.ts '
  '— change both together.';


-- 2. The recompute trigger reads the new argument list. ---------------------
create or replace function public.sync_daily_goals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user_id  uuid;
  v_profile  public.profiles%rowtype;
  v_weight   numeric;
  v_today    date;
  v_current  public.daily_goals%rowtype;
  v_computed record;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  elsif tg_table_name = 'profiles' then
    v_user_id := new.id;
  else
    v_user_id := new.user_id;
  end if;

  select * into v_profile from public.profiles where id = v_user_id;

  if v_profile.id is null
     or v_profile.sex is null
     or v_profile.birth_date is null
     or v_profile.height_cm is null then
    return null;
  end if;

  v_weight := public.current_weight_kg(v_user_id);
  if v_weight is null then
    return null;
  end if;

  v_today := (now() at time zone coalesce(v_profile.timezone, 'Asia/Kuala_Lumpur'))::date;

  select * into v_current
  from public.daily_goals
  where user_id = v_user_id and effective_from <= v_today
  order by effective_from desc
  limit 1;

  if coalesce(v_current.is_custom, false) then
    return null;
  end if;

  -- Target weight is NOT in the guard above, and that is deliberate: it is
  -- nullable, a null means "never stated", and `compute_targets` reads that as
  -- maintenance. Requiring it here would leave every account that predates it
  -- with no budget at all rather than with a flat one.
  select * into v_computed
  from public.compute_targets(
    v_profile.sex,
    v_profile.birth_date,
    v_profile.height_cm,
    v_weight,
    v_profile.activity_level,
    v_profile.target_weight_kg
  );

  insert into public.daily_goals as g (
    user_id, effective_from, kcal, carbs_g, protein_g, fat_g,
    water_glasses, is_custom
  )
  values (
    v_user_id, v_today,
    v_computed.kcal, v_computed.carbs_g, v_computed.protein_g, v_computed.fat_g,
    coalesce(v_current.water_glasses, 8),
    false
  )
  on conflict (user_id, effective_from) do update
    set kcal      = excluded.kcal,
        carbs_g   = excluded.carbs_g,
        protein_g = excluded.protein_g,
        fat_g     = excluded.fat_g
    where not g.is_custom;

  return null;
end;
$$;


-- `target_weight_kg` joins the columns that rerun the budget, and `weight_goal`
-- leaves them. Without the first, dragging the target on the goals screen would
-- leave the budget describing the old plan until the next weigh-in.
drop trigger if exists profiles_sync_daily_goals on public.profiles;

create trigger profiles_sync_daily_goals
  after insert or update of
    sex, birth_date, height_cm, target_weight_kg, activity_level, timezone
  on public.profiles
  for each row execute function public.sync_daily_goals();


-- 3. Give everyone a target weight to be read. ------------------------------
--
-- A profile with a directional goal and no target would otherwise land on
-- maintenance, silently ending a deficit the user asked for and never said to
-- stop. So the goal they chose is converted into the target it implied, 5% from
-- their current weight — the first target both NICE and the CDC use, and the
-- same figure onboarding offers.
--
-- A maintain or track profile with no target gets its current weight, which is
-- the same plan said in the new vocabulary.
--
-- Only NULLs are filled. A target the user actually set is never overwritten,
-- which means one deliberate behaviour change survives this: someone who chose
-- "maintain" and ALSO dragged a target away from their weight starts losing or
-- gaining. Under the new model that is what their answers say, and honouring
-- them is the point of the change.
-- Clamped into the column's own check: `weight_logs` allows 20 kg, and 5% under
-- that is a value this column would reject.
with latest as (
  select distinct on (user_id) user_id, weight_kg
  from public.weight_logs
  order by user_id, measured_on desc
)
update public.profiles p
set target_weight_kg = least(400, greatest(20, round(
  latest.weight_kg * case p.weight_goal
    when 'lose' then 0.95
    when 'gain' then 1.05
    else 1
  end,
  1
)))
from latest
where latest.user_id = p.id
  and p.target_weight_kg is null;


-- Every budget was computed by the old formula, so every budget is stale — not
-- only the backfilled ones. Writing `target_weight_kg` back over itself is a
-- no-op that still fires `profiles_sync_daily_goals`, because `update of` reads
-- the SET clause rather than whether the value moved. Hand-set targets are
-- skipped by the trigger itself, as always.
update public.profiles set target_weight_kg = target_weight_kg;


-- 4. The goal enum goes. ----------------------------------------------------
alter table public.profiles drop column weight_goal;

drop type public.weight_goal;
