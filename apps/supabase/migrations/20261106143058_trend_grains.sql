-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.trend_days(IN p_range text, IN p_user_id uuid);

DROP FUNCTION public.trend_series(IN p_range text, IN p_user_id uuid);

DROP FUNCTION public.trend_workouts(IN p_range text);

CREATE FUNCTION public.trend_days (
  p_range   text,
  p_user_id uuid DEFAULT auth.uid(),
  p_grain   text DEFAULT NULL::text
)
  RETURNS TABLE (
    at          date,
    bucket      date,
    kcal        integer,
    carbs_g     numeric,
    protein_g   numeric,
    fat_g       numeric,
    entry_count integer,
    water_ml    integer,
    goal_kcal   integer,
    goal_water  integer,
    weight_kg   numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with bounds as (
    select
      private.range_start(p_range, public.local_today(p_user_id)) as from_date,
      public.local_today(p_user_id) as to_date
  ),
  calendar as (
    select
      series::date as at,
      case coalesce(p_grain, case p_range when '1y' then 'month' when '30d' then 'week' end)
        when 'month' then date_trunc('month', series)::date
        -- Seven-day blocks counted BACK from today, not ISO weeks. Thirty days
        -- of ISO weeks is five or six groups depending on which weekday today
        -- is, and a chart whose column count moves with the day of the week is
        -- a chart nobody can label. The newest is always a whole week, and the
        -- oldest one is short.
        when 'week'  then greatest(b.from_date, b.to_date - ((b.to_date - series::date) / 7) * 7 - 6)
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
    coalesce(l.water_ml, 0)::integer,
    g.kcal,
    g.water_ml::integer,
    w.weight_kg
  from calendar c
  -- A bound the planner can push into the view, so it sums the range and not
  -- the whole diary (see `day_marks`). It has to be written from the arguments:
  -- a bound read from `bounds` is a join condition and is not pushed down.
  -- `range_start` is the same call `bounds` makes, so the two cannot disagree.
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date    = c.at
    and n.log_date between private.range_start(p_range, public.local_today(p_user_id))
                       and public.local_today(p_user_id)
  left join public.daily_logs      l on l.user_id = p_user_id and l.log_date    = c.at
  left join public.weight_logs     w on w.user_id = p_user_id and w.measured_on = c.at
  left join lateral (
    select gg.kcal, gg.water_ml
    from public.daily_goals gg
    where gg.user_id = p_user_id and gg.effective_from <= c.at
    order by gg.effective_from desc
    limit 1
  ) g on true;
$function$;

COMMENT ON FUNCTION public.trend_days(text,uuid,text) IS 'One row per calendar day in a named trend range (7d, 30d, 1y), with that day''s food totals, water, effective goals and weigh-in. Days with nothing logged are present and empty, because every "N of 30" on the Trends screen counts over the range rather than over the rows.';

GRANT ALL ON FUNCTION public.trend_days(text, uuid, text) TO authenticated;

CREATE FUNCTION public.trend_series (
  p_range   text,
  p_user_id uuid DEFAULT auth.uid(),
  p_grain   text DEFAULT NULL::text
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
    -- only ever describe the days that went well. Whole millilitres: a tenth of
    -- one is not a fact about anybody's day.
    round(avg(d.water_ml), 0),
    sum(d.water_ml)::integer,
    max(d.water_ml)::integer,
    (count(*) filter (where d.water_ml >= coalesce(d.goal_water, 2000)))::integer,
    -- Three quarters of that day's own goal, rounded up: 2,000 ml becomes
    -- 1,500. Counted per DAY and therefore here rather than in
    -- the client, which on the thirty-day range only has weekly buckets and
    -- could ask no better question than "did the whole WEEK average above the
    -- line" — which answers 0 of 30 for a month containing several full days.
    (count(*) filter (
      where d.water_ml >= ceil(coalesce(d.goal_water, 2000) * 0.75)
    ))::integer,
    (count(*) filter (where d.water_ml > 0))::integer,
    (array_agg(coalesce(d.goal_water, 2000) order by d.at desc))[1],
    round(avg(d.weight_kg), 1),
    -- The newest reading in the bucket, which is the point the line joins. A
    -- month's average is the honest summary but the line has to end where the
    -- scale last did.
    (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1],
    min(d.weight_kg),
    count(d.weight_kg)::integer
  from public.trend_days(p_range, p_user_id, p_grain) d
  group by d.bucket
  order by d.bucket;
$function$;

COMMENT ON FUNCTION public.trend_series(text,uuid,text) IS 'One row per column of a Trends chart: a day, a seven-day block counted back from today, or a calendar month (p_grain; null is the range''s own, a day for 7d, a block for 30d, a month for 1y), carrying the calorie, water and weight numbers so the cards need no second request.';

GRANT ALL ON FUNCTION public.trend_series(text, uuid, text) TO authenticated;

CREATE FUNCTION public.trend_workouts (
  p_range text,
  p_grain text DEFAULT NULL::text
)
  RETURNS TABLE (
    bucket_start date,
    bucket_end   date,
    days         integer,
    duration_s   integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with bounds as (
    select
      private.range_start(p_range, public.local_today((select auth.uid()))) as from_date,
      public.local_today((select auth.uid())) as to_date
  ),
  calendar as (
    select
      series::date as at,
      case coalesce(p_grain, case p_range when '1y' then 'month' when '30d' then 'week' end)
        when 'month' then date_trunc('month', series)::date
        when 'week'  then greatest(b.from_date, b.to_date - ((b.to_date - series::date) / 7) * 7 - 6)
        else series::date
      end as in_bucket
    from bounds b
    cross join generate_series(b.from_date, b.to_date, interval '1 day') as series
  ),
  per_day as (
    select w.log_date, sum(w.duration_s)::integer as duration_s
    from public.workouts w
    where w.user_id = (select auth.uid())
      and w.log_date between (select b.from_date from bounds b) and (select b.to_date from bounds b)
    group by w.log_date
  )
  select
    c.in_bucket,
    max(c.at),
    count(*)::integer,
    coalesce(sum(d.duration_s), 0)::integer
  from calendar c
  left join per_day d on d.log_date = c.at
  group by c.in_bucket
  order by c.in_bucket;
$function$;

COMMENT ON FUNCTION public.trend_workouts(text,text) IS 'Seconds trained per column of a Trends chart (p_grain day, week or month; null is the range''s own, a day for 7d, a seven-day block for 30d, a calendar month for 1y) with the column''s length in days, oldest first, empty columns included.';

GRANT ALL ON FUNCTION public.trend_workouts(text, text) TO authenticated;
-- `db diff` does not carry these: a new function is executable by PUBLIC
-- until it is taken away.
revoke all on function public.trend_days(text, uuid, text) from public, anon;
revoke all on function public.trend_series(text, uuid, text) from public, anon;
revoke all on function public.trend_workouts(text, text) from public, anon;
