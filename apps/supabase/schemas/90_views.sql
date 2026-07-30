-- ---------------------------------------------------------------------------
-- Read shapes.
--
-- The mock layer's rule was that screens never compute domain numbers — a
-- calorie total, a macro split and a day's budget all came from `derive.ts`.
-- These views are where those went. A screen selects a row that already has
-- `kcal` on it rather than joining three tables and multiplying.
--
-- EVERY VIEW IS security_invoker.
--
-- A Postgres view runs as its OWNER by default, and the owner here is
-- `postgres`, who bypasses RLS. A view defined the default way would hand
-- every row of `food_logs` to anyone who selected from it — no error, no
-- warning, just other people's meals. `security_invoker = on` makes the
-- caller's policies apply, so a view is a convenience and never a hole.
--
-- Views take no policies of their own; the policies on the tables underneath
-- are what filter them. They still need an explicit grant, because this
-- project does not auto-expose new entities to the Data API.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- A dish with its portions attached.
--
-- The portion list is aggregated into JSON rather than returned as extra rows
-- because the client wants one object per dish — the search screen renders a
-- row per food, and the food detail screen needs every serving at once. Two
-- round trips or a client-side group-by for something the database can shape
-- once is the kind of thing that ends up duplicated in four places.
-- ---------------------------------------------------------------------------
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

-- service_role too: the scan edge function resolves photos through
-- `search_foods`, which returns rows of this view — and service_role bypasses
-- RLS, not grants.
grant select on public.food_details to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- One logged item, with the numbers already worked out.
--
-- macros = the dish's per-base-serving values x the portion's factor x how
-- many. Rounded here, once, so that a total and the rows that make it up
-- cannot disagree by a calorie the way two independent roundings would.
-- ---------------------------------------------------------------------------
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
  e.scan_id,
  -- The model's specific name wins over a shared estimate row's generic one.
  -- A hand-logged entry has no display_label, so this is the food's name for
  -- every row that predates scanning.
  coalesce(e.display_label, f.name) as food_name,
  f.brand      as food_brand,
  -- What the UI badges an entry with: `verified = false` is "an estimate is
  -- on this row", and the two flags say which kind of guess it was.
  f.verified   as food_verified,
  f.is_estimate,
  f.is_archetype,
  -- One picture per row, resolved here so that no screen has to know the order.
  --
  -- A photo suppresses both icons outright. The check constraint stops an ENTRY
  -- holding a photo and an icon, but the food underneath can still carry a
  -- drawing, and returning it next to a photo would hand every consumer the same
  -- precedence rule to re-derive — and one of them would get it wrong. What the
  -- client reads is therefore a photo, or an icon, or neither.
  --
  -- Below that the entry's own choice wins over the food's, and a row with
  -- nothing comes back null rather than as a stand-in plate.
  case when e.photo_path is null then coalesce(e.icon_set,  f.icon_set)  end as icon_set,
  case when e.photo_path is null then coalesce(e.icon_name, f.icon_name) end as icon_name,
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


-- ---------------------------------------------------------------------------
-- A day's totals.
--
-- Only days with at least one entry appear. An empty day is the absence of a
-- row, not a row of zeros, so callers coalesce — which they have to do anyway
-- for dates before the account existed.
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
-- columns on the food itself — they were never facts about the dish, they were
-- facts about one person's habits, and on a shared catalogue that distinction
-- stops being cosmetic.
--
-- Derived rather than counted into a column: a counter needs incrementing on
-- insert, decrementing on delete, and repairing whenever one of those was
-- missed.
-- ---------------------------------------------------------------------------
create view public.user_food_stats with (security_invoker = on) as
select
  e.user_id,
  e.food_id,
  count(*)::integer        as times_logged,
  max(e.logged_at)         as last_logged_at,
  array_agg(distinct e.meal) as meals
from public.food_logs e
join public.foods f on f.id = e.food_id
-- Estimate and archetype rows are excluded for the same reason they are
-- excluded from search: "usual at this time" is a list to log from, and a
-- shared guess should not become a habit the app reinforces.
where not f.is_estimate and not f.is_archetype
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
  g.water_glasses,
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
-- The current streak accepts a run ending YESTERDAY as well as today.
-- Otherwise a 30-day streak reads as zero every morning until the user logs
-- breakfast, which is both wrong and discouraging at exactly the wrong moment.
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
