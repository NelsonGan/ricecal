-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.trend_workout_summary (
  p_range text
)
  RETURNS TABLE (
    from_date        date,
    to_date          date,
    workouts         integer,
    active_days      integer,
    duration_s       integer,
    volume_kg        numeric,
    sets             integer,
    prev_workouts    integer,
    prev_active_days integer,
    prev_duration_s  integer,
    prev_volume_kg   numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with bounds as (
    select
      r.from_date,
      r.to_date,
      case p_range
        when '1y' then (r.from_date - interval '12 months')::date
        else r.from_date - (r.to_date - r.from_date + 1)
      end as prev_from,
      -- The same point a year ago, not the end of last year's twelfth month:
      -- this year's twelfth month is only partway through, and a whole one
      -- beside it read as a fall in training on every day but the last.
      case p_range
        when '1y' then (r.to_date - interval '12 months')::date
        else r.from_date - 1
      end as prev_to
    from (
      select
        private.range_start(p_range, public.local_today((select auth.uid()))) as from_date,
        public.local_today((select auth.uid())) as to_date
    ) r
  ),
  per_workout as (
    select
      w.log_date,
      w.duration_s,
      coalesce(t.volume_kg, 0) as volume_kg,
      coalesce(t.sets, 0)      as sets
    from public.workouts w
    left join (
      select v.workout_id, sum(v.volume_kg) as volume_kg, count(*) as sets
      from public.workout_set_values v
      where v.user_id = (select auth.uid())
        and v.log_date >= (select b.prev_from from bounds b)
      group by v.workout_id
    ) t on t.workout_id = w.id
    where w.user_id = (select auth.uid())
      and w.log_date between (select b.prev_from from bounds b) and (select b.to_date from bounds b)
  )
  select
    b.from_date,
    b.to_date,
    (count(p.log_date) filter (where p.log_date >= b.from_date))::integer,
    (count(distinct p.log_date) filter (where p.log_date >= b.from_date))::integer,
    coalesce(sum(p.duration_s) filter (where p.log_date >= b.from_date), 0)::integer,
    coalesce(sum(p.volume_kg) filter (where p.log_date >= b.from_date), 0),
    coalesce(sum(p.sets) filter (where p.log_date >= b.from_date), 0)::integer,
    (count(p.log_date) filter (where p.log_date <= b.prev_to))::integer,
    (count(distinct p.log_date) filter (where p.log_date <= b.prev_to))::integer,
    coalesce(sum(p.duration_s) filter (where p.log_date <= b.prev_to), 0)::integer,
    coalesce(sum(p.volume_kg) filter (where p.log_date <= b.prev_to), 0)
  from bounds b
  left join per_workout p on true
  group by b.from_date, b.to_date;
$function$;

COMMENT ON FUNCTION public.trend_workout_summary(text) IS 'A named Trends range (7d, 30d, 1y) as one row of workout totals, beside the same totals for the range of the same length just before it.';

GRANT ALL ON FUNCTION public.trend_workout_summary(text) TO authenticated;

CREATE FUNCTION public.trend_workouts (
  p_range text
)
  RETURNS TABLE (
    bucket_start date,
    bucket_end   date,
    days         integer,
    workouts     integer,
    active_days  integer,
    duration_s   integer,
    volume_kg    numeric,
    sets         integer
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
      case p_range
        when '1y'  then date_trunc('month', series)::date
        when '30d' then greatest(b.from_date, b.to_date - ((b.to_date - series::date) / 7) * 7 - 6)
        else series::date
      end as in_bucket
    from bounds b
    cross join generate_series(b.from_date, b.to_date, interval '1 day') as series
  ),
  per_day as (
    select
      w.log_date,
      count(*)::integer                     as workouts,
      sum(w.duration_s)::integer            as duration_s,
      coalesce(sum(t.volume_kg), 0)         as volume_kg,
      coalesce(sum(t.sets), 0)::integer     as sets
    from public.workouts w
    left join (
      select v.workout_id, sum(v.volume_kg) as volume_kg, count(*) as sets
      from public.workout_set_values v
      where v.user_id = (select auth.uid())
        and v.log_date >= (select b.from_date from bounds b)
      group by v.workout_id
    ) t on t.workout_id = w.id
    where w.user_id = (select auth.uid())
      and w.log_date between (select b.from_date from bounds b) and (select b.to_date from bounds b)
    group by w.log_date
  )
  select
    c.in_bucket,
    max(c.at),
    count(*)::integer,
    coalesce(sum(d.workouts), 0)::integer,
    count(d.log_date)::integer,
    coalesce(sum(d.duration_s), 0)::integer,
    coalesce(sum(d.volume_kg), 0),
    coalesce(sum(d.sets), 0)::integer
  from calendar c
  left join per_day d on d.log_date = c.at
  group by c.in_bucket
  order by c.in_bucket;
$function$;

COMMENT ON FUNCTION public.trend_workouts(text) IS 'Workouts, active days, seconds, volume and sets per column of a Trends chart (a day for 7d, a seven-day block for 30d, a calendar month for 1y), oldest first, empty columns included.';

GRANT ALL ON FUNCTION public.trend_workouts(text) TO authenticated;

-- `db diff` does not carry these: a new function is executable by PUBLIC
-- until it is taken away.
revoke all on function public.trend_workouts(text) from public, anon;
revoke all on function public.trend_workout_summary(text) from public, anon;
