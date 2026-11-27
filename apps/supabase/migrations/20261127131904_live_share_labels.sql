-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.group_food_label (
  p_post_id uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.group_share_label(private.group_post_food(p_post_id), null, null);
$function$;

CREATE FUNCTION private.group_message_body (
  m        public.group_messages,
  p_viewer uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.group_share_body(m.body, c.food, c.workout, c.recipe)
  from private.group_message_cards(m.post_id, m.workout_id, m.activity_id, m.recipe_id, p_viewer) c;
$function$;

CREATE FUNCTION private.group_message_cards (
  p_post_id     uuid,
  p_workout_id  uuid,
  p_activity_id uuid,
  p_recipe_id   uuid,
  p_viewer      uuid
)
  RETURNS TABLE (
    food    jsonb,
    workout jsonb,
    recipe  jsonb
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    case when p_post_id is not null then private.group_post_food(p_post_id) end,
    case when p_workout_id is not null then private.group_workout(p_workout_id)
         when p_activity_id is not null then private.group_activity(p_activity_id) end,
    case when p_recipe_id is not null and not exists (
        select 1 from public.recipe_reports x where x.recipe_id = p_recipe_id and x.reporter_id = p_viewer)
      then private.group_recipe(p_recipe_id) end;
$function$;

CREATE OR REPLACE FUNCTION private.group_recipe_label (
  p_recipe_id uuid
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.group_share_label(null, null, private.group_recipe(p_recipe_id));
$function$;

CREATE FUNCTION private.group_share_body (
  p_body    text,
  p_food    jsonb,
  p_workout jsonb,
  p_recipe  jsonb
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case when p_body ~ ' \(\d+ (kcal|min)\)$'
    then coalesce(private.group_share_label(p_food, p_workout, p_recipe), p_body)
    else p_body end;
$function$;

CREATE FUNCTION private.group_share_label (
  p_food    jsonb,
  p_workout jsonb,
  p_recipe  jsonb
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select coalesce(
    left(p_food ->> 'name', 160) || ' (' || round((p_food ->> 'kcal')::numeric)::text || ' kcal)',
    private.group_workout_label(p_workout),
    left(p_recipe ->> 'name', 160) || ' (' || (p_recipe ->> 'kcal') || ' kcal)');
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
      select jsonb_build_object('author', private.group_person(m.author_id),
        'body', private.group_message_body(m, v_user))
      from public.group_messages m
      where m.group_id = p_group_id and not m.quarantined and m.event is null
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      order by m.created_at desc limit 1
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.group_messages (
  p_group_id  uuid,
  p_before_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                     DEFAULT NULL::uuid,
  p_limit     integer                  DEFAULT 50,
  p_events    boolean                  DEFAULT false,
  p_dislikes  boolean                  DEFAULT false
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
      'id', m.id, 'author', private.group_person(m.author_id),
      'body', private.group_share_body(m.body, c.food, c.workout, c.recipe),
      'created_at', m.created_at, 'mine', m.author_id = v_user,
      'reply_to', (
        select jsonb_build_object('id', r.id, 'author', private.group_person(r.author_id),
          'body', private.group_message_body(r, v_user),
          'is_food', r.post_id is not null, 'is_workout', num_nonnulls(r.workout_id, r.activity_id) > 0,
          'is_recipe', r.recipe_id is not null)
        from public.group_messages r
        where r.id = m.reply_to_id and not r.quarantined
          and not private.social_pair_blocked(r.author_id)
          and not exists (select 1 from public.group_message_reports x where x.message_id = r.id and x.reporter_id = v_user)
      ),
      -- The food's own fields, then its thumbs (appended, so an older app reads
      -- the card unchanged). A withdrawn post stays null either way.
      'food', case when m.post_id is not null then c.food
        || coalesce(private.group_food_reactions(m.post_id, p_group_id, v_user), '{}'::jsonb) end,
      'workout', c.workout,
      -- Not one the viewer reported (private.group_message_cards).
      'recipe', c.recipe,
      -- Only asked for by an app that draws them (`p_events`), so only ever
      -- present for one. A like or a dislike names the food and whose it is,
      -- read live, with the photo or drawing the board shows for it so the
      -- line can show it too.
      'event', case when m.event is not null then jsonb_build_object('kind', m.event,
        'food', case when m.event in ('liked', 'disliked') then (
          select jsonb_build_object('entry_id', f.id, 'name', left(coalesce(f.display_label, f.item_name), 160),
            'owner', private.group_person(f.user_id),
            'photo_path', d.photo_path, 'icon_set', d.icon_set, 'icon_name', d.icon_name)
          from public.food_logs f
          join public.food_log_details d on d.id = f.id
          where f.id = m.entry_id) end) end,
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
          -- An app from before dislike lines reads any event that is not a
          -- join as a like, so it is only sent one when it asks.
          and (m.event <> 'disliked' or coalesce(p_dislikes, false))
          -- A vote on the food of someone the viewer blocked, or who blocked
          -- them, is about that person, and is left out as their messages are.
          and (m.event not in ('liked', 'disliked') or not exists (
            select 1 from public.food_logs f
            where f.id = m.entry_id and f.user_id <> v_user and private.social_pair_blocked(f.user_id)))))
        -- Constants on the right, so the index walks straight to the cursor.
        and (m.created_at, m.id) < (coalesce(p_before_at, 'infinity'),
          coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'))
        and not private.social_pair_blocked(m.author_id)
        and not exists (select 1 from public.group_message_reports r where r.message_id = m.id and r.reporter_id = v_user)
      order by m.created_at desc, m.id desc limit greatest(1, least(coalesce(p_limit, 50), 100))
    ) m
    -- Each shared thing read once, for its card and for the body it says now.
    cross join lateral private.group_message_cards(m.post_id, m.workout_id, m.activity_id,
      m.recipe_id, v_user) c
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.group_update_digests (
  p_limit integer DEFAULT 90
)
  RETURNS TABLE (
    user_id    uuid,
    token      text,
    language   text,
    group_id   uuid,
    group_name text,
    actor_name text,
    body       text,
    more       integer
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- One run at a time, and a run that finds another going returns nothing
  -- rather than queueing behind it on a pooled connection. Taken in its own
  -- statement so the query below snapshots after the lock is held, and sees
  -- whatever the previous holder committed.
  select pg_catalog.set_config('ricecal.group_update_digests',
    pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('group_update_digests'))::text, true);

  with copy as (
    select m.user_id, s.group_id, s.author_id, s.id as message_id, s.created_at, m.chat_read_at,
      m.updates_told_until, coalesce(s.post_id, s.workout_id, s.activity_id, s.id) as thing
    from public.group_messages s
    join public.group_members m on m.group_id = s.group_id and m.user_id <> s.author_id
      and m.notify_updates and m.chat_read_at < s.created_at
    join public.profiles p on p.id = m.user_id
    where pg_catalog.current_setting('ricecal.group_update_digests') = 'true'
      and s.automatic and not s.quarantined
      and s.created_at > now() - interval '1 hour'
      and s.created_at <= now() - interval '30 seconds'
      -- The person-level checks first, so whoever cannot be pushed this minute
      -- (asleep, spaced, no device) costs nothing further.
      and extract(hour from now() at time zone p.timezone) between 7 and 21
      and not exists (
        select 1 from public.group_members q
        where q.user_id = m.user_id and q.updates_pushed_at > now() - interval '10 minutes'
      )
      and exists (select 1 from public.push_tokens t where t.user_id = m.user_id)
      and not exists (
        select 1 from public.blocked_authors x
        where (x.user_id = s.author_id and x.author_id = m.user_id)
           or (x.user_id = m.user_id and x.author_id = s.author_id)
      )
  ),
  -- Read in any group, muted ones included, is seen. A share's copies are
  -- written in one statement, so they share `created_at`.
  unread as (
    select c.* from copy c
    where not exists (
      select 1 from public.group_messages r, public.group_members rm
      where r.automatic and r.created_at = c.created_at
        and coalesce(r.post_id, r.workout_id, r.activity_id, r.id) = c.thing
        and rm.group_id = r.group_id and rm.user_id = c.user_id
        and rm.chat_read_at >= r.created_at
    )
  ),
  -- Each thing through one group. A pending share's choice cannot change, as
  -- reading any of its chats since would have made it read.
  chosen as (
    select distinct on (u.user_id, u.thing) u.*
    from unread u
    order by u.user_id, u.thing, u.chat_read_at desc, u.group_id
  ),
  pending as (
    select k.* from chosen k where k.created_at > k.updates_told_until
  ),
  -- The group of the newest pending share, and how many more it has.
  due as (
    select n.user_id, n.group_id, n.author_id, n.message_id, n.created_at,
      (select count(*) from pending q where q.user_id = n.user_id and q.group_id = n.group_id)::integer - 1
        as more
    from (
      select distinct on (p.user_id) p.*
      from pending p
      order by p.user_id, p.created_at desc, p.group_id
    ) n
    order by n.user_id
    limit p_limit
  ),
  -- Told up to the newest share pushed, not to the clock, so a share that
  -- commits late with a later `created_at` is still ahead of the mark.
  told as (
    update public.group_members m
    set updates_told_until = d.created_at, updates_pushed_at = now()
    from due d
    where m.user_id = d.user_id and m.group_id = d.group_id
  )
  select d.user_id, t.token, coalesce(st.language, 'en'), d.group_id, g.name,
    coalesce(nullif(btrim(a.display_name), ''), a.handle),
    -- What the share says now: a portion corrected between the share and its
    -- push is pushed corrected, as its card already shows it.
    private.group_message_body(s, d.user_id), d.more
  from due d
  join public.group_messages s on s.id = d.message_id
  join public.push_tokens t on t.user_id = d.user_id
  join public.groups g on g.id = d.group_id
  join public.profiles a on a.id = d.author_id
  left join public.user_settings st on st.user_id = d.user_id
  order by d.user_id;
$function$;

-- A diff carries the functions' bodies, not the revokes that shaped them
-- (README, "Things a diff cannot see").
revoke execute on function private.group_share_label, private.group_share_body,
  private.group_message_cards, private.group_message_body from public, anon, authenticated;
