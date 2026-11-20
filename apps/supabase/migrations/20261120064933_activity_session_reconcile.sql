-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.skip_dismissed_activity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if exists (
    select 1 from public.activity_session_dismissals d
    where d.user_id = new.user_id and d.provider = new.provider
      and (d.external_id = new.external_id
        or (d.started_at = new.started_at and d.kind = new.kind))
  ) then
    return null;
  end if;
  return new;
end;
$function$;

CREATE FUNCTION public.delete_activity_session (
  p_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := auth.uid();
  v_row public.activity_sessions;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  delete from public.activity_sessions a
  where a.id = p_id and a.user_id = v_user
  returning * into v_row;
  if not found then
    return false;
  end if;

  insert into public.activity_session_dismissals (user_id, provider, external_id, kind, started_at)
  values (v_user, v_row.provider, v_row.external_id, v_row.kind, v_row.started_at)
  on conflict (user_id, provider, external_id) do nothing;

  return true;
end;
$function$;

COMMENT ON FUNCTION public.delete_activity_session(uuid) IS 'Deletes one of the caller''s synced workouts and records it, so a later sync of the same workout, or of a copy re-saved under a new id, skips it.';

GRANT ALL ON FUNCTION public.delete_activity_session(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_activity_session(uuid) TO service_role;

CREATE FUNCTION public.reconcile_activity_sessions (
  p_provider public.health_provider,
  p_from     timestamp with time zone,
  p_to       timestamp with time zone,
  p_sessions jsonb,
  p_user_id  uuid                     DEFAULT auth.uid()
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := auth.uid();
  v_seen text[];
  v_new record;
  v_rekeyed integer := 0;
  v_deleted integer;
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
    select distinct s.external_id, s.started_at, s.kind
    from jsonb_to_recordset(p_sessions) as s(external_id text, started_at timestamptz, kind text)
    where not exists (
      select 1 from public.activity_sessions a
      where a.user_id = v_user and a.provider = p_provider and a.external_id = s.external_id
    )
  loop
    update public.activity_sessions a
       set external_id = v_new.external_id
     where a.id = (
       select o.id from public.activity_sessions o
       where o.user_id = v_user and o.provider = p_provider
         and o.started_at = v_new.started_at and o.kind = v_new.kind
         and o.started_at >= p_from and o.ended_at <= p_to
         and o.external_id <> all (v_seen)
       order by o.created_at
       limit 1
     );
    v_rekeyed := v_rekeyed + (case when found then 1 else 0 end);
  end loop;

  delete from public.activity_sessions a
  where a.user_id = v_user and a.provider = p_provider
    and a.started_at >= p_from and a.ended_at <= p_to
    and a.external_id <> all (v_seen);
  get diagnostics v_deleted = row_count;

  return v_rekeyed + v_deleted;
end;
$function$;

GRANT ALL ON FUNCTION public.reconcile_activity_sessions(public.health_provider, timestamp WITH time zone, timestamp WITH time zone, jsonb, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.reconcile_activity_sessions(public.health_provider, timestamp WITH time zone, timestamp WITH time zone, jsonb, uuid) TO service_role;

CREATE TABLE public.activity_session_dismissals (
  user_id     uuid                     NOT NULL,
  provider    public.health_provider   NOT NULL,
  external_id text                     NOT NULL,
  kind        text                     NOT NULL,
  started_at  timestamp with time zone NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.activity_session_dismissals
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.activity_session_dismissals
  ADD CONSTRAINT activity_session_dismissals_external_id_check CHECK (char_length(external_id) >= 1 AND char_length(external_id) <= 200);

ALTER TABLE public.activity_session_dismissals
  ADD CONSTRAINT activity_session_dismissals_kind_check CHECK (char_length(kind) >= 1 AND char_length(kind) <= 60);

ALTER TABLE public.activity_session_dismissals
  ADD CONSTRAINT activity_session_dismissals_pkey PRIMARY KEY (user_id, PROVIDER, external_id);

ALTER TABLE public.activity_session_dismissals
  ADD CONSTRAINT activity_session_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.activity_session_dismissals TO service_role;

CREATE INDEX activity_session_dismissals_start_idx ON public.activity_session_dismissals (user_id, PROVIDER, started_at);

CREATE POLICY "Server only" ON public.activity_session_dismissals
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE TRIGGER activity_sessions_skip_dismissed
  BEFORE INSERT ON public.activity_sessions
  FOR EACH ROW
  EXECUTE FUNCTION private.skip_dismissed_activity();
-- Hand-written: the diff emits the grants a function or table ends up with,
-- not the revokes that shaped them (README, "Things a diff cannot see").
revoke execute on function private.skip_dismissed_activity() from public, anon, authenticated;
revoke execute on function public.reconcile_activity_sessions(public.health_provider, timestamptz, timestamptz, jsonb, uuid) from public, anon;
revoke execute on function public.delete_activity_session(uuid) from public, anon;
revoke all on public.activity_session_dismissals from public, anon, authenticated;
