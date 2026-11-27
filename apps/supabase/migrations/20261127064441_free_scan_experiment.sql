-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.claim_scan (
  p_user uuid
)
  RETURNS TABLE (
    allowed     boolean,
    used        integer,
    daily_limit integer,
    entitled    boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_entitled boolean := public.is_entitled(p_user);
  v_limit    integer := case
                          when v_entitled then public.pro_daily_scans()
                          else public.free_daily_scans_for(p_user)
                        end;
  v_date     date    := public.local_today(p_user);
  v_used     integer;
begin
  -- The insert itself is unguarded, and can be: the `where` below only fires
  -- on a conflict, and both ceilings are at least one, so the first scan of a
  -- day is always within whichever applies.
  insert into public.scan_usage as u (user_id, usage_date, scans)
  values (p_user, v_date, 1)
  on conflict (user_id, usage_date) do update
     set scans = u.scans + 1
   where u.scans + 1 <= v_limit
  returning u.scans into v_used;

  -- No row came back: the account already had a row today and the guard
  -- refused the increment. Read what it stands at so the caller can say how
  -- far over the line the request was.
  if v_used is null then
    select u.scans into v_used
      from public.scan_usage u
     where u.user_id = p_user and u.usage_date = v_date;
    return query select false, coalesce(v_used, 0), v_limit, v_entitled;
    return;
  end if;

  return query select true, v_used, v_limit, v_entitled;
end;
$function$;

CREATE FUNCTION public.free_daily_scans_for (
  p_user uuid
)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select case
    when public.scan_experiment_arm(p_user) = 'two' then 2
    else public.free_daily_scans()
  end;
$function$;

GRANT ALL ON FUNCTION public.free_daily_scans_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.scan_daily_limit (
  p_user uuid
)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select case
    when public.is_entitled(p_user) then public.pro_daily_scans()
    else public.free_daily_scans_for(p_user)
  end;
$function$;

CREATE FUNCTION public.scan_experiment_arm (
  p_user uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select case
    when u.created_at <  timestamptz '2026-12-01 00:00:00+08'
      or u.created_at >= timestamptz '2027-02-01 00:00:00+08'
      then null
    when right(u.id::text, 1) in ('0', '2', '4', '6', '8', 'a', 'c', 'e')
      then 'two'
    else 'control'
  end
  from auth.users u
  where u.id = p_user;
$function$;

GRANT ALL ON FUNCTION public.scan_experiment_arm(uuid) TO service_role;

CREATE FUNCTION public.scan_experiment()
  RETURNS TABLE (
    arm              text,
    free_daily_scans integer
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select
    public.scan_experiment_arm((select auth.uid())),
    public.free_daily_scans_for((select auth.uid()));
$function$;

GRANT ALL ON FUNCTION public.scan_experiment() TO authenticated;

GRANT ALL ON FUNCTION public.scan_experiment() TO service_role;
-- Hand-written: the diff emits the grants a function ends up with, not the
-- revokes that shaped them (README, "Things a diff cannot see"). The two that
-- take a uuid stay the server's alone.
revoke execute on function public.scan_experiment_arm(uuid) from public, anon, authenticated;
revoke execute on function public.free_daily_scans_for(uuid) from public, anon, authenticated;
revoke execute on function public.scan_experiment() from public, anon;
