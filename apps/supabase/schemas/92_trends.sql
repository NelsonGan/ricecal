-- ---------------------------------------------------------------------------
-- Trends: the arithmetic behind three tabs and three ranges.
--
-- The Trends screen reads calories, water and weight over seven days, thirty
-- days or a year. No table here changed to support it — every figure it draws
-- was already stored. What was missing was a way to READ it: water lives in
-- `daily_logs` and food in `daily_nutrition`, so nothing could answer "how much
-- of each, per day, for the last thirty days" in one request, and there was no
-- range query over water at all.
--
-- The bucketing is here rather than in the client for the reason every other
-- total in this schema is a view: a weekly average computed in the app is one
-- the reminder and report jobs cannot reuse, and two of them will drift.
--
-- The ranges are NAMED rather than passed as a pair of dates. What "the last
-- thirty days" means depends on the user's timezone, and `local_today()` is the
-- only thing that knows it — a client computing `today - 29` in device time
-- gets the wrong window for anybody travelling.
--
-- These sort after 90_views.sql because `trend_days` reads `daily_nutrition`.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- One row per calendar day in the range, whether anything was logged or not.
--
-- The absent day is the point. `daily_nutrition` has no row for a day with no
-- food and `daily_logs` has none for a day with no water, but "5 of 7 days
-- under goal" and "2 of 7 days at goal" are both counts over SEVEN — so the
-- days have to be generated and the facts joined onto them, not the other way
-- round.
--
-- The goal is joined per day rather than taken once, because `daily_goals` is
-- effective-dated: a budget tightened on Thursday must not redraw Monday, which
-- is the same rule `goals_on()` exists for.
-- ---------------------------------------------------------------------------
create or replace function public.trend_days(
  p_range   text,
  p_user_id uuid default auth.uid()
)
returns table (
  at            date,
  bucket        date,
  kcal          integer,
  carbs_g       numeric,
  protein_g     numeric,
  fat_g         numeric,
  entry_count   integer,
  water_glasses integer,
  goal_kcal     integer,
  goal_water    integer,
  weight_kg     numeric
)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      case p_range
        -- Seven days including today, so the strip reads M..S and ends on now.
        when '7d'  then public.local_today(p_user_id) - 6
        when '30d' then public.local_today(p_user_id) - 29
        -- Twelve CALENDAR months, which is what "Last 12 months" means and what
        -- makes the axis read A S O N D J F M A M J J. `today - 364` would put
        -- two part-months at the ends and thirteen labels on the axis.
        when '1y'  then (date_trunc('month', public.local_today(p_user_id)) - interval '11 months')::date
      end as from_date,
      public.local_today(p_user_id) as to_date
  ),
  calendar as (
    select
      series::date as at,
      case p_range
        when '1y'  then date_trunc('month', series)::date
        -- Seven-day blocks counted BACK from today, not ISO weeks. Thirty days
        -- of ISO weeks is five or six groups depending on which weekday today
        -- is, and a chart whose column count moves with the day of the week is
        -- a chart nobody can label. This is always five, and the oldest one is
        -- short.
        when '30d' then greatest(b.from_date, b.to_date - ((b.to_date - series::date) / 7) * 7 - 6)
        else series::date
      end as in_bucket
    from bounds b
    cross join generate_series(b.from_date, b.to_date, interval '1 day') as series
  )
  select
    c.at,
    c.in_bucket,
    n.kcal,
    n.carbs_g,
    n.protein_g,
    n.fat_g,
    -- Zero, not null: "did this day have food logged" is asked by every count
    -- downstream, and one spelling of it beats each caller coalescing.
    coalesce(n.entry_count, 0),
    coalesce(l.water_glasses, 0)::integer,
    g.kcal,
    g.water_glasses::integer,
    w.weight_kg
  from calendar c
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date    = c.at
  left join public.daily_logs      l on l.user_id = p_user_id and l.log_date    = c.at
  left join public.weight_logs     w on w.user_id = p_user_id and w.measured_on = c.at
  left join lateral (
    select gg.kcal, gg.water_glasses
    from public.daily_goals gg
    where gg.user_id = p_user_id and gg.effective_from <= c.at
    order by gg.effective_from desc
    limit 1
  ) g on true;
$$;

comment on function public.trend_days is
  'One row per calendar day in a named trend range (7d, 30d, 1y), with that '
  'day''s food totals, water, effective goals and weigh-in. Days with nothing '
  'logged are present and empty, because every "N of 30" on the Trends screen '
  'counts over the range rather than over the rows.';


-- ---------------------------------------------------------------------------
-- The same days, folded into the buckets one chart draws: a day, a seven-day
-- block, or a month.
--
-- One row per column of the chart, carrying all three tabs' numbers. Three
-- separate readers would be three round trips for one screen, and the tab
-- switch is instant only if the data for all three is already in hand.
-- ---------------------------------------------------------------------------
create or replace function public.trend_series(
  p_range   text,
  p_user_id uuid default auth.uid()
)
returns table (
  bucket_start      date,
  bucket_end        date,
  days              integer,
  kcal_avg          numeric,
  carbs_g_avg       numeric,
  protein_g_avg     numeric,
  fat_g_avg         numeric,
  days_logged       integer,
  kcal_goal         integer,
  days_under_goal   integer,
  water_avg         numeric,
  water_total       integer,
  water_best        integer,
  water_goal_days   integer,
  water_habit_days  integer,
  water_logged_days integer,
  water_goal        integer,
  weight_avg        numeric,
  weight_last       numeric,
  weight_min        numeric,
  weigh_ins         integer
)
language sql
stable
set search_path = ''
as $$
  select
    d.bucket,
    max(d.at),
    count(*)::integer,
    -- Averaged over the days that HAVE food, not over the range. A week with
    -- two days logged averaged over seven reads as a starvation week.
    round(avg(d.kcal)      filter (where d.entry_count > 0), 0),
    round(avg(d.carbs_g)   filter (where d.entry_count > 0), 1),
    round(avg(d.protein_g) filter (where d.entry_count > 0), 1),
    round(avg(d.fat_g)     filter (where d.entry_count > 0), 1),
    (count(*) filter (where d.entry_count > 0))::integer,
    (array_agg(d.goal_kcal order by d.at desc))[1],
    (count(*) filter (
      where d.entry_count > 0 and d.goal_kcal is not null and d.kcal <= d.goal_kcal
    ))::integer,
    -- Water IS averaged over the whole bucket. An unlogged day is a day you
    -- drank nothing you recorded, and a hydration average that skipped it would
    -- only ever describe the days that went well.
    round(avg(d.water_glasses), 1),
    sum(d.water_glasses)::integer,
    max(d.water_glasses)::integer,
    (count(*) filter (where d.water_glasses >= coalesce(d.goal_water, 8)))::integer,
    -- Three quarters of that day's own goal, rounded up: eight becomes six,
    -- twelve becomes nine. Counted per DAY and therefore here rather than in
    -- the client, which on the thirty-day range only has weekly buckets and
    -- could ask no better question than "did the whole WEEK average above the
    -- line" — which answers 0 of 30 for a month containing several full days.
    (count(*) filter (
      where d.water_glasses >= ceil(coalesce(d.goal_water, 8) * 0.75)
    ))::integer,
    (count(*) filter (where d.water_glasses > 0))::integer,
    (array_agg(coalesce(d.goal_water, 8) order by d.at desc))[1],
    round(avg(d.weight_kg), 1),
    -- The newest reading in the bucket, which is the point the line joins. A
    -- month's average is the honest summary but the line has to end where the
    -- scale last did.
    (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1],
    min(d.weight_kg),
    count(d.weight_kg)::integer
  from public.trend_days(p_range, p_user_id) d
  group by d.bucket
  order by d.bucket;
$$;

comment on function public.trend_series is
  'One row per column of a Trends chart — a day for 7d, a seven-day block for '
  '30d, a calendar month for 1y — carrying the calorie, water and weight '
  'numbers for all three tabs so a tab switch needs no second request.';


-- ---------------------------------------------------------------------------
-- The whole range as one row: the three header cards, and the footnotes under
-- each chart.
--
-- Not derivable from `trend_series` without weighting every bucket by its
-- logged days, which is arithmetic the screens are not allowed to do — and
-- would get wrong on the 30d range, whose oldest block is two days rather than
-- seven.
-- ---------------------------------------------------------------------------
create or replace function public.trend_summary(
  p_range   text,
  p_user_id uuid default auth.uid()
)
returns table (
  from_date         date,
  to_date           date,
  days              integer,
  kcal_avg          numeric,
  carbs_g_avg       numeric,
  protein_g_avg     numeric,
  fat_g_avg         numeric,
  days_logged       integer,
  kcal_goal         integer,
  days_under_goal   integer,
  water_avg         numeric,
  water_total       integer,
  water_best        integer,
  water_goal_days   integer,
  water_habit_days  integer,
  water_logged_days integer,
  water_goal        integer,
  weight_before     numeric,
  weight_first      numeric,
  weight_last       numeric,
  weight_avg        numeric,
  weight_peak       numeric,
  weight_peak_on    date,
  weigh_ins         integer
)
language sql
stable
set search_path = ''
as $$
  select
    min(d.at),
    max(d.at),
    count(*)::integer,
    round(avg(d.kcal)      filter (where d.entry_count > 0), 0),
    round(avg(d.carbs_g)   filter (where d.entry_count > 0), 1),
    round(avg(d.protein_g) filter (where d.entry_count > 0), 1),
    round(avg(d.fat_g)     filter (where d.entry_count > 0), 1),
    (count(*) filter (where d.entry_count > 0))::integer,
    (array_agg(d.goal_kcal order by d.at desc))[1],
    (count(*) filter (
      where d.entry_count > 0 and d.goal_kcal is not null and d.kcal <= d.goal_kcal
    ))::integer,
    round(avg(d.water_glasses), 1),
    sum(d.water_glasses)::integer,
    max(d.water_glasses)::integer,
    (count(*) filter (where d.water_glasses >= coalesce(d.goal_water, 8)))::integer,
    (count(*) filter (
      where d.water_glasses >= ceil(coalesce(d.goal_water, 8) * 0.75)
    ))::integer,
    (count(*) filter (where d.water_glasses > 0))::integer,
    (array_agg(coalesce(d.goal_water, 8) order by d.at desc))[1],
    -- The newest reading from BEFORE the range, which is where the chart's line
    -- starts. Without it a range that opens on an unweighed day has nothing to
    -- carry forward and the line begins partway across, reading as missing data
    -- rather than as a week that started where the last one left off. Null only
    -- when there is genuinely no earlier weigh-in.
    (select w.weight_kg
       from public.weight_logs w
      where w.user_id = p_user_id and w.measured_on < min(d.at)
      order by w.measured_on desc
      limit 1),
    (array_agg(d.weight_kg order by d.at)      filter (where d.weight_kg is not null))[1],
    (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1],
    round(avg(d.weight_kg), 1),
    max(d.weight_kg),
    -- The heaviest reading and the day it was taken, which is what the line
    -- chart's subtitle names. Ties go to the earlier day: the sentence is about
    -- where the range started from, not where it last matched it.
    (array_agg(d.at order by d.weight_kg desc, d.at) filter (where d.weight_kg is not null))[1],
    count(d.weight_kg)::integer
  from public.trend_days(p_range, p_user_id) d;
$$;

comment on function public.trend_summary is
  'A named trend range as one row: the three metric-tab headline figures plus '
  'the per-chart footnotes. Separate from trend_series() because a range '
  'average has to weight each bucket by its logged days, and the 30d range''s '
  'oldest block is shorter than the rest.';


-- `security invoker` by default, which is load-bearing: every table these read
-- is under RLS, so passing somebody else's id returns nothing rather than their
-- year. The `p_user_id` parameter exists for a future server-side job with the
-- service role, not for the client.
grant execute on function public.trend_days    to authenticated;
grant execute on function public.trend_series  to authenticated;
grant execute on function public.trend_summary to authenticated;
