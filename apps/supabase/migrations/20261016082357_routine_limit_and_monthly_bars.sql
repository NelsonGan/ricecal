-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.free_routine_limit()
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select 3;
$function$;

GRANT ALL ON FUNCTION public.free_routine_limit() TO authenticated;

GRANT ALL ON FUNCTION public.free_routine_limit() TO service_role;

CREATE FUNCTION public.workout_months()
  RETURNS TABLE (
    month      date,
    workouts   integer,
    duration_s integer,
    volume_kg  numeric,
    sets       integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with this_month as (
    select date_trunc('month', public.local_today((select auth.uid())))::date as first
  ),
  bounds as (
    select
      least(
        coalesce(
          (select date_trunc('month', min(w.log_date))::date
             from public.workouts w
            where w.user_id = (select auth.uid())),
          t.first
        ),
        (t.first - interval '11 months')::date
      ) as first,
      t.first as last
    from this_month t
  ),
  calendar as (
    select gs::date as month
    from bounds b, generate_series(b.first, b.last, interval '1 month') as gs
  ),
  per_workout as (
    select
      date_trunc('month', w.log_date)::date as month,
      w.duration_s,
      coalesce(t.volume_kg, 0) as volume_kg,
      coalesce(t.sets, 0) as sets
    from public.workouts w
    left join (
      select v.workout_id, sum(v.volume_kg) as volume_kg, count(*) as sets
      from public.workout_set_values v
      where v.user_id = (select auth.uid())
      group by v.workout_id
    ) t on t.workout_id = w.id
    where w.user_id = (select auth.uid())
  )
  select
    c.month,
    count(p.month)::integer,
    coalesce(sum(p.duration_s), 0)::integer,
    coalesce(sum(p.volume_kg), 0),
    coalesce(sum(p.sets), 0)::integer
  from calendar c
  left join per_workout p on p.month = c.month
  group by c.month
  order by c.month;
$function$;

COMMENT ON FUNCTION public.workout_months() IS 'Workouts, seconds, volume and sets per calendar month, from the first workout''s month (or eleven months back, if earlier) to this one, oldest first, empty months included.';

GRANT ALL ON FUNCTION public.workout_months() TO authenticated;

CREATE FUNCTION public.workout_routines_enforce_free_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if public.is_entitled(new.user_id) then
    return new;
  end if;

  if (
    select pg_catalog.count(*)
      from public.workout_routines r
     where r.user_id = new.user_id
  ) >= public.free_routine_limit() then
    raise exception 'routine_limit_reached'
      using errcode = 'P0001',
            hint = 'A free account may keep ' || public.free_routine_limit()
                   || ' routines. Pro removes the limit.';
  end if;

  return new;
end;
$function$;

CREATE TRIGGER workout_routines_enforce_free_limit
  BEFORE INSERT ON public.workout_routines
  FOR EACH ROW
  EXECUTE FUNCTION public.workout_routines_enforce_free_limit();

-- Hand-written: `db diff` does not carry revokes, and a function is executable
-- by PUBLIC until one says otherwise. Restated from 42_workouts.sql and
-- 96_workouts.sql.
revoke execute on function public.free_routine_limit from public, anon;
revoke execute on function public.workout_routines_enforce_free_limit from public, anon, authenticated;
revoke all on function public.workout_months() from public, anon;
