-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.group_update_push_targets (
  p_caller uuid
)
  RETURNS TABLE (
    token      text,
    language   text,
    actor_name text,
    group_name text,
    group_id   uuid,
    body       text
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with shared as (
    update public.group_messages m set pushed_at = now()
    where m.author_id = p_caller and m.automatic and m.pushed_at is null and not m.quarantined
      and m.created_at > now() - interval '10 minutes'
    returning m.group_id, m.body, m.created_at, coalesce(m.post_id, m.workout_id, m.activity_id) as thing
  )
  select distinct on (t.token, c.thing)
    t.token, coalesce(s.language, 'en'), coalesce(nullif(btrim(a.display_name), ''), a.handle),
    g.name, g.id, c.body
  from shared c
  join public.group_members m on m.group_id = c.group_id and m.user_id <> p_caller
    and m.notify_updates and m.chat_read_at < c.created_at
  join public.push_tokens t on t.user_id = m.user_id
  join public.groups g on g.id = c.group_id
  join public.profiles a on a.id = p_caller
  left join public.user_settings s on s.user_id = m.user_id
  where not exists (
    select 1 from public.blocked_authors x
    where (x.user_id = p_caller and x.author_id = m.user_id)
       or (x.user_id = m.user_id and x.author_id = p_caller)
  )
  order by t.token, c.thing, m.chat_read_at desc, g.id;
$function$;