-- ---------------------------------------------------------------------------
-- Workouts: the arithmetic behind the Workouts tab.
--
-- Every number the tab shows is worked out here: a set's volume and estimated
-- one-rep max, whether it was a personal record, a workout's totals, an
-- exercise's bests and history, the weekly bars and the streak. The phone adds
-- nothing up, for the reason the diary's totals live in Postgres: a figure
-- computed twice is a figure that disagrees with itself the first time one copy
-- changes.
--
-- Two definitions every function below shares:
--
--   volume      weight x reps, for the two trackings where the weight is load
--               (`weight_reps`, `weighted_reps`). An assisted pull-up's weight
--               is the machine HELPING, and multiplying it by reps would make
--               the easiest set the biggest.
--   est. 1RM    Epley, weight x (1 + reps / 30), over 1 to 15 reps of a
--               `weight_reps` set. Past fifteen the formula stops meaning
--               anything, and a single is its own answer.
--
-- A warm-up counts towards volume (it was lifted) and never towards a record.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Every set with what it was worth, and nothing that needs the sets around it.
--
-- Split from the records below because a window cannot be filtered before it
-- is computed: anything that asked `workout_set_details` for one workout's
-- totals made Postgres score every set the user ever lifted first, once per
-- workout on the history list. Totals read this view instead, where a filter
-- on the workout reaches the indexes.
--
-- `weight_counts` is whether the set can hold a weight record: a working set
-- that was actually lifted, so a missed rep (150 kg x 0) or a weighted carry
-- that went nowhere is not the heaviest anything.
-- ---------------------------------------------------------------------------
create or replace view public.workout_set_values
with (security_invoker = true) as
select
  s.id,
  s.user_id,
  e.workout_id,
  s.workout_exercise_id,
  e.exercise_id,
  e.exercise_name,
  e.tracking,
  e.position as exercise_position,
  s.position,
  s.kind,
  s.weight_kg,
  s.reps,
  s.duration_s,
  s.distance_m,
  s.rpe,
  w.started_at,
  w.log_date,
  case
    when e.tracking in ('weight_reps', 'weighted_reps') and s.weight_kg > 0 and s.reps > 0
      then s.weight_kg * s.reps
  end as volume_kg,
  case
    when e.tracking = 'weight_reps' and s.weight_kg > 0 and s.reps = 1 then s.weight_kg
    when e.tracking = 'weight_reps' and s.weight_kg > 0 and s.reps between 2 and 15
      then round(s.weight_kg * (1 + s.reps / 30.0), 1)
  end as e1rm_kg,
  s.kind <> 'warmup' as counts,
  coalesce(
    s.kind <> 'warmup' and s.weight_kg > 0 and (
      (e.tracking in ('weight_reps', 'weighted_reps') and s.reps >= 1)
      or (e.tracking = 'weight_distance' and s.distance_m > 0)
    ),
    false
  ) as weight_counts
from public.workout_sets s
join public.workout_exercises e on e.id = s.workout_exercise_id
join public.workouts w on w.id = e.workout_id;

grant select on public.workout_set_values to authenticated, service_role;

comment on view public.workout_set_values is
  'Every saved set with its volume and Epley estimated 1RM, and whether it can '
  'hold a weight record. No records: those are workout_set_details.';


-- ---------------------------------------------------------------------------
-- Every set, with whether it beat everything before it.
--
-- A set is a record when it beats the best of every EARLIER workout and is the
-- best of its kind in its own workout. The second half is what stops a heavy
-- day lighting up three trophies for three successively heavier sets: the day
-- holds one weight record, on the set that set it. The first workout of an
-- exercise has nothing to beat, so it sets the baseline and wins nothing.
--
-- "Earlier" is by start time and then by id, with the frame excluding the
-- set's own workout (`exclude group` over both), so sets in the same session
-- never compete across the window, and two workouts logged at the same minute
-- are still one before the other rather than both first.
--
-- This scores every set the user has, so ask it for a whole history at once
-- (grouped, as `workout_summaries` does) rather than once per workout.
-- ---------------------------------------------------------------------------
create or replace view public.workout_set_details
with (security_invoker = true) as
with scored as (
  select
    b.*,
    max(case when b.weight_counts then b.weight_kg end) over earlier as prior_weight,
    max(case when b.counts then b.e1rm_kg end) over earlier as prior_e1rm,
    max(case when b.counts then b.volume_kg end) over earlier as prior_volume,
    max(case when b.counts and b.tracking in ('reps', 'weighted_reps', 'assisted_reps') then b.reps end)
      over earlier as prior_reps,
    max(case when b.counts and b.tracking in ('duration', 'distance_duration') then b.duration_s end)
      over earlier as prior_duration,
    max(case when b.counts and b.tracking in ('distance_duration', 'weight_distance') then b.distance_m end)
      over earlier as prior_distance,
    row_number() over (partition by b.workout_id, b.exercise_id
      order by b.weight_counts desc, b.weight_kg desc nulls last, b.reps desc nulls last, b.exercise_position, b.position) as weight_rank,
    row_number() over (partition by b.workout_id, b.exercise_id
      order by b.counts desc, b.e1rm_kg desc nulls last, b.exercise_position, b.position) as e1rm_rank,
    row_number() over (partition by b.workout_id, b.exercise_id
      order by b.counts desc, b.volume_kg desc nulls last, b.exercise_position, b.position) as volume_rank,
    row_number() over (partition by b.workout_id, b.exercise_id
      order by b.counts desc, b.reps desc nulls last, b.exercise_position, b.position) as reps_rank,
    row_number() over (partition by b.workout_id, b.exercise_id
      order by b.counts desc, b.duration_s desc nulls last, b.exercise_position, b.position) as duration_rank,
    row_number() over (partition by b.workout_id, b.exercise_id
      order by b.counts desc, b.distance_m desc nulls last, b.exercise_position, b.position) as distance_rank
  from public.workout_set_values b
  window earlier as (
    partition by b.user_id, b.exercise_id
    order by b.started_at, b.workout_id
    range between unbounded preceding and current row exclude group
  )
)
select
  id,
  user_id,
  workout_id,
  workout_exercise_id,
  exercise_id,
  exercise_name,
  tracking,
  exercise_position,
  position,
  kind,
  weight_kg,
  reps,
  duration_s,
  distance_m,
  rpe,
  started_at,
  volume_kg,
  e1rm_kg,
  coalesce(weight_counts and weight_rank = 1 and weight_kg > prior_weight, false) as is_weight_pr,
  coalesce(counts and e1rm_rank = 1 and e1rm_kg > prior_e1rm, false) as is_e1rm_pr,
  coalesce(counts and volume_rank = 1 and volume_kg > prior_volume, false) as is_volume_pr,
  coalesce(counts and reps_rank = 1 and tracking in ('reps', 'weighted_reps', 'assisted_reps')
    and reps > prior_reps, false) as is_reps_pr,
  coalesce(counts and duration_rank = 1 and tracking in ('duration', 'distance_duration')
    and duration_s > prior_duration, false) as is_duration_pr,
  coalesce(counts and distance_rank = 1 and tracking in ('distance_duration', 'weight_distance')
    and distance_m > prior_distance, false) as is_distance_pr
from scored;

grant select on public.workout_set_details to authenticated, service_role;

comment on view public.workout_set_details is
  'Every saved set with its volume, Epley estimated 1RM and personal-record '
  'flags. A record beats every earlier workout and is the best of its kind in '
  'its own workout; warm-ups never set one.';


-- ---------------------------------------------------------------------------
-- One row per workout, for the history list and the workout page's header.
--
-- `exercises` is the list a history card draws ("4 x Squat (Barbell)"), in
-- order, so the list needs one request rather than one per card.
-- ---------------------------------------------------------------------------
create or replace view public.workout_summaries
with (security_invoker = true) as
select
  w.id,
  w.user_id,
  w.name,
  w.notes,
  w.started_at,
  w.ended_at,
  w.duration_s,
  w.log_date,
  w.routine_id,
  w.kcal,
  w.health_workout_id,
  w.created_at,
  w.updated_at,
  coalesce(stats.exercise_count, 0) as exercise_count,
  coalesce(stats.set_count, 0) as set_count,
  coalesce(stats.volume_kg, 0) as volume_kg,
  coalesce(prs.pr_count, 0) as pr_count,
  coalesce(list.exercises, '[]'::jsonb) as exercises
from public.workouts w
left join lateral (
  select
    count(distinct v.workout_exercise_id)::integer as exercise_count,
    count(*)::integer as set_count,
    sum(v.volume_kg) as volume_kg
  from public.workout_set_values v
  where v.workout_id = w.id
) stats on true
-- Not lateral: the records are scored once for the whole history and joined,
-- because a filter on one workout cannot reach inside the window.
left join (
  select
    d.workout_id,
    count(*) filter (
      where d.is_weight_pr or d.is_e1rm_pr or d.is_volume_pr
        or d.is_reps_pr or d.is_duration_pr or d.is_distance_pr
    )::integer as pr_count
  from public.workout_set_details d
  group by d.workout_id
) prs on prs.workout_id = w.id
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'exercise_id', e.exercise_id,
      'exercise_name', e.exercise_name,
      'tracking', e.tracking,
      'sets', (select count(*) from public.workout_sets s where s.workout_exercise_id = e.id)
    )
    order by e.position
  ) as exercises
  from public.workout_exercises e
  where e.workout_id = w.id
) list on true;

grant select on public.workout_summaries to authenticated, service_role;

comment on view public.workout_summaries is
  'One row per workout with its totals, record count and exercise list.';


-- ---------------------------------------------------------------------------
-- An exercise's bests, for its records card, and the same row for every
-- exercise the user has done, for the records list.
--
-- `p_exercise_id` null means all of them. The name is the newest one the
-- exercise was saved under, so a custom exercise renamed last week reads with
-- its new name.
-- ---------------------------------------------------------------------------
create or replace function public.exercise_bests(p_exercise_id text default null)
returns table (
  exercise_id             text,
  exercise_name           text,
  tracking                public.exercise_tracking,
  workouts                integer,
  sets                    integer,
  last_at                 timestamptz,
  best_weight_kg          numeric,
  best_weight_reps        smallint,
  best_weight_at          timestamptz,
  best_e1rm_kg            numeric,
  best_e1rm_at            timestamptz,
  best_set_volume_kg      numeric,
  best_session_volume_kg  numeric,
  best_reps               smallint,
  best_duration_s         integer,
  best_distance_m         numeric,
  total_volume_kg         numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with sets as (
    select v.*
    from public.workout_set_values v
    where v.user_id = (select auth.uid())
      and (p_exercise_id is null or v.exercise_id = p_exercise_id)
  ),
  latest as (
    select distinct on (s.exercise_id) s.exercise_id, s.exercise_name, s.tracking
    from sets s
    order by s.exercise_id, s.started_at desc
  ),
  heaviest as (
    select distinct on (s.exercise_id) s.exercise_id, s.weight_kg, s.reps, s.started_at
    from sets s
    where s.weight_counts
    order by s.exercise_id, s.weight_kg desc, s.reps desc nulls last, s.started_at
  ),
  strongest as (
    select distinct on (s.exercise_id) s.exercise_id, s.e1rm_kg, s.started_at
    from sets s
    where s.kind <> 'warmup' and s.e1rm_kg is not null
    order by s.exercise_id, s.e1rm_kg desc, s.started_at
  ),
  sessions as (
    select s.exercise_id, s.workout_id, sum(s.volume_kg) as volume_kg
    from sets s
    group by s.exercise_id, s.workout_id
  )
  select
    l.exercise_id,
    l.exercise_name,
    l.tracking,
    count(distinct s.workout_id)::integer,
    count(*)::integer,
    max(s.started_at),
    h.weight_kg,
    h.reps,
    h.started_at,
    st.e1rm_kg,
    st.started_at,
    max(s.volume_kg) filter (where s.kind <> 'warmup'),
    (select max(x.volume_kg) from sessions x where x.exercise_id = l.exercise_id),
    max(s.reps) filter (where s.kind <> 'warmup' and s.tracking in ('reps', 'weighted_reps', 'assisted_reps')),
    max(s.duration_s) filter (where s.kind <> 'warmup'),
    max(s.distance_m) filter (where s.kind <> 'warmup'),
    coalesce(sum(s.volume_kg), 0)
  from latest l
  join sets s on s.exercise_id = l.exercise_id
  left join heaviest h on h.exercise_id = l.exercise_id
  left join strongest st on st.exercise_id = l.exercise_id
  group by l.exercise_id, l.exercise_name, l.tracking, h.weight_kg, h.reps, h.started_at, st.e1rm_kg, st.started_at
  order by max(s.started_at) desc;
$$;

comment on function public.exercise_bests(text) is
  'Personal bests per exercise (all exercises when the id is null): heaviest '
  'set, best estimated 1RM, best set and session volume, most reps, longest '
  'duration and distance. Warm-ups excluded.';

revoke all on function public.exercise_bests(text) from public, anon;
grant execute on function public.exercise_bests(text) to authenticated;


-- ---------------------------------------------------------------------------
-- An exercise across workouts, newest first: the history tab of an exercise
-- and every chart on it. One row per workout that contained the exercise, with
-- its sets as a list so the history can draw them without a second request.
-- ---------------------------------------------------------------------------
create or replace function public.exercise_history(p_exercise_id text, p_limit integer default 200)
returns table (
  workout_id      uuid,
  workout_name    text,
  started_at      timestamptz,
  sets            jsonb,
  best_weight_kg  numeric,
  best_e1rm_kg    numeric,
  volume_kg       numeric,
  reps            integer,
  duration_s      integer,
  distance_m      numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.workout_id,
    w.name,
    d.started_at,
    jsonb_agg(
      jsonb_build_object(
        'kind', d.kind,
        'weight_kg', d.weight_kg,
        'reps', d.reps,
        'duration_s', d.duration_s,
        'distance_m', d.distance_m,
        'rpe', d.rpe,
        'is_pr', d.is_weight_pr or d.is_e1rm_pr or d.is_volume_pr
          or d.is_reps_pr or d.is_duration_pr or d.is_distance_pr
      )
      order by d.exercise_position, d.position
    ),
    max(d.weight_kg) filter (where d.kind <> 'warmup'),
    max(d.e1rm_kg) filter (where d.kind <> 'warmup'),
    coalesce(sum(d.volume_kg), 0),
    coalesce(sum(d.reps), 0)::integer,
    coalesce(sum(d.duration_s), 0)::integer,
    sum(d.distance_m)
  from public.workout_set_details d
  join public.workouts w on w.id = d.workout_id
  where d.user_id = (select auth.uid()) and d.exercise_id = p_exercise_id
  group by d.workout_id, w.name, d.started_at
  order by d.started_at desc
  limit least(greatest(p_limit, 1), 500);
$$;

comment on function public.exercise_history(text, integer) is
  'One row per workout containing the exercise, newest first, with its sets '
  'and that session''s best weight, best estimated 1RM and totals.';

revoke all on function public.exercise_history(text, integer) from public, anon;
grant execute on function public.exercise_history(text, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- What each exercise was last time, set by set: the PREVIOUS column in the
-- logger, which is the comparison people lift against.
-- ---------------------------------------------------------------------------
create or replace function public.exercise_last_sets(p_exercise_ids text[])
returns table (
  exercise_id  text,
  workout_id   uuid,
  started_at   timestamptz,
  set_position smallint,
  kind         public.workout_set_kind,
  weight_kg    numeric,
  reps         smallint,
  duration_s   integer,
  distance_m   numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with last_entry as (
    select distinct on (e.exercise_id) e.exercise_id, e.id
    from public.workout_exercises e
    join public.workouts w on w.id = e.workout_id
    where e.user_id = (select auth.uid())
      and e.exercise_id = any (p_exercise_ids)
    order by e.exercise_id, w.started_at desc, e.position desc
  )
  select l.exercise_id, w.id, w.started_at, s.position, s.kind, s.weight_kg, s.reps, s.duration_s, s.distance_m
  from last_entry l
  join public.workout_exercises e on e.id = l.id
  join public.workouts w on w.id = e.workout_id
  join public.workout_sets s on s.workout_exercise_id = e.id
  order by l.exercise_id, s.position;
$$;

comment on function public.exercise_last_sets(text[]) is
  'The sets of the most recent workout entry for each exercise asked for: the '
  'logger''s PREVIOUS column.';

revoke all on function public.exercise_last_sets(text[]) from public, anon;
grant execute on function public.exercise_last_sets(text[]) to authenticated;


-- ---------------------------------------------------------------------------
-- Weekly bars: workouts, time, volume and sets for each of the last N weeks,
-- Monday to Sunday, empty weeks included so the chart's columns are weeks and
-- not "weeks with a workout in them".
-- ---------------------------------------------------------------------------
create or replace function public.workout_weeks(p_weeks integer default 12)
returns table (
  week        date,
  workouts    integer,
  duration_s  integer,
  volume_kg   numeric,
  sets        integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with this_week as (
    select date_trunc('week', public.local_today((select auth.uid())))::date as monday
  ),
  calendar as (
    select (t.monday - 7 * n)::date as week
    from this_week t, generate_series(0, least(greatest(p_weeks, 1), 104) - 1) as n
  ),
  per_workout as (
    select
      date_trunc('week', w.log_date)::date as week,
      w.duration_s,
      coalesce(t.volume_kg, 0) as volume_kg,
      coalesce(t.sets, 0) as sets
    from public.workouts w
    left join (
      select v.workout_id, sum(v.volume_kg) as volume_kg, count(*) as sets
      from public.workout_set_values v
      where v.user_id = (select auth.uid())
        and v.log_date >= (select min(c.week) from calendar c)
      group by v.workout_id
    ) t on t.workout_id = w.id
    where w.user_id = (select auth.uid())
      and w.log_date >= (select min(c.week) from calendar c)
  )
  select
    c.week,
    count(p.week)::integer,
    coalesce(sum(p.duration_s), 0)::integer,
    coalesce(sum(p.volume_kg), 0),
    coalesce(sum(p.sets), 0)::integer
  from calendar c
  left join per_workout p on p.week = c.week
  group by c.week
  order by c.week;
$$;

comment on function public.workout_weeks(integer) is
  'Workouts, seconds, volume and sets per Monday-to-Sunday week for the last '
  'p_weeks weeks (at most 104), oldest first, empty weeks included.';

revoke all on function public.workout_weeks(integer) from public, anon;
grant execute on function public.workout_weeks(integer) to authenticated;


-- ---------------------------------------------------------------------------
-- The tab's header: all-time count, this week so far, and the streak.
--
-- The streak is counted in WEEKS with at least one workout, ending this week or
-- last week. Days would be the wrong unit: rest days are part of training, and
-- a daily streak punishes exactly the recovery a program prescribes. A week
-- that has not had its workout yet does not break the streak until it is over.
-- ---------------------------------------------------------------------------
create or replace function public.workout_overview()
returns table (
  total_workouts        integer,
  week_streak           integer,
  this_week_workouts    integer,
  this_week_seconds     integer,
  this_week_volume_kg   numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id,
           date_trunc('week', public.local_today((select auth.uid())))::date as monday
  ),
  weeks as (
    select distinct date_trunc('week', w.log_date)::date as week
    from public.workouts w, me
    where w.user_id = me.id
  ),
  start as (
    select case
      when exists (select 1 from weeks, me where weeks.week = me.monday) then me.monday
      else me.monday - 7
    end as week
    from me
  ),
  ranked as (
    select weeks.week, row_number() over (order by weeks.week desc) as n
    from weeks, start
    where weeks.week <= start.week
  )
  select
    (select count(*)::integer from public.workouts w, me where w.user_id = me.id),
    (select count(*)::integer from ranked, start where ranked.week = start.week - 7 * (ranked.n - 1)::integer),
    (select count(*)::integer from public.workouts w, me
      where w.user_id = me.id and w.log_date >= me.monday and w.log_date < me.monday + 7),
    (select coalesce(sum(w.duration_s), 0)::integer from public.workouts w, me
      where w.user_id = me.id and w.log_date >= me.monday and w.log_date < me.monday + 7),
    (select coalesce(sum(v.volume_kg), 0) from public.workout_set_values v, me
      where v.user_id = me.id and v.log_date >= me.monday and v.log_date < me.monday + 7);
$$;

comment on function public.workout_overview() is
  'All-time workout count, the streak of consecutive weeks with a workout '
  '(ending this week or last), and this week''s workouts, seconds and volume.';

revoke all on function public.workout_overview() from public, anon;
grant execute on function public.workout_overview() to authenticated;


-- ---------------------------------------------------------------------------
-- How many working sets each exercise got over a range of days, which the app
-- spreads across muscles using its catalogue's splits. The split itself lives
-- with the catalogue, in the app, because that is where the exercises are; the
-- counting lives here.
-- ---------------------------------------------------------------------------
create or replace function public.workout_exercise_totals(p_from date, p_to date)
returns table (
  exercise_id  text,
  sets         integer,
  volume_kg    numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.exercise_id,
         count(s.id) filter (where s.kind <> 'warmup')::integer,
         coalesce(sum(s.weight_kg * s.reps) filter (
           where e.tracking in ('weight_reps', 'weighted_reps') and s.weight_kg > 0 and s.reps > 0
         ), 0)
  from public.workouts w
  join public.workout_exercises e on e.workout_id = w.id
  join public.workout_sets s on s.workout_exercise_id = e.id
  where w.user_id = (select auth.uid())
    and w.log_date between p_from and p_to
  group by e.exercise_id;
$$;

comment on function public.workout_exercise_totals(date, date) is
  'Working sets (warm-ups excluded) and volume per exercise between two local '
  'dates, inclusive. The app spreads them across muscles.';

revoke all on function public.workout_exercise_totals(date, date) from public, anon;
grant execute on function public.workout_exercise_totals(date, date) to authenticated;
