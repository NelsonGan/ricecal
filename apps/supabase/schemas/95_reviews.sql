-- ---------------------------------------------------------------------------
-- Reviews: a finished week or month, folded into the cards one story shows.
--
-- Nothing here is a new fact. Every figure a review draws was already stored —
-- what was missing was a way to ask for a NAMED CALENDAR PERIOD. `trend_days`
-- takes '7d', '30d' or '1y' anchored to today, which is the right shape for a
-- chart that always ends now and the wrong one for "the week of 3 August", a
-- window that stopped moving when the week ended.
--
-- Three ideas run through the file.
--
--   A PERIOD IS ITS START. Everything downstream takes `(kind, start)` and
--   works its own end out through `review_end()`. The alternative — passing a
--   pair of dates from the client — puts a month's length in the app, where a
--   February computed with `+30 days` is a review that quietly drops two days
--   of food.
--
--   ONLY FINISHED PERIODS. `review_periods` stops at the last completed week or
--   month. A review is a look back at something that is over; a week still
--   being lived has a Sunday nobody has eaten yet, and averaging it in makes
--   every review of the current week read as a light one until it ends.
--
--   EVERY PERIOD IN THE WINDOW, thin ones included. There was a `qualifies`
--   column here that said whether a period had enough logged days to be worth
--   opening, and the list hid the ones that failed it. It is gone: a week you
--   barely logged is the week you most want to see the shape of, and a list
--   with holes in it reads as a list that lost something. The comparison bars
--   inside a story wanted them all along for the same reason.
--
-- These sort after 94 by name only; they read `daily_nutrition` (90),
-- `activity_days` (41) and `weight_logs` (40).
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- The last day of the period that starts here.
--
-- Immutable and trivial, and it exists so that the length of a month is written
-- down once. Every other function below opens by calling it.
-- ---------------------------------------------------------------------------
create or replace function public.review_end(p_kind text, p_start date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'week'  then p_start + 6
    when 'month' then (p_start + interval '1 month')::date - 1
  end;
$$;

comment on function public.review_end is
  'The last day of a review period, given its kind and its first day. One place '
  'that knows a month is not thirty days.';


-- ---------------------------------------------------------------------------
-- One row per calendar day between two dates: food, water, weight and movement
-- side by side.
--
-- The day generator every function below folds. Same shape and same reasoning
-- as `trend_days` and `activity_days_range` — days with nothing logged are
-- present and empty, because "5 of 7 days under goal" counts over seven — with
-- one difference that matters: this takes DATES. A review's window is a
-- calendar week or a calendar month, so there is no range for `local_today()`
-- to name, which is the same reason `day_marks` takes dates too.
--
-- Food and movement in one generator rather than two. A review reads both on
-- one screen, and a story that made two round trips would draw its weight line
-- a beat after the steps under it.
--
-- Null and zero stay distinct, exactly as they do upstream: `steps` coalesces
-- to zero because a day in a pocket recorded none, while `resting_kcal` and
-- `stand_hours` do not, because a provider with no opinion must not be quoted
-- as having one.
-- ---------------------------------------------------------------------------
create or replace function public.review_days(
  p_from    date,
  p_to      date,
  p_user_id uuid default auth.uid()
)
returns table (
  at               date,
  kcal             integer,
  carbs_g          numeric,
  protein_g        numeric,
  fat_g            numeric,
  entry_count      integer,
  water_ml         integer,
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
language sql
stable
set search_path = ''
as $$
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
    coalesce(l.water_ml, 0)::integer,
    g.kcal,
    g.water_ml::integer,
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
    select gg.kcal, gg.water_ml
    from public.daily_goals gg
    where gg.user_id = p_user_id and gg.effective_from <= c.at
    order by gg.effective_from desc
    limit 1
  ) g on true;
$$;

comment on function public.review_days is
  'One row per calendar day between two dates, carrying that day''s food, '
  'water, weigh-in, budget and movement. The generator every review function '
  'folds; days with nothing logged are present and empty.';


-- ---------------------------------------------------------------------------
-- Every review period in the window, newest first, whether or not it has enough
-- in it to be worth opening.
--
-- Weeks run Monday to Sunday, which `date_trunc('week', …)` already means, and
-- months are calendar months. The window is three months of weeks and six
-- months of months: a weekly review a quarter old is still a week somebody
-- remembers, and one older than that is a chart, not a story. Both windows are
-- truncated to a period boundary BEFORE the range is generated, so the oldest
-- period in the list is a whole one rather than the tail of one.
--
-- `marks` is the sparkline on the list row: a week's seven days, or a month's
-- four or five weeks. Null entries are days that were not logged, and they draw
-- as gaps — which is the whole point of a sparkline here, since the figure
-- beside it is an average and an average cannot show that Tuesday is missing.
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- One period as one row: everything the four steps of a story put in a headline.
--
-- Wide rather than several narrow functions for the reason `trend_summary` is:
-- a story is one screen's worth of reading and these are one screen's worth of
-- numbers, so they should cost one request. The client decides which STEPS to
-- show from what came back null.
--
-- Folded here rather than in the app, because an average over a period has to
-- be weighted by the days that actually have food in them — a week with two
-- days logged averaged over seven describes a fast rather than a diet.
-- ---------------------------------------------------------------------------
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
    -- skipped it would only ever describe the days that went well. Whole
    -- millilitres: a tenth of one is not a fact about anybody's day.
    round(avg(d.water_ml), 0),
    (count(*) filter (where d.water_ml >= coalesce(d.goal_water, 2000)))::integer,

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


-- ---------------------------------------------------------------------------
-- The columns of the charts inside a story: a day of a week, a week of a month.
--
-- One row per column carrying calories, macros, steps and the weigh-in, because
-- three of the four steps draw a chart and none of them should cost a request
-- of its own.
--
-- A month's first and last weeks are CLIPPED to the month. Left whole they
-- would reach into the months either side, and a bar labelled W1 would be
-- counting days that belong to somebody else's review.
-- ---------------------------------------------------------------------------
create or replace function public.review_series(
  p_kind    text,
  p_start   date,
  p_user_id uuid default auth.uid()
)
returns table (
  bucket_start  date,
  days_logged   integer,
  kcal_avg      numeric,
  carbs_g_avg   numeric,
  protein_g_avg numeric,
  fat_g_avg     numeric,
  weight_last   numeric,
  steps_avg     numeric
)
language sql
stable
set search_path = ''
as $$
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
$$;

-- As narrow as `review_summary`, and for the same reason: every column here is
-- a mark on a chart. The goal, the water and the burn came out again once it
-- was clear no card drew them.
comment on function public.review_series is
  'One row per column of the charts inside a review: a day for a weekly review, '
  'a week for a monthly one, carrying the calories, the macro split, the '
  'weigh-in and the steps, so three of the story''s steps share one request.';


-- ---------------------------------------------------------------------------
-- What was eaten, by dish, over one period.
--
-- Grouped on the FOLDED name rather than on `food_id`, and that is the whole
-- design of this function. An entry carries its own numbers and its `food_id`
-- is nullable — a tier-4 estimate, an archetype and a plate rebuilt from its
-- parts all write null — so grouping on the id would drop exactly the meals a
-- review is most interesting about, and would split one dish across a catalogue
-- row, a recipe and a guess that all say "nasi lemak".
--
-- HEAVIEST FIRST, and this was "most often first" for about a day. Counting
-- repeats assumes a diary in which the same dish arrives under the same name,
-- and this one mostly does not: a scanned plate is named by a model and a
-- searched one by the catalogue, so a fortnight of eating nasi lemak four times
-- can be four spellings and four counts of one. Calories need no such
-- agreement, and "the five biggest plates" is a question a week can answer
-- honestly however its rows were written.
--
-- Still grouped by name rather than listed row by row: where a name DOES repeat,
-- five identical lines would be a worse answer than four dishes and a fifth.
-- The macros are averaged over those repeats, because the figure beside a name
-- is what one of them costs.
-- ---------------------------------------------------------------------------
create or replace function public.review_meals(
  p_kind    text,
  p_start   date,
  p_limit   integer default 5,
  p_user_id uuid default auth.uid()
)
returns table (
  name          text,
  icon_set      public.icon_set,
  icon_name     text,
  photo_path    text,
  kcal_avg      integer,
  carbs_g_avg   numeric,
  protein_g_avg numeric,
  fat_g_avg     numeric
)
language sql
stable
set search_path = ''
as $$
  with span as (
    select p_start as from_date, public.review_end(p_kind, p_start) as to_date
  ),
  entries as (
    -- The view for the arithmetic, the table beside it for the DRAWING.
    -- `food_log_details` nulls both icon columns whenever an entry has a
    -- photograph, because in the diary the photograph is the better picture.
    -- This screen wants BOTH — the plate somebody actually photographed, and a
    -- drawing to fall back on when nobody did — and the view can only ever hand
    -- it one of them.
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
    -- The newest plate anybody photographed under this name, which is not
    -- necessarily the entry the icon came from: a dish logged twice by camera
    -- and once by hand has a photograph and a drawing, and the screen prefers
    -- the photograph exactly as the diary does.
    (array_agg(e.photo_path order by e.logged_at desc) filter (where e.photo_path is not null))[1],
    round(avg(e.kcal))::integer,
    round(avg(e.carbs_g), 1),
    round(avg(e.protein_g), 1),
    round(avg(e.fat_g), 1)
  from entries e
  group by lower(e.food_name)
  -- The dearest plate first. A tie goes to the one eaten more often, which is
  -- the difference between a heavy meal and a heavy habit.
  order by avg(e.kcal) desc, count(*) desc
  limit greatest(p_limit, 0);
$$;

comment on function public.review_meals is
  'The biggest plates of one review period, folded by name and ordered by what '
  'one of them cost. Grouped on the name rather than on food_id, because an '
  'estimate, an archetype and a recipe all log a null id and would otherwise '
  'vanish from the one screen that is about what somebody ate.';


-- Callable by a signed-in user and nobody else. The revoke is not redundant:
-- Postgres grants EXECUTE to PUBLIC on a newly created function, and a grant to
-- `authenticated` does not take that away.
revoke execute on function public.review_end     from public, anon;
revoke execute on function public.review_days    from public, anon;
revoke execute on function public.review_periods from public, anon;
revoke execute on function public.review_summary from public, anon;
revoke execute on function public.review_series  from public, anon;
revoke execute on function public.review_meals   from public, anon;

grant execute on function public.review_end     to authenticated;
grant execute on function public.review_days    to authenticated;
grant execute on function public.review_periods to authenticated;
grant execute on function public.review_summary to authenticated;
grant execute on function public.review_series  to authenticated;
grant execute on function public.review_meals   to authenticated;
