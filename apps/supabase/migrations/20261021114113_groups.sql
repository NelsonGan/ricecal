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
declare v_count smallint;
begin
  update public.groups g set member_count = g.member_count + 1
  where g.id = new.group_id returning g.member_count into v_count;
  delete from public.group_invites i where i.group_id = new.group_id and i.invitee_id = new.user_id;
  if v_count >= 10 then
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
declare v_count smallint;
begin
  perform pg_advisory_xact_lock(hashtextextended('group-joining:' || new.user_id::text, 0));
  select g.member_count into v_count from public.groups g where g.id = new.group_id for update;
  if v_count >= 10 then
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
  -- Locked before the next leader is picked: a leave and an account deletion
  -- at once otherwise each saw the other's row, and the group was left with
  -- no members and a leader who had gone.
  perform 1 from public.groups g where g.id = old.group_id for update;
  if not found then return null; end if;
  select m.user_id into v_next from public.group_members m
  where m.group_id = old.group_id order by m.joined_at, m.user_id limit 1;
  if v_next is null then
    delete from public.groups g where g.id = old.group_id;
  else
    update public.groups g set member_count = g.member_count - 1,
      leader_id = case when g.leader_id is null or g.leader_id = old.user_id then v_next else g.leader_id end
    where g.id = old.group_id;
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
  with keys as materialized (
    select distinct k.key, split_part(k.key, '/', 2)::uuid as owner
    from unnest(p_keys) k(key)
    where k.key ~ '^meals/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
  )
  select k.owner, k.key
  from keys k
  where k.owner <> (select auth.uid())
    and private.group_share((select auth.uid()), k.owner)
    and exists (
      select 1 from public.food_logs f
      where f.user_id = k.owner and f.photo_path = k.key
        and f.log_date >= public.local_today((select auth.uid())) - 60
    );
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
  ) and not exists (
    select 1 from public.blocked_authors x
    where (x.user_id = p_a and x.author_id = p_b) or (x.user_id = p_b and x.author_id = p_a)
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

CREATE FUNCTION private.group_meal_due (
  p_local_now timestamp without time zone,
  p_day       date,
  p_meal      public.group_meal,
  p_at        time without time zone
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select p_local_now::date = p_day
    and extract(hour from p_local_now) * 60 + extract(minute from p_local_now)
      >= extract(epoch from coalesce(p_at, case p_meal when 'breakfast' then time '08:00'
           when 'lunch' then time '13:00' else time '19:30' end)) / 60 + 30;
$function$;

CREATE FUNCTION private.group_nudge_open (
  p_group  uuid,
  p_target uuid,
  p_day    date,
  p_meal   public.group_meal
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_tz text;
begin
  select p.timezone into v_tz from public.profiles p where p.id = p_target;
  if not private.group_meal_due(now() at time zone coalesce(v_tz, 'Asia/Kuala_Lumpur'), p_day, p_meal,
    (select mt.at from public.meal_times mt where mt.user_id = p_target and mt.meal::text = p_meal::text)) then
    return false;
  end if;
  if exists (
    select 1 from public.food_logs f
    left join public.meal_times b on b.user_id = f.user_id and b.meal = 'breakfast'
    left join public.meal_times l on l.user_id = f.user_id and l.meal = 'lunch'
    left join public.meal_times d on d.user_id = f.user_id and d.meal = 'dinner'
    where f.user_id = p_target and f.log_date = p_day
      and private.group_entry_meal(f.logged_at, f.log_date, v_tz, f.board_meal, b.at, l.at, d.at) = p_meal
  ) then
    return false;
  end if;
  return not exists (
    select 1 from public.group_nudges n
    where n.group_id = p_group and n.target_id = p_target and n.day = p_day and n.meal = p_meal
      and n.created_at > now() - interval '1 hour'
  );
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
  ),
  -- This day's thread only, for its preview. The unread count is its own
  -- capped query below: a member who never opens the chat would otherwise have
  -- every message since they joined read on each poll.
  chat as materialized (
    select m.author_id, m.body, m.created_at
    from public.group_messages m
    where m.group_id = p_group_id and m.day = p_day and not m.quarantined
      and not private.social_pair_blocked(m.author_id)
      and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
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
    ), '[]'::jsonb),
    -- Unread counts the whole group since the caller last read it, since that
    -- is what reading clears; the preview is this day's latest message.
    'chat', jsonb_build_object(
      'unread', (select count(*) from (
        select 1 from public.group_messages m
        where m.group_id = p_group_id and m.created_at > v_member.chat_read_at
          and m.author_id <> v_user and not m.quarantined
          and not private.social_pair_blocked(m.author_id)
          and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
        limit 100) u),
      'last', (
        select jsonb_build_object('author', private.group_person(c.author_id), 'body', c.body)
        from chat c order by c.created_at desc limit 1
      )
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
  -- A block made since the nudge or invite still silences it.
  if exists (
    select 1 from public.blocked_authors x
    where (x.user_id = p_caller and x.author_id = v_recipient)
       or (x.user_id = v_recipient and x.author_id = p_caller)
  ) then
    return;
  end if;
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
  v_email boolean := position('@' in ltrim(lower(btrim(coalesce(p_target, ''))), '@')) > 0;
  v_invitee uuid;
  v_id uuid;
  v_count smallint;
begin
  if v_target = '' or char_length(v_target) > 254 then
    raise exception 'Enter a username or email' using errcode = '22023';
  end if;
  if not private.social_claim(v_user, 'group_invite', 60) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  -- Before the lock, so the lookup does not hold up joins. GoTrue stores
  -- addresses lowercased, and comparing the column itself uses its index.
  if v_email then
    select u.id into v_invitee from auth.users u where u.email = v_target and not u.is_sso_user limit 1;
  else
    select p.id into v_invitee from public.profiles p where p.handle = ltrim(v_target, '@');
  end if;
  -- Locked with the joins, so an invite cannot slip into a group that a
  -- concurrent join has just filled.
  select g.member_count into v_count from public.groups g where g.id = p_group_id for update;
  if v_count >= 10 then
    raise exception 'This group is full' using errcode = 'P0001', hint = 'group_full';
  end if;
  -- Someone blocked in either direction reads as nobody, so an invite cannot be
  -- used to learn who blocked whom.
  if v_invitee is null or v_invitee = v_user or private.social_pair_blocked(v_invitee)
     or exists (select 1 from public.profiles p where p.id = v_invitee and p.quarantined) then
    if v_email then return gen_random_uuid(); end if;
    raise exception 'No account found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if private.group_is_member(p_group_id, v_invitee) then
    if v_email then return gen_random_uuid(); end if;
    raise exception 'Already in this group' using errcode = 'P0001', hint = 'already_member';
  end if;
  insert into public.group_invites(group_id, invitee_id, inviter_id, by_email)
  values (p_group_id, v_invitee, v_user, v_email)
  on conflict (group_id, invitee_id) do update
    set inviter_id = excluded.inviter_id, by_email = excluded.by_email, created_at = now(), pushed_at = null
    -- A pending invite is renewed at most hourly, which also caps its pushes.
    where public.group_invites.created_at < now() - interval '1 hour'
  returning id into v_id;
  if v_id is null then
    select i.id into v_id from public.group_invites i
    where i.group_id = p_group_id and i.invitee_id = v_invitee;
  end if;
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
  if private.group_is_member(p_group_id, v_user) then return; end if;
  if not exists (select 1 from public.groups g where g.id = p_group_id and g.is_public)
     and not exists (select 1 from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user) then
    raise exception 'This group is invite only' using errcode = '42501';
  end if;
  insert into public.group_members(group_id, user_id) values (p_group_id, v_user);
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
    update public.groups g set leader_id = p_new_leader where g.id = p_group_id;
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
      'group_id', g.id, 'name', g.name, 'icon_name', g.icon_name,
      'member_count', g.member_count, 'inviter', private.group_person(i.inviter_id)
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
      'member_count', g.member_count,
      'logged_today', (
        select count(*) from public.group_members x
        join public.profiles p on p.id = x.user_id
        where x.group_id = g.id
          and (x.user_id = v_user or not private.social_pair_blocked(x.user_id))
          and exists (
          select 1 from public.food_logs f
          where f.user_id = x.user_id
            and f.log_date = (now() at time zone coalesce(p.timezone, 'Asia/Kuala_Lumpur'))::date)
      ),
      'members', (
        -- The caller first, then whoever joined first, and nobody blocked: the
        -- list is kept on the phone.
        select coalesce(jsonb_agg(private.group_person(x.user_id) order by x.mine desc, x.joined_at), '[]')
        from (
          select x.user_id, x.joined_at, x.user_id = v_user as mine from public.group_members x
          where x.group_id = g.id and (x.user_id = v_user or not private.social_pair_blocked(x.user_id))
          order by x.user_id = v_user desc, x.joined_at limit 5
        ) x
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
  if p_target_id = v_user or not private.group_is_member(p_group_id, p_target_id)
     or private.social_pair_blocked(p_target_id) then
    raise exception 'Member unavailable' using errcode = '42501';
  end if;
  -- Serialise nudges at one person's meal, so two friends tapping together
  -- send one.
  perform pg_advisory_xact_lock(hashtextextended(
    'group-nudge:' || p_group_id::text || p_target_id::text || p_day::text || p_meal::text, 0));
  if not private.group_nudge_open(p_group_id, p_target_id, p_day, p_meal) then
    raise exception 'Nudged recently' using errcode = 'P0001', hint = 'nudge_closed';
  end if;
  if not private.social_claim(v_user, 'group_nudge', 30) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  delete from public.group_nudges n where n.group_id = p_group_id and n.created_at < now() - interval '2 days';
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
    select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'icon_name', r.icon_name,
      'member_count', r.member_count) order by r.member_count desc, r.created_at desc)
    from (
      select g.id, g.name, g.icon_name, g.member_count, g.created_at
      from public.groups g
      where g.is_public and not g.quarantined
        and (v_query is null or g.name ilike '%' || replace(replace(v_query, '%', ''), '_', '') || '%')
        and not exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = v_user)
        and not exists (select 1 from public.group_reports r where r.group_id = g.id and r.reporter_id = v_user)
      order by g.member_count desc, g.created_at desc
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
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,180}\]$'
     or p_platform not in ('ios', 'android') then
    raise exception 'Invalid push token' using errcode = '22023';
  end if;
  if not private.social_claim(v_user, 'push_token', 20) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.push_tokens(token, user_id, platform) values (p_token, v_user, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  -- Ten phones is plenty; a reinstall mints a new token and the old one lingers
  -- until a push finds it gone, so the oldest go first.
  delete from public.push_tokens t where t.user_id = v_user and t.token not in (
    select k.token from public.push_tokens k where k.user_id = v_user order by k.updated_at desc limit 10);
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

CREATE FUNCTION public.report_group (
  p_group_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  if not exists (select 1 from public.groups g where g.id = p_group_id and (g.is_public
       or private.group_is_member(p_group_id, v_user)
       or exists (select 1 from public.group_invites i where i.group_id = g.id and i.invitee_id = v_user))) then
    raise exception 'Group unavailable' using errcode = '42501';
  end if;
  if not private.social_claim(v_user, 'report', 30) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_reports(group_id, reporter_id) values (p_group_id, v_user)
  on conflict do nothing;
  update public.groups g set quarantined = true
  where g.id = p_group_id
    and (select count(*) from public.group_reports r where r.group_id = p_group_id) >= 3;
end;
$function$;

GRANT ALL ON FUNCTION public.report_group(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.report_group(uuid) TO service_role;

CREATE FUNCTION public.respond_to_group_invite (
  p_group_id uuid,
  p_accept   boolean
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false); v_count smallint;
begin
  if not exists (select 1 from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user) then
    raise exception 'This invite is no longer available' using errcode = 'P0001', hint = 'invite_gone';
  end if;
  if not coalesce(p_accept, false) then
    delete from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user;
    return 'declined';
  end if;
  if private.group_is_member(p_group_id, v_user) then
    delete from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user;
    return 'joined';
  end if;
  select g.member_count into v_count from public.groups g where g.id = p_group_id for update;
  if v_count >= 10 then
    delete from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user;
    return 'full';
  end if;
  insert into public.group_members(group_id, user_id) values (p_group_id, v_user);
  return 'joined';
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
  on conflict (entry_id, user_id) do update set value = excluded.value;
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
declare
  v_user uuid := private.group_require_member(p_group_id);
  v_old text;
begin
  if p_name is not null and char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'Name the group' using errcode = '22023';
  end if;
  select g.name into v_old from public.groups g
  where g.id = p_group_id and g.leader_id = v_user for update;
  if not found then
    raise exception 'Only the leader can change the group' using errcode = '42501';
  end if;
  update public.groups g set
    name = coalesce(btrim(p_name), g.name),
    icon_name = coalesce(nullif(p_icon_name, ''), g.icon_name),
    is_public = coalesce(p_is_public, g.is_public),
    -- A new name has not been reported. The same name saved again is not new,
    -- or saving it would clear its reports.
    quarantined = g.quarantined and btrim(coalesce(p_name, v_old)) = v_old
  where g.id = p_group_id;
  if btrim(coalesce(p_name, v_old)) <> v_old then
    delete from public.group_reports r where r.group_id = p_group_id;
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
  pushed_at  timestamp with time zone,
  by_email   boolean                  DEFAULT false NOT NULL
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

CREATE INDEX group_invites_inviter_idx ON public.group_invites (inviter_id);

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

CREATE INDEX group_message_reports_reporter_idx ON public.group_message_reports (reporter_id);

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

CREATE INDEX group_messages_recent_idx ON public.group_messages (group_id, created_at);

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

CREATE INDEX group_nudges_nudger_idx ON public.group_nudges (nudger_id);

CREATE INDEX group_nudges_target_idx ON public.group_nudges (group_id, target_id, day, meal, created_at DESC);

CREATE INDEX group_nudges_target_id_idx ON public.group_nudges (target_id);

CREATE TABLE public.group_reactions (
  entry_id uuid     NOT NULL,
  user_id  uuid     NOT NULL,
  value    smallint NOT NULL
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

CREATE TABLE public.group_reports (
  group_id    uuid                     NOT NULL,
  reporter_id uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.group_reports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_reports
  ADD CONSTRAINT group_reports_pkey PRIMARY KEY (group_id, reporter_id);

ALTER TABLE public.group_reports
  ADD CONSTRAINT group_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.group_reports TO service_role;

CREATE INDEX group_reports_reporter_idx ON public.group_reports (reporter_id);

CREATE TABLE public.groups (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name         text                     NOT NULL,
  icon_name    text                     DEFAULT 'rice-bowl'::text NOT NULL,
  is_public    boolean                  DEFAULT false NOT NULL,
  leader_id    uuid,
  member_count smallint                 DEFAULT 0 NOT NULL,
  quarantined  boolean                  DEFAULT false NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.groups
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_icon_name_check CHECK (icon_name ~ '^[a-z0-9-]{1,60}$'::text);

ALTER TABLE public.groups
  ADD CONSTRAINT groups_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_member_count_check CHECK (member_count >= 0 AND member_count <= 10);

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

ALTER TABLE public.group_reports
  ADD CONSTRAINT group_reports_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;

GRANT ALL ON public.groups TO service_role;

CREATE INDEX groups_public_name_idx ON public.groups USING gin (name extensions.gin_trgm_ops)
  WHERE is_public AND NOT quarantined;

CREATE INDEX groups_public_idx ON public.groups (member_count DESC, created_at DESC)
  WHERE is_public AND NOT quarantined;

CREATE INDEX groups_leader_idx ON public.groups (leader_id);

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
-- db diff does not preserve grants: the tables stay closed to clients, and
-- every function is revoked from PUBLIC.
revoke all on public.groups, public.group_members, public.group_invites, public.group_reactions,
  public.group_nudges, public.group_messages, public.group_message_reports, public.group_reports,
  public.push_tokens from anon, authenticated;
revoke execute on function private.group_entry_meal, private.group_meal_due, private.group_member_left,
  private.group_member_joining, private.group_member_joined, private.group_block_after
  from public, anon, authenticated;
revoke execute on function private.group_is_member, private.group_share,
  private.group_require_member from public, anon;
grant execute on function private.group_is_member, private.group_share,
  private.group_require_member to authenticated, service_role;
revoke execute on function private.group_nudge_open from public, anon, authenticated;
revoke execute on function public.create_group, public.update_group, public.invite_to_group,
  public.respond_to_group_invite, public.join_group, public.leave_group, public.remove_group_member,
  public.set_group_preferences, public.set_entry_board_meal, public.set_group_reaction,
  public.nudge_group_member, public.send_group_message, public.delete_group_message,
  public.report_group_message, public.report_group, public.mark_group_chat_read,
  public.register_push_token, public.unregister_push_token from public, anon;
grant execute on function public.create_group, public.update_group, public.invite_to_group,
  public.respond_to_group_invite, public.join_group, public.leave_group, public.remove_group_member,
  public.set_group_preferences, public.set_entry_board_meal, public.set_group_reaction,
  public.nudge_group_member, public.send_group_message, public.delete_group_message,
  public.report_group_message, public.report_group, public.mark_group_chat_read,
  public.register_push_token, public.unregister_push_token to authenticated, service_role;
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
