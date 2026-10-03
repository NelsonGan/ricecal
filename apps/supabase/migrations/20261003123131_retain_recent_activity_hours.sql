-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.prune_activity_hours (
  p_asof  timestamp with time zone DEFAULT now(),
  p_limit integer                  DEFAULT 1000
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_before date := (least(p_asof, now()) at time zone 'UTC')::date - 31;
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 1000);
  v_pruned integer;
begin
  with expired as (
    select user_id, log_date, hour from public.activity_hours
    where log_date < v_before
    order by log_date
    limit v_limit
    for update skip locked
  ), deleted as (
    delete from public.activity_hours as stored using expired
    where stored.user_id = expired.user_id
      and stored.log_date = expired.log_date and stored.hour = expired.hour
    returning 1
  )
  select count(*)::integer into v_pruned from deleted;

  return jsonb_build_object(
    'pruned', v_pruned, 'before', v_before,
    'remaining', exists (select 1 from public.activity_hours where log_date < v_before)
  );
end;
$function$;

-- db diff does not emit the revokes that remove CREATE FUNCTION's PUBLIC grant.
REVOKE EXECUTE ON FUNCTION public.prune_activity_hours(timestamp WITH time zone, integer) FROM public, anon, authenticated;
GRANT ALL ON FUNCTION public.prune_activity_hours(timestamp WITH time zone, integer) TO service_role;

CREATE FUNCTION public.replace_activity_hours (
  p_from    date,
  p_to      date,
  p_hours   jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid  DEFAULT auth.uid()
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := auth.uid();
  v_deleted integer;
  v_written integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- A sync can outlive sign-out. The captured account must still be the one
  -- sending this request, including an empty replacement that only deletes.
  if p_user_id is distinct from v_user then
    raise exception 'Health account changed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'Invalid hourly window' using errcode = '22023';
  end if;
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' then
    raise exception 'Expected hourly readings' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_hours) as h(log_date date)
    where h.log_date is null or h.log_date < p_from or h.log_date > p_to
  ) then
    raise exception 'Hourly reading outside window' using errcode = '22023';
  end if;

  delete from public.activity_hours as stored
  where stored.user_id = v_user and stored.log_date between p_from and p_to
    and not exists (
      select 1 from jsonb_to_recordset(p_hours) as h(log_date date, hour smallint)
      where h.log_date = stored.log_date and h.hour = stored.hour
    );
  get diagnostics v_deleted = row_count;

  insert into public.activity_hours as stored
    (user_id, log_date, hour, steps, active_kcal, distance_m)
  select v_user, h.log_date, h.hour, coalesce(h.steps, 0), coalesce(h.active_kcal, 0), h.distance_m
  from jsonb_to_recordset(p_hours) as h(
    log_date date, hour smallint, steps integer, active_kcal integer, distance_m integer
  )
  on conflict (user_id, log_date, hour) do update set
    steps = excluded.steps,
    active_kcal = excluded.active_kcal,
    distance_m = excluded.distance_m
  where (stored.steps, stored.active_kcal, stored.distance_m)
    is distinct from (excluded.steps, excluded.active_kcal, excluded.distance_m);
  get diagnostics v_written = row_count;

  return v_deleted + v_written;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.replace_activity_hours(date, date, jsonb, uuid) FROM public, anon;
GRANT ALL ON FUNCTION public.replace_activity_hours(date, date, jsonb, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.replace_activity_hours(date, date, jsonb, uuid) TO service_role;

CREATE INDEX activity_hours_log_date_idx ON public.activity_hours (log_date);
