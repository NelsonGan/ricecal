-- The read side of the Activity tab. Mirrors schemas/93_activity.sql.
-- Applied to the remote project directly; see the tables migration beside
-- this one for why.

-- ---------------------------------------------------------------------------
-- One row per calendar day in the range, movement and food side by side.
--
-- Days with no row in `activity_days` are present and empty, exactly as in
-- `trend_days` and for a sharper version of the same reason: "goal days: 2 of
-- 7" counts over seven, and a user who left their watch on the charger has a
-- day of no steps rather than no day.
--
-- Null and zero stay distinct all the way up. `steps` coalesces to zero — a day
-- the phone was in a pocket genuinely recorded no steps — while `stand_hours`
-- and `resting_kcal` do not, because a provider that never reports them would
-- otherwise show a confident zero for something it has no opinion about.
-- ---------------------------------------------------------------------------
create or replace function public.activity_days_range(
  p_range   text,
  p_user_id uuid default auth.uid()
)
returns table (
  at                date,
  bucket            date,
  has_data          boolean,
  active_kcal       integer,
  resting_kcal      integer,
  steps             integer,
  distance_m        integer,
  exercise_minutes  integer,
  stand_hours       smallint,
  move_goal_kcal    integer,
  exercise_goal_min integer,
  stand_goal_hr     smallint,
  step_goal         integer,
  sessions          integer,
  session_kcal      integer,
  session_seconds   integer,
  eaten_kcal        integer,
  goal_kcal         integer
)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      case p_range
        when '7d'  then public.local_today(p_user_id) - 6
        when '30d' then public.local_today(p_user_id) - 29
        when '1y'  then (date_trunc('month', public.local_today(p_user_id)) - interval '11 months')::date
      end as from_date,
      public.local_today(p_user_id) as to_date
  ),
  calendar as (
    select
      series::date as at,
      case p_range
        when '1y'  then date_trunc('month', series)::date
        when '30d' then greatest(b.from_date, b.to_date - ((b.to_date - series::date) / 7) * 7 - 6)
        else series::date
      end as in_bucket
    from bounds b
    cross join generate_series(b.from_date, b.to_date, interval '1 day') as series
  ),
  -- The step goal is a single current preference rather than an effective-dated
  -- one, unlike the calorie budget. Read once here so the join below is a
  -- constant and not a lookup per day.
  prefs as (
    select coalesce(
      (select s.step_goal from public.user_settings s where s.user_id = p_user_id),
      8000
    ) as step_goal
  )
  select
    c.at,
    c.in_bucket,
    (a.user_id is not null),
    coalesce(a.active_kcal, 0),
    a.resting_kcal,
    coalesce(a.steps, 0),
    a.distance_m,
    a.exercise_minutes,
    a.stand_hours,
    a.move_goal_kcal,
    a.exercise_goal_min,
    a.stand_goal_hr,
    p.step_goal,
    coalesce(w.sessions, 0),
    coalesce(w.session_kcal, 0),
    coalesce(w.session_seconds, 0),
    n.kcal,
    g.kcal
  from calendar c
  cross join prefs p
  left join public.activity_days  a on a.user_id = p_user_id and a.log_date = c.at
  left join public.daily_nutrition n on n.user_id = p_user_id and n.log_date = c.at
  left join lateral (
    select
      count(*)::integer                as sessions,
      sum(s.active_kcal)::integer      as session_kcal,
      sum(s.duration_s)::integer       as session_seconds
    from public.activity_sessions s
    where s.user_id = p_user_id and s.log_date = c.at
  ) w on true
  left join lateral (
    select gg.kcal
    from public.daily_goals gg
    where gg.user_id = p_user_id and gg.effective_from <= c.at
    order by gg.effective_from desc
    limit 1
  ) g on true;
$$;

comment on function public.activity_days_range is
  'One row per calendar day in a named range (7d, 30d, 1y) with that day''s '
  'movement, its workouts folded to a count and a total, and the food and goal '
  'beside them. Days the watch recorded nothing are present with has_data '
  'false, because every "N of 30" on the Activity screen counts over the range.';


-- ---------------------------------------------------------------------------
-- The columns of whichever Activity chart is on screen.
--
-- A day on 7d, a seven-day block on 30d, a calendar month on 1y — the same
-- bucketing as Trends, so the two tabs' charts line up column for column when a
-- user switches between them.
-- ---------------------------------------------------------------------------
create or replace function public.activity_series(
  p_range   text,
  p_user_id uuid default auth.uid()
)
returns table (
  bucket_start      date,
  bucket_end        date,
  days              integer,
  active_days       integer,
  active_kcal_avg   numeric,
  active_kcal_total integer,
  resting_kcal_avg  numeric,
  burn_avg          numeric,
  steps_avg         numeric,
  steps_total       integer,
  steps_best        integer,
  step_goal_days    integer,
  step_goal         integer,
  distance_total_m  integer,
  exercise_min_avg  numeric,
  stand_hours_avg   numeric,
  sessions          integer,
  session_kcal      integer,
  session_minutes   integer,
  eaten_avg         numeric,
  balance_avg       numeric
)
language sql
stable
set search_path = ''
as $$
  select
    d.bucket,
    max(d.at),
    count(*)::integer,
    (count(*) filter (where d.has_data))::integer,
    -- Averaged over the days the provider HAS, not over the range. A week with
    -- two days of watch data averaged over seven reads as a sedentary week,
    -- which is a claim about the user rather than about the watch.
    round(avg(d.active_kcal) filter (where d.has_data), 0),
    sum(d.active_kcal)::integer,
    round(avg(d.resting_kcal) filter (where d.resting_kcal is not null), 0),
    round(avg(d.resting_kcal + d.active_kcal) filter (where d.resting_kcal is not null), 0),
    round(avg(d.steps) filter (where d.has_data), 0),
    sum(d.steps)::integer,
    max(d.steps)::integer,
    (count(*) filter (where d.steps >= d.step_goal))::integer,
    (array_agg(d.step_goal order by d.at desc))[1],
    sum(d.distance_m)::integer,
    round(avg(d.exercise_minutes) filter (where d.exercise_minutes is not null), 0),
    round(avg(d.stand_hours) filter (where d.stand_hours is not null), 1),
    sum(d.sessions)::integer,
    sum(d.session_kcal)::integer,
    (sum(d.session_seconds) / 60)::integer,
    round(avg(d.eaten_kcal) filter (where d.eaten_kcal is not null), 0),
    -- The bar the balance chart draws, per day, averaged. Only days that have
    -- BOTH sides: a day with food and no watch is not a 1,900 kcal surplus, and
    -- a day with a watch and no food is not a 2,000 kcal deficit. Either one
    -- averaged in would make the headline number a story about missing data.
    round(
      avg(d.eaten_kcal - (coalesce(d.resting_kcal, 0) + d.active_kcal))
        filter (where d.eaten_kcal is not null and d.resting_kcal is not null),
      0
    )
  from public.activity_days_range(p_range, p_user_id) d
  group by d.bucket
  order by d.bucket;
$$;

comment on function public.activity_series is
  'One row per column of an Activity chart — a day for 7d, a seven-day block '
  'for 30d, a calendar month for 1y — carrying movement, workouts and the food '
  'eaten against them, so the balance chart and the steps chart need one '
  'request between them.';


-- ---------------------------------------------------------------------------
-- The whole range as one row: the tiles at the top, and every footnote.
--
-- Folded here rather than in the client for the reason `trend_summary` is: a
-- range average has to weight each bucket by the days actually in it, and on
-- 30d the oldest block is two days rather than seven.
-- ---------------------------------------------------------------------------
create or replace function public.activity_summary(
  p_range   text,
  p_user_id uuid default auth.uid()
)
returns table (
  from_date         date,
  to_date           date,
  days              integer,
  active_days       integer,
  active_kcal_avg   numeric,
  active_kcal_total integer,
  resting_kcal_avg  numeric,
  resting_kcal_total integer,
  burn_avg          numeric,
  steps_avg         numeric,
  steps_total       integer,
  steps_best        integer,
  step_goal_days    integer,
  step_goal         integer,
  distance_total_m  integer,
  exercise_min_avg  numeric,
  exercise_min_total integer,
  stand_hours_avg   numeric,
  sessions          integer,
  session_kcal      integer,
  session_minutes   integer,
  -- Active energy that no session accounts for: the walk to the mamak, the
  -- stairs, the errands. A remainder, clamped at zero — see the header.
  walking_kcal      integer,
  eaten_avg         numeric,
  eaten_total       integer,
  balance_avg       numeric,
  balance_days      integer
)
language sql
stable
set search_path = ''
as $$
  select
    min(d.at),
    max(d.at),
    count(*)::integer,
    (count(*) filter (where d.has_data))::integer,
    round(avg(d.active_kcal) filter (where d.has_data), 0),
    sum(d.active_kcal)::integer,
    round(avg(d.resting_kcal) filter (where d.resting_kcal is not null), 0),
    sum(d.resting_kcal)::integer,
    round(avg(d.resting_kcal + d.active_kcal) filter (where d.resting_kcal is not null), 0),
    round(avg(d.steps) filter (where d.has_data), 0),
    sum(d.steps)::integer,
    max(d.steps)::integer,
    (count(*) filter (where d.steps >= d.step_goal))::integer,
    (array_agg(d.step_goal order by d.at desc))[1],
    sum(d.distance_m)::integer,
    round(avg(d.exercise_minutes) filter (where d.exercise_minutes is not null), 0),
    sum(d.exercise_minutes)::integer,
    round(avg(d.stand_hours) filter (where d.stand_hours is not null), 1),
    sum(d.sessions)::integer,
    sum(d.session_kcal)::integer,
    (sum(d.session_seconds) / 60)::integer,
    greatest(sum(d.active_kcal) - sum(d.session_kcal), 0)::integer,
    round(avg(d.eaten_kcal) filter (where d.eaten_kcal is not null), 0),
    sum(d.eaten_kcal)::integer,
    round(
      avg(d.eaten_kcal - (coalesce(d.resting_kcal, 0) + d.active_kcal))
        filter (where d.eaten_kcal is not null and d.resting_kcal is not null),
      0
    ),
    (count(*) filter (where d.eaten_kcal is not null and d.resting_kcal is not null))::integer
  from public.activity_days_range(p_range, p_user_id) d;
$$;

comment on function public.activity_summary is
  'A named Activity range folded to one row: the tiles at the top of the tab, '
  'the three-way split of where the burn came from, and the average daily '
  'balance with the count of days honest enough to compute it over.';


-- Callable by a signed-in user and nobody else. The revoke is not redundant:
-- Postgres grants EXECUTE to PUBLIC on a newly created function, and a grant to
-- `authenticated` does not take that away.
revoke execute on function public.activity_days_range from public, anon;
revoke execute on function public.activity_series     from public, anon;
revoke execute on function public.activity_summary    from public, anon;

grant execute on function public.activity_days_range to authenticated;
grant execute on function public.activity_series     to authenticated;
grant execute on function public.activity_summary    to authenticated;
