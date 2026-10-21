-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.group_block_after()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from public.group_invites i
  where (i.invitee_id = new.user_id and i.inviter_id = new.author_id)
     or (i.invitee_id = new.author_id and i.inviter_id = new.user_id);
  return null;
end;
$function$;

CREATE FUNCTION private.group_is_member (
  p_group uuid,
  p_user  uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_user);
$function$;

GRANT ALL ON FUNCTION private.group_is_member(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION private.group_is_member(uuid, uuid) TO service_role;

CREATE FUNCTION private.group_member_joined()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from public.group_invites i where i.group_id = new.group_id and i.invitee_id = new.user_id;
  if (select count(*) from public.group_members m where m.group_id = new.group_id) >= 10 then
    delete from public.group_invites i where i.group_id = new.group_id;
  end if;
  return null;
end;
$function$;

CREATE FUNCTION private.group_member_joining()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform 1 from public.groups g where g.id = new.group_id for update;
  if (select count(*) from public.group_members m where m.group_id = new.group_id) >= 10 then
    raise exception 'This group is full' using errcode = 'P0001', hint = 'group_full';
  end if;
  if (select count(*) from public.group_members m where m.user_id = new.user_id) >= 20 then
    raise exception 'You are in too many groups' using errcode = 'P0001', hint = 'too_many_groups';
  end if;
  return new;
end;
$function$;

CREATE FUNCTION private.group_member_left()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_next uuid;
begin
  if not exists (select 1 from public.groups g where g.id = old.group_id) then return null; end if;
  select m.user_id into v_next from public.group_members m
  where m.group_id = old.group_id order by m.joined_at, m.user_id limit 1;
  if v_next is null then
    delete from public.groups g where g.id = old.group_id;
  else
    update public.groups g set leader_id = v_next, updated_at = now()
    where g.id = old.group_id and (g.leader_id is null or g.leader_id = old.user_id);
  end if;
  return null;
end;
$function$;

CREATE FUNCTION private.group_person (
  p_user uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'id', p.id,
    'name', coalesce(nullif(btrim(p.display_name), ''), p.handle),
    'handle', p.handle,
    'avatar_path', case when p.review_status = 'approved' and not p.quarantined then p.avatar_path end
  ) from public.profiles p where p.id = p_user;
$function$;

GRANT ALL ON FUNCTION private.group_person(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.group_person(uuid) TO service_role;

CREATE FUNCTION private.group_photo_claims (
  p_keys text[]
)
  RETURNS TABLE (
    owner_id   uuid,
    photo_path text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select f.user_id, f.photo_path
  from unnest(p_keys) k(key)
  join public.food_logs f on f.photo_path = k.key
  where f.user_id <> (select auth.uid())
    and f.log_date >= public.local_today((select auth.uid())) - 60
    and private.group_share((select auth.uid()), f.user_id)
    and not private.social_pair_blocked(f.user_id);
$function$;

GRANT ALL ON FUNCTION private.group_photo_claims(text[]) TO authenticated;

GRANT ALL ON FUNCTION private.group_photo_claims(text[]) TO service_role;

CREATE FUNCTION private.group_require_member (
  p_group uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or not private.group_is_member(p_group, v_user) then
    raise exception 'Group unavailable' using errcode = '42501';
  end if;
  return v_user;
end;
$function$;

GRANT ALL ON FUNCTION private.group_require_member(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.group_require_member(uuid) TO service_role;

CREATE FUNCTION private.group_share (
  p_a uuid,
  p_b uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = p_a and b.user_id = p_b
  );
$function$;

GRANT ALL ON FUNCTION private.group_share(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION private.group_share(uuid, uuid) TO service_role;

CREATE TYPE public.group_meal AS ENUM (
  'breakfast',
  'lunch',
  'dinner'
);

CREATE FUNCTION private.group_entry_meal (
  p_logged_at timestamp with time zone,
  p_log_date  date,
  p_timezone  text,
  p_override  public.group_meal,
  p_breakfast time without time zone,
  p_lunch     time without time zone,
  p_dinner    time without time zone
)
  RETURNS public.group_meal
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_local timestamp := p_logged_at at time zone coalesce(p_timezone, 'Asia/Kuala_Lumpur');
  v_minutes integer := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  v_b integer := extract(epoch from coalesce(p_breakfast, time '08:00'))::integer / 60;
  v_l integer := extract(epoch from coalesce(p_lunch, time '13:00'))::integer / 60;
  v_d integer := extract(epoch from coalesce(p_dinner, time '19:30'))::integer / 60;
begin
  if p_override is not null then return p_override; end if;
  if v_local::date > p_log_date or v_minutes < 240 then return 'dinner'; end if;
  if v_local::date < p_log_date then return 'breakfast'; end if;
  if v_minutes < (v_b + v_l) / 2 then return 'breakfast'; end if;
  if v_minutes < (v_l + v_d) / 2 then return 'lunch'; end if;
  return 'dinner';
end;
$function$;

CREATE FUNCTION private.group_nudge_state (
  p_group  uuid,
  p_target uuid,
  p_day    date,
  p_meal   public.group_meal
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_tz text;
  v_now timestamp;
  v_at time;
begin
  select p.timezone into v_tz from public.profiles p where p.id = p_target;
  v_now := now() at time zone coalesce(v_tz, 'Asia/Kuala_Lumpur');
  if v_now::date <> p_day then return 'closed'; end if;
  select mt.at into v_at from public.meal_times mt where mt.user_id = p_target and mt.meal::text = p_meal::text;
  if v_now::time < coalesce(v_at, case p_meal when 'breakfast' then time '08:00'
       when 'lunch' then time '13:00' else time '19:30' end) + interval '30 minutes' then
    return 'early';
  end if;
  if exists (
    select 1 from public.food_logs f
    left join public.meal_times b on b.user_id = f.user_id and b.meal = 'breakfast'
    left join public.meal_times l on l.user_id = f.user_id and l.meal = 'lunch'
    left join public.meal_times d on d.user_id = f.user_id and d.meal = 'dinner'
    where f.user_id = p_target and f.log_date = p_day
      and private.group_entry_meal(f.logged_at, f.log_date, v_tz, f.board_meal, b.at, l.at, d.at) = p_meal
  ) then
    return 'logged';
  end if;
  if exists (
    select 1 from public.group_nudges n
    where n.group_id = p_group and n.target_id = p_target and n.day = p_day and n.meal = p_meal
      and n.created_at > now() - interval '1 hour'
  ) then
    return 'cooling';
  end if;
  return 'open';
end;
$function$;

CREATE FUNCTION public.create_group (
  p_name      text,
  p_icon_name text,
  p_is_public boolean
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false); v_group uuid;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'Name the group' using errcode = '22023';
  end if;
  if not private.social_claim(v_user, 'group_create', 10) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.groups(name, icon_name, is_public, leader_id)
  values (btrim(p_name), coalesce(nullif(p_icon_name, ''), 'rice-bowl'), coalesce(p_is_public, false), v_user)
  returning id into v_group;
  insert into public.group_members(group_id, user_id) values (v_group, v_user);
  return v_group;
end;
$function$;

GRANT ALL ON FUNCTION public.create_group(text, text, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.create_group(text, text, boolean) TO service_role;

CREATE FUNCTION public.delete_group_message (
  p_message_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from public.group_messages m where m.id = p_message_id and m.author_id = (select auth.uid());
end;
$function$;

GRANT ALL ON FUNCTION public.delete_group_message(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_group_message(uuid) TO service_role;

CREATE FUNCTION public.forget_push_tokens (
  p_tokens text[]
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  delete from public.push_tokens t where t.token = any(p_tokens);
$function$;

GRANT ALL ON FUNCTION public.forget_push_tokens(text[]) TO service_role;

CREATE FUNCTION public.group_board (
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
  if p_day is null then raise exception 'Day required' using errcode = '22023'; end if;
  select * into v_member from public.group_members m where m.group_id = p_group_id and m.user_id = v_user;

  with members as materialized (
    select m.user_id, m.joined_at, p.timezone,
      case when m.user_id = v_user then 0
           else coalesce(array_position(v_member.board_order, m.user_id), 100) end as rank
    from public.group_members m join public.profiles p on p.id = m.user_id
    where m.group_id = p_group_id
  ),
  entries as materialized (
    select d.user_id, d.id, d.food_name, d.kcal, d.carbs_g, d.protein_g, d.fat_g,
      d.photo_path, d.icon_set, d.icon_name, d.logged_at, d.serving_label, d.quantity,
      f.board_meal is not null as moved,
      private.group_entry_meal(d.logged_at, d.log_date, mb.timezone, f.board_meal, b.at, l.at, dn.at) as meal
    from members mb
    join public.food_log_details d on d.user_id = mb.user_id and d.log_date = p_day
    join public.food_logs f on f.id = d.id
    left join public.meal_times b on b.user_id = mb.user_id and b.meal = 'breakfast'
    left join public.meal_times l on l.user_id = mb.user_id and l.meal = 'lunch'
    left join public.meal_times dn on dn.user_id = mb.user_id and dn.meal = 'dinner'
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
  )
  select jsonb_build_object(
    'group', (select jsonb_build_object('id', g.id, 'name', g.name, 'icon_name', g.icon_name,
        'is_public', g.is_public, 'leader_id', g.leader_id, 'member_count', (select count(*) from members))
      from public.groups g where g.id = p_group_id),
    'day', p_day,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person', private.group_person(mb.user_id),
        'today', (now() at time zone coalesce(mb.timezone, 'Asia/Kuala_Lumpur'))::date,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id, 'meal', e.meal, 'name', e.food_name, 'kcal', e.kcal,
            'carbs_g', e.carbs_g, 'protein_g', e.protein_g, 'fat_g', e.fat_g,
            'photo_path', e.photo_path, 'icon_set', e.icon_set, 'icon_name', e.icon_name,
            'logged_at', e.logged_at, 'serving_label', e.serving_label, 'quantity', e.quantity,
            'moved', e.moved,
            'likes', coalesce(r.likes, 0), 'dislikes', coalesce(r.dislikes, 0), 'mine', coalesce(r.mine, 0)
          ) order by e.logged_at, e.id)
          from entries e left join reactions r on r.entry_id = e.id
          where e.user_id = mb.user_id
        ), '[]'::jsonb),
        'nudges', coalesce((
          select jsonb_object_agg(meal, jsonb_build_object(
            'by', private.group_person(n.nudger_id), 'at', n.created_at))
          from (
            select distinct on (n.meal) n.meal, n.nudger_id, n.created_at
            from public.group_nudges n
            where n.group_id = p_group_id and n.target_id = mb.user_id and n.day = p_day
              and n.created_at > now() - interval '1 hour'
            order by n.meal, n.created_at desc
          ) n
        ), '{}'::jsonb),
        'nudgeable', case when mb.user_id = v_user then '[]'::jsonb else coalesce((
          select jsonb_agg(m.meal) from unnest(enum_range(null::public.group_meal)) m(meal)
          where private.group_nudge_state(p_group_id, mb.user_id, p_day, m.meal) = 'open'
        ), '[]'::jsonb) end,
        'workout', (
          select jsonb_build_object('name', w.name, 'kind', w.kind, 'duration_s', w.duration_s,
            'distance_m', w.distance_m, 'count', w.total)
          from (
            select x.name, x.kind, x.duration_s, x.distance_m, count(*) over () as total
            from (
              select wo.name, 'strength'::text as kind, wo.duration_s, null::integer as distance_m, wo.started_at
              from public.workouts wo where wo.user_id = mb.user_id and wo.log_date = p_day
              union all
              -- A workout saved to Apple Health comes back as a session; the
              -- in-app one already stands for it.
              select coalesce(s.kind_label, s.kind), s.kind, s.duration_s, s.distance_m, s.started_at
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
    ), '[]'::jsonb),
    'chat', (
      select jsonb_build_object(
        'count', count(*),
        'unread', count(*) filter (where m.author_id <> v_user and m.created_at > v_member.chat_read_at),
        'last', (
          select jsonb_build_object('author', private.group_person(l.author_id), 'body', l.body, 'at', l.created_at)
          from public.group_messages l
          where l.group_id = p_group_id and l.day = p_day and not l.quarantined
            and not private.social_pair_blocked(l.author_id)
            and not exists (select 1 from public.group_message_reports r where r.message_id = l.id and r.reporter_id = v_user)
          order by l.created_at desc limit 1
        )
      )
      from public.group_messages m
      where m.group_id = p_group_id and m.day = p_day and not m.quarantined
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
    )
  ) into v_result;
  return v_result;
end;
$function$;

GRANT ALL ON FUNCTION public.group_board(uuid, date) TO authenticated;

GRANT ALL ON FUNCTION public.group_board(uuid, date) TO service_role;

CREATE FUNCTION public.group_details (
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
      'id', g.id, 'name', g.name, 'icon_name', g.icon_name, 'is_public', g.is_public,
      'leader_id', g.leader_id, 'notify', v_member.notify,
      'members', (
        select jsonb_agg(private.group_person(m.user_id) order by
          m.user_id <> v_user, coalesce(array_position(v_member.board_order, m.user_id), 100), m.joined_at, m.user_id)
        from public.group_members m where m.group_id = p_group_id
      ),
      'invites', coalesce((
        select jsonb_agg(jsonb_build_object('person', private.group_person(i.invitee_id), 'created_at', i.created_at)
          order by i.created_at desc)
        from public.group_invites i where i.group_id = p_group_id
      ), '[]'::jsonb)
    )
    from public.groups g where g.id = p_group_id
  );
end;
$function$;

GRANT ALL ON FUNCTION public.group_details(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.group_details(uuid) TO service_role;

CREATE FUNCTION public.group_invite_count()
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select count(*)::integer from public.group_invites i
  where i.invitee_id = (select auth.uid()) and not private.social_pair_blocked(i.inviter_id);
$function$;

GRANT ALL ON FUNCTION public.group_invite_count() TO authenticated;

GRANT ALL ON FUNCTION public.group_invite_count() TO service_role;

CREATE FUNCTION public.group_messages (
  p_group_id uuid,
  p_day      date
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
      where m.group_id = p_group_id and m.day = p_day and not m.quarantined
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      order by m.created_at desc limit 200
    ) m
  ), '[]'::jsonb);
end;
$function$;

GRANT ALL ON FUNCTION public.group_messages(uuid, date) TO authenticated;

GRANT ALL ON FUNCTION public.group_messages(uuid, date) TO service_role;

CREATE FUNCTION public.group_push_targets (
  p_caller uuid,
  p_kind   text,
  p_id     uuid
)
  RETURNS TABLE (
    token      text,
    language   text,
    actor_name text,
    group_name text,
    group_id   uuid,
    day        date,
    meal       public.group_meal
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_recipient uuid; v_group uuid; v_day date; v_meal public.group_meal;
begin
  if p_kind = 'nudge' then
    update public.group_nudges n set pushed_at = now()
    where n.id = p_id and n.nudger_id = p_caller and n.pushed_at is null
      and n.created_at > now() - interval '10 minutes'
    returning n.target_id, n.group_id, n.day, n.meal into v_recipient, v_group, v_day, v_meal;
  elsif p_kind = 'invite' then
    update public.group_invites i set pushed_at = now()
    where i.id = p_id and i.inviter_id = p_caller and i.pushed_at is null
      and i.created_at > now() - interval '10 minutes'
    returning i.invitee_id, i.group_id into v_recipient, v_group;
  else
    raise exception 'Unknown kind' using errcode = '22023';
  end if;
  if v_recipient is null then return; end if;
  -- A member who muted the group hears no nudges from it. Invites always
  -- arrive, since the invitee is not a member yet.
  if p_kind = 'nudge' and not exists (
    select 1 from public.group_members m where m.group_id = v_group and m.user_id = v_recipient and m.notify
  ) then
    return;
  end if;
  return query
    select t.token, coalesce(s.language, 'en'), coalesce(nullif(btrim(a.display_name), ''), a.handle),
      g.name, g.id, v_day, v_meal
    from public.push_tokens t
    join public.groups g on g.id = v_group
    join public.profiles a on a.id = p_caller
    left join public.user_settings s on s.user_id = v_recipient
    where t.user_id = v_recipient;
end;
$function$;

GRANT ALL ON FUNCTION public.group_push_targets(uuid, text, uuid) TO service_role;

CREATE FUNCTION public.invite_to_group (
  p_group_id uuid,
  p_target   text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := private.group_require_member(p_group_id);
  v_target text := lower(btrim(coalesce(p_target, '')));
  v_invitee uuid;
  v_id uuid;
begin
  if v_target = '' or char_length(v_target) > 254 then
    raise exception 'Enter a username or email' using errcode = '22023';
  end if;
  if not private.social_claim(v_user, 'group_invite', 60) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if position('@' in ltrim(v_target, '@')) > 0 then
    select u.id into v_invitee from auth.users u where lower(u.email) = v_target limit 1;
  else
    select p.id into v_invitee from public.profiles p where p.handle = ltrim(v_target, '@');
  end if;
  -- Someone blocked in either direction reads as nobody, so an invite cannot be
  -- used to learn who blocked whom.
  if v_invitee is null or v_invitee = v_user or private.social_pair_blocked(v_invitee)
     or exists (select 1 from public.profiles p where p.id = v_invitee and p.quarantined) then
    raise exception 'No account found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if private.group_is_member(p_group_id, v_invitee) then
    raise exception 'Already in this group' using errcode = 'P0001', hint = 'already_member';
  end if;
  if (select count(*) from public.group_members m where m.group_id = p_group_id) >= 10 then
    raise exception 'This group is full' using errcode = 'P0001', hint = 'group_full';
  end if;
  insert into public.group_invites(group_id, invitee_id, inviter_id)
  values (p_group_id, v_invitee, v_user)
  on conflict (group_id, invitee_id) do update
    set inviter_id = excluded.inviter_id, created_at = now(), pushed_at = null
    -- A pending invite is renewed at most hourly, which also caps its pushes.
    where public.group_invites.created_at < now() - interval '1 hour'
  returning id into v_id;
  return v_id;
end;
$function$;

GRANT ALL ON FUNCTION public.invite_to_group(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.invite_to_group(uuid, text) TO service_role;

CREATE FUNCTION public.join_group (
  p_group_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.is_public)
     and not exists (select 1 from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user) then
    raise exception 'This group is invite only' using errcode = '42501';
  end if;
  insert into public.group_members(group_id, user_id) values (p_group_id, v_user)
  on conflict do nothing;
end;
$function$;

GRANT ALL ON FUNCTION public.join_group(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.join_group(uuid) TO service_role;

CREATE FUNCTION public.leave_group (
  p_group_id   uuid,
  p_new_leader uuid DEFAULT NULL::uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id);
begin
  perform 1 from public.groups g where g.id = p_group_id for update;
  if exists (select 1 from public.groups g where g.id = p_group_id and g.leader_id = v_user)
     and exists (select 1 from public.group_members m where m.group_id = p_group_id and m.user_id <> v_user) then
    if p_new_leader is null or p_new_leader = v_user or not private.group_is_member(p_group_id, p_new_leader) then
      raise exception 'Choose a new leader' using errcode = 'P0001', hint = 'choose_leader';
    end if;
    update public.groups g set leader_id = p_new_leader, updated_at = now() where g.id = p_group_id;
  end if;
  delete from public.group_members m where m.group_id = p_group_id and m.user_id = v_user;
end;
$function$;

GRANT ALL ON FUNCTION public.leave_group(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.leave_group(uuid, uuid) TO service_role;

CREATE FUNCTION public.mark_group_chat_read (
  p_group_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.group_members m set chat_read_at = now()
  where m.group_id = p_group_id and m.user_id = (select auth.uid());
end;
$function$;

GRANT ALL ON FUNCTION public.mark_group_chat_read(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.mark_group_chat_read(uuid) TO service_role;

CREATE FUNCTION public.my_group_invites()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Sign in to continue' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'group_id', g.id, 'name', g.name, 'icon_name', g.icon_name, 'is_public', g.is_public,
      'member_count', (select count(*) from public.group_members x where x.group_id = g.id),
      'inviter', private.group_person(i.inviter_id), 'created_at', i.created_at
    ) order by i.created_at desc)
    from public.group_invites i join public.groups g on g.id = i.group_id
    where i.invitee_id = v_user and not private.social_pair_blocked(i.inviter_id)
  ), '[]'::jsonb);
end;
$function$;

GRANT ALL ON FUNCTION public.my_group_invites() TO authenticated;

GRANT ALL ON FUNCTION public.my_group_invites() TO service_role;

CREATE FUNCTION public.my_groups()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Sign in to continue' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'icon_name', g.icon_name, 'is_public', g.is_public,
      'is_leader', g.leader_id = v_user,
      'member_count', (select count(*) from public.group_members x where x.group_id = g.id),
      'logged_today', (
        select count(*) from public.group_members x
        where x.group_id = g.id and exists (
          select 1 from public.food_logs f
          where f.user_id = x.user_id and f.log_date = public.local_today(x.user_id))
      ),
      'members', (
        select coalesce(jsonb_agg(private.group_person(x.user_id) order by x.user_id = v_user desc, x.joined_at), '[]')
        from (select * from public.group_members x where x.group_id = g.id order by x.joined_at limit 5) x
      )
    ) order by m.joined_at desc)
    from public.group_members m join public.groups g on g.id = m.group_id
    where m.user_id = v_user
  ), '[]'::jsonb);
end;
$function$;

GRANT ALL ON FUNCTION public.my_groups() TO authenticated;

GRANT ALL ON FUNCTION public.my_groups() TO service_role;

CREATE FUNCTION public.nudge_group_member (
  p_group_id  uuid,
  p_target_id uuid,
  p_day       date,
  p_meal      public.group_meal
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id); v_id uuid;
begin
  if p_target_id = v_user or not private.group_is_member(p_group_id, p_target_id) then
    raise exception 'Member unavailable' using errcode = '42501';
  end if;
  -- Serialise nudges at one person's meal, so two friends tapping together
  -- send one.
  perform pg_advisory_xact_lock(hashtextextended(
    'group-nudge:' || p_group_id::text || p_target_id::text || p_day::text || p_meal::text, 0));
  if private.group_nudge_state(p_group_id, p_target_id, p_day, p_meal) <> 'open' then
    raise exception 'Nudged recently' using errcode = 'P0001', hint = 'nudge_closed';
  end if;
  if not private.social_claim(v_user, 'group_nudge', 30) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_nudges(group_id, target_id, nudger_id, day, meal)
  values (p_group_id, p_target_id, v_user, p_day, p_meal) returning id into v_id;
  return v_id;
end;
$function$;

GRANT ALL ON FUNCTION public.nudge_group_member(uuid, uuid, date, public.group_meal) TO authenticated;

GRANT ALL ON FUNCTION public.nudge_group_member(uuid, uuid, date, public.group_meal) TO service_role;

CREATE FUNCTION public.public_groups (
  p_query text    DEFAULT NULL::text,
  p_limit integer DEFAULT 20
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := (select auth.uid());
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if v_user is null then raise exception 'Sign in to continue' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Limit must be between 1 and 50' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(r)::jsonb order by r.member_count desc, r.created_at desc)
    from (
      select g.id, g.name, g.icon_name, g.created_at,
        (select count(*) from public.group_members x where x.group_id = g.id) as member_count
      from public.groups g
      where g.is_public
        and not private.group_is_member(g.id, v_user)
        and (v_query is null or g.name ilike '%' || replace(replace(v_query, '%', ''), '_', '') || '%')
      order by member_count desc, g.created_at desc
      limit p_limit
    ) r
  ), '[]'::jsonb);
end;
$function$;

GRANT ALL ON FUNCTION public.public_groups(text, integer) TO authenticated;

GRANT ALL ON FUNCTION public.public_groups(text, integer) TO service_role;

CREATE FUNCTION public.register_push_token (
  p_token    text,
  p_platform text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  if p_token is null or char_length(p_token) not between 10 and 200 or p_platform not in ('ios', 'android') then
    raise exception 'Invalid push token' using errcode = '22023';
  end if;
  insert into public.push_tokens(token, user_id, platform) values (p_token, v_user, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$function$;

GRANT ALL ON FUNCTION public.register_push_token(text, text) TO authenticated;

GRANT ALL ON FUNCTION public.register_push_token(text, text) TO service_role;

CREATE FUNCTION public.remove_group_member (
  p_group_id uuid,
  p_user_id  uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id);
begin
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.leader_id = v_user) then
    raise exception 'Only the leader can remove members' using errcode = '42501';
  end if;
  if p_user_id = v_user then
    raise exception 'Leave the group instead' using errcode = '22023';
  end if;
  delete from public.group_members m where m.group_id = p_group_id and m.user_id = p_user_id;
end;
$function$;

GRANT ALL ON FUNCTION public.remove_group_member(uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.remove_group_member(uuid, uuid) TO service_role;

CREATE FUNCTION public.report_group_message (
  p_message_id uuid
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
  insert into public.group_message_reports(message_id, reporter_id) values (p_message_id, v_user)
  on conflict do nothing;
  update public.group_messages m set quarantined = true
  where m.id = p_message_id
    and (select count(*) from public.group_message_reports r where r.message_id = p_message_id) >= 3;
end;
$function$;

GRANT ALL ON FUNCTION public.report_group_message(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.report_group_message(uuid) TO service_role;

CREATE FUNCTION public.respond_to_group_invite (
  p_group_id uuid,
  p_accept   boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  if not exists (select 1 from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user) then
    raise exception 'This invite is no longer available' using errcode = 'P0001', hint = 'invite_gone';
  end if;
  if p_accept then
    insert into public.group_members(group_id, user_id) values (p_group_id, v_user)
    on conflict do nothing;
  end if;
  delete from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user;
end;
$function$;

GRANT ALL ON FUNCTION public.respond_to_group_invite(uuid, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.respond_to_group_invite(uuid, boolean) TO service_role;

CREATE FUNCTION public.send_group_message (
  p_group_id   uuid,
  p_day        date,
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
  if p_request_id is null or p_day is null
     or p_day not between public.local_today(v_user) - 60 and public.local_today(v_user) + 1 then
    raise exception 'Day unavailable' using errcode = '22023';
  end if;
  select m.id into v_id from public.group_messages m where m.author_id = v_user and m.request_id = p_request_id;
  if v_id is not null then return v_id; end if;
  if not private.social_claim(v_user, 'group_message', 120) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_messages(group_id, day, author_id, body, request_id)
  values (p_group_id, p_day, v_user, btrim(p_body), p_request_id)
  returning id into v_id;
  update public.group_members m set chat_read_at = now()
  where m.group_id = p_group_id and m.user_id = v_user;
  return v_id;
end;
$function$;

GRANT ALL ON FUNCTION public.send_group_message(uuid, date, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.send_group_message(uuid, date, text, uuid) TO service_role;

CREATE FUNCTION public.set_entry_board_meal (
  p_entry_id uuid,
  p_meal     public.group_meal
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  update public.food_logs f set board_meal = p_meal
  where f.id = p_entry_id and f.user_id = v_user;
  if not found then
    raise exception 'Entry unavailable' using errcode = '42501';
  end if;
end;
$function$;

GRANT ALL ON FUNCTION public.set_entry_board_meal(uuid, public.group_meal) TO authenticated;

GRANT ALL ON FUNCTION public.set_entry_board_meal(uuid, public.group_meal) TO service_role;

CREATE FUNCTION public.set_group_preferences (
  p_group_id    uuid,
  p_board_order uuid[],
  p_notify      boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id);
begin
  if p_board_order is not null and cardinality(p_board_order) > 10 then
    raise exception 'Too many members' using errcode = '22023';
  end if;
  update public.group_members m set
    board_order = coalesce(p_board_order, m.board_order),
    notify = coalesce(p_notify, m.notify)
  where m.group_id = p_group_id and m.user_id = v_user;
end;
$function$;

GRANT ALL ON FUNCTION public.set_group_preferences(uuid, uuid[], boolean) TO authenticated;

GRANT ALL ON FUNCTION public.set_group_preferences(uuid, uuid[], boolean) TO service_role;

CREATE FUNCTION public.set_group_reaction (
  p_entry_id uuid,
  p_value    smallint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false); v_owner uuid;
begin
  if p_value is null or p_value not in (-1, 0, 1) then
    raise exception 'Unknown reaction' using errcode = '22023';
  end if;
  select f.user_id into v_owner from public.food_logs f where f.id = p_entry_id;
  if v_owner is null or v_owner = v_user or not private.group_share(v_user, v_owner) then
    raise exception 'Entry unavailable' using errcode = '42501';
  end if;
  if p_value = 0 then
    delete from public.group_reactions r where r.entry_id = p_entry_id and r.user_id = v_user;
    return;
  end if;
  if not private.social_claim(v_user, 'group_reaction', 600) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_reactions(entry_id, user_id, value) values (p_entry_id, v_user, p_value)
  on conflict (entry_id, user_id) do update set value = excluded.value, created_at = now();
end;
$function$;

GRANT ALL ON FUNCTION public.set_group_reaction(uuid, smallint) TO authenticated;

GRANT ALL ON FUNCTION public.set_group_reaction(uuid, smallint) TO service_role;

CREATE OR REPLACE FUNCTION public.social_photo_claims (
  p_keys text[]
)
  RETURNS TABLE (
    owner_id   uuid,
    photo_path text,
    photo_etag text,
    kind       text
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  if p_keys is null or cardinality(p_keys) not between 1 and 100 or array_position(p_keys, null) is not null then
    raise exception 'Between 1 and 100 photo keys are required' using errcode = '22023';
  end if;
  return query
    with keys as materialized (select distinct unnest(p_keys) as key)
    select p.author_id, p.photo_path, p.photo_etag, 'meal'::text from keys k cross join lateral (
      select sp.author_id, sp.photo_path, sp.photo_etag from public.social_posts sp
      where sp.photo_path = k.key and sp.review_status = 'approved' and not sp.quarantined limit 1
    ) p
    union all
    select p.user_id, p.avatar_path, p.photo_etag, 'avatar'::text from keys k cross join lateral (
      select sp.user_id, sp.avatar_path, sp.photo_etag from public.social_profiles sp
      where sp.avatar_path = k.key and sp.review_status = 'approved' and not sp.quarantined limit 1
    ) p
    union all
    -- Diary photos of people the caller shares a group with (97_groups.sql).
    select c.owner_id, c.photo_path, null::text, 'meal'::text
    from private.group_photo_claims(p_keys) c;
end;
$function$;

CREATE FUNCTION public.unregister_push_token (
  p_token text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  delete from public.push_tokens t where t.token = p_token and t.user_id = (select auth.uid());
$function$;

GRANT ALL ON FUNCTION public.unregister_push_token(text) TO authenticated;

GRANT ALL ON FUNCTION public.unregister_push_token(text) TO service_role;

CREATE FUNCTION public.update_group (
  p_group_id  uuid,
  p_name      text,
  p_icon_name text,
  p_is_public boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id);
begin
  if p_name is not null and char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'Name the group' using errcode = '22023';
  end if;
  update public.groups g set
    name = coalesce(btrim(p_name), g.name),
    icon_name = coalesce(nullif(p_icon_name, ''), g.icon_name),
    is_public = coalesce(p_is_public, g.is_public),
    updated_at = now()
  where g.id = p_group_id and g.leader_id = v_user;
  if not found then
    raise exception 'Only the leader can change the group' using errcode = '42501';
  end if;
end;
$function$;

GRANT ALL ON FUNCTION public.update_group(uuid, text, text, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.update_group(uuid, text, text, boolean) TO service_role;

CREATE TRIGGER group_block_after
  AFTER INSERT ON public.blocked_authors
  FOR EACH ROW
  EXECUTE FUNCTION private.group_block_after();

ALTER TABLE public.food_logs
  ADD COLUMN board_meal public.group_meal;

CREATE TABLE public.group_invites (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  group_id   uuid                     NOT NULL,
  invitee_id uuid                     NOT NULL,
  inviter_id uuid                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  pushed_at  timestamp with time zone
);

ALTER TABLE public.group_invites
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_invites
  ADD CONSTRAINT group_invites_id_key UNIQUE (id);

ALTER TABLE public.group_invites
  ADD CONSTRAINT group_invites_invitee_id_fkey FOREIGN KEY (invitee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.group_invites
  ADD CONSTRAINT group_invites_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.group_invites
  ADD CONSTRAINT group_invites_not_self CHECK (invitee_id <> inviter_id);

ALTER TABLE public.group_invites
  ADD CONSTRAINT group_invites_pkey PRIMARY KEY (group_id, invitee_id);

GRANT ALL ON public.group_invites TO service_role;

CREATE INDEX group_invites_invitee_idx ON public.group_invites (invitee_id, created_at DESC);

CREATE TABLE public.group_members (
  group_id     uuid                     NOT NULL,
  user_id      uuid                     NOT NULL,
  joined_at    timestamp with time zone DEFAULT now() NOT NULL,
  board_order  uuid[]                   DEFAULT '{}'::uuid[] NOT NULL,
  chat_read_at timestamp with time zone DEFAULT now() NOT NULL,
  notify       boolean                  DEFAULT true NOT NULL
);

ALTER TABLE public.group_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_board_order_check CHECK (cardinality(board_order) <= 10);

ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_pkey PRIMARY KEY (group_id, user_id);

ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.group_members TO service_role;

CREATE INDEX group_members_user_idx ON public.group_members (user_id, joined_at);

CREATE TRIGGER group_member_joined
  AFTER INSERT ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION private.group_member_joined();

CREATE TRIGGER group_member_joining
  BEFORE INSERT ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION private.group_member_joining();

CREATE TRIGGER group_member_left
  AFTER DELETE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION private.group_member_left();

CREATE TABLE public.group_message_reports (
  message_id  uuid                     NOT NULL,
  reporter_id uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.group_message_reports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_message_reports
  ADD CONSTRAINT group_message_reports_pkey PRIMARY KEY (message_id, reporter_id);

ALTER TABLE public.group_message_reports
  ADD CONSTRAINT group_message_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.group_message_reports TO service_role;

CREATE TABLE public.group_messages (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  group_id    uuid                     NOT NULL,
  day         date                     NOT NULL,
  author_id   uuid                     NOT NULL,
  body        text                     NOT NULL,
  request_id  uuid                     NOT NULL,
  quarantined boolean                  DEFAULT false NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.group_messages
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_author_id_request_id_key UNIQUE (author_id, request_id);

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_body_check CHECK (char_length(btrim(body)) >= 1 AND char_length(btrim(body)) <= 500);

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);

ALTER TABLE public.group_message_reports
  ADD CONSTRAINT group_message_reports_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.group_messages(id) ON DELETE CASCADE;

GRANT ALL ON public.group_messages TO service_role;

CREATE INDEX group_messages_day_idx ON public.group_messages (group_id, day, created_at);

CREATE TABLE public.group_nudges (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  group_id   uuid                     NOT NULL,
  target_id  uuid                     NOT NULL,
  nudger_id  uuid                     NOT NULL,
  day        date                     NOT NULL,
  meal       public.group_meal        NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  pushed_at  timestamp with time zone
);

ALTER TABLE public.group_nudges
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_nudges
  ADD CONSTRAINT group_nudges_not_self CHECK (target_id <> nudger_id);

ALTER TABLE public.group_nudges
  ADD CONSTRAINT group_nudges_nudger_id_fkey FOREIGN KEY (nudger_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.group_nudges
  ADD CONSTRAINT group_nudges_pkey PRIMARY KEY (id);

ALTER TABLE public.group_nudges
  ADD CONSTRAINT group_nudges_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.group_nudges TO service_role;

CREATE INDEX group_nudges_target_idx ON public.group_nudges (group_id, target_id, day, meal, created_at DESC);

CREATE TABLE public.group_reactions (
  entry_id   uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  value      smallint                 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.group_reactions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_reactions
  ADD CONSTRAINT group_reactions_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.food_logs(id) ON DELETE CASCADE;

ALTER TABLE public.group_reactions
  ADD CONSTRAINT group_reactions_pkey PRIMARY KEY (entry_id, user_id);

ALTER TABLE public.group_reactions
  ADD CONSTRAINT group_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.group_reactions
  ADD CONSTRAINT group_reactions_value_check CHECK (value = ANY (ARRAY['-1'::integer, 1]));

GRANT ALL ON public.group_reactions TO service_role;

CREATE INDEX group_reactions_user_idx ON public.group_reactions (user_id);

CREATE TABLE public.groups (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name       text                     NOT NULL,
  icon_name  text                     DEFAULT 'rice-bowl'::text NOT NULL,
  is_public  boolean                  DEFAULT false NOT NULL,
  leader_id  uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.groups
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_icon_name_check CHECK (icon_name ~ '^[a-z0-9-]{1,60}$'::text);

ALTER TABLE public.groups
  ADD CONSTRAINT groups_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_name_check CHECK (char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 40);

ALTER TABLE public.groups
  ADD CONSTRAINT groups_pkey PRIMARY KEY (id);

ALTER TABLE public.group_invites
  ADD CONSTRAINT group_invites_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

ALTER TABLE public.group_nudges
  ADD CONSTRAINT group_nudges_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

GRANT ALL ON public.groups TO service_role;

CREATE INDEX groups_public_idx ON public.groups (created_at DESC)
  WHERE is_public;

CREATE TABLE public.push_tokens (
  token      text                     NOT NULL,
  user_id    uuid                     NOT NULL,
  platform   text                     NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.push_tokens
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_tokens
  ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (token);

ALTER TABLE public.push_tokens
  ADD CONSTRAINT push_tokens_platform_check CHECK (platform = ANY (ARRAY['ios'::text, 'android'::text]));

ALTER TABLE public.push_tokens
  ADD CONSTRAINT push_tokens_token_check CHECK (char_length(token) >= 10 AND char_length(token) <= 200);

ALTER TABLE public.push_tokens
  ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.push_tokens TO service_role;

CREATE INDEX push_tokens_user_idx ON public.push_tokens (user_id);
-- db diff does not preserve function grants.
revoke execute on function private.group_entry_meal, private.group_member_left,
  private.group_member_joining, private.group_member_joined, private.group_block_after
  from public, anon, authenticated;
revoke execute on function private.group_is_member, private.group_share,
  private.group_require_member from public, anon;
grant execute on function private.group_is_member, private.group_share,
  private.group_require_member to authenticated, service_role;
revoke execute on function private.group_nudge_state from public, anon, authenticated;
revoke execute on function public.create_group, public.update_group, public.invite_to_group,
  public.respond_to_group_invite, public.join_group, public.leave_group, public.remove_group_member,
  public.set_group_preferences, public.set_entry_board_meal, public.set_group_reaction,
  public.nudge_group_member, public.send_group_message, public.delete_group_message,
  public.report_group_message, public.mark_group_chat_read, public.register_push_token,
  public.unregister_push_token from public, anon;
grant execute on function public.create_group, public.update_group, public.invite_to_group,
  public.respond_to_group_invite, public.join_group, public.leave_group, public.remove_group_member,
  public.set_group_preferences, public.set_entry_board_meal, public.set_group_reaction,
  public.nudge_group_member, public.send_group_message, public.delete_group_message,
  public.report_group_message, public.mark_group_chat_read, public.register_push_token,
  public.unregister_push_token to authenticated, service_role;
revoke execute on function public.group_push_targets, public.forget_push_tokens
  from public, anon, authenticated;
grant execute on function public.group_push_targets, public.forget_push_tokens to service_role;
revoke execute on function private.group_photo_claims, private.group_person from public, anon;
grant execute on function private.group_photo_claims, private.group_person to authenticated, service_role;
revoke execute on function public.my_groups, public.my_group_invites, public.group_invite_count,
  public.public_groups, public.group_board, public.group_messages, public.group_details from public, anon;
grant execute on function public.my_groups, public.my_group_invites, public.group_invite_count,
  public.public_groups, public.group_board, public.group_messages, public.group_details
  to authenticated, service_role;
