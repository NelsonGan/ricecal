-- Weight change: one reading and nothing before it is not a change of zero.
--
-- `review_periods` and `review_summary` both fell back to the period's own
-- first weigh-in when there was none before it. With a single reading inside
-- the period that names the same row twice and subtracts it from itself, so a
-- first ever weigh-in came back to the review card as "0.0 kg" -- a claim the
-- data cannot support, on the one tile whose job is to say which way the
-- weight went. Both now answer null, which the card already draws as a dash.
--
-- Both bodies are copied out of schemas/95_reviews.sql verbatim, comments
-- included: `db diff` compares prosrc as written, so a retyped comment reads
-- as a function no migration produces.

create or replace function public.review_periods(
  p_kind    text,
  p_user_id uuid default auth.uid()
)
returns table (
  kind            text,
  starts_on       date,
  ends_on         date,
  days            integer,
  days_logged     integer,
  kcal_avg        numeric,
  weight_change   numeric,
  marks           numeric[]
)
language sql
stable
set search_path = ''
as $$
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
      count(d.weight_kg)::integer                             as weigh_ins,
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
    f.kcal_avg,
    -- Against the reading the period OPENED at, which is the last one before it
    -- began rather than the first one inside it. A user who weighs in on
    -- Wednesday and Sunday changed by the distance from the week before, not by
    -- the distance between those two days.
    --
    -- ONE READING AND NOTHING BEFORE IT IS NOT A CHANGE OF ZERO. The fallback
    -- to the period's own first reading is right whenever there are two of
    -- them; with a single weigh-in it names the same row twice and subtracts it
    -- from itself, so somebody's first ever time on the scale was reported back
    -- as "0.0 kg" -- a claim the data cannot support, in a tile whose whole job
    -- is to say which way the weight went. Null is what the reader is owed, and
    -- the card already draws a dash for it.
    case
      when f.weight_last is null then null
      when f.weigh_ins = 1 and wb.weight_kg is null then null
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
$$;

comment on function public.review_periods is
  'Every finished week (three months back) or month (six months back), newest '
  'first, with the figures the list row prints and a sparkline of the days in '
  'it. Thin periods and empty ones come back like any other: the list draws '
  'them, and so does the comparison chart inside a story.';

create or replace function public.review_summary(
  p_kind    text,
  p_start   date,
  p_user_id uuid default auth.uid()
)
returns table (
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
language sql
stable
set search_path = ''
as $$
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

    -- Averaged over every day, unlike the calorie figures. A day nobody logged
    -- water on is a day they recorded none, and a hydration average that
    -- skipped it would only ever describe the days that went well.
    round(avg(d.water_glasses), 1),
    (count(*) filter (where d.water_glasses >= coalesce(d.goal_water, 8)))::integer,

    (array_agg(d.weight_kg order by d.at desc) filter (where d.weight_kg is not null))[1],
    -- One reading and nothing before it is not a change of zero: the fallback
    -- would subtract that reading from itself. Same rule, and the same reason,
    -- as the one written out in `review_periods`.
    case
      when count(d.weight_kg) = 0 then null
      when count(d.weight_kg) = 1 and (select b.weight_kg from before b) is null then null
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
$$;

-- Deliberately narrower than `trend_summary`. Every column here is drawn by a
-- card in the story, and each one that stopped being drawn came out with it —
-- the step total, the best day, the workout minutes, the first weigh-in, and
-- then the meal count and what was cooked at home when the line under the food
-- step went. A returned figure nothing reads is one a future reader trusts
-- without checking that it means what its name suggests.
comment on function public.review_summary is
  'One review period folded to a single row: the calorie headline, the macro '
  'split, the lightest and heaviest day, the weigh-ins and the movement. The '
  'client decides which story steps to draw from which of these came back '
  'null.';
