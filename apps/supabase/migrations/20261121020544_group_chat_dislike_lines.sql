-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.group_messages(p_group_id uuid, p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer, p_events boolean);

ALTER TABLE public.group_messages
  DROP CONSTRAINT group_messages_event_check;

ALTER TABLE public.group_messages
  DROP CONSTRAINT group_messages_event_shape;

CREATE OR REPLACE FUNCTION private.group_reaction_event()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_entry uuid := coalesce(new.entry_id, old.entry_id);
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_old text := case when tg_op <> 'INSERT' then
    case old.value when 1 then 'liked' when -1 then 'disliked' end end;
  v_new text := case when tg_op <> 'DELETE' then
    case new.value when 1 then 'liked' when -1 then 'disliked' end end;
begin
  if v_old is not distinct from v_new then
    return null;
  end if;
  begin
    if v_old is not null then
      delete from public.group_messages m
      where m.entry_id = v_entry and m.author_id = v_user and m.event = v_old;
    end if;
    if v_new is not null then
      insert into public.group_messages(group_id, author_id, body, request_id, event, entry_id)
      select a.group_id, v_user, left(coalesce(nullif(btrim(coalesce(f.display_label, f.item_name)), ''), 'food'), 160),
        md5(v_new || ':' || v_entry::text || ':' || a.group_id::text)::uuid, v_new, v_entry
      from public.food_logs f
      join public.group_members b on b.user_id = f.user_id
      join public.group_members a on a.group_id = b.group_id and a.user_id = v_user
      where f.id = v_entry
      on conflict (author_id, request_id) do nothing;
    end if;
  exception when others then
    raise warning 'group vote event skipped: %', sqlerrm;
  end;
  return null;
end;
$function$;

CREATE FUNCTION public.group_messages (
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
  ), '[]'::jsonb);
end;
$function$;

GRANT ALL ON FUNCTION public.group_messages(uuid, timestamp WITH time zone, uuid, integer, boolean, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.group_messages(uuid, timestamp WITH time zone, uuid, integer, boolean, boolean) TO service_role;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_event_check CHECK (event = ANY (ARRAY['joined'::text, 'liked'::text, 'disliked'::text]));

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_event_shape CHECK (event IS NULL AND entry_id IS NULL OR event IS
    NOT NULL AND num_nonnulls(post_id, workout_id, activity_id, recipe_id) = 0 AND (entry_id IS NOT NULL) = (event = ANY (ARRAY['liked'::text, 'disliked'::text])));
-- Restated by hand: `db diff` does not carry function grants and revokes.
revoke execute on function public.group_messages(uuid, timestamptz, uuid, integer, boolean, boolean)
  from public, anon;
grant execute on function public.group_messages(uuid, timestamptz, uuid, integer, boolean, boolean)
  to authenticated, service_role;
