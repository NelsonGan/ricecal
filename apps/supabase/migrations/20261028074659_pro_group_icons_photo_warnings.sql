-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.create_group(p_name text, p_icon_name text, p_is_public boolean);

DROP FUNCTION public.social_feed(p_mode text, p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer, p_kinds public.social_post_kind[]);

DROP FUNCTION public.social_post(p_id uuid, p_kinds public.social_post_kind[]);

DROP FUNCTION public.social_profile_posts(p_user_id uuid, p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer, p_kinds public.social_post_kind[]);

DROP FUNCTION public.social_profile(p_user_id uuid);

DROP FUNCTION public.social_search_profiles(p_query text, p_after_handle text, p_limit integer);

DROP FUNCTION public.social_suggestions(p_limit integer);

DROP FUNCTION public.update_group(p_group_id uuid, p_name text, p_icon_name text, p_is_public boolean);

DROP VIEW public.social_post_details;

DROP VIEW public.social_profile_details;

CREATE FUNCTION private.group_check_icon (
  p_user      uuid,
  p_icon_name text,
  p_icon_path text
)
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if nullif(p_icon_path, '') is not null and (
    p_icon_path not like 'avatars/' || p_user::text || '/%'
    or p_icon_path !~ '^avatars/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|png|webp)$'
  ) then
    raise exception 'That picture cannot be used' using errcode = '22023';
  end if;
  if (nullif(p_icon_path, '') is not null
      or (nullif(p_icon_name, '') is not null and not (p_icon_name = any (public.free_group_icons()))))
     and not public.is_entitled(p_user) then
    raise exception 'pro_group_icon' using errcode = 'P0001', hint = 'pro_group_icon';
  end if;
end;
$function$;

CREATE FUNCTION private.group_icon_claims (
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
  select distinct split_part(g.icon_path, '/', 2)::uuid, g.icon_path
  from public.groups g
  where g.icon_path = any (p_keys)
    and exists (select 1 from public.group_members m
                where m.group_id = g.id and m.user_id = (select auth.uid()));
$function$;

GRANT ALL ON FUNCTION private.group_icon_claims(text[]) TO authenticated;

GRANT ALL ON FUNCTION private.group_icon_claims(text[]) TO service_role;

CREATE OR REPLACE FUNCTION private.group_person (
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
    'avatar_path', case when p.review_status = 'approved' and not p.quarantined then p.avatar_path end,
    -- Drawn as a gold ring round the face. Only for the caller and for people
    -- they share a group with: this builder also draws invitees, inviters and
    -- invite suggestions, and an invite by handle would otherwise tell anybody
    -- whether a stranger pays.
    'is_pro', (p.id = (select auth.uid()) or private.group_share((select auth.uid()), p.id))
      and public.is_entitled(p.id)
  ) from public.profiles p where p.id = p_user;
$function$;

CREATE FUNCTION private.social_is_pro (
  p_user uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce((
    select public.is_entitled(p.id) from public.profiles p
     where p.id = p_user
       and (p.id = (select auth.uid()) or (p.social_joined_at is not null and not p.is_private))
  ), false);
$function$;

GRANT ALL ON FUNCTION private.social_is_pro(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.social_is_pro(uuid) TO service_role;

CREATE FUNCTION public.create_group (
  p_name      text,
  p_icon_name text,
  p_is_public boolean,
  p_icon_path text    DEFAULT NULL::text
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
  perform private.group_check_icon(v_user, p_icon_name, p_icon_path);
  if not public.is_entitled(v_user) then
    -- One create at a time per free account, so two at once cannot both count
    -- one group and both pass.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('group_create:' || v_user::text));
    if (select count(*) from public.groups g where g.leader_id = v_user) >= public.free_group_limit() then
      raise exception 'group_limit_reached' using errcode = 'P0001', hint = 'group_limit_reached';
    end if;
  end if;
  if not private.social_claim(v_user, 'group_create', 10) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.groups(name, icon_name, icon_path, is_public, leader_id)
  values (btrim(p_name), coalesce(nullif(p_icon_name, ''), 'rice-bowl'), nullif(p_icon_path, ''),
    coalesce(p_is_public, false), v_user)
  returning id into v_group;
  insert into public.group_members(group_id, user_id) values (v_group, v_user);
  return v_group;
end;
$function$;

GRANT ALL ON FUNCTION public.create_group(text, text, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.create_group(text, text, boolean, text) TO service_role;

CREATE FUNCTION public.free_group_icons()
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select array['rice-bowl', 'noodle-bowl', 'dumpling', 'satay', 'avocado', 'smoothie', 'coffee', 'chilli'];
$function$;

GRANT ALL ON FUNCTION public.free_group_icons() TO authenticated;

GRANT ALL ON FUNCTION public.free_group_icons() TO service_role;

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
        'icon_path', g.icon_path, 'is_public', g.is_public, 'leader_id', g.leader_id, 'member_count', g.member_count)
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
          -- The day's workouts read once: the first draws the tile, and `all`
          -- lists every one for the tap that opens them (appended, so an older
          -- app reads the rest unchanged).
          select case when w.all_of is not null then
            (w.all_of -> 0) - 'started_at'
              || jsonb_build_object('count', jsonb_array_length(w.all_of),
                   'all', (select jsonb_agg(e - 'started_at') from jsonb_array_elements(w.all_of) e))
          end
          from (
            select jsonb_agg(jsonb_build_object('id', x.id, 'source', x.source, 'name', x.name,
                'kind', x.kind, 'duration_s', x.duration_s, 'started_at', x.started_at) order by x.started_at) as all_of
            from (
              select wo.id, 'workout'::text as source, wo.name, 'strength'::text as kind, wo.duration_s, wo.started_at
              from public.workouts wo where wo.user_id = mb.user_id and wo.log_date = p_day
              union all
              -- A workout saved to Apple Health comes back as a session; the
              -- in-app one already stands for it. Apple writes no label, so the
              -- name is null there and the app names the kind itself.
              select s.id, 'activity', nullif(btrim(s.kind_label), ''), s.kind, s.duration_s, s.started_at
              from public.activity_sessions s
              where s.user_id = mb.user_id and s.log_date = p_day
                and not exists (select 1 from public.workouts wo where wo.user_id = mb.user_id
                  and wo.health_workout_id = s.external_id)
            ) x
          ) w
        )
      ) order by mb.rank, mb.joined_at, mb.user_id)
      from members mb
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
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

CREATE OR REPLACE FUNCTION public.my_groups()
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
      'id', g.id, 'name', g.name, 'icon_name', g.icon_name, 'icon_path', g.icon_path,
      'is_public', g.is_public, 'is_leader', g.leader_id = v_user,
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

CREATE FUNCTION public.photo_removal_push_targets (
  p_days  integer DEFAULT 6,
  p_limit integer DEFAULT 200,
  p_after uuid    DEFAULT NULL::uuid
)
  RETURNS TABLE (
    token       text,
    user_id     uuid,
    language    text,
    timezone    text,
    photo_count integer,
    removes_by  timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
#variable_conflict use_column
begin
  if p_days is null or p_days not between 1 and 14 then
    raise exception 'Days must be between 1 and 14' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('photo_removal_push_targets'));
  return query
    with candidates as materialized (
      -- Accounts with a device and a photograph past the start of its free
      -- window, by the sweep's own index, before any per-account work.
      select distinct t.user_id
        from public.push_tokens t
       where (p_after is null or t.user_id > p_after)
         and not public.is_entitled(t.user_id)
         and not exists (
           select 1 from public.photo_removal_warnings w
            where w.user_id = t.user_id
              -- A few hours short of the window, so tomorrow's run is never
              -- a minute too early for an account warned this morning and
              -- the photos due on the window's last day still get a warning.
              and w.warned_at > now() - pg_catalog.make_interval(days => p_days)
                    + interval '3 hours'
         )
         -- The cheap test first: a photograph old enough to be in the window.
         and exists (
           select 1 from public.food_logs f
            where f.user_id = t.user_id and f.photo_path is not null
              and f.logged_at < now() + pg_catalog.make_interval(days => p_days)
                    - pg_catalog.make_interval(days => public.free_photo_retention_days())
         )
         -- Then the schedule itself, so every candidate has something due
         -- and gets a push. An empty answer then means there is nobody left,
         -- which is what the job stops on.
         and exists (
           select 1 from public.photo_removal_schedule(
             t.user_id, now() + pg_catalog.make_interval(days => p_days))
         )
       order by t.user_id
       limit p_limit
    ),
    due as (
      select c.user_id, count(*)::integer as photo_count, max(s.removes_at) as removes_by
        from candidates c
        cross join lateral public.photo_removal_schedule(
          c.user_id, now() + pg_catalog.make_interval(days => p_days)) s
       group by c.user_id
    ),
    marked as (
      insert into public.photo_removal_warnings(user_id, warned_at)
      select c.user_id, now() from candidates c
      on conflict (user_id) do update set warned_at = excluded.warned_at
      returning photo_removal_warnings.user_id
    )
    select t.token, d.user_id, coalesce(us.language, 'en'), coalesce(p.timezone, 'Asia/Kuala_Lumpur'),
      d.photo_count, d.removes_by
      from due d
      join marked m on m.user_id = d.user_id
      join public.push_tokens t on t.user_id = d.user_id
      join public.profiles p on p.id = d.user_id
      left join public.user_settings us on us.user_id = d.user_id;
end;
$function$;

GRANT ALL ON FUNCTION public.photo_removal_push_targets(integer, integer, uuid) TO service_role;

CREATE FUNCTION public.photo_removal_schedule (
  p_user  uuid,
  p_until timestamp with time zone
)
  RETURNS TABLE (
    id         uuid,
    log_date   date,
    photo_path text,
    item_name  text,
    removes_at timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with sub as (
    select s.current_period_end as period_end
      from public.subscriptions s where s.user_id = p_user
  ),
  rows as (
    select f.id, f.log_date, f.photo_path, f.item_name,
      greatest(
        f.logged_at + pg_catalog.make_interval(days => public.free_photo_retention_days()),
        coalesce((select period_end from sub), '-infinity'::timestamptz)
          + pg_catalog.make_interval(days => public.lapsed_photo_grace_days())
      ) as removes_at
    from public.food_logs f
    where f.user_id = p_user
      and f.photo_path is not null
      and f.photo_path like 'meals/' || f.user_id::text || '/%'
      and pg_catalog.char_length(f.photo_path) <= 512
      and f.photo_path ~ '^[A-Za-z0-9/_.-]+$'
      and pg_catalog.strpos(f.photo_path, '..') = 0
      and f.logged_at > coalesce((select period_end from sub), '-infinity'::timestamptz)
      -- Nothing logged in the last day of the window can be due before it, so
      -- the diary read stops at the oldest photographs.
      and f.logged_at < p_until - pg_catalog.make_interval(days => public.free_photo_retention_days())
  )
  select r.id, r.log_date, r.photo_path, r.item_name, r.removes_at
    from rows r
   where not public.is_entitled(p_user)
     and r.removes_at < p_until
   order by r.removes_at, r.id
   limit 500;
$function$;

CREATE OR REPLACE FUNCTION public.social_connections (
  p_user_id   uuid,
  p_direction text                     DEFAULT 'followers'::text,
  p_before_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                     DEFAULT NULL::uuid,
  p_limit     integer                  DEFAULT 20
)
  RETURNS TABLE (
    user_id               uuid,
    handle                text,
    display_name          text,
    bio                   text,
    avatar_path           text,
    review_status         public.recipe_review,
    review_reason         text,
    revision              integer,
    quarantined           boolean,
    follower_count        bigint,
    following_count       bigint,
    post_count            bigint,
    is_following          boolean,
    is_followed_by        boolean,
    created_at            timestamp with time zone,
    connection_created_at timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  if p_direction not in ('followers', 'following') or p_direction is null then raise exception 'Invalid connections' using errcode = '22023'; end if;
  return query
    with edges as materialized (
      (select f.follower_id as other_id, f.created_at from public.social_follows f
      where p_direction = 'followers' and f.followed_id = p_user_id
        and (p_before_at is null or (f.created_at, f.follower_id) < (p_before_at, p_before_id))
      order by f.created_at desc, f.follower_id desc limit p_limit + 1)
      union all
      (select f.followed_id as other_id, f.created_at from public.social_follows f
      where p_direction = 'following' and f.follower_id = p_user_id
        and (p_before_at is null or (f.created_at, f.followed_id) < (p_before_at, p_before_id))
      order by f.created_at desc, f.followed_id desc limit p_limit + 1)
    ), page as materialized (
      select e.* from edges e order by e.created_at desc, e.other_id desc limit p_limit + 1
    )
    -- Named rather than `d.*`: the view grows at its end, and this function's
    -- columns are fixed by an older app.
    select d.user_id, d.handle, d.display_name, d.bio, d.avatar_path,
      d.review_status, d.review_reason, d.revision, d.quarantined,
      d.follower_count, d.following_count, d.post_count,
      d.is_following, d.is_followed_by, d.created_at, p.created_at
    from page p join public.social_profile_details d on d.user_id = p.other_id
    order by p.created_at desc, p.other_id desc;
end;
$function$;

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
    from private.group_photo_claims(p_keys) c
    union all
    -- Pictures uploaded as a group's icon, for its members only.
    select c.owner_id, c.photo_path, null::text, 'avatar'::text
    from private.group_icon_claims(p_keys) c;
end;
$function$;

CREATE FUNCTION public.upcoming_photo_removals (
  p_days integer DEFAULT 14
)
  RETURNS TABLE (
    id         uuid,
    log_date   date,
    photo_path text,
    item_name  text,
    removes_at timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Sign in to continue' using errcode = '42501'; end if;
  if p_days is null or p_days not between 1 and 30 then
    raise exception 'Days must be between 1 and 30' using errcode = '22023';
  end if;
  return query select * from public.photo_removal_schedule(v_user, now() + pg_catalog.make_interval(days => p_days));
end;
$function$;

GRANT ALL ON FUNCTION public.upcoming_photo_removals(integer) TO authenticated;

GRANT ALL ON FUNCTION public.upcoming_photo_removals(integer) TO service_role;

CREATE FUNCTION public.update_group (
  p_group_id  uuid,
  p_name      text,
  p_icon_name text,
  p_is_public boolean,
  p_icon_path text    DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := private.group_require_member(p_group_id);
  v_old text;
  v_old_icon text;
begin
  if p_name is not null and char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'Name the group' using errcode = '22023';
  end if;
  select g.name, g.icon_name into v_old, v_old_icon from public.groups g
  where g.id = p_group_id and g.leader_id = v_user for update;
  if not found then
    raise exception 'Only the leader can change the group' using errcode = '42501';
  end if;
  -- The icon the group already wears is never refused, so a lapsed Pro can
  -- still rename a group that wears a Pro drawing.
  perform private.group_check_icon(v_user,
    case when p_icon_name is distinct from v_old_icon then p_icon_name end, p_icon_path);
  update public.groups g set
    name = coalesce(btrim(p_name), g.name),
    icon_name = coalesce(nullif(p_icon_name, ''), g.icon_name),
    icon_path = case
      when p_icon_path is not null then nullif(p_icon_path, '')
      when nullif(p_icon_name, '') is not null then null
      else g.icon_path
    end,
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

GRANT ALL ON FUNCTION public.update_group(uuid, text, text, boolean, text) TO authenticated;

GRANT ALL ON FUNCTION public.update_group(uuid, text, text, boolean, text) TO service_role;

ALTER TABLE public.groups
  ADD COLUMN icon_path text;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_icon_path_check CHECK (icon_path ~ '^avatars/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|png|webp)$'::text);

CREATE INDEX groups_icon_path_idx ON public.groups (icon_path)
  WHERE icon_path IS NOT NULL;

CREATE TABLE public.photo_removal_warnings (
  user_id   uuid                     NOT NULL,
  warned_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.photo_removal_warnings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.photo_removal_warnings
  ADD CONSTRAINT photo_removal_warnings_pkey PRIMARY KEY (user_id);

ALTER TABLE public.photo_removal_warnings
  ADD CONSTRAINT photo_removal_warnings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.photo_removal_warnings TO service_role;

CREATE POLICY "Server only" ON public.photo_removal_warnings
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE VIEW public.social_post_details WITH (security_invoker=true) AS SELECT p.id,
    p.author_id,
    a.handle,
    a.display_name,
    a.avatar_path,
    food.food_name,
    food.icon_set,
    food.icon_name,
    food.photo_path,
    food.kcal,
    food.carbs_g,
    food.protein_g,
    food.fat_g,
    p.caption,
    p.audience,
    p.review_status,
    p.review_reason,
    p.revision,
    p.quarantined,
    p.created_at,
    p.published_at,
    private.social_count(p.id, 'likes'::public.social_counter_metric) AS like_count,
    private.social_count(p.id, 'comments'::public.social_counter_metric) AS comment_count,
    COALESCE(( SELECT true
           FROM public.social_likes l
          WHERE ((l.post_id = p.id) AND (l.user_id = ( SELECT auth.uid() AS uid)))
         LIMIT 1), false) AS is_liked,
    COALESCE(( SELECT true
           FROM public.social_follows f
          WHERE ((f.follower_id = ( SELECT auth.uid() AS uid)) AND (f.followed_id = p.author_id))
         LIMIT 1), false) AS is_following,
    p.kind,
    workout.workout_name,
    workout.workout_started_at,
    workout.workout_duration_s,
    workout.workout_sets,
    workout.workout_volume_kg,
    workout.workout_exercises,
    p.workout_records,
    private.social_is_pro(p.author_id) AS author_is_pro
   FROM (((public.social_posts p
     JOIN public.social_profiles a ON ((a.user_id = p.author_id)))
     LEFT JOIN LATERAL private.social_post_food(p.id) food(food_name, icon_set, icon_name, photo_path, kcal, carbs_g, protein_g, fat_g) ON (true))
     LEFT JOIN LATERAL private.social_post_workout(p.id) workout(workout_name, workout_started_at, workout_duration_s, workout_sets, workout_volume_kg, workout_exercises) ON (true))
  WHERE ((food.food_name IS NOT NULL) OR (workout.workout_name IS NOT NULL));

CREATE FUNCTION public.social_feed (
  p_mode      text                      DEFAULT 'following'::text,
  p_before_at timestamp with time zone  DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                      DEFAULT NULL::uuid,
  p_limit     integer                   DEFAULT 20,
  p_kinds     public.social_post_kind[] DEFAULT '{food}'::public.social_post_kind[]
)
  RETURNS SETOF public.social_post_details
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  return query
    with page as materialized (
      select c.id, c.created_at from private.social_feed_candidates(p_mode, p_before_at, p_before_id, p_limit, p_kinds) c
    )
    select d.* from page p join public.social_post_details d on d.id = p.id order by p.created_at desc, p.id desc;
end;
$function$;

CREATE FUNCTION public.social_post (
  p_id    uuid,
  p_kinds public.social_post_kind[] DEFAULT '{food}'::public.social_post_kind[]
)
  RETURNS SETOF public.social_post_details
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select * from public.social_post_details where id = p_id and kind = any(p_kinds);
$function$;

CREATE FUNCTION public.social_profile_posts (
  p_user_id   uuid,
  p_before_at timestamp with time zone  DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                      DEFAULT NULL::uuid,
  p_limit     integer                   DEFAULT 20,
  p_kinds     public.social_post_kind[] DEFAULT '{food}'::public.social_post_kind[]
)
  RETURNS SETOF public.social_post_details
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  return query
    with page as materialized (
      select c.id, c.created_at
      from private.social_profile_post_candidates(p_user_id, p_before_at, p_before_id, p_limit, p_kinds) c
    )
    select d.* from page p join public.social_post_details d on d.id = p.id
    order by p.created_at desc, p.id desc;
end;
$function$;

GRANT SELECT ON public.social_post_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.social_post_details TO service_role;

CREATE VIEW public.social_profile_details WITH (security_invoker=true) AS SELECT user_id,
    handle,
    display_name,
    bio,
    avatar_path,
    review_status,
    review_reason,
    revision,
    quarantined,
    private.social_count(user_id, 'followers'::public.social_counter_metric) AS follower_count,
    private.social_count(user_id, 'following'::public.social_counter_metric) AS following_count,
    private.social_count(user_id, 'posts'::public.social_counter_metric) AS post_count,
    COALESCE(( SELECT true
           FROM public.social_follows f
          WHERE ((f.follower_id = ( SELECT auth.uid() AS uid)) AND (f.followed_id = p.user_id))
         LIMIT 1), false) AS is_following,
    COALESCE(( SELECT true
           FROM public.social_follows f
          WHERE ((f.followed_id = ( SELECT auth.uid() AS uid)) AND (f.follower_id = p.user_id))
         LIMIT 1), false) AS is_followed_by,
    created_at,
    private.social_is_pro(user_id) AS is_pro
   FROM public.social_profiles p;

CREATE FUNCTION public.social_profile (
  p_user_id uuid
)
  RETURNS SETOF public.social_profile_details
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select * from public.social_profile_details where user_id = p_user_id;
$function$;

CREATE FUNCTION public.social_search_profiles (
  p_query        text,
  p_after_handle text    DEFAULT NULL::text,
  p_limit        integer DEFAULT 20
)
  RETURNS SETOF public.social_profile_details
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare v_query text := lower(btrim(p_query));
begin
  perform private.social_validate_page(null, null, p_limit);
  if v_query is null or v_query !~ '^[a-z0-9_.]{1,24}$' then raise exception 'Invalid handle search' using errcode = '22023'; end if;
  if p_after_handle is not null and p_after_handle !~ '^[a-z0-9_.]{3,24}$' then raise exception 'Invalid search cursor' using errcode = '22023'; end if;
  return query select d.* from public.social_profiles p
    join public.social_profile_details d on d.user_id = p.user_id
    where starts_with(p.handle, v_query) and not p.is_private
      and (p_after_handle is null or d.handle > p_after_handle)
    order by d.handle limit p_limit + 1;
end;
$function$;

CREATE FUNCTION public.social_suggestions (
  p_limit integer DEFAULT 12
)
  RETURNS SETOF public.social_profile_details
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  return query
    with page as materialized (
      select c.user_id, c.weight from private.social_suggestion_candidates(p_limit) c
    )
    select d.* from page p join public.social_profile_details d on d.user_id = p.user_id order by p.weight desc, p.user_id;
end;
$function$;

GRANT SELECT ON public.social_profile_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.social_profile_details TO service_role;
-- Hand-written: `db diff` does not see a revoke, nor the grants of a function
-- or view it dropped and created again. Restated from 35_retention.sql,
-- 51_groups.sql, 97_groups.sql and 97_social.sql.
REVOKE ALL ON public.photo_removal_warnings FROM anon, authenticated;
REVOKE ALL ON public.social_profile_details, public.social_post_details FROM anon, authenticated;
GRANT SELECT ON public.social_profile_details, public.social_post_details TO authenticated;
REVOKE EXECUTE ON FUNCTION public.social_profile(uuid),
  public.social_post(uuid, public.social_post_kind[]),
  public.social_feed(text, timestamptz, uuid, integer, public.social_post_kind[]),
  public.social_profile_posts(uuid, timestamptz, uuid, integer, public.social_post_kind[]),
  public.social_search_profiles(text, text, integer),
  public.social_suggestions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_profile(uuid),
  public.social_post(uuid, public.social_post_kind[]),
  public.social_feed(text, timestamptz, uuid, integer, public.social_post_kind[]),
  public.social_profile_posts(uuid, timestamptz, uuid, integer, public.social_post_kind[]),
  public.social_search_profiles(text, text, integer),
  public.social_suggestions(integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_group(text, text, boolean, text),
  public.update_group(uuid, text, text, boolean, text),
  public.free_group_icons(), public.upcoming_photo_removals(integer),
  private.group_icon_claims(text[]), private.social_is_pro(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.group_check_icon(uuid, text, text),
  public.photo_removal_schedule(uuid, timestamptz),
  public.photo_removal_push_targets(integer, integer, uuid) FROM PUBLIC, anon, authenticated;
