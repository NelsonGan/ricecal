-- ---------------------------------------------------------------------------
-- Cutting the app back to three things a user can do: photograph a meal, type
-- to search the catalogue, log what they ate.
--
-- WHAT GOES
--
--   * user-created foods       — `foods.owner_id`, `foods.image_path` and every
--                                write path into the catalogue. The catalogue is
--                                now read-only to clients and arrives from the
--                                import loader.
--   * barcode scanning         — the `barcode` value in `entry_source`.
--   * achievements             — `achievements`, `user_achievements`, `badge_tone`.
--   * device sync              — `workouts`, `daily_activity`, `session_kind`,
--                                `measurement_source`, `weight_logs.source` and
--                                the six integration columns on `user_settings`.
--   * the steps goal           — `daily_goals.steps`. `daily_activity` was the
--                                only thing that ever measured against it, so it
--                                goes with it rather than surviving as a number
--                                the user can set and never see.
--
-- WHAT DOES NOT GO
--
-- The 121 catalogue rows the old seed migration inserted. The generator and its
-- migration are deleted, so nothing re-seeds, but the rows already applied to a
-- deployed database stay: `food_logs.food_id` is `on delete restrict` and
-- deleting them would take real entries with it. Clearing them is a separate,
-- deliberate migration.
--
-- WHY EVERY VIEW IS DROPPED AND REBUILT
--
-- `food_log_details` reads `food_logs.source`, whose type is being swapped, and
-- `food_details` and `current_daily_goals` read columns being dropped. Postgres
-- refuses to alter a column a view depends on, so all five come down at the top
-- and go back up at the bottom exactly as `schemas/90_views.sql` declares them.
-- ---------------------------------------------------------------------------


-- 1. VIEWS DOWN ---------------------------------------------------------------

drop view if exists public.daily_nutrition;
drop view if exists public.food_log_details;
drop view if exists public.food_details;
drop view if exists public.user_food_stats;
drop view if exists public.current_daily_goals;


-- 2. ACHIEVEMENTS -------------------------------------------------------------

drop table if exists public.user_achievements;
drop table if exists public.achievements;


-- 3. DEVICE SYNC --------------------------------------------------------------

drop table if exists public.daily_activity;
drop table if exists public.workouts;

alter table public.weight_logs drop column if exists source;

alter table public.user_settings
  drop column if exists connect_watch,
  drop column if exists connect_phone_health,
  drop column if exists connect_running_app,
  drop column if exists connect_smart_scale,
  drop column if exists auto_sync,
  drop column if exists wifi_only;

-- After the columns that used them.
drop type if exists public.session_kind;
drop type if exists public.measurement_source;
drop type if exists public.badge_tone;


-- 4. THE STEPS GOAL -----------------------------------------------------------

alter table public.daily_goals drop column if exists steps;


-- 5. USER-CREATED FOODS -------------------------------------------------------
--
-- THIS DELETES USER DATA. `log/custom.tsx` was a working form, so any database
-- this runs against may hold dishes people typed in themselves — and the
-- entries logged against them go too, because `food_logs` carries a composite
-- foreign key that is `on delete restrict`. Entries first, then dishes, then
-- the column.
--
-- The alternative was to keep the rows and let dropping `owner_id` promote them
-- into the shared catalogue. That is worse: "Mum's rendang" and every other
-- private dish would become visible to every user of the app, which is a
-- disclosure, not a migration. Removing the feature means removing its rows.
--
-- Check what is there before running this against a database with real users:
--   select count(*) from public.foods where owner_id is not null;

delete from public.food_logs e
  using public.foods f
  where f.id = e.food_id and f.owner_id is not null;

delete from public.foods where owner_id is not null;

drop policy if exists "foods: read catalogue and own" on public.foods;
drop policy if exists "foods: insert own"             on public.foods;
drop policy if exists "foods: update own"             on public.foods;
drop policy if exists "foods: delete own"             on public.foods;

-- The grant is the outer gate, and removing it is the actual control: a policy
-- added later by mistake cannot become a write path if the privilege is gone.
revoke insert, update, delete on public.foods from authenticated;

create policy "foods: read catalogue"
  on public.foods for select
  to authenticated
  using (true);

alter table public.foods drop constraint if exists foods_owner_has_no_slug;
drop index if exists public.foods_slug_key;
drop index if exists public.foods_owner_idx;

alter table public.foods drop column if exists owner_id;

-- `image_path` was the photo a user attached to a dish they invented. Catalogue
-- rows are illustrated and were always null here, so it has no reader and no
-- writer left.
alter table public.foods drop column if exists image_path;

-- Every row is a catalogue row now, so the slug is real identity rather than a
-- handle that half the table lacked.
alter table public.foods alter column slug set not null;
alter table public.foods add constraint foods_slug_key unique (slug);


-- 6. FOOD SERVINGS ------------------------------------------------------------

drop policy if exists "food_servings: read with food"       on public.food_servings;
drop policy if exists "food_servings: write with own food"  on public.food_servings;
drop policy if exists "food_servings: update with own food" on public.food_servings;
drop policy if exists "food_servings: delete with own food" on public.food_servings;

revoke insert, update, delete on public.food_servings from authenticated;

create policy "food_servings: read with food"
  on public.food_servings for select
  to authenticated
  using (true);


-- 7. BARCODE OUT OF entry_source ----------------------------------------------
--
-- Postgres has no `alter type ... drop value`, so the type is rebuilt and the
-- column recast. The update runs first, while `barcode` is still a legal value:
-- after the swap the cast would fail on any row still holding it.

update public.food_logs set source = 'search' where source = 'barcode';

alter type public.entry_source rename to entry_source_old;

create type public.entry_source as enum (
  'search',
  'quick_add',
  'camera',
  'voice',
  'import'
);

alter table public.food_logs
  alter column source drop default,
  alter column source type public.entry_source
    using source::text::public.entry_source,
  alter column source set default 'search';

drop type public.entry_source_old;


-- 8. FUNCTIONS ----------------------------------------------------------------
--
-- `sync_daily_goals` wrote `steps` on every recompute. `goals_on` returns a
-- `daily_goals` row and is replaced so its declared shape matches the narrowed
-- table.

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

  select * into v_computed
  from public.compute_targets(
    v_profile.sex,
    v_profile.birth_date,
    v_profile.height_cm,
    v_weight,
    v_profile.activity_level,
    v_profile.weight_goal
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


-- 9. VIEWS BACK UP ------------------------------------------------------------

create view public.food_details with (security_invoker = on) as
select
  f.id,
  f.slug,
  f.name,
  f.brand,
  f.icon_set,
  f.icon_name,
  f.place,
  f.kcal,
  f.carbs_g,
  f.protein_g,
  f.fat_g,
  f.fibre_g,
  f.sugar_g,
  f.sodium_mg,
  f.verified,
  d.id     as default_serving_id,
  d.label  as serving_label,
  coalesce(sv.servings, '[]'::jsonb) as servings
from public.foods f
left join public.food_servings d
  on d.food_id = f.id and d.is_default
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id',      s.id,
      'slug',    s.slug,
      'label',   s.label,
      'factor',  s.factor,
      'default', s.is_default
    )
    order by s.position, s.label
  ) as servings
  from public.food_servings s
  where s.food_id = f.id
) sv on true;

grant select on public.food_details to authenticated;


create view public.food_log_details with (security_invoker = on) as
select
  e.id,
  e.user_id,
  e.log_date,
  e.meal,
  e.quantity,
  e.logged_at,
  e.note,
  e.source,
  e.photo_path,

  e.food_id,
  f.name       as food_name,
  f.brand      as food_brand,
  f.icon_set,
  f.icon_name,
  f.place,

  e.serving_id,
  s.label      as serving_label,
  s.factor     as serving_factor,

  round(f.kcal      * s.factor * e.quantity)::integer      as kcal,
  round(f.carbs_g   * s.factor * e.quantity, 1)::numeric   as carbs_g,
  round(f.protein_g * s.factor * e.quantity, 1)::numeric   as protein_g,
  round(f.fat_g     * s.factor * e.quantity, 1)::numeric   as fat_g,
  round(f.fibre_g   * s.factor * e.quantity, 1)::numeric   as fibre_g,
  round(f.sugar_g   * s.factor * e.quantity, 1)::numeric   as sugar_g
from public.food_logs e
join public.foods f         on f.id = e.food_id
join public.food_servings s on s.id = e.serving_id;

grant select on public.food_log_details to authenticated;


create view public.daily_nutrition with (security_invoker = on) as
select
  d.user_id,
  d.log_date,
  sum(d.kcal)::integer          as kcal,
  sum(d.carbs_g)::numeric       as carbs_g,
  sum(d.protein_g)::numeric     as protein_g,
  sum(d.fat_g)::numeric         as fat_g,
  sum(d.fibre_g)::numeric       as fibre_g,
  sum(d.sugar_g)::numeric       as sugar_g,
  count(*)::integer             as entry_count
from public.food_log_details d
group by d.user_id, d.log_date;

grant select on public.daily_nutrition to authenticated;


create view public.user_food_stats with (security_invoker = on) as
select
  e.user_id,
  e.food_id,
  count(*)::integer        as times_logged,
  max(e.logged_at)         as last_logged_at,
  array_agg(distinct e.meal) as meals
from public.food_logs e
group by e.user_id, e.food_id;

grant select on public.user_food_stats to authenticated;


create view public.current_daily_goals with (security_invoker = on) as
select distinct on (g.user_id)
  g.user_id,
  g.effective_from,
  g.kcal,
  g.carbs_g,
  g.protein_g,
  g.fat_g,
  g.water_glasses,
  g.is_custom
from public.daily_goals g
where g.effective_from <= public.local_today(g.user_id)
order by g.user_id, g.effective_from desc;

grant select on public.current_daily_goals to authenticated;


create or replace function public.goals_on(
  p_date    date,
  p_user_id uuid default auth.uid()
)
returns public.daily_goals
language sql
stable
set search_path = ''
as $$
  select g.*
  from public.daily_goals g
  where g.user_id = p_user_id and g.effective_from <= p_date
  order by g.effective_from desc
  limit 1;
$$;
