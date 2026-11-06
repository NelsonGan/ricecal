-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.review_workout_periods (
  p_kind text
)
  RETURNS TABLE (
    starts_on  date,
    workouts   integer,
    duration_s integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with bounds as (
    select
      case p_kind
        when 'week'  then date_trunc('week',  public.local_today((select auth.uid())) - interval '3 months')::date
        when 'month' then date_trunc('month', public.local_today((select auth.uid())) - interval '6 months')::date
      end as from_date,
      case p_kind
        when 'week'  then date_trunc('week',  public.local_today((select auth.uid())))::date - 1
        when 'month' then date_trunc('month', public.local_today((select auth.uid())))::date - 1
      end as to_date
  ),
  calendar as (
    select gs::date as starts_on
    from bounds b,
      generate_series(
        b.from_date,
        b.to_date,
        case p_kind when 'week' then interval '1 week' else interval '1 month' end
      ) as gs
  ),
  per_workout as (
    select
      case p_kind
        when 'week' then date_trunc('week', w.log_date)::date
        else date_trunc('month', w.log_date)::date
      end as starts_on,
      w.duration_s
    from public.workouts w
    where w.user_id = (select auth.uid())
      and w.log_date between (select b.from_date from bounds b) and (select b.to_date from bounds b)
  )
  select c.starts_on, count(p.starts_on)::integer, coalesce(sum(p.duration_s), 0)::integer
  from calendar c
  left join per_workout p on p.starts_on = c.starts_on
  group by c.starts_on
  order by c.starts_on desc;
$function$;

COMMENT ON FUNCTION public.review_workout_periods(text) IS 'Workouts and seconds trained for every finished week (three months back) or month (six months back), newest first: the figures on the reviews list.';

GRANT ALL ON FUNCTION public.review_workout_periods(text) TO authenticated;

CREATE FUNCTION public.review_workout_records (
  p_kind  text,
  p_start date,
  p_limit integer DEFAULT 3
)
  RETURNS TABLE (
    exercise_id   text,
    exercise_name text,
    weight_kg     numeric,
    reps          integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with best as (
    select distinct on (d.exercise_id)
      d.exercise_id,
      e.exercise_name,
      d.weight_kg,
      d.reps
    from public.workout_set_details d
    join public.workouts w on w.id = d.workout_id
    join public.workout_exercises e on e.id = d.workout_exercise_id
    where d.user_id = (select auth.uid())
      and d.is_weight_pr
      and w.log_date between p_start and public.review_end(p_kind, p_start)
    order by d.exercise_id, d.weight_kg desc, d.reps desc nulls last
  )
  select b.exercise_id, b.exercise_name, b.weight_kg, b.reps
  from best b
  order by b.weight_kg desc, b.exercise_name
  limit least(greatest(p_limit, 0), 10);
$function$;

COMMENT ON FUNCTION public.review_workout_records(text,date,integer) IS 'The exercises that set a weight record in one review period, each at its heaviest record set, heaviest first.';

GRANT ALL ON FUNCTION public.review_workout_records(text, date, integer) TO authenticated;

CREATE FUNCTION public.review_workouts (
  p_kind  text,
  p_start date
)
  RETURNS TABLE (
    workouts      integer,
    active_days   integer,
    duration_s    integer,
    volume_kg     numeric,
    sets          integer,
    prev_workouts integer,
    trained_on    date[]
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with bounds as (
    select
      p_start as from_date,
      public.review_end(p_kind, p_start) as to_date,
      case p_kind
        when 'week'  then p_start - 7
        when 'month' then (p_start - interval '1 month')::date
      end as prev_from
  ),
  per_workout as (
    select
      w.id,
      w.log_date,
      w.duration_s,
      coalesce(t.volume_kg, 0) as volume_kg,
      coalesce(t.sets, 0)      as sets
    from public.workouts w
    left join (
      select v.workout_id, sum(v.volume_kg) as volume_kg, count(*) as sets
      from public.workout_set_values v
      where v.user_id = (select auth.uid())
        and v.log_date between (select b.prev_from from bounds b) and (select b.to_date from bounds b)
      group by v.workout_id
    ) t on t.workout_id = w.id
    where w.user_id = (select auth.uid())
      and w.log_date between (select b.prev_from from bounds b) and (select b.to_date from bounds b)
  )
  select
    (count(p.id) filter (where p.log_date >= b.from_date))::integer,
    (count(distinct p.log_date) filter (where p.log_date >= b.from_date))::integer,
    coalesce(sum(p.duration_s) filter (where p.log_date >= b.from_date), 0)::integer,
    coalesce(sum(p.volume_kg) filter (where p.log_date >= b.from_date), 0),
    coalesce(sum(p.sets) filter (where p.log_date >= b.from_date), 0)::integer,
    (count(p.id) filter (where p.log_date < b.from_date))::integer,
    coalesce(
      array_agg(distinct p.log_date order by p.log_date) filter (where p.log_date >= b.from_date),
      '{}'
    )
  from bounds b
  left join per_workout p on true
  group by b.from_date;
$function$;

COMMENT ON FUNCTION public.review_workouts(text,date) IS 'One review period''s training as one row: workouts, active days, seconds, volume and sets, the workouts of the period before, and the days trained.';

GRANT ALL ON FUNCTION public.review_workouts(text, date) TO authenticated;

-- `db diff` does not carry these: a new function is executable by PUBLIC
-- until it is taken away.
revoke all on function public.review_workouts(text, date) from public, anon;
revoke all on function public.review_workout_records(text, date, integer) from public, anon;
revoke all on function public.review_workout_periods(text) from public, anon;
