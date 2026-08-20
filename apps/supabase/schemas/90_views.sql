-- ---------------------------------------------------------------------------
-- Read shapes.
--
-- Screens never compute domain numbers: a calorie total, a macro split and a
-- day's budget all come from here. A screen selects a row that already has `kcal`
-- on it rather than joining three tables and multiplying.
--
-- Every view is `security_invoker`.
--
-- A Postgres view runs as its owner by default, and the owner here is `postgres`,
-- who bypasses RLS. A view defined the default way would hand every row of
-- `food_logs` to anyone who selected from it: no error, no warning, just other
-- people's meals. `security_invoker = on` makes the caller's policies apply.
--
-- Views take no policies of their own; the policies on the tables underneath
-- filter them. They still need an explicit grant, because this project does not
-- auto-expose new entities to the Data API.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Where `food_details` went.
--
-- There was a view here that joined a dish to its portions and shaped them into
-- JSON, and `search_foods` returned `setof food_details`. Both are in Cloudflare
-- D1 now, behind a Worker. The shape the Worker returns is deliberately the shape
-- this view returned: the callers were written against it, and a move of where
-- the data lives should not become a rewrite of what it looks like.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- A scanned plate's ingredients, with the numbers already worked out.
--
-- Same arithmetic as food_log_details (the part's own per-serving macros times
-- its portion factor times its quantity) so the breakdown a screen renders under
-- an entry uses the same rounding as everything else. The parent entry's own
-- macros stay authoritative; these rows explain them.
--
-- No joins left. The two this had, into `foods` for the name and macros and into
-- `food_servings` for the factor, are columns on the row now.
-- ---------------------------------------------------------------------------
create view public.food_log_ingredient_details with (security_invoker = on) as
select
  i.id,
  i.food_log_id,
  i.food_id,
  i.position,
  coalesce(i.display_label, i.item_name) as name,
  i.quantity,
  i.serving_label,
  round(i.base_kcal      * i.serving_factor * i.quantity)::integer    as kcal,
  round(i.base_carbs_g   * i.serving_factor * i.quantity, 1)::numeric as carbs_g,
  round(i.base_protein_g * i.serving_factor * i.quantity, 1)::numeric as protein_g,
  round(i.base_fat_g     * i.serving_factor * i.quantity, 1)::numeric as fat_g,
  -- What this much of the part weighs. Stored per unit and multiplied here, so
  -- it moves with the stepper the way the calories do. The serving factor is
  -- deliberately absent: the weight describes the ingredient row itself, and
  -- nothing in the app lets an ingredient change the serving it was written
  -- against.
  round(i.grams * i.quantity, 1)::numeric                             as grams
from public.food_log_ingredients i;

grant select on public.food_log_ingredient_details to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- One logged item, with the numbers already worked out.
--
-- macros = the entry's own per-base-serving values times the portion's factor
-- times how many. Rounded here, once, so that a total and the rows that make it
-- up cannot disagree by a calorie the way two independent roundings would.
--
-- Every column name here is the one it was. The screens, the mappers and four
-- views above this one were written against them, and moving the catalogue out of
-- this database must not become a rename.
-- ---------------------------------------------------------------------------
create view public.food_log_details with (security_invoker = on) as
select
  e.id,
  e.user_id,
  e.log_date,
  e.quantity,
  e.logged_at,
  e.note,
  e.source,
  e.photo_path,
  e.food_id,
  e.scan_id,
  e.suggested_edits,

  coalesce(e.display_label, e.item_name) as food_name,
  e.item_brand                           as food_brand,
  -- `food_verified`, `is_estimate` and `is_archetype` were here, three flags that
  -- were properties of the catalogue row. They survived the move to D1 as constant
  -- `false` so the mappers would not have to change shape, and a constant is the
  -- one kind of column that cannot come back to life: every reader downstream was
  -- reading a value the view had already decided. So the client mapped two of them
  -- into fields no screen ever branched on, and the third was read by nothing at
  -- all. Anything that needs to exclude a guess filters on `food_id is not null`,
  -- which is the real test.
  --
  -- A photo suppresses both icons outright: the entry's own icon wins over the
  -- food's, and a photograph wins over either.
  case when e.photo_path is null then coalesce(e.icon_set,  e.item_icon_set)  end as icon_set,
  case when e.photo_path is null then coalesce(e.icon_name, e.item_icon_name) end as icon_name,
  e.item_place                           as place,
  e.serving_id,
  e.serving_label,
  e.serving_factor,
  e.override_kcal,
  e.override_carbs_g,
  e.override_protein_g,
  e.override_fat_g,

  -- THREE SOURCES, IN ORDER, and this is the invariant the client's
  -- `entryTotals` is a copy of: what the user typed, what the parts add up to,
  -- what the dish costs at this portion. Only the last of the three changed —
  -- it reads the row itself now instead of a catalogue join.
  coalesce(
    e.override_kcal,
    (select round(sum(i.base_kcal * i.serving_factor * i.quantity))::integer
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_kcal * e.serving_factor * e.quantity)::integer
  )                                      as kcal,
  coalesce(
    e.override_carbs_g,
    (select round(sum(i.base_carbs_g * i.serving_factor * i.quantity), 1)
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_carbs_g * e.serving_factor * e.quantity, 1)
  )                                      as carbs_g,
  coalesce(
    e.override_protein_g,
    (select round(sum(i.base_protein_g * i.serving_factor * i.quantity), 1)
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_protein_g * e.serving_factor * e.quantity, 1)
  )                                      as protein_g,
  coalesce(
    e.override_fat_g,
    (select round(sum(i.base_fat_g * i.serving_factor * i.quantity), 1)
       from public.food_log_ingredients i where i.food_log_id = e.id),
    round(e.base_fat_g * e.serving_factor * e.quantity, 1)
  )                                      as fat_g,
  -- No override and no per-part figure for these three: nothing in the app
  -- lets a user type a fibre correction, and the breakdown does not carry them.
  round(e.base_fibre_g   * e.serving_factor * e.quantity, 1)       as fibre_g,
  round(e.base_sugar_g   * e.serving_factor * e.quantity, 1)       as sugar_g,
  round(e.base_sodium_mg * e.serving_factor * e.quantity)::integer as sodium_mg,
  round(e.serving_grams  * e.quantity, 1)                          as grams,
  e.recipe_id,

  -- The snapshot itself, unmultiplied, because one caller wants to copy an entry
  -- rather than read it. "Repeat yesterday" writes today's row from yesterday's,
  -- and every figure above has already been through the portion and the quantity.
  -- Dividing them back out is lossy, since they are rounded, and a repeat that
  -- lands a calorie off the row it copied is a bug nobody can explain.
  e.item_name,
  e.item_brand,
  e.base_kcal,
  e.base_carbs_g,
  e.base_protein_g,
  e.base_fat_g,
  e.base_fibre_g,
  e.base_sugar_g,
  e.base_sodium_mg,
  e.serving_grams as base_serving_grams
from public.food_logs e;

grant select on public.food_log_details to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- A day's totals.
--
-- Only days with at least one entry appear. An empty day is the absence of a row,
-- not a row of zeros, so callers coalesce, which they have to do anyway for dates
-- before the account existed.
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- How often this user logs each dish.
--
-- Replaces `timesLogged` and `usualMeals`, which the mock catalogue carried as
-- columns on the food itself. They were never facts about the dish, they were
-- facts about one person's habits, and on a shared catalogue that distinction
-- stops being cosmetic.
--
-- Derived rather than counted into a column: a counter needs incrementing on
-- insert, decrementing on delete, and repairing whenever one of those was missed.
--
-- The exclusions moved. This used to join `foods` and filter out estimate,
-- archetype and recipe rows, because "usual at this time" is a list to log from
-- and a shared guess should not become a habit the app reinforces. There is no
-- join to filter through now, and `food_id is not null` does the same work by a
-- different route: every one of those three cases writes a null `food_id`.
-- ---------------------------------------------------------------------------
create view public.user_food_stats with (security_invoker = on) as
select
  e.user_id,
  e.food_id,
  max(e.item_name)         as name,
  count(*)::integer        as times_logged,
  max(e.logged_at)         as last_logged_at
from public.food_logs e
where e.food_id is not null
group by e.user_id, e.food_id;

grant select on public.user_food_stats to authenticated;

-- ---------------------------------------------------------------------------
-- The budget in force right now, one row per user.
-- ---------------------------------------------------------------------------
create view public.current_daily_goals with (security_invoker = on) as
select distinct on (g.user_id)
  g.user_id,
  g.effective_from,
  g.kcal,
  g.carbs_g,
  g.protein_g,
  g.fat_g,
  g.water_ml,
  g.is_custom
from public.daily_goals g
where g.effective_from <= public.local_today(g.user_id)
order by g.user_id, g.effective_from desc;

grant select on public.current_daily_goals to authenticated;


-- ---------------------------------------------------------------------------
-- The budget that applied on a given past day, for the weekly report.
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- Consecutive days with at least one entry.
--
-- Gaps and islands: subtracting a row number from a date gives every run of
-- consecutive days the same constant, so grouping on it counts the runs.
--
-- The current streak accepts a run ending yesterday as well as today. Otherwise a
-- 30-day streak reads as zero every morning until the user logs breakfast, which
-- is both wrong and discouraging at exactly the wrong moment.
-- ---------------------------------------------------------------------------
create or replace function public.logging_streak(p_user_id uuid default auth.uid())
returns table (current_days integer, best_days integer)
language sql
stable
set search_path = ''
as $$
  with logged as (
    select distinct e.log_date
    from public.food_logs e
    where e.user_id = p_user_id
  ),
  islands as (
    select
      l.log_date,
      l.log_date - (row_number() over (order by l.log_date))::integer as island
    from logged l
  ),
  runs as (
    select count(*)::integer as length, max(i.log_date) as ended_on
    from islands i
    group by i.island
  )
  select
    coalesce(
      max(r.length) filter (
        where r.ended_on >= public.local_today(p_user_id) - 1
      ),
      0
    )::integer,
    coalesce(max(r.length), 0)::integer
  from runs r;
$$;
