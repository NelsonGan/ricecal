-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.skip_dismissed_activity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if exists (
    select 1 from public.activity_sessions a
    where a.user_id = new.user_id and a.provider = new.provider and a.external_id = new.external_id
  ) then
    return new;
  end if;
  if exists (
    select 1 from public.activity_sessions a
    where a.user_id = new.user_id and a.provider = new.provider
      and a.started_at = new.started_at and a.kind = new.kind
      and a.source_name is not distinct from new.source_name
  ) then
    return null;
  end if;
  if private.activity_dismissed(new.user_id, new.provider, new.external_id,
                                new.started_at, new.kind, new.source_name) then
    return null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_activity_sessions (
  p_provider public.health_provider,
  p_from     timestamp with time zone,
  p_to       timestamp with time zone,
  p_sessions jsonb,
  p_user_id  uuid                     DEFAULT auth.uid()
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := auth.uid();
  v_seen text[];
  v_new record;
  v_rekeyed integer := 0;
  v_deleted integer;
  v_dismissed boolean;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- A sync can outlive sign-out, as with `replace_activity_hours`.
  if p_user_id is distinct from v_user then
    raise exception 'Health account changed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '32 days' then
    raise exception 'Invalid workout window' using errcode = '22023';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'Expected workouts' using errcode = '22023';
  end if;
  if jsonb_array_length(p_sessions) = 0 then
    return 0;
  end if;
  if jsonb_array_length(p_sessions) > 2000 then
    raise exception 'Too many workouts' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_sessions) as s(external_id text, started_at timestamptz, kind text)
    where s.external_id is null or s.external_id = '' or s.started_at is null or s.kind is null
  ) then
    raise exception 'Expected an id, a start and a kind' using errcode = '22023';
  end if;

  select array_agg(distinct s.external_id) into v_seen
  from jsonb_to_recordset(p_sessions) as s(external_id text);

  for v_new in
    select distinct s.external_id, s.started_at, s.kind, s.source_name
    from jsonb_to_recordset(p_sessions) as s(external_id text, started_at timestamptz, kind text, source_name text)
    where not exists (
      select 1 from public.activity_sessions a
      where a.user_id = v_user and a.provider = p_provider and a.external_id = s.external_id
    )
  loop
    v_dismissed := private.activity_dismissed(v_user, p_provider, v_new.external_id,
                                              v_new.started_at, v_new.kind, v_new.source_name);
    update public.activity_sessions a
       set external_id = v_new.external_id
     where a.id = (
       select o.id from public.activity_sessions o
       where o.user_id = v_user and o.provider = p_provider
         and o.started_at = v_new.started_at and o.kind = v_new.kind
         -- Overlapping the window, as the store's read does: a run across the
         -- window's first midnight is returned, and its copies must match.
         and o.started_at < p_to and o.ended_at > p_from
         and o.external_id <> all (v_seen)
         and (not v_dismissed or o.source_name is not distinct from v_new.source_name)
       order by o.created_at
       limit 1
     );
    v_rekeyed := v_rekeyed + (case when found then 1 else 0 end);
  end loop;

  delete from public.activity_sessions a
  where a.user_id = v_user and a.provider = p_provider
    and a.started_at < p_to and a.ended_at > p_from
    and a.external_id <> all (v_seen)
    and exists (
      select 1 from jsonb_to_recordset(p_sessions) as s(started_at timestamptz, kind text)
      where s.started_at = a.started_at and s.kind = a.kind
    );
  get diagnostics v_deleted = row_count;

  return v_rekeyed + v_deleted;
end;
$function$;