-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.group_food_reactions (
  p_post_id  uuid,
  p_group_id uuid,
  p_user     uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.create_group (
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
  insert into public.groups(name, icon_name, is_public, leader_id)
  values (btrim(p_name), coalesce(nullif(p_icon_name, ''), 'rice-bowl'), coalesce(p_is_public, false), v_user)
  returning id into v_group;
  insert into public.group_members(group_id, user_id) values (v_group, v_user);
  return v_group;
end;
$function$;

CREATE FUNCTION public.free_group_limit()
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select 2;
$function$;

GRANT ALL ON FUNCTION public.free_group_limit() TO authenticated;

GRANT ALL ON FUNCTION public.free_group_limit() TO service_role;

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
$function$;
revoke execute on function private.group_food_reactions from public, anon, authenticated;
revoke execute on function public.free_group_limit from public, anon;
grant execute on function public.free_group_limit to authenticated, service_role;
