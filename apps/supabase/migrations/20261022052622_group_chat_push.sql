-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.group_message_push_targets (
  p_caller uuid,
  p_id     uuid
)
  RETURNS TABLE (
    token      text,
    language   text,
    actor_name text,
    group_name text,
    group_id   uuid,
    day        date,
    body       text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_group uuid; v_day date; v_body text;
begin
  update public.group_messages m set pushed_at = now()
  where m.id = p_id and m.author_id = p_caller and m.pushed_at is null and not m.quarantined
    and m.created_at > now() - interval '10 minutes'
  returning m.group_id, m.day, m.body into v_group, v_day, v_body;
  if v_group is null then return; end if;
  return query
    select t.token, coalesce(s.language, 'en'), coalesce(nullif(btrim(a.display_name), ''), a.handle),
      g.name, g.id, v_day, v_body
    from public.group_members m
    join public.push_tokens t on t.user_id = m.user_id
    join public.groups g on g.id = m.group_id
    join public.profiles a on a.id = p_caller
    left join public.user_settings s on s.user_id = m.user_id
    where m.group_id = v_group and m.user_id <> p_caller and m.notify
      and not exists (
        select 1 from public.blocked_authors x
        where (x.user_id = p_caller and x.author_id = m.user_id)
           or (x.user_id = m.user_id and x.author_id = p_caller)
      );
end;
$function$;

GRANT ALL ON FUNCTION public.group_message_push_targets(uuid, uuid) TO service_role;

ALTER TABLE public.group_messages
  ADD COLUMN pushed_at timestamp with time zone;

-- `db diff` does not carry revokes; Postgres grants EXECUTE to PUBLIC by default.
revoke execute on function public.group_message_push_targets(uuid, uuid) from public, anon, authenticated;
