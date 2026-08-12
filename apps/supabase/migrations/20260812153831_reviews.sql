-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.review_days (
  p_from    date,
  p_to      date,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    at               date,
    kcal             integer,
    carbs_g          numeric,
    protein_g        numeric,
    fat_g            numeric,
    entry_count      integer,
    water_glasses    integer,
    goal_kcal        integer,
    goal_water       integer,
    weight_kg        numeric,
    has_activity     boolean,
    active_kcal      integer,
    resting_kcal     integer,
    steps            integer,
    distance_m       integer,
    exercise_minutes integer,
    step_goal        integer,
    sessions         integer,
    session_kcal     integer,
    session_seconds  integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with calendar as (
    select series::date as at
    from generate_series(p_from, p_to, interval '1 day') as series
  ),
  -- One current preference rather than an effective-dated one, so it is read
  -- once and joined as a constant. Same treatment as `activity_days_range`.
  prefs as (
    select coalesce(
      (select s.step_goal from public.user_settings s where s.user_id = p_user_id),
      8000
    ) as step_goal
  )
  select
    c.at,
    n.kcal,
    n.carbs_g,
    n.protein_g,
    n.fat_g,
    coalesce(n.entry_count, 0),
    coalesce(l.water_glasses, 0)::integer,
    g.kcal,
    g.water_glasses::integer,
    w.weight_kg,
    (a.user_id is not null),
    coalesce(a.active_kcal, 0),
    a.resting_kcal,
    coalesce(a.steps, 0),
    a.distance_m,
    a.exercise_minutes,
    p.step_goal,
    coalesce(s.sessions, 0),
    coalesce(s.session_kcal, 0),
    coalesce(s.session_seconds, 0)
  from calendar c
  cross join prefs p
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date    = c.at
  left join public.daily_logs      l on l.user_id = p_user_id and l.log_date    = c.at
  left join public.weight_logs     w on w.user_id = p_user_id and w.measured_on = c.at
  left join public.activity_days   a on a.user_id = p_user_id and a.log_date    = c.at
  left join lateral (
    select
      count(*)::integer           as sessions,
      sum(v.active_kcal)::integer as session_kcal,
      sum(v.duration_s)::integer  as session_seconds
    from public.activity_sessions v
    where v.user_id = p_user_id and v.log_date = c.at
  ) s on true
  left join lateral (
    select gg.kcal, gg.water_glasses
    from public.daily_goals gg
    where gg.user_id = p_user_id and gg.effective_from <= c.at
    order by gg.effective_from desc
    limit 1
  ) g on true;
$function$;

COMMENT ON FUNCTION public.review_days(date,date,uuid) IS 'One row per calendar day between two dates, carrying that day''s food, water, weigh-in, budget and movement. The generator every review function folds; days with nothing logged are present and empty.';

GRANT ALL ON FUNCTION public.review_days(date, date, uuid) TO authenticated;

CREATE FUNCTION public.review_end (
  p_kind  text,
  p_start date
)
  RETURNS date
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case p_kind
    when 'week'  then p_start + 6
    when 'month' then (p_start + interval '1 month')::date - 1
  end;
$function$;

COMMENT ON FUNCTION public.review_end(text,date) IS 'The last day of a review period, given its kind and its first day. One place that knows a month is not thirty days.';

GRANT ALL ON FUNCTION public.review_end(text, date) TO authenticated;

CREATE FUNCTION public.review_meals (
  p_kind    text,
  p_start   date,
  p_limit   integer DEFAULT 5,
  p_user_id uuid    DEFAULT auth.uid()
)
  RETURNS TABLE (
    name          text,
    icon_set      public.icon_set,
    icon_name     text,
    times         integer,
    kcal_avg      integer,
    carbs_g_avg   numeric,
    protein_g_avg numeric,
    fat_g_avg     numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with span as (
    select p_start as from_date, public.review_end(p_kind, p_start) as to_date
  ),
  entries as (
    -- The view for the arithmetic, the table beside it for the DRAWING.
    -- `food_log_details` nulls both icon columns whenever an entry has a
    -- photograph, because in the diary the photograph is the better picture.
    -- This screen shows no photographs, so a camera user's five most-eaten
    -- dishes would every one of them be the blank plate.
    select
      e.*,
      coalesce(f.icon_set,  f.item_icon_set)  as own_icon_set,
      coalesce(f.icon_name, f.item_icon_name) as own_icon_name
    from public.food_log_details e
    join public.food_logs f on f.id = e.id
    cross join span s
    where e.user_id = p_user_id and e.log_date between s.from_date and s.to_date
  )
  select
    -- The most recent spelling wins. Two entries differing only in case are one
    -- dish, and the newer one is the one the user last saw on their diary.
    (array_agg(e.food_name order by e.logged_at desc))[1],
    (array_agg(e.own_icon_set  order by e.logged_at desc) filter (where e.own_icon_set  is not null))[1],
    (array_agg(e.own_icon_name order by e.logged_at desc) filter (where e.own_icon_name is not null))[1],
    count(*)::integer,
    round(avg(e.kcal))::integer,
    round(avg(e.carbs_g), 1),
    round(avg(e.protein_g), 1),
    round(avg(e.fat_g), 1)
  from entries e
  group by lower(e.food_name)
  -- Most often first, and the heavier dish breaks a tie: two things eaten twice
  -- each, the one worth mentioning is the one that cost something.
  order by count(*) desc, avg(e.kcal) desc
  limit greatest(p_limit, 0);
$function$;

COMMENT ON FUNCTION public.review_meals(text,date,integer,uuid) IS 'The dishes of one review period, folded by name and ordered by how often they were eaten. Grouped on the name rather than on food_id, because an estimate, an archetype and a recipe all log a null id and would otherwise vanish from the one screen that is about what somebody ate.';

GRANT ALL ON FUNCTION public.review_meals(text, date, integer, uuid) TO authenticated;

CREATE FUNCTION public.review_periods (
  p_kind    text,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    kind          text,
    starts_on     date,
    ends_on       date,
    days          integer,
    days_logged   integer,
    qualifies     boolean,
    kcal_avg      numeric,
    weight_change numeric,
    marks         numeric[]
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with bounds as (
    select
      case p_kind
        when 'week'  then date_trunc('week',  public.local_today(p_user_id) - interval '3 months')::date
        when 'month' then date_trunc('month', public.local_today(p_user_id) - interval '6 months')::date
      end as from_date,
      -- The day before the current period began: the newest period that is
      -- OVER. A review of a week still being lived would read as a light one
      -- until Sunday night.
      case p_kind
        when 'week'  then date_trunc('week',  public.local_today(p_user_id))::date - 1
        when 'month' then date_trunc('month', public.local_today(p_user_id))::date - 1
      end as to_date
  ),
  days as (
    select
      d.*,
      case p_kind
        when 'week'  then date_trunc('week',  d.at)::date
        when 'month' then date_trunc('month', d.at)::date
      end as period
    from bounds b
    cross join lateral public.review_days(b.from_date, b.to_date, p_user_id) d
  ),
  -- One value per sparkline tick: a day of a week, or a week of a month. The
  -- month case groups the ISO weeks that overlap it, so a month opens and
  -- closes with a short week and draws four or five ticks rather than thirty.
  ticks as (
    select
      d.period,
      case p_kind when 'week' then d.at else date_trunc('week', d.at)::date end as tick,
      round(avg(d.kcal) filter (where d.entry_count > 0), 0) as value
    from days d
    group by 1, 2
  ),
  sparkline as (
    select t.period, array_agg(t.value order by t.tick) as marks
    from ticks t
    group by t.period
  ),
  folded as (
    select
      d.period,
      count(*)::integer                                       as days,
      (count(*) filter (where d.entry_count > 0))::integer    as days_logged,
      round(avg(d.kcal) filter (where d.entry_count > 0), 0)  as kcal_avg,
      (array_agg(d.weight_kg order by d.at)      filter (where d.weight_kg is not null))[1] as weight_first,
      (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1] as weight_last
    from days d
    group by d.period
  )
  select
    p_kind,
    f.period,
    public.review_end(p_kind, f.period),
    f.days,
    f.days_logged,
    -- ENOUGH TO REVIEW. Four days of a week and twelve of a month, which is
    -- somewhat over half and somewhat under half on purpose: a week is short
    -- enough that three missing days make the average a different week's, while
    -- a month has room to skip a holiday and still describe itself.
    f.days_logged >= case p_kind when 'week' then 4 else 12 end,
    f.kcal_avg,
    -- Against the reading the period OPENED at, which is the last one before it
    -- began rather than the first one inside it. A user who weighs in on
    -- Wednesday and Sunday changed by the distance from the week before, not by
    -- the distance between those two days.
    case
      when f.weight_last is null then null
      else f.weight_last - coalesce(wb.weight_kg, f.weight_first)
    end,
    s.marks
  from folded f
  left join sparkline s on s.period = f.period
  left join lateral (
    select w.weight_kg
    from public.weight_logs w
    where w.user_id = p_user_id and w.measured_on < f.period
    order by w.measured_on desc
    limit 1
  ) wb on true
  order by f.period desc;
$function$;

COMMENT ON FUNCTION public.review_periods(text,uuid) IS 'Every finished week (three months back) or month (six months back), newest first, with the figures the list row prints and a sparkline of the days in it. `qualifies` says whether there is enough logged to be worth opening; thin periods come back anyway, because the comparison chart inside a story draws them.';

GRANT ALL ON FUNCTION public.review_periods(text, uuid) TO authenticated;

CREATE FUNCTION public.review_series (
  p_kind    text,
  p_start   date,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    bucket_start  date,
    days_logged   integer,
    kcal_avg      numeric,
    carbs_g_avg   numeric,
    protein_g_avg numeric,
    fat_g_avg     numeric,
    weight_last   numeric,
    steps_avg     numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with span as (
    select p_start as from_date, public.review_end(p_kind, p_start) as to_date
  ),
  days as (
    select
      d.*,
      case p_kind
        when 'week' then d.at
        -- Clipped at both ends: `greatest` holds the first partial week to the
        -- month's first day, and the range itself stops at its last.
        else greatest(date_trunc('week', d.at)::date, s.from_date)
      end as bucket
    from span s
    cross join lateral public.review_days(s.from_date, s.to_date, p_user_id) d
  )
  select
    d.bucket,
    (count(*) filter (where d.entry_count > 0))::integer,
    round(avg(d.kcal)      filter (where d.entry_count > 0), 0),
    round(avg(d.carbs_g)   filter (where d.entry_count > 0), 1),
    round(avg(d.protein_g) filter (where d.entry_count > 0), 1),
    round(avg(d.fat_g)     filter (where d.entry_count > 0), 1),
    -- The newest reading in the column, which is where the weight line lands.
    (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1],
    -- Averaged over the days the provider HAS, so a week with two days of watch
    -- data is not drawn as five sedentary ones. Null where it has none, which
    -- is what the bar reads as a day off rather than as a day of no steps.
    round(avg(d.steps) filter (where d.has_activity), 0)
  from days d
  group by d.bucket
  order by d.bucket;
$function$;

COMMENT ON FUNCTION public.review_series(text,date,uuid) IS 'One row per column of the charts inside a review: a day for a weekly review, a week for a monthly one, carrying the calories, the macro split, the weigh-in and the steps, so three of the story''s steps share one request.';

GRANT ALL ON FUNCTION public.review_series(text, date, uuid) TO authenticated;

CREATE FUNCTION public.review_summary (
  p_kind    text,
  p_start   date,
  p_user_id uuid DEFAULT auth.uid()
)
  RETURNS TABLE (
    kind               text,
    starts_on          date,
    ends_on            date,
    days               integer,
    days_logged        integer,
    days_under_goal    integer,
    streak_days        integer,
    kcal_avg           numeric,
    kcal_goal          integer,
    carbs_g_avg        numeric,
    protein_g_avg      numeric,
    fat_g_avg          numeric,
    lightest_on        date,
    lightest_kcal      integer,
    heaviest_on        date,
    heaviest_kcal      integer,
    entries            integer,
    home_cooked        integer,
    water_avg          numeric,
    water_goal_days    integer,
    weight_last        numeric,
    weight_change      numeric,
    weigh_ins          integer,
    active_days        integer,
    active_kcal_avg    numeric,
    steps_avg          numeric,
    step_goal_days     integer,
    step_goal          integer,
    distance_total_m   integer,
    exercise_min_total integer,
    sessions           integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with span as (
    select p_start as from_date, public.review_end(p_kind, p_start) as to_date
  ),
  days as (
    select d.* from span s cross join lateral public.review_days(s.from_date, s.to_date, p_user_id) d
  ),
  before as (
    select w.weight_kg
    from public.weight_logs w
    where w.user_id = p_user_id and w.measured_on < p_start
    order by w.measured_on desc
    limit 1
  ),
  -- What was eaten, counted over entries rather than over days: "64 meals, 41
  -- of them cooked at home" is a fact about rows, and `daily_nutrition` has
  -- already folded them away.
  meals as (
    select
      count(*)::integer                                        as entries,
      (count(*) filter (where e.recipe_id is not null))::integer as home_cooked
    from public.food_logs e, span s
    where e.user_id = p_user_id and e.log_date between s.from_date and s.to_date
  ),
  -- The run of consecutive logged days ending on the last day of the period,
  -- counted back past its start. Gaps and islands, as in `logging_streak()`,
  -- and deliberately AS THE PERIOD ENDED rather than as of today: a review of
  -- August should not quote a streak that only began in September.
  logged as (
    select distinct e.log_date
    from public.food_logs e, span s
    where e.user_id = p_user_id and e.log_date <= s.to_date
  ),
  islands as (
    select l.log_date, l.log_date - (row_number() over (order by l.log_date))::integer as island
    from logged l
  ),
  streak as (
    select coalesce(count(*), 0)::integer as days
    from islands i, span s
    where i.island = (select j.island from islands j, span s2 where j.log_date = s2.to_date)
      and i.log_date <= s.to_date
  )
  select
    p_kind,
    min(d.at),
    max(d.at),
    count(*)::integer,
    (count(*) filter (where d.entry_count > 0))::integer,
    (count(*) filter (
      where d.entry_count > 0 and d.goal_kcal is not null and d.kcal <= d.goal_kcal
    ))::integer,
    (select st.days from streak st),

    round(avg(d.kcal)      filter (where d.entry_count > 0), 0),
    (array_agg(d.goal_kcal order by d.at desc))[1],
    round(avg(d.carbs_g)   filter (where d.entry_count > 0), 1),
    round(avg(d.protein_g) filter (where d.entry_count > 0), 1),
    round(avg(d.fat_g)     filter (where d.entry_count > 0), 1),
    -- Ties go to the earlier day, on both. Two days at the same figure is one
    -- story about the day it first happened, not about the last time it did.
    (array_agg(d.at   order by d.kcal asc,  d.at) filter (where d.entry_count > 0))[1],
    (array_agg(d.kcal order by d.kcal asc,  d.at) filter (where d.entry_count > 0))[1],
    (array_agg(d.at   order by d.kcal desc, d.at) filter (where d.entry_count > 0))[1],
    (array_agg(d.kcal order by d.kcal desc, d.at) filter (where d.entry_count > 0))[1],

    (select m.entries     from meals m),
    (select m.home_cooked from meals m),

    -- Averaged over every day, unlike the calorie figures. A day nobody logged
    -- water on is a day they recorded none, and a hydration average that
    -- skipped it would only ever describe the days that went well.
    round(avg(d.water_glasses), 1),
    (count(*) filter (where d.water_glasses >= coalesce(d.goal_water, 8)))::integer,

    (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1],
    case
      when count(d.weight_kg) = 0 then null
      else (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1]
         - coalesce(
             (select b.weight_kg from before b),
             (array_agg(d.weight_kg order by d.at) filter (where d.weight_kg is not null))[1]
           )
    end,
    count(d.weight_kg)::integer,

    (count(*) filter (where d.has_activity))::integer,
    round(avg(d.active_kcal) filter (where d.has_activity), 0),
    round(avg(d.steps)       filter (where d.has_activity), 0),
    (count(*) filter (where d.steps >= d.step_goal))::integer,
    (array_agg(d.step_goal order by d.at desc))[1],
    sum(d.distance_m)::integer,
    sum(d.exercise_minutes)::integer,
    sum(d.sessions)::integer
  from days d;
$function$;

COMMENT ON FUNCTION public.review_summary(text,date,uuid) IS 'One review period folded to a single row: the calorie headline, the macro split, the lightest and heaviest day, what was cooked at home, the weigh-ins and the movement. The client decides which story steps to draw from which of these came back null.';

GRANT ALL ON FUNCTION public.review_summary(text, date, uuid) TO authenticated;
-- The revokes the diff does not emit.
--
-- Postgres grants EXECUTE to PUBLIC on a newly created function and `anon`
-- inherits from PUBLIC, so every function above is callable with the anon key
-- until this runs. `schemas/95_reviews.sql` says so declaratively and
-- `supabase db diff` does not look at grants — see the note in the root
-- CLAUDE.md, and the five functions that shipped executable by PUBLIC before
-- anybody checked.
REVOKE EXECUTE ON FUNCTION public.review_end(text, date) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.review_days(date, date, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.review_periods(text, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.review_summary(text, date, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.review_series(text, date, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.review_meals(text, date, integer, uuid) FROM public, anon;
