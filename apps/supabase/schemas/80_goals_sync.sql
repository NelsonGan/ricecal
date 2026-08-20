-- ---------------------------------------------------------------------------
-- Keeping the calorie budget in step with the body it was computed from.
--
-- Without this, `daily_goals` is a table somebody has to remember to write. The
-- client would compute the budget on the profile screen, and any other write path
-- (a scale sync, an admin correction, a future web app) would leave a user's
-- target describing a body they no longer have.
--
-- The one rule: a hand-set target is never overwritten. `is_custom` is set by the
-- Goals screen when the user types a number, and from that point this trigger
-- reads the flag and returns without touching anything. Recomputing over a
-- deliberate choice is the single worst thing this could do: the user sets 1,800,
-- changes their activity level, and the app silently moves them back to 2,140.
-- ---------------------------------------------------------------------------


-- The newest recorded weight, or null before the first weigh-in.
create or replace function public.current_weight_kg(p_user_id uuid default auth.uid())
returns numeric
language sql
stable
set search_path = ''
as $$
  select w.weight_kg
  from public.weight_logs w
  where w.user_id = p_user_id
  order by w.measured_on desc
  limit 1;
$$;


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
  -- Attached to two tables whose owner columns are named differently, and to
  -- DELETE where there is no NEW row.
  --
  -- This is an IF and not a CASE expression on purpose. PL/pgSQL resolves the
  -- field references in EVERY branch of a CASE, so `case … then new.id else
  -- new.user_id end` fails with `record "new" has no field "user_id"` while
  -- firing on `profiles` — the branch it never takes is what breaks it. The
  -- branches of an IF are separate statements and only the taken one is
  -- evaluated.
  --
  -- Likewise `coalesce(new, old)`: OLD is unassigned during INSERT, and
  -- touching it raises rather than returning null.
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  elsif tg_table_name = 'profiles' then
    v_user_id := new.id;
  else
    v_user_id := new.user_id;
  end if;

  select * into v_profile from public.profiles where id = v_user_id;

  -- Onboarding fills the profile one screen at a time, so most of these calls
  -- happen before there is enough to compute anything. Returning quietly is
  -- correct: the write that completes the set will fire this again.
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

  -- Written against today, not against the row that is currently in force.
  -- A new budget applies from now on; yesterday was still measured against
  -- yesterday's target, which is the entire point of the effective_from key.
  --
  -- Water is carried forward rather than recomputed: it is not derived from
  -- body stats, and resetting it to the default on every profile edit would
  -- quietly undo a user's own choice.
  insert into public.daily_goals as g (
    user_id, effective_from, kcal, carbs_g, protein_g, fat_g,
    water_ml, is_custom
  )
  values (
    v_user_id, v_today,
    v_computed.kcal, v_computed.carbs_g, v_computed.protein_g, v_computed.fat_g,
    coalesce(v_current.water_ml, 2000),
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

-- `update of <columns>` so that renaming yourself, changing your avatar or
-- finishing onboarding does not rerun the budget.
--
-- Every input to `compute_targets` has to be in this list. `target_weight_kg`
-- was not, back when it was a number the app stored and nothing read; now that it
-- is the plan, a user dragging their target on the goals screen has to move the
-- budget, and the column list is the only thing that decides whether the write is
-- even noticed.
create trigger profiles_sync_daily_goals
  after insert or update of
    sex, birth_date, height_cm, target_weight_kg, activity_level, timezone
  on public.profiles
  for each row execute function public.sync_daily_goals();

-- A new weigh-in moves the budget, which is most of the reason the budget is
-- recomputed at all. DELETE is included so that removing a mistaken reading
-- puts the target back where the remaining history says it should be.
create trigger weight_logs_sync_daily_goals
  after insert or update of weight_kg or delete
  on public.weight_logs
  for each row execute function public.sync_daily_goals();
