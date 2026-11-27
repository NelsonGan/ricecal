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
    when public.scan_experiment_arm(p_user) = 'two'
     and not exists (select 1 from public.scan_experiment_window w where w.stopped)
      then 2
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
    when w.singleton is null
      or u.created_at < w.starts_at or u.created_at >= w.ends_at
      then null
    when right(u.id::text, 1) in ('0', '2', '4', '6', '8', 'a', 'c', 'e')
      then 'two'
    else 'control'
  end
  from auth.users u
  left join public.scan_experiment_window w on true
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

CREATE TABLE public.scan_experiment_window (
  singleton  boolean                  DEFAULT true NOT NULL,
  starts_at  timestamp with time zone NOT NULL,
  ends_at    timestamp with time zone NOT NULL,
  stopped    boolean                  DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.scan_experiment_window
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scan_experiment_window
  ADD CONSTRAINT scan_experiment_window_check CHECK (ends_at > starts_at);

ALTER TABLE public.scan_experiment_window
  ADD CONSTRAINT scan_experiment_window_pkey PRIMARY KEY (singleton);

ALTER TABLE public.scan_experiment_window
  ADD CONSTRAINT scan_experiment_window_singleton_check CHECK (singleton);

GRANT ALL ON public.scan_experiment_window TO service_role;

CREATE TRIGGER scan_experiment_window_set_updated_at
  BEFORE UPDATE ON public.scan_experiment_window
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Server only" ON public.scan_experiment_window
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
-- Hand-written: the diff emits the grants an object ends up with, not the
-- revokes that shaped them (README, "Things a diff cannot see"). The window is
-- the server's alone, and so are the two functions that take a uuid.
revoke all on public.scan_experiment_window from public, anon, authenticated;
revoke execute on function public.scan_experiment_arm(uuid) from public, anon, authenticated;
revoke execute on function public.free_daily_scans_for(uuid) from public, anon, authenticated;
revoke execute on function public.scan_experiment() from public, anon;

-- Hand-written, as seed data has to be: the window opens when this migration
-- runs, on the database's own clock, and stays open for two months.
insert into public.scan_experiment_window (starts_at, ends_at)
values (now(), now() + interval '2 months')
on conflict (singleton) do nothing;
