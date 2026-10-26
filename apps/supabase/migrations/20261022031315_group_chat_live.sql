-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.group_chat_broadcast (
  p_group uuid,
  p_day   date,
  p_event text,
  p_ids   jsonb
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select realtime.send(jsonb_build_object('ids', p_ids), p_event,
    'group-chat:' || p_group::text || ':' || p_day::text, true);
$function$;

CREATE FUNCTION private.group_chat_listener (
  p_topic text
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_parts text[] := string_to_array(p_topic, ':');
begin
  if cardinality(v_parts) <> 3 or v_parts[1] <> 'group-chat'
     or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_parts[3] !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  return private.group_is_member(v_parts[2]::uuid, (select auth.uid()));
end;
$function$;

GRANT ALL ON FUNCTION private.group_chat_listener(text) TO authenticated;

GRANT ALL ON FUNCTION private.group_chat_listener(text) TO service_role;

CREATE FUNCTION private.group_message_quarantined()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.group_chat_broadcast(new.group_id, new.day, 'removed', jsonb_build_array(new.id));
  return null;
end;
$function$;

CREATE FUNCTION private.group_message_sent()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.group_chat_broadcast(new.group_id, new.day, 'message', jsonb_build_array(new.id));
  return null;
end;
$function$;

CREATE FUNCTION private.group_messages_removed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.group_chat_broadcast(g.group_id, g.day, 'removed', jsonb_agg(g.id))
  from gone g group by g.group_id, g.day;
  return null;
end;
$function$;

CREATE TRIGGER group_message_quarantined
  AFTER UPDATE OF quarantined ON public.group_messages
  FOR EACH ROW
  WHEN (new.quarantined AND NOT old.quarantined)
  EXECUTE FUNCTION private.group_message_quarantined();

CREATE TRIGGER group_message_sent
  AFTER INSERT ON public.group_messages
  FOR EACH ROW
  EXECUTE FUNCTION private.group_message_sent();

CREATE TRIGGER group_messages_removed
  AFTER DELETE ON public.group_messages REFERENCING OLD TABLE AS gone
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.group_messages_removed();

-- Hand-written: the diff emits neither the revokes that keep these functions
-- from PUBLIC nor policies on realtime.messages, which is outside the schemas
-- it compares. Both are restated from schemas/51_groups.sql.
revoke execute on function private.group_chat_broadcast, private.group_message_sent,
  private.group_messages_removed, private.group_message_quarantined from public, anon, authenticated;
revoke execute on function private.group_chat_listener from public, anon;
grant execute on function private.group_chat_listener to authenticated, service_role;

create policy "Group members hear their chat" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.group_chat_listener((select realtime.topic()))
  );
