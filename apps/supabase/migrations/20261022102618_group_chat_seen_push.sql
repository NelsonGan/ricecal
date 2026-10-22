-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION private.group_chat_broadcast(p_group uuid, p_day date, p_event text, p_ids jsonb);

DROP FUNCTION public.group_message_push_targets(IN p_caller uuid, IN p_id uuid);

DROP FUNCTION public.group_messages(p_group_id uuid, p_day date);

DROP FUNCTION public.send_group_message(p_group_id uuid, p_day date, p_body text, p_request_id uuid);

DROP INDEX public.group_messages_day_idx;

ALTER TABLE public.group_messages
  DROP COLUMN day;

CREATE FUNCTION private.group_chat_broadcast (
  p_group uuid,
  p_event text,
  p_ids   jsonb
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select realtime.send(jsonb_build_object('ids', p_ids), p_event, 'group-chat:' || p_group::text, true);
$function$;

CREATE OR REPLACE FUNCTION private.group_chat_listener (
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
  if cardinality(v_parts) <> 2 or v_parts[1] <> 'group-chat'
     or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.group_is_member(v_parts[2]::uuid, (select auth.uid()));
end;
$function$;

CREATE OR REPLACE FUNCTION private.group_message_quarantined()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.group_chat_broadcast(new.group_id, 'removed', jsonb_build_array(new.id));
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.group_message_sent()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.group_chat_broadcast(new.group_id, 'message', jsonb_build_array(new.id));
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.group_messages_removed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.group_chat_broadcast(g.group_id, 'removed', jsonb_agg(g.id))
  from gone g group by g.group_id;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.group_board (
  p_group_id uuid,
  p_day      date
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := private.group_require_member(p_group_id);
  v_member public.group_members;
  v_result jsonb;
begin
  if p_day is null or p_day not between public.local_today(v_user) - 60 and public.local_today(v_user) + 1 then
    raise exception 'Day unavailable' using errcode = '22023';
  end if;
  select * into v_member from public.group_members m where m.group_id = p_group_id and m.user_id = v_user;

  with members as materialized (
    select m.user_id, m.joined_at,
      now() at time zone coalesce(p.timezone, 'Asia/Kuala_Lumpur') as local_now,
      p.timezone,
      case when m.user_id = v_user then 0
           else coalesce(array_position(v_member.board_order, m.user_id), 100) end as rank,
      b.at as breakfast_at, l.at as lunch_at, d.at as dinner_at
    from public.group_members m
    join public.profiles p on p.id = m.user_id
    left join public.meal_times b on b.user_id = m.user_id and b.meal = 'breakfast'
    left join public.meal_times l on l.user_id = m.user_id and l.meal = 'lunch'
    left join public.meal_times d on d.user_id = m.user_id and d.meal = 'dinner'
    where m.group_id = p_group_id
      and (m.user_id = v_user or not private.social_pair_blocked(m.user_id))
  ),
  entries as materialized (
    select fd.user_id, fd.id, fd.food_name, fd.kcal, fd.carbs_g, fd.protein_g, fd.fat_g,
      fd.photo_path, fd.icon_set, fd.icon_name, fd.logged_at, fd.serving_label,
      private.group_entry_meal(fd.logged_at, fd.log_date, mb.timezone, f.board_meal,
        mb.breakfast_at, mb.lunch_at, mb.dinner_at) as meal
    from members mb
    join public.food_log_details fd on fd.user_id = mb.user_id and fd.log_date = p_day
    join public.food_logs f on f.id = fd.id
  ),
  reactions as materialized (
    select r.entry_id,
      count(*) filter (where r.value = 1) as likes,
      count(*) filter (where r.value = -1) as dislikes,
      max(r.value) filter (where r.user_id = v_user) as mine
    from public.group_reactions r
    join entries e on e.id = r.entry_id
    join members mb on mb.user_id = r.user_id
    group by r.entry_id
  ),
  nudges as materialized (
    select distinct on (n.target_id, n.meal) n.target_id, n.meal, n.nudger_id
    from public.group_nudges n
    where n.group_id = p_group_id and n.day = p_day and n.created_at > now() - interval '1 hour'
    order by n.target_id, n.meal, n.created_at desc
  )
  select jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'icon_name', g.icon_name,
        'is_public', g.is_public, 'leader_id', g.leader_id, 'member_count', g.member_count)
      from public.groups g where g.id = p_group_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person', private.group_person(mb.user_id),
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id, 'meal', e.meal, 'name', e.food_name, 'kcal', e.kcal,
            'carbs_g', e.carbs_g, 'protein_g', e.protein_g, 'fat_g', e.fat_g,
            'photo_path', e.photo_path, 'icon_set', e.icon_set, 'icon_name', e.icon_name,
            'logged_at', e.logged_at, 'serving_label', e.serving_label,
            'likes', coalesce(r.likes, 0), 'dislikes', coalesce(r.dislikes, 0), 'mine', coalesce(r.mine, 0)
          ) order by e.logged_at, e.id)
          from entries e left join reactions r on r.entry_id = e.id
          where e.user_id = mb.user_id
        ), '[]'::jsonb),
        'nudges', coalesce((
          -- A nudge by someone blocked still holds the cooldown (nudgeable
          -- reads every one), but is not drawn with their face.
          select jsonb_object_agg(n.meal, jsonb_build_object('by', private.group_person(n.nudger_id)))
          from nudges n where n.target_id = mb.user_id and not private.social_pair_blocked(n.nudger_id)
        ), '{}'::jsonb),
        -- The same rule as nudge_group_member, read from what this query
        -- already holds instead of three lookups per member and meal.
        'nudgeable', case when mb.user_id = v_user then '[]'::jsonb else coalesce((
          select jsonb_agg(m.meal order by m.meal) from unnest(enum_range(null::public.group_meal)) m(meal)
          where private.group_meal_due(mb.local_now, p_day, m.meal,
              case m.meal when 'breakfast' then mb.breakfast_at when 'lunch' then mb.lunch_at else mb.dinner_at end)
            and not exists (select 1 from entries e where e.user_id = mb.user_id and e.meal = m.meal)
            and not exists (select 1 from nudges n where n.target_id = mb.user_id and n.meal = m.meal)
        ), '[]'::jsonb) end,
        'workout', (
          select jsonb_build_object('name', w.name, 'kind', w.kind, 'duration_s', w.duration_s, 'count', w.total)
          from (
            select x.name, x.kind, x.duration_s, count(*) over () as total
            from (
              select wo.name, 'strength'::text as kind, wo.duration_s, wo.started_at
              from public.workouts wo where wo.user_id = mb.user_id and wo.log_date = p_day
              union all
              -- A workout saved to Apple Health comes back as a session; the
              -- in-app one already stands for it. Apple writes no label, so the
              -- name is null there and the app names the kind itself.
              select nullif(btrim(s.kind_label), ''), s.kind, s.duration_s, s.started_at
              from public.activity_sessions s
              where s.user_id = mb.user_id and s.log_date = p_day
                and not exists (select 1 from public.workouts wo where wo.user_id = mb.user_id
                  and wo.health_workout_id = s.external_id)
            ) x
            order by x.started_at
            limit 1
          ) w
        )
      ) order by mb.rank, mb.joined_at, mb.user_id)
      from members mb
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

CREATE FUNCTION public.group_chat_summary (
  p_group_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id); v_read_at timestamptz;
begin
  select m.chat_read_at into v_read_at from public.group_members m
  where m.group_id = p_group_id and m.user_id = v_user;
  return jsonb_build_object(
    'unread', (select count(*) from (
      select 1 from public.group_messages m
      where m.group_id = p_group_id and m.created_at > v_read_at
        and m.author_id <> v_user and not m.quarantined
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      limit 100) u),
    'last', (
      select jsonb_build_object('author', private.group_person(m.author_id), 'body', m.body)
      from public.group_messages m
      where m.group_id = p_group_id and not m.quarantined
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      order by m.created_at desc limit 1
    )
  );
end;
$function$;

GRANT ALL ON FUNCTION public.group_chat_summary(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.group_chat_summary(uuid) TO service_role;

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
    and m.created_at > now() - interval '10 minutes'
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

GRANT ALL ON FUNCTION public.group_message_push_targets(uuid, uuid) TO service_role;

CREATE FUNCTION public.group_messages (
  p_group_id  uuid,
  p_before_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                     DEFAULT NULL::uuid,
  p_limit     integer                  DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'author', private.group_person(m.author_id), 'body', m.body,
      'created_at', m.created_at, 'mine', m.author_id = v_user
    ) order by m.created_at, m.id)
    from (
      select * from public.group_messages m
      where m.group_id = p_group_id and not m.quarantined
        and (p_before_at is null or (m.created_at, m.id) < (p_before_at, coalesce(p_before_id, m.id)))
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      order by m.created_at desc, m.id desc limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) m
  ), '[]'::jsonb);
end;
$function$;

GRANT ALL ON FUNCTION public.group_messages(uuid, timestamp WITH time zone, uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.group_messages(uuid, timestamp WITH time zone, uuid, integer) TO service_role;

CREATE FUNCTION public.send_group_message (
  p_group_id   uuid,
  p_body       text,
  p_request_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id); v_id uuid;
begin
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception 'Messages are 1 to 500 characters' using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception 'Request id required' using errcode = '22023';
  end if;
  select m.id into v_id from public.group_messages m where m.author_id = v_user and m.request_id = p_request_id;
  if v_id is not null then return v_id; end if;
  if not private.social_claim(v_user, 'group_message', 120) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_messages(group_id, author_id, body, request_id)
  values (p_group_id, v_user, btrim(p_body), p_request_id)
  returning id into v_id;
  update public.group_members m set chat_read_at = now()
  where m.group_id = p_group_id and m.user_id = v_user;
  return v_id;
end;
$function$;

GRANT ALL ON FUNCTION public.send_group_message(uuid, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.send_group_message(uuid, text, uuid) TO service_role;
-- `db diff` does not carry revokes; Postgres grants EXECUTE to PUBLIC by default.
revoke execute on function public.group_chat_summary(uuid), public.group_messages(uuid, timestamptz, uuid, integer),
  public.send_group_message(uuid, text, uuid) from public, anon;
revoke execute on function public.group_message_push_targets(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.group_chat_broadcast(uuid, text, jsonb) from public, anon, authenticated;
