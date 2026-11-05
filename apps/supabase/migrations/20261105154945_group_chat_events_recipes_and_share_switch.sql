-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.group_messages(p_group_id uuid, p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer);

DROP FUNCTION public.send_group_message(p_group_id uuid, p_body text, p_request_id uuid, p_reply_to uuid, p_post_id uuid, p_workout_id uuid, p_activity_id uuid);

DROP FUNCTION public.set_group_preferences(p_group_id uuid, p_board_order uuid[], p_notify boolean, p_notify_updates boolean);

ALTER TABLE public.group_messages
  DROP CONSTRAINT group_messages_one_share;

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
  -- "Aisha joined", in the chat. Not for the first member, who made the group.
  -- One line per member: joining again moves it rather than adding another,
  -- and not within a day of the last, so leaving and joining a public group
  -- in a loop cannot fill its chat.
  if v_count > 1 and not exists (
    select 1 from public.group_messages m
    where m.group_id = new.group_id and m.author_id = new.user_id and m.event = 'joined'
      and m.created_at > now() - interval '1 day'
  ) then
    begin
      delete from public.group_messages m
      where m.group_id = new.group_id and m.author_id = new.user_id and m.event = 'joined';
      insert into public.group_messages(group_id, author_id, body, request_id, event)
      values (new.group_id, new.user_id, 'joined', gen_random_uuid(), 'joined');
    exception when others then
      -- The line in the chat is a courtesy; joining is not.
      raise warning 'group join event skipped: %', sqlerrm;
    end;
  end if;
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
  -- An event goes out under its own name, which an app from before events
  -- does not listen for, so it does not read the thread for a line it is not
  -- shown.
  perform private.group_chat_broadcast(new.group_id,
    case when new.event is null then 'message' else 'event' end, jsonb_build_array(new.id));
  return null;
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
    ) or exists (
      -- The card shows the diary's photo as it is now (private.group_post_food),
      -- which for a photo added after posting is not the post's own.
      select 1 from public.food_logs f
      join public.social_posts p on p.source_entry_id = f.id
        and p.review_status = 'approved' and not p.quarantined
      join public.group_messages gm on gm.post_id = p.id and not gm.quarantined
      join public.group_members mm on mm.group_id = gm.group_id and mm.user_id = (select auth.uid())
      where f.user_id = k.owner and f.photo_path = k.key
    ));
$function$;

CREATE OR REPLACE FUNCTION private.group_post_food (
  p_post_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_entry uuid; v_author uuid; v_food jsonb;
begin
  select p.source_entry_id, p.author_id into v_entry, v_author
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'food' and p.review_status = 'approved' and not p.quarantined;
  if v_entry is null then return null; end if;
  select jsonb_build_object(
    'post_id', p_post_id, 'name', left(d.food_name, 160), 'icon_set', d.icon_set, 'icon_name', d.icon_name,
    'photo_path', d.photo_path,
    'serving_label', d.serving_label, 'logged_at', d.logged_at,
    'kcal', d.kcal, 'carbs_g', d.carbs_g, 'protein_g', d.protein_g, 'fat_g', d.fat_g)
  into v_food
  from public.food_log_details d
  where d.id = v_entry and d.user_id = v_author;
  return v_food;
end;
$function$;

CREATE FUNCTION private.group_reaction_event()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_entry uuid := coalesce(new.entry_id, old.entry_id); v_user uuid := coalesce(new.user_id, old.user_id);
begin
  begin
    if tg_op <> 'INSERT' and old.value = 1 and (tg_op = 'DELETE' or new.value <> 1) then
      delete from public.group_messages m
      where m.entry_id = v_entry and m.author_id = v_user and m.event = 'liked';
    end if;
    if tg_op <> 'DELETE' and new.value = 1 and (tg_op = 'INSERT' or old.value <> 1) then
      insert into public.group_messages(group_id, author_id, body, request_id, event, entry_id)
      select a.group_id, v_user, left(coalesce(nullif(btrim(coalesce(f.display_label, f.item_name)), ''), 'food'), 160),
        md5('liked:' || v_entry::text || ':' || a.group_id::text)::uuid, 'liked', v_entry
      from public.food_logs f
      join public.group_members b on b.user_id = f.user_id
      join public.group_members a on a.group_id = b.group_id and a.user_id = v_user
      where f.id = v_entry
      on conflict (author_id, request_id) do nothing;
    end if;
  exception when others then
    raise warning 'group like event skipped: %', sqlerrm;
  end;
  return null;
end;
$function$;

CREATE FUNCTION private.group_recipe_label (
  p_recipe_id uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select left(f ->> 'name', 160) || ' (' || (f ->> 'kcal') || ' kcal)'
  from (select private.group_recipe(p_recipe_id) as f) x
  where f is not null;
$function$;

CREATE FUNCTION private.group_recipe (
  p_recipe_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'id', r.id, 'name', r.name, 'photo_path', r.photo_path, 'icon_set', r.icon_set,
    'icon_name', r.icon_name, 'servings', r.servings, 'share_slug', r.share_slug,
    'kcal', round(coalesce(t.kcal, 0) / greatest(r.servings, 1))::integer,
    'carbs_g', round(coalesce(t.carbs_g, 0) / greatest(r.servings, 1), 1),
    'protein_g', round(coalesce(t.protein_g, 0) / greatest(r.servings, 1), 1),
    'fat_g', round(coalesce(t.fat_g, 0) / greatest(r.servings, 1), 1))
  from public.recipes r
  left join lateral (
    select sum(i.kcal_per_unit * i.amount) as kcal, sum(i.carbs_g_per_unit * i.amount) as carbs_g,
      sum(i.protein_g_per_unit * i.amount) as protein_g, sum(i.fat_g_per_unit * i.amount) as fat_g
    from public.recipe_ingredients i where i.recipe_id = r.id
  ) t on true
  where r.id = p_recipe_id;
$function$;

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
    where m.user_id = new.user_id and m.share_updates
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
    where m.user_id = new.author_id and m.share_updates
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
    where m.user_id = new.user_id and m.share_updates
    on conflict (author_id, request_id) do nothing;
exception when others then
    -- Sharing is a courtesy; the meal, workout or sync it rides on is not.
    -- A failure here is logged and the write goes ahead without it.
    raise warning 'group chat share skipped: %', sqlerrm;
  end;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_group_message (
  p_message_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from public.group_messages m
  where m.id = p_message_id and m.author_id = (select auth.uid()) and m.event is null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.group_chat_summary (
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
        and m.author_id <> v_user and not m.quarantined and m.event is null
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      limit 100) u),
    'last', (
      select jsonb_build_object('author', private.group_person(m.author_id), 'body', m.body)
      from public.group_messages m
      where m.group_id = p_group_id and not m.quarantined and m.event is null
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      order by m.created_at desc limit 1
    )
  );
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
      'notify_updates', v_member.notify_updates, 'share_updates', v_member.share_updates,
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
    and not m.automatic and m.event is null and m.created_at > now() - interval '10 minutes'
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

CREATE FUNCTION public.group_message_reactors (
  p_message_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid()); v_group uuid; v_author uuid;
begin
  select m.group_id, m.author_id into v_group, v_author from public.group_messages m
  where m.id = p_message_id and not m.quarantined and m.event is null;
  if v_group is null or v_user is null or not private.group_is_member(v_group, v_user)
     or (v_author <> v_user and private.social_pair_blocked(v_author))
     or exists (select 1 from public.group_message_reports r where r.message_id = p_message_id and r.reporter_id = v_user) then
    raise exception 'Message unavailable' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('emoji', a.emoji, 'person', private.group_person(a.user_id),
        'mine', a.user_id = v_user)
      order by a.user_id <> v_user, a.created_at desc)
    from public.group_message_reactions a
    where a.message_id = p_message_id and (a.user_id = v_user or not private.social_pair_blocked(a.user_id))
  ), '[]'::jsonb);
end;
$function$;

GRANT ALL ON FUNCTION public.group_message_reactors(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.group_message_reactors(uuid) TO service_role;

CREATE FUNCTION public.group_messages (
  p_group_id  uuid,
  p_before_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                     DEFAULT NULL::uuid,
  p_limit     integer                  DEFAULT 50,
  p_events    boolean                  DEFAULT false
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
          'is_food', r.post_id is not null, 'is_workout', num_nonnulls(r.workout_id, r.activity_id) > 0,
          'is_recipe', r.recipe_id is not null)
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
      -- Not one the viewer reported: its link would answer nothing, and the
      -- body still says what it was.
      'recipe', case when m.recipe_id is not null and not exists (
          select 1 from public.recipe_reports x where x.recipe_id = m.recipe_id and x.reporter_id = v_user)
        then private.group_recipe(m.recipe_id) end,
      -- Only asked for by an app that draws them (`p_events`), so only ever
      -- present for one. A like names the food and whose it is, read live.
      'event', case when m.event is not null then jsonb_build_object('kind', m.event,
        'food', case when m.event = 'liked' then (
          select jsonb_build_object('entry_id', f.id, 'name', left(coalesce(f.display_label, f.item_name), 160),
            'owner', private.group_person(f.user_id))
          from public.food_logs f where f.id = m.entry_id) end) end,
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
        and (m.event is null or (p_events
          -- A like of the food of someone the viewer blocked, or who blocked
          -- them, is about that person, and is left out as their messages are.
          and (m.event <> 'liked' or not exists (
            select 1 from public.food_logs f
            where f.id = m.entry_id and f.user_id <> v_user and private.social_pair_blocked(f.user_id)))))
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

GRANT ALL ON FUNCTION public.group_messages(uuid, timestamp WITH time zone, uuid, integer, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.group_messages(uuid, timestamp WITH time zone, uuid, integer, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.report_group_message (
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
  where m.id = p_message_id and m.author_id <> v_user and m.event is null;
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

CREATE FUNCTION public.send_group_message (
  p_group_id    uuid,
  p_body        text,
  p_request_id  uuid,
  p_reply_to    uuid DEFAULT NULL::uuid,
  p_post_id     uuid DEFAULT NULL::uuid,
  p_workout_id  uuid DEFAULT NULL::uuid,
  p_activity_id uuid DEFAULT NULL::uuid,
  p_recipe_id   uuid DEFAULT NULL::uuid
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
  if num_nonnulls(p_post_id, p_workout_id, p_activity_id, p_recipe_id) > 1 then
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
  elsif p_recipe_id is not null then
    -- Only one of the sender's own: sharing hands the group its share slug.
    if not exists (select 1 from public.recipes r where r.id = p_recipe_id and r.owner_id = v_user) then
      raise exception 'Food unavailable' using errcode = '42501', hint = 'recipe_gone';
    end if;
    if v_body = '' then v_body := coalesce(private.group_recipe_label(p_recipe_id), ''); end if;
  end if;
  if char_length(v_body) not between 1 and 500 then
    raise exception 'Messages are 1 to 500 characters' using errcode = '22023';
  end if;
  -- A message answered while it was deleted or hidden is sent on its own
  -- rather than refused: the sender's retry would carry the same reply and
  -- fail for ever. One from another group is dropped the same way.
  if p_reply_to is not null and not exists (
    select 1 from public.group_messages r where r.id = p_reply_to and r.group_id = p_group_id and not r.quarantined
      and r.event is null
  ) then
    p_reply_to := null;
  end if;
  if not private.social_claim(v_user, 'group_message', 120) then
    raise exception 'Try again later' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.group_messages(group_id, author_id, body, request_id, reply_to_id, post_id, workout_id,
    activity_id, recipe_id)
  values (p_group_id, v_user, v_body, p_request_id, p_reply_to, p_post_id, p_workout_id, p_activity_id, p_recipe_id)
  returning id into v_id;
  update public.group_members m set chat_read_at = now()
  where m.group_id = p_group_id and m.user_id = v_user;
  return v_id;
end;
$function$;

GRANT ALL ON FUNCTION public.send_group_message(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.send_group_message(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid) TO service_role;

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
  where m.id = p_message_id and not m.quarantined and m.event is null;
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

CREATE FUNCTION public.set_group_preferences (
  p_group_id       uuid,
  p_board_order    uuid[],
  p_notify         boolean,
  p_notify_updates boolean DEFAULT NULL::boolean,
  p_share_updates  boolean DEFAULT NULL::boolean
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
    notify_updates = coalesce(p_notify_updates, p_notify, m.notify_updates),
    share_updates = coalesce(p_share_updates, m.share_updates)
  where m.group_id = p_group_id and m.user_id = v_user;
end;
$function$;

GRANT ALL ON FUNCTION public.set_group_preferences(uuid, uuid[], boolean, boolean, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.set_group_preferences(uuid, uuid[], boolean, boolean, boolean) TO service_role;

CREATE INDEX food_logs_user_photo_idx ON public.food_logs (user_id, photo_path)
  WHERE photo_path IS NOT NULL;

ALTER TABLE public.group_members
  ADD COLUMN share_updates boolean DEFAULT true NOT NULL;

ALTER TABLE public.group_messages
  ADD COLUMN recipe_id uuid;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_one_share CHECK (num_nonnulls(post_id, workout_id, activity_id, recipe_id) <= 1);

ALTER TABLE public.group_messages
  ADD COLUMN event text;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_event_check CHECK (event = ANY (ARRAY['joined'::text, 'liked'::text]));

ALTER TABLE public.group_messages
  ADD COLUMN entry_id uuid;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.food_logs(id) ON DELETE CASCADE;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_event_shape CHECK (event IS NULL AND entry_id IS NULL OR event IS
    NOT NULL AND num_nonnulls(post_id, workout_id, activity_id, recipe_id) = 0 AND (entry_id IS NOT NULL) = (event = 'liked'::text));

CREATE INDEX group_messages_recipe_idx ON public.group_messages (recipe_id)
  WHERE recipe_id IS NOT NULL;

CREATE INDEX group_messages_entry_idx ON public.group_messages (entry_id)
  WHERE entry_id IS NOT NULL;

CREATE TRIGGER group_reaction_event
  AFTER INSERT OR DELETE OR UPDATE OF VALUE ON public.group_reactions
  FOR EACH ROW
  EXECUTE FUNCTION private.group_reaction_event();

-- Restated by hand: `db diff` does not carry function grants and revokes.
revoke execute on function public.group_messages(uuid, timestamptz, uuid, integer, boolean),
  public.send_group_message(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid),
  public.set_group_preferences(uuid, uuid[], boolean, boolean, boolean),
  public.group_message_reactors(uuid) from public, anon;
grant execute on function public.group_messages(uuid, timestamptz, uuid, integer, boolean),
  public.send_group_message(uuid, text, uuid, uuid, uuid, uuid, uuid, uuid),
  public.set_group_preferences(uuid, uuid[], boolean, boolean, boolean),
  public.group_message_reactors(uuid) to authenticated, service_role;
revoke execute on function private.group_recipe(uuid), private.group_recipe_label(uuid),
  private.group_reaction_event() from public, anon, authenticated;
