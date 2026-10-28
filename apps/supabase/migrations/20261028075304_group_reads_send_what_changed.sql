-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.group_board(p_group_id uuid, p_day date);

DROP FUNCTION public.group_messages(p_group_id uuid, p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer);

CREATE FUNCTION public.group_board (
  p_group_id uuid,
  p_day      date,
  p_known    text DEFAULT NULL::text
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
  v_version text;
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
  v_version := md5(v_result::text);
  if p_known = v_version then
    return jsonb_build_object('unchanged', true, 'version', v_version);
  end if;
  return v_result || jsonb_build_object('version', v_version);
end;
$function$;

GRANT ALL ON FUNCTION public.group_board(uuid, date, text) TO authenticated;

GRANT ALL ON FUNCTION public.group_board(uuid, date, text) TO service_role;

CREATE FUNCTION public.group_messages (
  p_group_id  uuid,
  p_before_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                     DEFAULT NULL::uuid,
  p_limit     integer                  DEFAULT 50,
  p_after_at  timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_ids       uuid[]                   DEFAULT NULL::uuid[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.group_require_member(p_group_id); v_after timestamptz := p_after_at;
begin
  if p_ids is not null then
    if cardinality(p_ids) not between 1 and 100 then
      raise exception 'Between 1 and 100 ids' using errcode = '22023';
    end if;
    -- Bounded by the earliest one named, so the index walks only that far back.
    select greatest(v_after, min(m.created_at) - interval '1 microsecond') into v_after
    from public.group_messages m where m.group_id = p_group_id and m.id = any(p_ids);
    if v_after is null then return '[]'::jsonb; end if;
  end if;
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
      -- The food's own fields, then its thumbs (appended, so an older app reads
      -- the card unchanged). A withdrawn post stays null either way.
      'food', case when m.post_id is not null then private.group_post_food(m.post_id)
        || coalesce(private.group_food_reactions(m.post_id, p_group_id, v_user), '{}'::jsonb) end,
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
        and m.created_at > coalesce(v_after, '-infinity')
        and (p_ids is null or m.id = any(p_ids))
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      order by m.created_at desc, m.id desc limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) m
  ), '[]'::jsonb);
end;
$function$;

GRANT ALL ON FUNCTION public.group_messages(uuid, timestamp WITH time zone, uuid, integer, timestamp WITH time zone, uuid[]) TO authenticated;

GRANT ALL ON FUNCTION public.group_messages(uuid, timestamp WITH time zone, uuid, integer, timestamp WITH time zone, uuid[]) TO service_role;

-- `db diff` does not carry revokes; Postgres grants EXECUTE to PUBLIC by default.
revoke execute on function public.group_board(uuid, date, text),
  public.group_messages(uuid, timestamptz, uuid, integer, timestamptz, uuid[]) from public, anon;
