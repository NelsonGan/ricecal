-- ---------------------------------------------------------------------------
-- Group reads. Each answers one screen as jsonb, checks membership itself and
-- reads members' entries from food_log_details by owner and day. They are
-- definer functions because the diary's RLS is owner-only; what they hand back
-- is the board's narrow set of fields, never notes, servings history or goals.
-- ---------------------------------------------------------------------------

-- A member as the app draws one.
create or replace function private.group_person(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'name', coalesce(nullif(btrim(p.display_name), ''), p.handle),
    'handle', p.handle,
    'avatar_path', case when p.review_status = 'approved' and not p.quarantined then p.avatar_path end
  ) from public.profiles p where p.id = p_user;
$$;

-- The groups the caller is in, newest join first, with who is in each and how
-- many of them have logged anything on their own today.
create or replace function public.my_groups()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

create or replace function public.my_group_invites()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

create or replace function public.group_invite_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.group_invites i
  where i.invitee_id = (select auth.uid()) and not private.social_pair_blocked(i.inviter_id);
$$;

-- Public groups the caller is not in, fullest first, so a new person lands
-- where there is company. Full groups are listed but cannot be joined.
create or replace function public.public_groups(p_query text default null, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

-- The board for one day. Every member's entries for that day in the column
-- they belong to, reactions counted among this group's members, what the
-- caller may nudge, the day's first workout and the chat's unread count.
create or replace function public.group_board(p_group_id uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

-- A day's chat, oldest first, the latest 200.
create or replace function public.group_messages(p_group_id uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

-- Settings: members in the caller's board order, pending invites and the
-- caller's own switches.
create or replace function public.group_details(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

-- Meal photos a group member may see: entries of anyone the caller shares a
-- group with, logged within the board's sixty days. Read by social_photo_claims.
create or replace function private.group_photo_claims(p_keys text[])
returns table (owner_id uuid, photo_path text)
language sql stable security definer set search_path = '' as $$
  select f.user_id, f.photo_path
  from unnest(p_keys) k(key)
  join public.food_logs f on f.photo_path = k.key
  where f.user_id <> (select auth.uid())
    and f.log_date >= public.local_today((select auth.uid())) - 60
    and private.group_share((select auth.uid()), f.user_id)
    and not private.social_pair_blocked(f.user_id);
$$;
revoke execute on function private.group_photo_claims, private.group_person from public, anon;
grant execute on function private.group_photo_claims, private.group_person to authenticated, service_role;

revoke execute on function public.my_groups, public.my_group_invites, public.group_invite_count,
  public.public_groups, public.group_board, public.group_messages, public.group_details from public, anon;
grant execute on function public.my_groups, public.my_group_invites, public.group_invite_count,
  public.public_groups, public.group_board, public.group_messages, public.group_details
  to authenticated, service_role;
