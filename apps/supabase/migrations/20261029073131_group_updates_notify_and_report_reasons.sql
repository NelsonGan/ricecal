-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.group_members
  ADD COLUMN notify_updates boolean DEFAULT true NOT NULL;

-- Written by hand. A member who muted a group before this switch existed muted
-- everything it could push, so the new switch starts where the old one is.
UPDATE public.group_members SET notify_updates = notify;

ALTER TABLE public.group_message_reports
  ADD COLUMN reason public.report_reason;

ALTER TABLE public.group_messages
  ADD COLUMN automatic boolean DEFAULT false NOT NULL;

DROP FUNCTION public.report_group_message(p_message_id uuid);

DROP FUNCTION public.set_group_preferences(p_group_id uuid, p_board_order uuid[], p_notify boolean);

CREATE OR REPLACE FUNCTION private.group_share_activity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_body text;
begin
  begin
    if not exists (select 1 from public.profiles p where p.id = new.user_id and p.auto_post_workouts) then
      return null;
    end if;
    -- The Health copy of a logger workout: by the id the logger kept, or, for
    -- one a watch recorded before the logger heard its id, by starting and
    -- ending within a few minutes of it.
    if exists (select 1 from public.workouts w
               where w.user_id = new.user_id
                 and (w.health_workout_id = new.external_id
                   or (w.started_at between new.started_at - interval '5 minutes' and new.started_at + interval '5 minutes'
                       and w.ended_at between new.ended_at - interval '5 minutes' and new.ended_at + interval '5 minutes'))) then
      return null;
    end if;
    v_body := private.group_workout_label(private.group_activity(new.id));
    if v_body is null then return null; end if;
    insert into public.group_messages(group_id, author_id, body, request_id, activity_id, automatic)
    select m.group_id, new.user_id, v_body,
      md5('activity:' || new.id::text || ':' || m.group_id::text)::uuid, new.id, true
    from public.group_members m
    where m.user_id = new.user_id
    on conflict (author_id, request_id) do nothing;
exception when others then
    -- Sharing is a courtesy; the meal, workout or sync it rides on is not.
    -- A failure here is logged and the write goes ahead without it.
    raise warning 'group chat share skipped: %', sqlerrm;
  end;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.group_share_posted_food()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_body text;
begin
  begin
    v_body := private.group_food_label(new.id);
    if v_body is null then return null; end if;
    insert into public.group_messages(group_id, author_id, body, request_id, post_id, automatic)
    select m.group_id, new.author_id, v_body,
      md5(new.id::text || ':' || m.group_id::text)::uuid, new.id, true
    from public.group_members m
    where m.user_id = new.author_id
    on conflict (author_id, request_id) do nothing;
exception when others then
    -- Sharing is a courtesy; the meal, workout or sync it rides on is not.
    -- A failure here is logged and the write goes ahead without it.
    raise warning 'group chat share skipped: %', sqlerrm;
  end;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.group_share_workout()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_body text;
begin
  begin
    if not exists (select 1 from public.profiles p where p.id = new.user_id and p.auto_post_workouts) then
      return null;
    end if;
    v_body := private.group_workout_label(private.group_workout(new.id));
    if v_body is null then return null; end if;
    insert into public.group_messages(group_id, author_id, body, request_id, workout_id, automatic)
    select m.group_id, new.user_id, v_body,
      md5('workout:' || new.id::text || ':' || m.group_id::text)::uuid, new.id, true
    from public.group_members m
    where m.user_id = new.user_id
    on conflict (author_id, request_id) do nothing;
exception when others then
    -- Sharing is a courtesy; the meal, workout or sync it rides on is not.
    -- A failure here is logged and the write goes ahead without it.
    raise warning 'group chat share skipped: %', sqlerrm;
  end;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.group_details (
  p_group_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id); v_member public.group_members;
begin
  select * into v_member from public.group_members m where m.group_id = p_group_id and m.user_id = v_user;
  return (
    select jsonb_build_object(
      'id', g.id, 'name', g.name, 'icon_name', g.icon_name, 'icon_path', g.icon_path,
      'is_public', g.is_public, 'leader_id', g.leader_id, 'notify', v_member.notify,
      'notify_updates', v_member.notify_updates,
      'members', (
        select jsonb_agg(private.group_person(m.user_id) order by
          m.user_id <> v_user, private.group_last_active(m.user_id) desc nulls last, m.joined_at, m.user_id)
        from public.group_members m
        where m.group_id = p_group_id and (m.user_id = v_user or not private.social_pair_blocked(m.user_id))
      ),
      'invites', coalesce((
        select jsonb_agg(private.group_person(i.invitee_id) order by i.created_at desc)
        from public.group_invites i
        where i.group_id = p_group_id and i.inviter_id = v_user and not i.by_email
      ), '[]'::jsonb)
    )
    from public.groups g where g.id = p_group_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.group_message_push_targets (
  p_caller uuid,
  p_id     uuid
)
  RETURNS TABLE (
    token      text,
    language   text,
    actor_name text,
    group_name text,
    group_id   uuid,
    body       text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_group uuid; v_body text; v_sent_at timestamptz;
begin
  update public.group_messages m set pushed_at = now()
  where m.id = p_id and m.author_id = p_caller and m.pushed_at is null and not m.quarantined
    and not m.automatic and m.created_at > now() - interval '10 minutes'
  returning m.group_id, m.body, m.created_at into v_group, v_body, v_sent_at;
  if v_group is null then return; end if;
  return query
    select t.token, coalesce(s.language, 'en'), coalesce(nullif(btrim(a.display_name), ''), a.handle),
      g.name, g.id, v_body
    from public.group_members m
    join public.push_tokens t on t.user_id = m.user_id
    join public.groups g on g.id = m.group_id
    join public.profiles a on a.id = p_caller
    left join public.user_settings s on s.user_id = m.user_id
    where m.group_id = v_group and m.user_id <> p_caller and m.notify
      and m.chat_read_at < v_sent_at
      and not exists (
        select 1 from public.blocked_authors x
        where (x.user_id = p_caller and x.author_id = m.user_id)
           or (x.user_id = m.user_id and x.author_id = p_caller)
      );
end;
$function$;

CREATE FUNCTION public.group_update_push_targets (
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
    returning m.group_id, m.body, m.created_at
  )
  select t.token, coalesce(s.language, 'en'), coalesce(nullif(btrim(a.display_name), ''), a.handle),
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
  );
$function$;

GRANT ALL ON FUNCTION public.group_update_push_targets(uuid) TO service_role;

CREATE FUNCTION public.report_group_message (
  p_message_id uuid,
  p_reason     public.report_reason DEFAULT NULL::public.report_reason
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false); v_group uuid;
begin
  select m.group_id into v_group from public.group_messages m
  where m.id = p_message_id and m.author_id <> v_user;
  if v_group is null or not private.group_is_member(v_group, v_user) then
    raise exception 'Message unavailable' using errcode = '42501';
  end if;
  if not private.social_claim(v_user, 'report', 30) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_message_reports(message_id, reporter_id, reason)
  values (p_message_id, v_user, p_reason)
  on conflict do nothing;
  update public.group_messages m set quarantined = true
  where m.id = p_message_id
    and (select count(*) from public.group_message_reports r where r.message_id = p_message_id) >= 3;
end;
$function$;

GRANT ALL ON FUNCTION public.report_group_message(uuid, public.report_reason) TO authenticated;

GRANT ALL ON FUNCTION public.report_group_message(uuid, public.report_reason) TO service_role;

CREATE FUNCTION public.set_group_preferences (
  p_group_id       uuid,
  p_board_order    uuid[],
  p_notify         boolean,
  p_notify_updates boolean DEFAULT NULL::boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id);
begin
  if p_board_order is not null and cardinality(p_board_order) > 20 then
    raise exception 'Too many members' using errcode = '22023';
  end if;
  update public.group_members m set
    board_order = coalesce(p_board_order, m.board_order),
    notify = coalesce(p_notify, m.notify),
    notify_updates = coalesce(p_notify_updates, p_notify, m.notify_updates)
  where m.group_id = p_group_id and m.user_id = v_user;
end;
$function$;

GRANT ALL ON FUNCTION public.set_group_preferences(uuid, uuid[], boolean, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.set_group_preferences(uuid, uuid[], boolean, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.report_group_message(uuid, public.report_reason) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_group_preferences(uuid, uuid[], boolean, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.group_update_push_targets(uuid) FROM PUBLIC, anon, authenticated;
