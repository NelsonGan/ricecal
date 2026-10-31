-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.set_group_message_reaction (
  p_message_id uuid,
  p_emoji      text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false); v_group uuid; v_author uuid;
begin
  select m.group_id, m.author_id into v_group, v_author from public.group_messages m
  where m.id = p_message_id and not m.quarantined;
  if v_group is null or not private.group_is_member(v_group, v_user)
     or (v_author <> v_user and private.social_pair_blocked(v_author))
     or exists (select 1 from public.group_message_reports r where r.message_id = p_message_id and r.reporter_id = v_user) then
    raise exception 'Message unavailable' using errcode = '42501';
  end if;
  if p_emoji is null then
    delete from public.group_message_reactions r where r.message_id = p_message_id and r.user_id = v_user;
    return;
  end if;
  -- Setting the reaction already there changes nothing, so it spends nothing.
  if exists (select 1 from public.group_message_reactions r
             where r.message_id = p_message_id and r.user_id = v_user and r.emoji = p_emoji) then
    return;
  end if;
  -- Its own allowance: board thumbs (set_group_reaction) once shared this one,
  -- and an hour of them refused every emoji.
  if not private.social_claim(v_user, 'group_message_reaction', 300) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_message_reactions(message_id, user_id, emoji) values (p_message_id, v_user, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now()
  where public.group_message_reactions.emoji <> excluded.emoji;
end;
$function$;