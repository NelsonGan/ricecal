-- "Days at 7 cups or more", counted per DAY.
--
-- The habit card asks how many days cleared a line below the goal, and the
-- client cannot answer it on the thirty-day range: its buckets are seven-day
-- blocks, so the best it could do was ask whether the whole week AVERAGED above
-- the line. That reported "0 of 30" for a month containing several nine-cup
-- days, which is not an approximation — it is the wrong number.
--
-- So the count moves to where the days still exist. The line is three quarters
-- of that day's own goal, rounded up: eight becomes six, twelve becomes nine.
-- Fixed in one place rather than passed in, because two callers picking their
-- own threshold is how the same card ends up saying two things.
--
-- DROP before CREATE, not `create or replace`: Postgres will not change the
-- return type of an existing function, and adding a column to RETURNS TABLE is
-- changing it.

drop function if exists public.trend_series(text, uuid);
drop function if exists public.trend_summary(text, uuid);

create function public.trend_series (
  p_range   text,
  p_user_id uuid default auth.uid()
)
  RETURNS TABLE (
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
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    d.bucket,
    max(d.at),
    count(*)::integer,
    -- Averaged over the days that HAVE food, not over the range. A week with two
    -- days logged averaged over seven reads as a starvation week.
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
$function$;

COMMENT ON FUNCTION public.trend_series(text, uuid) IS 'One row per column of a Trends chart — a day for 7d, a seven-day block for 30d, a calendar month for 1y — carrying the calorie, water and weight numbers for all three tabs so a tab switch needs no second request.';

create function public.trend_summary (
  p_range   text,
  p_user_id uuid default auth.uid()
)
  RETURNS TABLE (
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
    weight_first      numeric,
    weight_last       numeric,
    weight_avg        numeric,
    weight_peak       numeric,
    weight_peak_on    date,
    weigh_ins         integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
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
$function$;

COMMENT ON FUNCTION public.trend_summary(text, uuid) IS 'A named trend range as one row: the three metric-tab headline figures plus the per-chart footnotes. Separate from trend_series() because a range average has to weight each bucket by its logged days, and the 30d range''s oldest block is shorter than the rest.';

grant execute on function public.trend_series(text, uuid)  to authenticated;
grant execute on function public.trend_summary(text, uuid) to authenticated;
