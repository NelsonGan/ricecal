-- ---------------------------------------------------------------------------
-- Group reads. Each answers one screen as jsonb, checks membership itself and
-- reads members' entries from food_log_details by owner and day. They are
-- definer functions because the diary's RLS is owner-only; what they hand back
-- is the board's narrow set of fields, never notes, servings history or goals.
-- ---------------------------------------------------------------------------

-- A group's size as an app from before twenty-member groups may read it in the
-- two lists where it decides whether Join is offered. That app takes ten as
-- full, so a group of ten to nineteen is reported as nine there and its Join
-- stays live; a full group keeps its real count. The true size travels beside
-- it as `member_total`, which the current app reads.
create or replace function private.group_size_for_join(p_count smallint)
returns integer language sql immutable set search_path = '' as $$
  select case when p_count between 10 and 19 then 9 else p_count end;
$$;

-- A member as the app draws one.
create or replace function private.group_person(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'name', coalesce(nullif(btrim(p.display_name), ''), p.handle),
    'handle', p.handle,
    'avatar_path', case when p.review_status = 'approved' and not p.quarantined then p.avatar_path end,
    -- Drawn as a gold ring round the face. Shown to the people the group
    -- already shows this person to, and nowhere a stranger can ask by id.
    'is_pro', public.is_entitled(p.id)
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
$$;

create or replace function public.my_group_invites()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Sign in to continue' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'group_id', g.id, 'name', g.name, 'icon_name', g.icon_name,
      'member_count', private.group_size_for_join(g.member_count), 'member_total', g.member_count,
      'inviter', private.group_person(i.inviter_id)
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
-- where there is company. Full groups are listed but cannot be joined. A name
-- the caller reported, or three people reported, is left out.
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
    select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'icon_name', r.icon_name,
      'member_count', private.group_size_for_join(r.member_count), 'member_total', r.member_count)
      order by r.member_count desc, r.created_at desc)
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
$$;

-- The board for one day, within the sixty days the pager reaches. Every
-- visible member's entries for that day in the column they belong to,
-- reactions counted among this group's members, what the caller may nudge,
-- and the day's first workout. Members blocked either way are left
-- out for the caller, food and all.
create or replace function public.group_board(p_group_id uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

-- The board's chat bar: the unread count since the caller last read the
-- chat, which is what reading clears, and the latest message for the preview.
-- Read on its own, and again when the group's Realtime topic announces a
-- message, rather than with the board and its every member's day of food. The
-- count stops at 100, so a member who never opens the chat does not have every
-- message since they joined read on each poll. Both leave out what
-- group_messages leaves out.
create or replace function public.group_chat_summary(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

-- A shared food as a chat card draws it: the post's meal read live, as the
-- board reads the diary, so a corrected portion shows in the thread too. The
-- photo only while it is still the one the post was published with, since a
-- replacement has not been through the post's review. Null once the post is
-- withdrawn or hidden; the message's body still says what it was.
--
-- Two steps, as private.social_post_food does: joining the expanded diary view
-- to posts made Postgres scan every meal a busy author ever logged, once per
-- food message on the page.
create or replace function private.group_post_food(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

-- A shared food's likes and dislikes as this group's board counts them (its
-- members' votes, less anyone blocked either way), with the diary entry they
-- are cast on and the viewer's own vote, so the chat card takes the same
-- thumbs as the board.
create or replace function private.group_food_reactions(p_post_id uuid, p_group_id uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'entry_id', p.source_entry_id,
    'likes', count(*) filter (where r.value = 1),
    'dislikes', count(*) filter (where r.value = -1),
    'mine', coalesce(max(r.value) filter (where r.user_id = p_user), 0))
  from public.social_posts p
  left join public.group_reactions r on r.entry_id = p.source_entry_id
    and exists (select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = r.user_id)
    and (r.user_id = p_user or not private.social_pair_blocked(r.user_id))
  where p.id = p_post_id and p.source_entry_id is not null
  group by p.source_entry_id;
$$;

-- What a food message's body says: "Nasi lemak (640 kcal)". Not translated,
-- since one row is read by every member in their own language; a name and a
-- number read in any of them.
create or replace function private.group_food_label(p_post_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select left(f ->> 'name', 160) || ' (' || round((f ->> 'kcal')::numeric)::text || ' kcal)'
  from (select private.group_post_food(p_post_id) as f) x
  where f is not null;
$$;

-- A workout shared into the chat as its card draws it, read live: a workout
-- from the app's logger with its exercises and sets, or (below) one a health
-- store recorded. The same shape for both, `source` saying which. Only what a
-- workout's card or its feed post shows, never its notes.
create or replace function private.group_workout(p_workout_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'source', 'workout', 'id', w.id, 'name', w.name, 'kind', 'strength',
    'started_at', w.started_at, 'duration_s', w.duration_s, 'kcal', w.kcal, 'distance_m', null,
    'sets', (select count(*) from public.workout_set_values v where v.workout_id = w.id),
    'exercises', (select count(*) from public.workout_exercises e where e.workout_id = w.id))
  from public.workouts w where w.id = p_workout_id;
$$;

create or replace function private.group_activity(p_activity_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'source', 'activity', 'id', a.id, 'name', nullif(btrim(a.kind_label), ''), 'kind', a.kind,
    'started_at', a.started_at, 'duration_s', a.duration_s, 'kcal', a.active_kcal,
    'distance_m', a.distance_m, 'sets', null, 'exercises', null)
  from public.activity_sessions a where a.id = p_activity_id;
$$;

-- What a workout message's body says: "Push day (45 min)", "Running (32 min)".
-- A kind with no name of its own reads as its slug made into words. Not
-- translated, as for food: one row is read by every member.
create or replace function private.group_workout_label(p_workout jsonb)
returns text language sql immutable set search_path = '' as $$
  select left(coalesce(p_workout ->> 'name',
      initcap(regexp_replace(replace(p_workout ->> 'kind', '_', ' '), '([a-z])([A-Z])', '\1 \2', 'g'))), 160)
    || ' (' || greatest(1, round((p_workout ->> 'duration_s')::numeric / 60))::text || ' min)'
  where p_workout is not null;
$$;

-- One workout of a fellow member's, as its detail page draws it: from the
-- board's tile or a workout card in the chat. A definer function, as the
-- board is, since workouts are owner-only. The owner must be in this group
-- with the caller and not blocked either way, and the workout within the
-- board's sixty days or shared into this group's chat. Never its notes or an
-- exercise's notes, which are the owner's own. Nor its records: scoring them
-- reads the owner's whole history, which this read does not need to show.
--
-- A logger workout comes back as the rows the app's own workout page reads
-- (`summary`, `exercises`, `sets`, `heart`); a health store's as its session row.
create or replace function public.group_workout_detail(p_group_id uuid, p_source text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

-- The group's one thread, a page at a time: the latest `p_limit` messages, or
-- those before the (`p_before_at`, `p_before_id`) cursor when scrolling up,
-- read newest first and returned oldest first as the screen draws them.
--
-- Each message carries what an app from before replies, food and reactions
-- reads (id, author, body, created_at, mine) and, beside it, the message it
-- answers, the food or workout it shares and its reactions. The answered message is left
-- out under the same rules as the thread (deleted, hidden, blocked, reported),
-- and so are reactions by anyone blocked either way.
create or replace function public.group_messages(p_group_id uuid, p_before_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      order by m.created_at desc, m.id desc limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) m
  ), '[]'::jsonb);
end;
$$;

-- A few people to invite with one tap: whoever the caller follows or is
-- followed by, people who follow each other first, then the most recent
-- follow. Leaves out members, anyone already invited, anyone blocked either
-- way and anyone hidden by moderation. Only the follow graph the caller can
-- already see on their own profile, so it reveals nothing new.
create or replace function public.group_invite_suggestions(p_group_id uuid, p_limit integer default 5)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

-- Settings: members in the caller's board order, the invites the caller sent
-- by handle (one sent to an address would name who owns it, so those are not
-- listed), and the caller's own switches.
create or replace function public.group_details(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;

-- Meal photos a group member may see: entries of anyone the caller shares a
-- group with (and has not blocked either way), within the board's sixty days.
-- The owner comes from the key, so the lookup is by owner and photo through
-- the diary's own index rather than a scan for the key; `ownsKey` in the
-- photos function checks the same prefix again. Read by social_photo_claims.
create or replace function private.group_photo_claims(p_keys text[])
returns table (owner_id uuid, photo_path text)
language sql stable security definer set search_path = '' as $$
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
$$;
-- A group's uploaded picture, for its members only. Nobody reviews it, so it
-- is shown only to people who chose to be in the group with whoever uploaded
-- it, as their meal photos are. An invite, which a leader can send to a
-- stranger by handle, and the public list both draw the drawing instead. The
-- owner is whoever uploaded it, read from the key as `ownsKey` does.
create or replace function private.group_icon_claims(p_keys text[])
returns table (owner_id uuid, photo_path text)
language sql stable security definer set search_path = '' as $$
  select distinct split_part(g.icon_path, '/', 2)::uuid, g.icon_path
  from public.groups g
  where g.icon_path = any (p_keys)
    and exists (select 1 from public.group_members m
                where m.group_id = g.id and m.user_id = (select auth.uid()));
$$;
create index if not exists groups_icon_path_idx on public.groups(icon_path) where icon_path is not null;
revoke execute on function private.group_icon_claims from public, anon;
grant execute on function private.group_icon_claims to authenticated, service_role;

revoke execute on function private.group_size_for_join from public, anon;
grant execute on function private.group_size_for_join to authenticated, service_role;
revoke execute on function private.group_post_food, private.group_food_label, private.group_workout,
  private.group_activity, private.group_workout_label, private.group_food_reactions
  from public, anon, authenticated;
revoke execute on function private.group_photo_claims, private.group_person from public, anon;
grant execute on function private.group_photo_claims, private.group_person to authenticated, service_role;

revoke execute on function public.my_groups, public.my_group_invites, public.group_invite_count,
  public.public_groups, public.group_board, public.group_messages, public.group_chat_summary,
  public.group_details, public.group_invite_suggestions, public.group_workout_detail from public, anon;
grant execute on function public.my_groups, public.my_group_invites, public.group_invite_count,
  public.public_groups, public.group_board, public.group_messages, public.group_chat_summary,
  public.group_details, public.group_invite_suggestions, public.group_workout_detail to authenticated, service_role;
