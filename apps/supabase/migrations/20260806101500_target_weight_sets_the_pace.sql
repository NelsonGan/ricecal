-- Target weight becomes an input to the calorie budget.
--
-- `compute_targets` gains a seventh argument, so the six-argument version has to
-- go rather than be replaced: leaving it behind would make every existing call
-- ambiguous against the new one's default, and `sync_daily_goals` is written
-- against the new shape.
drop function if exists public.compute_targets(
  public.sex, date, numeric, numeric, public.activity_level, public.weight_goal
);

create or replace function public.compute_targets(
  p_sex              public.sex,
  p_birth_date       date,
  p_height_cm        numeric,
  p_weight_kg        numeric,
  p_activity         public.activity_level,
  p_goal             public.weight_goal,
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
    -- Signed the same way the pace is: negative when there is weight to lose.
    p_target_weight_kg - p_weight_kg as remaining
  ),
  -- What the goal asks for, before the target is consulted.
  nominal as (
    select
      tdee,
      remaining,
      case p_goal when 'lose' then -0.5 when 'gain' then 0.25 else 0 end as pace
    from maintenance
  ),
  -- What the plan does, which is the goal read against the distance left.
  intent as (
    select
      tdee,
      case
        when pace = 0                          then 0
        -- No target stated: the goal's own pace, unchanged.
        when remaining is null                 then pace
        -- Arrived. The goal enum still says `lose`, and it is wrong.
        when abs(remaining) < 0.5              then 0
        -- The goal and the target point opposite ways. Hold rather than guess.
        when sign(remaining) <> sign(pace)     then 0
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
  'Daily calorie and macro budget from body stats. Loss targets 0.5 kg/week and '
  'gain 0.25 kg/week, tapered so the last 2 kg to the target weight are not '
  'chased at full pace and a target already reached asks for nothing, then '
  'capped as a share of maintenance; protein is 1.6 g per kg of body weight '
  'rather than a share of energy; the budget is floored at 1200 kcal for women '
  'and 1500 for men. A null target weight means none was stated and the goal''s '
  'nominal pace stands. Mirrors computeTargets() in '
  'apps/mobile/src/lib/nutrition.ts — change both together.';


-- The recompute trigger passes the new argument along.
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
  -- the goal's nominal pace. Requiring it here would leave every account that
  -- predates it with no budget at all.
  select * into v_computed
  from public.compute_targets(
    v_profile.sex,
    v_profile.birth_date,
    v_profile.height_cm,
    v_weight,
    v_profile.activity_level,
    v_profile.weight_goal,
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


-- `target_weight_kg` joins the columns that rerun the budget. Without this the
-- new argument would only ever be read when something ELSE about the profile
-- changed, so dragging the target on the goals screen would leave the budget
-- describing the old plan until the next weigh-in.
drop trigger if exists profiles_sync_daily_goals on public.profiles;

create trigger profiles_sync_daily_goals
  after insert or update of
    sex, birth_date, height_cm, target_weight_kg, activity_level, weight_goal, timezone
  on public.profiles
  for each row execute function public.sync_daily_goals();
