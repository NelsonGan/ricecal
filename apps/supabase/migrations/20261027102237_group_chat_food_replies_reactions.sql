-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.send_group_message(p_group_id uuid, p_body text, p_request_id uuid);

ALTER TABLE public.group_members
  DROP CONSTRAINT group_members_board_order_check;

ALTER TABLE public.groups
  DROP CONSTRAINT groups_member_count_check;

CREATE FUNCTION private.group_activity (
  p_activity_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'source', 'activity', 'id', a.id, 'name', nullif(btrim(a.kind_label), ''), 'kind', a.kind,
    'started_at', a.started_at, 'duration_s', a.duration_s, 'kcal', a.active_kcal,
    'distance_m', a.distance_m, 'sets', null, 'exercises', null)
  from public.activity_sessions a where a.id = p_activity_id;
$function$;

CREATE FUNCTION private.group_food_label (
  p_post_id uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select left(f ->> 'name', 160) || ' (' || round((f ->> 'kcal')::numeric)::text || ' kcal)'
  from (select private.group_post_food(p_post_id) as f) x
  where f is not null;
$function$;

CREATE OR REPLACE FUNCTION private.group_member_joined()
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
  if v_count >= 20 then
    delete from public.group_invites i where i.group_id = new.group_id;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.group_member_joining()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_count smallint;
begin
  perform pg_advisory_xact_lock(hashtextextended('group-joining:' || new.user_id::text, 0));
  select g.member_count into v_count from public.groups g where g.id = new.group_id for update;
  if v_count >= 20 then
    raise exception 'This group is full' using errcode = 'P0001', hint = 'group_full';
  end if;
  if (select count(*) from public.group_members m where m.user_id = new.user_id) >= 20 then
    raise exception 'You are in too many groups' using errcode = 'P0001', hint = 'too_many_groups';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.group_photo_claims (
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
    and (exists (
      select 1 from public.food_logs f
      where f.user_id = k.owner and f.photo_path = k.key
        and f.log_date >= public.local_today((select auth.uid())) - 60
    ) or exists (
      -- A food shared into the chat of a group the two are both in stays
      -- visible there however old the meal is.
      -- Only while the post itself is still published: moderation that hides
      -- a post takes its photo out of the chat as well.
      select 1 from public.social_posts p
      join public.group_messages gm on gm.post_id = p.id and not gm.quarantined
      join public.group_members mm on mm.group_id = gm.group_id and mm.user_id = (select auth.uid())
      where p.author_id = k.owner and p.photo_path = k.key
        and p.review_status = 'approved' and not p.quarantined
    ));
$function$;

CREATE FUNCTION private.group_post_food (
  p_post_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_entry uuid; v_author uuid; v_photo text; v_food jsonb;
begin
  select p.source_entry_id, p.author_id, p.photo_path into v_entry, v_author, v_photo
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'food' and p.review_status = 'approved' and not p.quarantined;
  if v_entry is null then return null; end if;
  select jsonb_build_object(
    'post_id', p_post_id, 'name', left(d.food_name, 160), 'icon_set', d.icon_set, 'icon_name', d.icon_name,
    'photo_path', case when d.photo_path = v_photo then d.photo_path end,
    'serving_label', d.serving_label, 'logged_at', d.logged_at,
    'kcal', d.kcal, 'carbs_g', d.carbs_g, 'protein_g', d.protein_g, 'fat_g', d.fat_g)
  into v_food
  from public.food_log_details d
  where d.id = v_entry and d.user_id = v_author;
  return v_food;
end;
$function$;

CREATE FUNCTION private.group_reactions_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.group_chat_broadcast(m.group_id, 'reacted', jsonb_agg(distinct m.id))
  from changed c join public.group_messages m on m.id = c.message_id group by m.group_id;
  return null;
end;
$function$;

CREATE FUNCTION private.group_share_activity()
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
    insert into public.group_messages(group_id, author_id, body, request_id, activity_id, pushed_at)
    select m.group_id, new.user_id, v_body,
      md5('activity:' || new.id::text || ':' || m.group_id::text)::uuid, new.id, now()
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

CREATE FUNCTION private.group_share_posted_food()
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
    insert into public.group_messages(group_id, author_id, body, request_id, post_id, pushed_at)
    select m.group_id, new.author_id, v_body,
      md5(new.id::text || ':' || m.group_id::text)::uuid, new.id, now()
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

CREATE FUNCTION private.group_share_workout()
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
    insert into public.group_messages(group_id, author_id, body, request_id, workout_id, pushed_at)
    select m.group_id, new.user_id, v_body,
      md5('workout:' || new.id::text || ':' || m.group_id::text)::uuid, new.id, now()
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

CREATE FUNCTION private.group_workout_label (
  p_workout jsonb
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select left(coalesce(p_workout ->> 'name',
      initcap(regexp_replace(replace(p_workout ->> 'kind', '_', ' '), '([a-z])([A-Z])', '\1 \2', 'g'))), 160)
    || ' (' || greatest(1, round((p_workout ->> 'duration_s')::numeric / 60))::text || ' min)'
  where p_workout is not null;
$function$;

CREATE FUNCTION private.group_workout (
  p_workout_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'source', 'workout', 'id', w.id, 'name', w.name, 'kind', 'strength',
    'started_at', w.started_at, 'duration_s', w.duration_s, 'kcal', w.kcal, 'distance_m', null,
    'sets', (select count(*) from public.workout_set_values v where v.workout_id = w.id),
    'exercises', (select count(*) from public.workout_exercises e where e.workout_id = w.id))
  from public.workouts w where w.id = p_workout_id;
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

CREATE FUNCTION public.group_invite_suggestions (
  p_group_id uuid,
  p_limit    integer DEFAULT 5
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id);
begin
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception 'Limit must be between 1 and 20' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(private.group_person(c.other) order by c.mutual desc, c.latest desc, c.other)
    from (
      select e.other, count(*) > 1 as mutual, max(e.created_at) as latest
      from (
        select f.followed_id as other, f.created_at from public.social_follows f where f.follower_id = v_user
        union all
        select f.follower_id, f.created_at from public.social_follows f where f.followed_id = v_user
      ) e
      join public.profiles p on p.id = e.other and not p.quarantined and p.handle is not null
      where not exists (select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = e.other)
        and not exists (select 1 from public.group_invites i where i.group_id = p_group_id and i.invitee_id = e.other)
        and not private.social_pair_blocked(e.other)
      group by e.other
      order by count(*) > 1 desc, max(e.created_at) desc, e.other
      limit p_limit
    ) c
  ), '[]'::jsonb);
end;
$function$;

GRANT ALL ON FUNCTION public.group_invite_suggestions(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.group_invite_suggestions(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.group_messages (
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
      'created_at', m.created_at, 'mine', m.author_id = v_user,
      'reply_to', (
        select jsonb_build_object('id', r.id, 'author', private.group_person(r.author_id), 'body', r.body,
          'is_food', r.post_id is not null, 'is_workout', num_nonnulls(r.workout_id, r.activity_id) > 0)
        from public.group_messages r
        where r.id = m.reply_to_id and not r.quarantined
          and not private.social_pair_blocked(r.author_id)
          and not exists (select 1 from public.group_message_reports x where x.message_id = r.id and x.reporter_id = v_user)
      ),
      'food', case when m.post_id is not null then private.group_post_food(m.post_id) end,
      'workout', case when m.workout_id is not null then private.group_workout(m.workout_id)
                      when m.activity_id is not null then private.group_activity(m.activity_id) end,
      'reactions', coalesce((
        select jsonb_agg(jsonb_build_object('emoji', x.emoji, 'count', x.total) order by x.total desc, x.first_at)
        from (
          select a.emoji, count(*) as total, min(a.created_at) as first_at
          from public.group_message_reactions a
          where a.message_id = m.id and (a.user_id = v_user or not private.social_pair_blocked(a.user_id))
          group by a.emoji
        ) x
      ), '[]'::jsonb),
      'my_reaction', (select a.emoji from public.group_message_reactions a
        where a.message_id = m.id and a.user_id = v_user)
    ) order by m.created_at, m.id)
    from (
      select * from public.group_messages m
      where m.group_id = p_group_id and not m.quarantined
        -- Constants on the right, so the index walks straight to the cursor.
        and (m.created_at, m.id) < (coalesce(p_before_at, 'infinity'),
          coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'))
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      order by m.created_at desc, m.id desc limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) m
  ), '[]'::jsonb);
end;
$function$;

CREATE FUNCTION public.group_workout_detail (
  p_group_id uuid,
  p_source   text,
  p_id       uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id); v_owner uuid; v_day date; v_shared boolean;
begin
  if p_source = 'workout' then
    select w.user_id, w.log_date into v_owner, v_day from public.workouts w where w.id = p_id;
    v_shared := exists (select 1 from public.group_messages m
      where m.group_id = p_group_id and m.workout_id = p_id and not m.quarantined);
  elsif p_source = 'activity' then
    select a.user_id, a.log_date into v_owner, v_day from public.activity_sessions a where a.id = p_id;
    v_shared := exists (select 1 from public.group_messages m
      where m.group_id = p_group_id and m.activity_id = p_id and not m.quarantined);
  else
    raise exception 'Unknown workout source' using errcode = '22023';
  end if;
  if v_owner is null or not private.group_is_member(p_group_id, v_owner)
     or (v_owner <> v_user and private.social_pair_blocked(v_owner))
     or not (v_shared or v_day >= public.local_today(v_user) - 60) then
    raise exception 'Workout unavailable' using errcode = '42501', hint = 'workout_gone';
  end if;
  if p_source = 'activity' then
    -- What the Activity page draws, field by field, so a column added to the
    -- table later is not handed to the group with it. Never the store's own ids.
    return (select jsonb_build_object('owner', private.group_person(v_owner), 'session', jsonb_build_object(
        'id', a.id, 'user_id', a.user_id, 'provider', a.provider, 'external_id', '', 'source_name', null,
        'log_date', a.log_date, 'kind', a.kind, 'kind_label', a.kind_label,
        'started_at', a.started_at, 'ended_at', a.ended_at, 'duration_s', a.duration_s,
        'active_kcal', a.active_kcal, 'distance_m', a.distance_m, 'avg_hr', a.avg_hr, 'max_hr', a.max_hr,
        'elevation_m', a.elevation_m, 'hr_zones', a.hr_zones,
        'created_at', a.created_at, 'updated_at', a.updated_at))
            from public.activity_sessions a where a.id = p_id);
  end if;
  return jsonb_build_object(
    'owner', private.group_person(v_owner),
    'summary', (
      select jsonb_build_object('id', w.id, 'user_id', w.user_id, 'name', w.name, 'notes', null,
        'started_at', w.started_at, 'ended_at', w.ended_at, 'duration_s', w.duration_s,
        'log_date', w.log_date, 'routine_id', null, 'kcal', w.kcal, 'health_workout_id', null,
        'set_count', (select count(*) from public.workout_set_values v where v.workout_id = w.id),
        'volume_kg', coalesce((select sum(v.volume_kg) from public.workout_set_values v where v.workout_id = w.id), 0),
        'exercises', '[]'::jsonb)
      from public.workouts w where w.id = p_id),
    'exercises', coalesce((
      select jsonb_agg(to_jsonb(e) - 'notes' || jsonb_build_object('notes', null) order by e.position)
      from public.workout_exercises e where e.workout_id = p_id), '[]'::jsonb),
    'sets', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.exercise_position, v.position)
      from public.workout_set_values v where v.workout_id = p_id), '[]'::jsonb),
    'heart', (select jsonb_build_object('workout_id', h.workout_id, 'started_at', h.started_at,
        'interval_s', h.interval_s, 'bpm', h.bpm, 'avg_bpm', h.avg_bpm, 'max_bpm', h.max_bpm,
        'min_bpm', h.min_bpm, 'active_kcal', h.active_kcal)
      from public.workout_heart_rates h where h.workout_id = p_id)
  );
end;
$function$;

GRANT ALL ON FUNCTION public.group_workout_detail(uuid, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.group_workout_detail(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''));
  v_local text;
  v_base text;
  v_handle text;
begin
  -- Whatever the identity provider told us. Apple gives a name on the first
  -- sign-in only, Google gives one every time, email/password gives none.
  -- Without one, the address's local part is made into a name ("nelson.gan"
  -- becomes "Nelson Gan"), and the handle gets four random characters after
  -- it, since a handle that was exactly the local part published the address.
  -- Anything after a "+" is dropped from both. An empty name is filled in by
  -- the onboarding name step.
  if v_name is null then
    v_local := split_part(split_part(coalesce(new.email, ''), '@', 1), '+', 1);
    v_name := btrim(initcap(regexp_replace(v_local, '[._+-]+', ' ', 'g')));
    v_base := lower(extensions.unaccent('extensions.unaccent'::regdictionary, v_local));
    v_base := regexp_replace(v_base, '[^a-z0-9.]+', '.', 'g');
    v_base := trim(both '.' from regexp_replace(v_base, '[.]+', '.', 'g'));
    v_base := trim(both '.' from left(v_base, 19));
    if char_length(v_base) < 3 then v_base := 'user'; end if;
    -- 36^4 suffixes; asked again on the rare one already taken.
    loop
      v_handle := v_base || '.' || (
        select string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + floor(random() * 36)::int, 1), '')
        from generate_series(1, 4));
      perform pg_advisory_xact_lock(hashtextextended('profile.handle:' || v_handle, 0));
      exit when not exists (select 1 from public.profiles p where p.handle = v_handle);
    end loop;
  end if;

  insert into public.profiles (id, display_name, handle)
  values (new.id, coalesce(v_name, ''), v_handle)
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  -- Sensible Malaysian defaults, reminders off. A notification the user never
  -- asked for on the day they sign up is how an app gets its permission
  -- revoked; the reminders screen turns them on.
  insert into public.meal_times (user_id, meal, at, reminder_enabled)
  values
    (new.id, 'breakfast', time '08:00', false),
    (new.id, 'lunch',     time '13:00', false),
    (new.id, 'dinner',    time '19:30', false),
    (new.id, 'snack',     time '16:00', false)
  on conflict (user_id, meal) do nothing;

  -- No `daily_goals` row. It cannot be computed before onboarding has
  -- collected a body, and a placeholder budget is worse than none: the Today
  -- screen would render a ring against a number nobody chose.
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.invite_to_group (
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
  if v_count >= 20 then
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
  -- An address must leave nothing behind that a later invite could read: a
  -- repeat finds the invite already there, changes nothing and answers with a
  -- made-up id, as an address with no account does. That costs a renewed push
  -- for an address invite; the invite itself stays in the invitee's list.
  if v_email then
    insert into public.group_invites(group_id, invitee_id, inviter_id, by_email)
    values (p_group_id, v_invitee, v_user, true)
    on conflict (group_id, invitee_id) do nothing
    returning id into v_id;
    return coalesce(v_id, gen_random_uuid());
  end if;
  -- A handle takes over an invite sent to an address, so a handle after an
  -- address looks exactly like the handle alone: its own id, on the sender's
  -- list, pushed. Otherwise a pending invite is renewed at most hourly, which
  -- also caps its pushes, and a renewal takes a new id.
  insert into public.group_invites(group_id, invitee_id, inviter_id, by_email)
  values (p_group_id, v_invitee, v_user, false)
  on conflict (group_id, invitee_id) do update
    set id = gen_random_uuid(), inviter_id = excluded.inviter_id, by_email = false,
      created_at = now(), pushed_at = null
    where public.group_invites.by_email or public.group_invites.created_at < now() - interval '1 hour'
  returning id into v_id;
  if v_id is null then
    select i.id into v_id from public.group_invites i
    where i.group_id = p_group_id and i.invitee_id = v_invitee;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_group_invite (
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
  if v_count >= 20 then
    delete from public.group_invites i where i.group_id = p_group_id and i.invitee_id = v_user;
    return 'full';
  end if;
  insert into public.group_members(group_id, user_id) values (p_group_id, v_user);
  return 'joined';
end;
$function$;

CREATE FUNCTION public.send_group_message (
  p_group_id    uuid,
  p_body        text,
  p_request_id  uuid,
  p_reply_to    uuid DEFAULT NULL::uuid,
  p_post_id     uuid DEFAULT NULL::uuid,
  p_workout_id  uuid DEFAULT NULL::uuid,
  p_activity_id uuid DEFAULT NULL::uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id); v_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if p_request_id is null then
    raise exception 'Request id required' using errcode = '22023';
  end if;
  select m.id into v_id from public.group_messages m where m.author_id = v_user and m.request_id = p_request_id;
  if v_id is not null then return v_id; end if;
  if num_nonnulls(p_post_id, p_workout_id, p_activity_id) > 1 then
    raise exception 'Share one thing at a time' using errcode = '22023';
  end if;
  if p_post_id is not null then
    if not exists (select 1 from public.social_posts p where p.id = p_post_id and p.author_id = v_user
                     and p.kind = 'food' and p.review_status = 'approved' and not p.quarantined) then
      raise exception 'Food unavailable' using errcode = '42501', hint = 'food_gone';
    end if;
    if v_body = '' then v_body := coalesce(private.group_food_label(p_post_id), ''); end if;
  elsif p_workout_id is not null then
    if not exists (select 1 from public.workouts w where w.id = p_workout_id and w.user_id = v_user) then
      raise exception 'Workout unavailable' using errcode = '42501', hint = 'workout_gone';
    end if;
    if v_body = '' then v_body := coalesce(private.group_workout_label(private.group_workout(p_workout_id)), ''); end if;
  elsif p_activity_id is not null then
    if not exists (select 1 from public.activity_sessions a where a.id = p_activity_id and a.user_id = v_user) then
      raise exception 'Workout unavailable' using errcode = '42501', hint = 'workout_gone';
    end if;
    if v_body = '' then v_body := coalesce(private.group_workout_label(private.group_activity(p_activity_id)), ''); end if;
  end if;
  if char_length(v_body) not between 1 and 500 then
    raise exception 'Messages are 1 to 500 characters' using errcode = '22023';
  end if;
  -- A message answered while it was deleted or hidden is sent on its own
  -- rather than refused: the sender's retry would carry the same reply and
  -- fail for ever. One from another group is dropped the same way.
  if p_reply_to is not null and not exists (
    select 1 from public.group_messages r where r.id = p_reply_to and r.group_id = p_group_id and not r.quarantined
  ) then
    p_reply_to := null;
  end if;
  if not private.social_claim(v_user, 'group_message', 120) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_messages(group_id, author_id, body, request_id, reply_to_id, post_id, workout_id, activity_id)
  values (p_group_id, v_user, v_body, p_request_id, p_reply_to, p_post_id, p_workout_id, p_activity_id)
  returning id into v_id;
  update public.group_members m set chat_read_at = now()
  where m.group_id = p_group_id and m.user_id = v_user;
  return v_id;
end;
$function$;

GRANT ALL ON FUNCTION public.send_group_message(uuid, text, uuid, uuid, uuid, uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.send_group_message(uuid, text, uuid, uuid, uuid, uuid, uuid) TO service_role;

CREATE FUNCTION public.set_group_message_reaction (
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
  if not private.social_claim(v_user, 'group_reaction', 300) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_message_reactions(message_id, user_id, emoji) values (p_message_id, v_user, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now()
  where public.group_message_reactions.emoji <> excluded.emoji;
end;
$function$;

GRANT ALL ON FUNCTION public.set_group_message_reaction(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.set_group_message_reaction(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_group_preferences (
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
  if p_board_order is not null and cardinality(p_board_order) > 20 then
    raise exception 'Too many members' using errcode = '22023';
  end if;
  update public.group_members m set
    board_order = coalesce(p_board_order, m.board_order),
    notify = coalesce(p_notify, m.notify)
  where m.group_id = p_group_id and m.user_id = v_user;
end;
$function$;

CREATE TRIGGER group_share_activity
  AFTER INSERT ON public.activity_sessions
  FOR EACH ROW
  WHEN (new.ended_at > (now() - '1 day'::interval) AND new.provider <> 'demo'::public.health_provider)
  EXECUTE FUNCTION private.group_share_activity();

ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_board_order_check CHECK (cardinality(board_order) <= 20);

CREATE TABLE public.group_message_reactions (
  message_id uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  emoji      text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.group_message_reactions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_message_reactions
  ADD CONSTRAINT group_message_reactions_emoji_check CHECK (emoji = ANY (ARRAY['❤️'::text, '😂'::text, '😮'::text, '😢'::text, '🔥'::text, '👍'::text]));

ALTER TABLE public.group_message_reactions
  ADD CONSTRAINT group_message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.group_messages(id) ON DELETE CASCADE;

ALTER TABLE public.group_message_reactions
  ADD CONSTRAINT group_message_reactions_pkey PRIMARY KEY (message_id, user_id);

ALTER TABLE public.group_message_reactions
  ADD CONSTRAINT group_message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.group_message_reactions TO service_role;

CREATE INDEX group_message_reactions_user_idx ON public.group_message_reactions (user_id);

CREATE TRIGGER group_reactions_added
  AFTER INSERT ON public.group_message_reactions REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.group_reactions_changed();

CREATE TRIGGER group_reactions_removed
  AFTER DELETE ON public.group_message_reactions REFERENCING OLD TABLE AS changed
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.group_reactions_changed();

CREATE TRIGGER group_reactions_updated
  AFTER UPDATE ON public.group_message_reactions REFERENCING NEW TABLE AS changed
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.group_reactions_changed();

CREATE POLICY "Server only" ON public.group_message_reactions
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE public.group_messages
  ADD COLUMN reply_to_id uuid;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.group_messages(id) ON DELETE SET NULL;

ALTER TABLE public.group_messages
  ADD COLUMN post_id uuid;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;

ALTER TABLE public.group_messages
  ADD COLUMN workout_id uuid;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;

ALTER TABLE public.group_messages
  ADD COLUMN activity_id uuid;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity_sessions(id) ON DELETE CASCADE;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_one_share CHECK (num_nonnulls(post_id, workout_id, activity_id) <= 1);

CREATE INDEX group_messages_activity_idx ON public.group_messages (activity_id)
  WHERE activity_id IS NOT NULL;

CREATE INDEX group_messages_workout_idx ON public.group_messages (workout_id)
  WHERE workout_id IS NOT NULL;

CREATE INDEX group_messages_post_idx ON public.group_messages (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX group_messages_reply_idx ON public.group_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_member_count_check CHECK (member_count >= 0 AND member_count <= 20);

CREATE TRIGGER group_share_posted_food
  AFTER INSERT ON public.social_posts
  FOR EACH ROW
  WHEN (new.kind = 'food'::public.social_post_kind AND new.review_status = 'approved'::public.recipe_review AND NOT new.quarantined)
  EXECUTE FUNCTION private.group_share_posted_food();

CREATE TRIGGER group_share_workout
  AFTER INSERT ON public.workouts
  FOR EACH ROW
  WHEN (new.ended_at > (now() - '1 day'::interval))
  EXECUTE FUNCTION private.group_share_workout();
-- Hand-written: `db diff` does not see a revoke, nor a table grant taken away.
-- Restated from 51_groups.sql, 97_groups.sql and 98_group_chat_shares.sql.
REVOKE ALL ON public.group_message_reactions FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_group_message(uuid, text, uuid, uuid, uuid, uuid, uuid),
  public.set_group_message_reaction(uuid, text),
  public.group_invite_suggestions(uuid, integer), public.group_workout_detail(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.group_post_food(uuid), private.group_food_label(uuid),
  private.group_workout(uuid), private.group_activity(uuid), private.group_workout_label(jsonb),
  private.group_reactions_changed(), private.group_share_posted_food(), private.group_share_workout(),
  private.group_share_activity() FROM PUBLIC, anon, authenticated;
