-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE SCHEMA private AUTHORIZATION postgres;

GRANT USAGE ON SCHEMA private TO authenticated;

GRANT USAGE ON SCHEMA private TO service_role;

CREATE FUNCTION private.social_block_after()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from public.social_follows f
  where (f.follower_id = new.user_id and f.followed_id = new.author_id)
     or (f.follower_id = new.author_id and f.followed_id = new.user_id);
  delete from public.social_notifications n
  where (n.actor_id = new.user_id and n.recipient_id = new.author_id)
     or (n.actor_id = new.author_id and n.recipient_id = new.user_id);
  return null;
end;
$function$;

CREATE FUNCTION private.social_block_before()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.social_lock_pair(new.user_id, new.author_id);
  return new;
end;
$function$;

CREATE FUNCTION private.social_can_view_comment (
  p_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.social_comments c where c.id = p_id
      and private.social_can_view_post(c.post_id)
      and private.social_can_view_profile(c.author_id)
      and (c.author_id = (select auth.uid()) or (
        c.review_status = 'approved' and not c.quarantined
        and not exists (select 1 from public.social_reports r
          where r.kind = 'comment' and r.content_id = c.id
            and r.reporter_id = (select auth.uid()))
      ))
  );
$function$;

GRANT ALL ON FUNCTION private.social_can_view_comment(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.social_can_view_comment(uuid) TO service_role;

CREATE FUNCTION private.social_can_view_notification (
  p_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (select 1 from public.social_notifications n
    where n.id = p_id and n.recipient_id = (select auth.uid())
      and private.social_can_view_profile(n.actor_id)
      and (n.post_id is null or private.social_can_view_post(n.post_id))
      and (n.comment_id is null or private.social_can_view_comment(n.comment_id))
  );
$function$;

GRANT ALL ON FUNCTION private.social_can_view_notification(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.social_can_view_notification(uuid) TO service_role;

CREATE FUNCTION private.social_can_view_post (
  p_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.social_posts p where p.id = p_id and (
      p.author_id = (select auth.uid()) or (
        p.review_status = 'approved' and not p.quarantined
        and private.social_can_view_profile(p.author_id)
        and (p.audience = 'public' or exists (select 1 from public.social_follows f
          where f.follower_id = (select auth.uid()) and f.followed_id = p.author_id))
        and not exists (select 1 from public.social_reports r
          where r.kind = 'post' and r.content_id = p.id
            and r.reporter_id = (select auth.uid()))
      )
    )
  );
$function$;

GRANT ALL ON FUNCTION private.social_can_view_post(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.social_can_view_post(uuid) TO service_role;

CREATE FUNCTION private.social_can_view_profile (
  p_user uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.social_profiles p where p.user_id = p_user and (
      p.user_id = (select auth.uid()) or (
        p.review_status = 'approved' and not p.quarantined
        and not private.social_pair_blocked(p.user_id)
        and not exists (select 1 from public.social_reports r
          where r.kind = 'profile' and r.content_id = p.user_id
            and r.reporter_id = (select auth.uid()))
      )
    )
  );
$function$;

GRANT ALL ON FUNCTION private.social_can_view_profile(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.social_can_view_profile(uuid) TO service_role;

CREATE FUNCTION private.social_claim (
  p_user   uuid,
  p_action text,
  p_limit  integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_used integer; v_bucket timestamptz := date_trunc('hour', now());
begin
  insert into public.social_rate_limits(user_id, action, bucket, used)
  values (p_user, p_action, v_bucket, 1)
  on conflict (user_id, action) do update
    set bucket = excluded.bucket,
        used = case when social_rate_limits.bucket = excluded.bucket then social_rate_limits.used + 1 else 1 end
    where social_rate_limits.bucket <> excluded.bucket or social_rate_limits.used < p_limit
  returning used into v_used;
  return v_used is not null;
end;
$function$;

CREATE FUNCTION private.social_comment_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_before boolean := false; v_after boolean := false; v_row public.social_comments; v_owner uuid;
begin
  if tg_op <> 'INSERT' then v_before := old.review_status = 'approved' and not old.quarantined; end if;
  if tg_op <> 'DELETE' then v_after := new.review_status = 'approved' and not new.quarantined; v_row := new; else v_row := old; end if;
  if v_before <> v_after then
    perform private.social_counter_change(v_row.post_id, 'comments', v_row.author_id, case when v_after then 1 else -1 end);
  end if;
  if v_after then
    select author_id into v_owner from public.social_posts where id = v_row.post_id;
    if v_owner <> v_row.author_id then
      insert into public.social_notifications(recipient_id, actor_id, kind, post_id, comment_id)
      values (v_owner, v_row.author_id, 'comment', v_row.post_id, v_row.id) on conflict do nothing;
    end if;
  end if;
  if tg_op = 'DELETE' then delete from public.social_reports where kind = 'comment' and content_id = old.id; end if;
  return null;
end;
$function$;

CREATE FUNCTION private.social_feed_candidates (
  p_mode      text,
  p_before_at timestamp with time zone,
  p_before_id uuid,
  p_limit     integer
)
  RETURNS TABLE (
    id         uuid,
    created_at timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid());
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  if p_mode not in ('following', 'discover') or p_mode is null then raise exception 'Invalid feed' using errcode = '22023'; end if;
  if v_user is null then return; end if;
  if p_mode = 'following' then
    return query
      with hidden_authors as materialized (
        select b.author_id as user_id from public.blocked_authors b where b.user_id = v_user
        union select b.user_id from public.blocked_authors b where b.author_id = v_user
        union select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'profile'
      ), hidden_posts as materialized (
        select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'post'
      ), authors as materialized (
        select v_user as user_id
        union all
        select f.followed_id from public.social_follows f
          join public.social_profiles a on a.user_id = f.followed_id
        where f.follower_id = v_user and a.review_status = 'approved' and not a.quarantined
          and f.followed_id not in (select h.user_id from hidden_authors h)
      ), candidates as materialized (
        select p.id, p.created_at from authors a cross join lateral (
          select sp.id, sp.created_at from public.social_posts sp
          where sp.author_id = a.user_id and sp.review_status = 'approved' and not sp.quarantined
            and (p_before_at is null or (sp.created_at, sp.id) < (p_before_at, p_before_id))
            and (sp.author_id = v_user or sp.id not in (select h.content_id from hidden_posts h))
          order by sp.created_at desc, sp.id desc limit p_limit + 1
        ) p
      )
      select c.id, c.created_at from candidates c order by c.created_at desc, c.id desc limit p_limit + 1;
  else
    return query
      with excluded_authors as materialized (
        select v_user as user_id
        union select f.followed_id from public.social_follows f where f.follower_id = v_user
        union select b.author_id from public.blocked_authors b where b.user_id = v_user
        union select b.user_id from public.blocked_authors b where b.author_id = v_user
        union select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'profile'
      )
      select sp.id, sp.created_at from public.social_posts sp
        join public.social_profiles a on a.user_id = sp.author_id
      where sp.audience = 'public' and sp.review_status = 'approved' and not sp.quarantined
        and a.review_status = 'approved' and not a.quarantined
        and sp.author_id not in (select e.user_id from excluded_authors e)
        and sp.id not in (select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'post')
        and (p_before_at is null or (sp.created_at, sp.id) < (p_before_at, p_before_id))
      order by sp.created_at desc, sp.id desc limit p_limit + 1;
  end if;
end;
$function$;

GRANT ALL ON FUNCTION private.social_feed_candidates(text, timestamp WITH time zone, uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION private.social_feed_candidates(text, timestamp WITH time zone, uuid, integer) TO service_role;

CREATE FUNCTION private.social_follow_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_row public.social_follows; v_delta integer;
begin
  if tg_op = 'INSERT' then v_row := new; v_delta := 1; else v_row := old; v_delta := -1; end if;
  -- Opposite follows acquire their two counter entities in the same order.
  if v_row.follower_id < v_row.followed_id then
    perform private.social_counter_change(v_row.follower_id, 'following', v_row.followed_id, v_delta);
    perform private.social_counter_change(v_row.followed_id, 'followers', v_row.follower_id, v_delta);
  else
    perform private.social_counter_change(v_row.followed_id, 'followers', v_row.follower_id, v_delta);
    perform private.social_counter_change(v_row.follower_id, 'following', v_row.followed_id, v_delta);
  end if;
  if tg_op = 'INSERT' then
    insert into public.social_notifications(recipient_id, actor_id, kind)
    values (v_row.followed_id, v_row.follower_id, 'follow') on conflict do nothing;
  else
    delete from public.social_notifications where recipient_id = v_row.followed_id
      and actor_id = v_row.follower_id and kind = 'follow';
  end if;
  return null;
end;
$function$;

CREATE FUNCTION private.social_like_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_row public.social_likes; v_owner uuid; v_delta integer;
begin
  if tg_op = 'INSERT' then v_row := new; v_delta := 1; else v_row := old; v_delta := -1; end if;
  perform private.social_counter_change(v_row.post_id, 'likes', v_row.user_id, v_delta);
  if tg_op = 'INSERT' then
    select author_id into v_owner from public.social_posts where id = v_row.post_id;
    if v_owner <> v_row.user_id then
      insert into public.social_notifications(recipient_id, actor_id, kind, post_id)
      values (v_owner, v_row.user_id, 'like', v_row.post_id);
    end if;
  else
    delete from public.social_notifications where post_id = v_row.post_id and actor_id = v_row.user_id and kind = 'like';
  end if;
  return null;
end;
$function$;

CREATE FUNCTION private.social_lock_pair (
  p_left  uuid,
  p_right uuid
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select pg_advisory_xact_lock(hashtextextended(
    'social-pair:' || least(p_left, p_right)::text || ':' || greatest(p_left, p_right)::text, 0));
$function$;

CREATE FUNCTION private.social_pair_blocked (
  p_other uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from public.blocked_authors b
    where (b.user_id = (select auth.uid()) and b.author_id = p_other)
       or (b.author_id = (select auth.uid()) and b.user_id = p_other)
  );
$function$;

GRANT ALL ON FUNCTION private.social_pair_blocked(uuid) TO authenticated;

GRANT ALL ON FUNCTION private.social_pair_blocked(uuid) TO service_role;

CREATE FUNCTION private.social_post_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_before boolean := false; v_after boolean := false; v_row public.social_posts;
begin
  if tg_op <> 'INSERT' then v_before := old.review_status = 'approved' and not old.quarantined; end if;
  if tg_op <> 'DELETE' then v_after := new.review_status = 'approved' and not new.quarantined; v_row := new; else v_row := old; end if;
  if v_before <> v_after then
    perform private.social_counter_change(v_row.author_id, 'posts', v_row.id, case when v_after then 1 else -1 end);
  end if;
  if tg_op = 'DELETE' then
    delete from public.social_counters where entity_id = old.id;
    delete from public.social_reports where kind = 'post' and content_id = old.id;
  end if;
  return null;
end;
$function$;

CREATE FUNCTION private.social_profile_deleted()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from public.social_counters where entity_id = old.user_id;
  delete from public.social_reports where kind = 'profile' and content_id = old.user_id;
  return null;
end;
$function$;

CREATE FUNCTION private.social_require_user (
  p_identity boolean DEFAULT true
)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or not exists (select 1 from auth.users where id = v_user) then
    raise exception 'Sign in to continue' using errcode = '42501';
  end if;
  if p_identity and not exists (select 1 from public.social_profiles p where p.user_id = v_user
      and p.review_status = 'approved' and not p.quarantined) then
    raise exception 'Create an approved public profile first' using errcode = '42501';
  end if;
  return v_user;
end;
$function$;

CREATE FUNCTION private.social_source_photo_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.photo_path is distinct from old.photo_path then
    update public.social_posts set photo_path = null, photo_etag = null, revision = revision + 1, updated_at = now()
    where source_entry_id = new.id and photo_path is not null;
  end if;
  return null;
end;
$function$;

CREATE FUNCTION private.social_suggestion_candidates (
  p_limit integer
)
  RETURNS TABLE (
    user_id uuid,
    weight  bigint
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid());
begin
  perform private.social_validate_page(null, null, p_limit);
  if v_user is null then return; end if;
  return query
    with hidden_authors as materialized (
      select b.author_id as user_id from public.blocked_authors b where b.user_id = v_user
      union select b.user_id from public.blocked_authors b where b.author_id = v_user
      union select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'profile'
    ), seeds as materialized (
      select f.followed_id from public.social_follows f
        join public.social_profiles a on a.user_id = f.followed_id
      where f.follower_id = v_user and a.review_status = 'approved' and not a.quarantined
        and f.followed_id not in (select h.user_id from hidden_authors h)
      order by f.created_at desc, f.followed_id desc limit 64
    ), paths as materialized (
      select f.followed_id from seeds s cross join lateral (
        select edge.followed_id from public.social_follows edge
          join public.social_profiles a on a.user_id = edge.followed_id
        where edge.follower_id = s.followed_id
          and (a.user_id = v_user or (a.review_status = 'approved' and not a.quarantined
            and a.user_id not in (select h.user_id from hidden_authors h)))
        order by edge.created_at desc, edge.followed_id desc limit 64
      ) f
    ), mutual as materialized (
      select p.followed_id as user_id, count(*) as weight from paths p group by p.followed_id
      order by count(*) desc, p.followed_id limit 256
    ), recent as materialized (
      select p.user_id, 0::bigint as weight from public.social_profiles p
      where p.review_status = 'approved' and not p.quarantined
        and p.user_id not in (select h.user_id from hidden_authors h)
      order by p.created_at desc, p.user_id desc limit 512
    ), candidates as materialized (
      select c.user_id, max(c.weight) as weight from (
        select * from mutual union all select * from recent
      ) c group by c.user_id
    )
    select c.user_id, c.weight from candidates c
    where c.user_id <> v_user
      and not exists (select 1 from public.social_follows f where f.follower_id = v_user and f.followed_id = c.user_id)
    order by c.weight desc, c.user_id limit p_limit;
end;
$function$;

GRANT ALL ON FUNCTION private.social_suggestion_candidates(integer) TO authenticated;

GRANT ALL ON FUNCTION private.social_suggestion_candidates(integer) TO service_role;

CREATE FUNCTION private.social_validate_page (
  p_before_at timestamp with time zone,
  p_before_id uuid,
  p_limit     integer
)
  RETURNS void
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
begin
  if (p_before_at is null) <> (p_before_id is null) or (p_before_at is not null and not isfinite(p_before_at))
      or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Invalid page cursor or size' using errcode = '22023';
  end if;
end;
$function$;

GRANT ALL ON FUNCTION private.social_validate_page(timestamp WITH time zone, uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION private.social_validate_page(timestamp WITH time zone, uuid, integer) TO service_role;

CREATE TYPE public.social_activity_kind AS ENUM (
  'follow',
  'like',
  'comment'
);

CREATE TYPE public.social_audience AS ENUM (
  'public',
  'followers'
);

CREATE TYPE public.social_content_kind AS ENUM (
  'profile',
  'post',
  'comment'
);

CREATE TYPE public.social_counter_metric AS ENUM (
  'followers',
  'following',
  'posts',
  'likes',
  'comments'
);

CREATE FUNCTION private.social_count (
  p_entity uuid,
  p_metric public.social_counter_metric
)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(sum(c.value), 0)::bigint from public.social_counters c
  where c.entity_id = p_entity and c.metric = p_metric;
$function$;

GRANT ALL ON FUNCTION private.social_count(uuid, public.social_counter_metric) TO authenticated;

GRANT ALL ON FUNCTION private.social_count(uuid, public.social_counter_metric) TO service_role;

CREATE FUNCTION private.social_counter_change (
  p_entity uuid,
  p_metric public.social_counter_metric,
  p_actor  uuid,
  p_delta  integer
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- A parent deletion can remove counters before child cascade triggers run.
  -- Decrements must never recreate a counter for that deleted entity.
  if p_delta < 0 then
    update public.social_counters set value = greatest(0, value + p_delta)
    where entity_id = p_entity and metric = p_metric
      and shard = (hashtextextended(p_actor::text, 0) & 31)::smallint;
  else
    insert into public.social_counters(entity_id, metric, shard, value)
    values (p_entity, p_metric, (hashtextextended(p_actor::text, 0) & 31)::smallint, p_delta)
    on conflict (entity_id, metric, shard) do update
      set value = social_counters.value + p_delta;
  end if;
end;
$function$;

CREATE FUNCTION public.claim_social_review (
  p_user uuid
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.social_claim(p_user, 'review', 60);
$function$;

GRANT ALL ON FUNCTION public.claim_social_review(uuid) TO service_role;

CREATE FUNCTION public.create_social_comment (
  p_post_id    uuid,
  p_body       text,
  p_request_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(); v_id uuid;
begin
  if not private.social_can_view_post(p_post_id) then raise exception 'Post unavailable' using errcode = '42501'; end if;
  select id into v_id from public.social_comments where author_id = v_user and request_id = p_request_id;
  if found then return v_id; end if;
  if p_request_id is null then raise exception 'A request id is required' using errcode = '22023'; end if;
  if not private.social_claim(v_user, 'comment', 60) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  insert into public.social_comments(post_id, author_id, request_id, body)
  values (p_post_id, v_user, p_request_id, btrim(p_body)) on conflict (author_id, request_id) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.social_comments where author_id = v_user and request_id = p_request_id; end if;
  return v_id;
end;
$function$;

GRANT ALL ON FUNCTION public.create_social_comment(uuid, text, uuid) TO authenticated;

GRANT ALL ON FUNCTION public.create_social_comment(uuid, text, uuid) TO service_role;

CREATE FUNCTION public.create_social_post (
  p_entry_id uuid,
  p_caption  text,
  p_audience public.social_audience
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(); v_id uuid; v_entry public.food_logs;
begin
  -- The source lock also serializes publication against its deletion or photo replacement.
  select * into v_entry from public.food_logs where id = p_entry_id and user_id = v_user for share;
  if not found then raise exception 'Meal unavailable' using errcode = '42501'; end if;
  select id into v_id from public.social_posts where source_entry_id = p_entry_id and author_id = v_user;
  if found then return v_id; end if;
  if not private.social_claim(v_user, 'post', 30) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  insert into public.social_posts(author_id, source_entry_id, food_name, icon_set, icon_name, photo_path, caption, audience)
  values (v_user, p_entry_id, left(coalesce(v_entry.display_label, v_entry.item_name), 160),
    coalesce(v_entry.icon_set, v_entry.item_icon_set), coalesce(v_entry.icon_name, v_entry.item_icon_name),
    case when v_entry.photo_path like 'meals/' || v_user::text || '/%' then v_entry.photo_path end,
    btrim(coalesce(p_caption, '')), p_audience)
  on conflict (source_entry_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.social_posts where source_entry_id = p_entry_id and author_id = v_user;
  end if;
  return v_id;
end;
$function$;

GRANT ALL ON FUNCTION public.create_social_post(uuid, text, public.social_audience) TO authenticated;

GRANT ALL ON FUNCTION public.create_social_post(uuid, text, public.social_audience) TO service_role;

CREATE FUNCTION public.delete_social_comment (
  p_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  delete from public.social_comments c where c.id = p_id and (c.author_id = v_user
    or exists (select 1 from public.social_posts p where p.id = c.post_id and p.author_id = v_user));
end;
$function$;

GRANT ALL ON FUNCTION public.delete_social_comment(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_social_comment(uuid) TO service_role;

CREATE FUNCTION public.delete_social_post (
  p_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  delete from public.social_posts where id = p_id and author_id = v_user;
end;
$function$;

GRANT ALL ON FUNCTION public.delete_social_post(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_social_post(uuid) TO service_role;

CREATE FUNCTION public.mark_social_notifications_read (
  p_ids uuid[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  if p_ids is null or cardinality(p_ids) > 100 then raise exception 'At most 100 activity ids' using errcode = '22023'; end if;
  update public.social_notifications set read_at = now() where recipient_id = v_user and id = any(p_ids) and read_at is null;
end;
$function$;

GRANT ALL ON FUNCTION public.mark_social_notifications_read(uuid[]) TO authenticated;

GRANT ALL ON FUNCTION public.mark_social_notifications_read(uuid[]) TO service_role;

CREATE FUNCTION public.remove_social_follower (
  p_follower_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  perform private.social_lock_pair(v_user, p_follower_id);
  delete from public.social_follows where follower_id = p_follower_id and followed_id = v_user;
end;
$function$;

GRANT ALL ON FUNCTION public.remove_social_follower(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.remove_social_follower(uuid) TO service_role;

CREATE FUNCTION public.report_social_content (
  p_kind   public.social_content_kind,
  p_id     uuid,
  p_reason public.report_reason
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := private.social_require_user(false);
  v_author uuid;
  v_revision integer;
  v_visible boolean;
begin
  if p_kind is null or p_id is null then raise exception 'Invalid report' using errcode = '22023'; end if;
  if exists (select 1 from public.social_reports
      where kind = p_kind and content_id = p_id and reporter_id = v_user) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('social-report:' || p_kind::text || ':' || p_id::text, 0));
  if exists (select 1 from public.social_reports
      where kind = p_kind and content_id = p_id and reporter_id = v_user) then return; end if;
  case p_kind
    when 'profile' then select p.user_id, p.revision, private.social_can_view_profile(p.user_id)
      into v_author, v_revision, v_visible from public.social_profiles p where p.user_id = p_id for update;
    when 'post' then select p.author_id, p.revision, private.social_can_view_post(p.id)
      into v_author, v_revision, v_visible from public.social_posts p where p.id = p_id for update;
    when 'comment' then select c.author_id, c.revision, private.social_can_view_comment(c.id)
      into v_author, v_revision, v_visible from public.social_comments c where c.id = p_id for update;
    else raise exception 'Invalid report' using errcode = '22023';
  end case;
  if v_author is null or v_author = v_user then raise exception 'Content unavailable' using errcode = '42501'; end if;
  if not v_visible then raise exception 'Content unavailable' using errcode = '42501'; end if;
  if not private.social_claim(v_user, 'report', 30) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  insert into public.social_reports(kind, content_id, content_revision, reporter_id, reason)
  values (p_kind, p_id, v_revision, v_user, p_reason) on conflict do nothing;
  if (select count(*) from (select 1 from public.social_reports
      where kind = p_kind and content_id = p_id and content_revision = v_revision
        and resolved_at is null limit 3) reports) >= 3 then
    case p_kind
      when 'profile' then update public.social_profiles set quarantined = true, review_status = 'pending', revision = revision + 1, updated_at = now()
        where user_id = p_id and revision = v_revision and not quarantined;
      when 'post' then update public.social_posts set quarantined = true, review_status = 'pending', revision = revision + 1, updated_at = now()
        where id = p_id and revision = v_revision and not quarantined;
      when 'comment' then update public.social_comments set quarantined = true, review_status = 'pending', revision = revision + 1, updated_at = now()
        where id = p_id and revision = v_revision and not quarantined;
    end case;
  end if;
end;
$function$;

GRANT ALL ON FUNCTION public.report_social_content(public.social_content_kind, uuid, public.report_reason) TO authenticated;

GRANT ALL ON FUNCTION public.report_social_content(public.social_content_kind, uuid, public.report_reason) TO service_role;

CREATE FUNCTION public.resolve_social_report (
  p_kind       public.social_content_kind,
  p_id         uuid,
  p_status     public.recipe_review,
  p_reason     text                       DEFAULT NULL::text,
  p_revision   integer                    DEFAULT NULL::integer,
  p_photo_etag text                       DEFAULT NULL::text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_count integer; v_has_photo boolean := false;
begin
  if p_revision is null then raise exception 'The reviewed revision is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('social-report:' || p_kind::text || ':' || p_id::text, 0));
  if p_kind = 'profile' then select avatar_path is not null into v_has_photo from public.social_profiles where user_id = p_id;
  elsif p_kind = 'post' then select photo_path is not null into v_has_photo from public.social_posts where id = p_id; end if;
  if p_status = 'approved' and v_has_photo and (p_photo_etag is null or char_length(p_photo_etag) not between 1 and 128 or p_photo_etag !~ '^"[a-zA-Z0-9-]+"$' ) then
    raise exception 'A reviewed image ETag is required' using errcode = '22023';
  end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Invalid review status' using errcode = '22023'; end if;
  case p_kind
    when 'profile' then update public.social_profiles set quarantined = false, review_status = p_status, review_reason = left(p_reason, 280), revision = revision + 1, updated_at = now(),
      photo_etag = case when p_status = 'approved' and avatar_path is not null then p_photo_etag end where user_id = p_id and revision = p_revision;
    when 'post' then update public.social_posts set quarantined = false, review_status = p_status, review_reason = left(p_reason, 280), revision = revision + 1, updated_at = now(),
      photo_etag = case when p_status = 'approved' and photo_path is not null then p_photo_etag end,
      published_at = case when p_status = 'approved' then coalesce(published_at, now()) else published_at end where id = p_id and revision = p_revision;
    when 'comment' then update public.social_comments set quarantined = false, review_status = p_status, review_reason = left(p_reason, 280), revision = revision + 1, updated_at = now() where id = p_id and revision = p_revision;
    else raise exception 'Invalid content kind' using errcode = '22023';
  end case;
  get diagnostics v_count = row_count;
  if v_count = 1 then
    update public.social_reports set resolved_at = pg_catalog.clock_timestamp()
    where kind = p_kind and content_id = p_id and resolved_at is null;
  end if;
  return v_count = 1;
end;
$function$;

GRANT ALL ON FUNCTION public.resolve_social_report(public.social_content_kind, uuid, public.recipe_review, text, integer, text) TO service_role;

CREATE FUNCTION public.review_social_content (
  p_kind       public.social_content_kind,
  p_id         uuid,
  p_revision   integer,
  p_status     public.recipe_review,
  p_reason     text                       DEFAULT NULL::text,
  p_photo_etag text                       DEFAULT NULL::text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_count integer; v_has_photo boolean := false;
begin
  if p_kind = 'profile' then select avatar_path is not null into v_has_photo from public.social_profiles where user_id = p_id;
  elsif p_kind = 'post' then select photo_path is not null into v_has_photo from public.social_posts where id = p_id; end if;
  if p_status = 'approved' and v_has_photo and (p_photo_etag is null or char_length(p_photo_etag) not between 1 and 128 or p_photo_etag !~ '^"[a-zA-Z0-9-]+"$' ) then
    raise exception 'A reviewed image ETag is required' using errcode = '22023';
  end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Invalid review status' using errcode = '22023'; end if;
  case p_kind
    when 'profile' then update public.social_profiles set review_status = p_status, review_reason = left(p_reason, 280), updated_at = now(),
        photo_etag = case when p_status = 'approved' and avatar_path is not null then p_photo_etag end
      where user_id = p_id and revision = p_revision and review_status = 'pending' and not quarantined;
    when 'post' then update public.social_posts set review_status = p_status, review_reason = left(p_reason, 280), updated_at = now(),
        photo_etag = case when p_status = 'approved' and photo_path is not null then p_photo_etag end,
        published_at = case when p_status = 'approved' then coalesce(published_at, now()) else published_at end
      where id = p_id and revision = p_revision and review_status = 'pending' and not quarantined;
    when 'comment' then update public.social_comments set review_status = p_status, review_reason = left(p_reason, 280), updated_at = now()
      where id = p_id and revision = p_revision and review_status = 'pending' and not quarantined;
    else raise exception 'Invalid content kind' using errcode = '22023';
  end case;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$function$;

GRANT ALL ON FUNCTION public.review_social_content(public.social_content_kind, uuid, integer, public.recipe_review, text, text) TO service_role;

CREATE FUNCTION public.set_social_follow (
  p_target_id uuid,
  p_following boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  if p_target_id is null or p_target_id = v_user or p_following is null then
    raise exception 'Invalid follow' using errcode = '22023';
  end if;
  if p_following then perform private.social_require_user(); end if;
  perform pg_advisory_xact_lock(hashtextextended('social-following:' || v_user::text, 0));
  perform private.social_lock_pair(v_user, p_target_id);
  if not p_following then
    delete from public.social_follows where follower_id = v_user and followed_id = p_target_id;
    return;
  end if;
  if not private.social_can_view_profile(p_target_id) then raise exception 'Profile unavailable' using errcode = '42501'; end if;
  if exists (select 1 from public.social_follows where follower_id = v_user and followed_id = p_target_id) then return; end if;
  if private.social_count(v_user, 'following') >= 5000 then raise exception 'Following limit reached' using errcode = 'P0001'; end if;
  if not private.social_claim(v_user, 'follow', 200) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  insert into public.social_follows(follower_id, followed_id) values (v_user, p_target_id) on conflict do nothing;
end;
$function$;

GRANT ALL ON FUNCTION public.set_social_follow(uuid, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.set_social_follow(uuid, boolean) TO service_role;

CREATE FUNCTION public.set_social_like (
  p_post_id uuid,
  p_liked   boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  if p_liked is null then raise exception 'Invalid like' using errcode = '22023'; end if;
  if not p_liked then delete from public.social_likes where post_id = p_post_id and user_id = v_user; return; end if;
  perform private.social_require_user();
  if not private.social_can_view_post(p_post_id) then raise exception 'Post unavailable' using errcode = '42501'; end if;
  if exists (select 1 from public.social_likes where post_id = p_post_id and user_id = v_user) then return; end if;
  if not private.social_claim(v_user, 'like', 600) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  insert into public.social_likes(post_id, user_id) values (p_post_id, v_user) on conflict do nothing;
end;
$function$;

GRANT ALL ON FUNCTION public.set_social_like(uuid, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.set_social_like(uuid, boolean) TO service_role;

CREATE FUNCTION public.set_social_profile (
  p_handle       text,
  p_display_name text,
  p_bio          text DEFAULT ''::text,
  p_avatar_path  text DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  if not private.social_claim(v_user, 'profile', 20) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  insert into public.social_profiles(user_id, handle, display_name, bio, avatar_path)
  values (v_user, lower(btrim(p_handle)), btrim(p_display_name), btrim(coalesce(p_bio, '')), p_avatar_path)
  on conflict (user_id) do update set handle = excluded.handle, display_name = excluded.display_name,
    bio = excluded.bio, avatar_path = excluded.avatar_path, photo_etag = null, review_status = 'pending', review_reason = null,
    revision = social_profiles.revision + 1, updated_at = now();
  return v_user;
end;
$function$;

GRANT ALL ON FUNCTION public.set_social_profile(text, text, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.set_social_profile(text, text, text, text) TO service_role;

CREATE FUNCTION public.social_blocked_profiles (
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
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user(false);
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  return query select b.author_id,
    case when p.review_status = 'approved' and not p.quarantined then p.handle else '' end,
    case when p.review_status = 'approved' and not p.quarantined then p.display_name else '' end,
    ''::text, null::text, coalesce(p.review_status, 'pending'::public.recipe_review), null::text,
    coalesce(p.revision, 1), coalesce(p.quarantined, false),
    0::bigint, 0::bigint, 0::bigint, false, false, coalesce(p.created_at, b.created_at), b.created_at
  from public.blocked_authors b left join public.social_profiles p on p.user_id = b.author_id
  where b.user_id = v_user and (p_before_at is null or (b.created_at, b.author_id) < (p_before_at, p_before_id))
  order by b.created_at desc, b.author_id desc limit p_limit + 1;
end;
$function$;

GRANT ALL ON FUNCTION public.social_blocked_profiles(timestamp WITH time zone, uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.social_blocked_profiles(timestamp WITH time zone, uuid, integer) TO service_role;

CREATE FUNCTION public.social_connections (
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
    select d.*, p.created_at from page p join public.social_profile_details d on d.user_id = p.other_id
    order by p.created_at desc, p.other_id desc;
end;
$function$;

GRANT ALL ON FUNCTION public.social_connections(uuid, text, timestamp WITH time zone, uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.social_connections(uuid, text, timestamp WITH time zone, uuid, integer) TO service_role;

CREATE FUNCTION public.social_entry_post (
  p_entry_id uuid
)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select p.id from public.social_posts p where p.source_entry_id = p_entry_id and p.author_id = (select auth.uid());
$function$;

GRANT ALL ON FUNCTION public.social_entry_post(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.social_entry_post(uuid) TO service_role;

CREATE FUNCTION public.social_photo_claims (
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
      where sp.photo_path = k.key and sp.photo_etag is not null and sp.review_status = 'approved' and not sp.quarantined limit 1
    ) p
    union all
    select p.user_id, p.avatar_path, p.photo_etag, 'avatar'::text from keys k cross join lateral (
      select sp.user_id, sp.avatar_path, sp.photo_etag from public.social_profiles sp
      where sp.avatar_path = k.key and sp.photo_etag is not null and sp.review_status = 'approved' and not sp.quarantined limit 1
    ) p;
end;
$function$;

GRANT ALL ON FUNCTION public.social_photo_claims(text[]) TO authenticated;

GRANT ALL ON FUNCTION public.social_photo_claims(text[]) TO service_role;

CREATE FUNCTION public.social_unread_notification_count()
  RETURNS integer
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select count(*)::integer from (
    select 1 from public.social_notifications n
    where n.recipient_id = (select auth.uid()) and n.read_at is null
    limit 100
  ) unread;
$function$;

GRANT ALL ON FUNCTION public.social_unread_notification_count() TO authenticated;

GRANT ALL ON FUNCTION public.social_unread_notification_count() TO service_role;

CREATE FUNCTION public.update_social_comment (
  p_id   uuid,
  p_body text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user();
begin
  if not private.social_claim(v_user, 'comment-edit', 60) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  update public.social_comments set body = btrim(p_body), review_status = 'pending', review_reason = null,
    revision = revision + 1, updated_at = now()
  where id = p_id and author_id = v_user and private.social_can_view_post(post_id);
  if not found then raise exception 'Comment unavailable' using errcode = '42501'; end if;
  return p_id;
end;
$function$;

GRANT ALL ON FUNCTION public.update_social_comment(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.update_social_comment(uuid, text) TO service_role;

CREATE FUNCTION public.update_social_post (
  p_id       uuid,
  p_caption  text,
  p_audience public.social_audience
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := private.social_require_user();
begin
  if not private.social_claim(v_user, 'post-edit', 30) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  update public.social_posts set caption = btrim(coalesce(p_caption, '')), audience = p_audience, photo_etag = null,
    review_status = 'pending', review_reason = null, revision = revision + 1, updated_at = now()
  where id = p_id and author_id = v_user;
  if not found then raise exception 'Post unavailable' using errcode = '42501'; end if;
  return p_id;
end;
$function$;

GRANT ALL ON FUNCTION public.update_social_post(uuid, text, public.social_audience) TO authenticated;

GRANT ALL ON FUNCTION public.update_social_post(uuid, text, public.social_audience) TO service_role;

CREATE INDEX blocked_authors_reverse_idx ON public.blocked_authors (author_id, user_id);

CREATE TRIGGER social_block_after
  AFTER INSERT ON public.blocked_authors
  FOR EACH ROW
  EXECUTE FUNCTION private.social_block_after();

CREATE TRIGGER social_block_before
  BEFORE INSERT ON public.blocked_authors
  FOR EACH ROW
  EXECUTE FUNCTION private.social_block_before();

CREATE TRIGGER social_source_photo_changed
  AFTER UPDATE OF photo_path ON public.food_logs
  FOR EACH ROW
  EXECUTE FUNCTION private.social_source_photo_changed();

CREATE TABLE public.social_comments (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  post_id       uuid                     NOT NULL,
  author_id     uuid                     NOT NULL,
  request_id    uuid                     NOT NULL,
  body          text                     NOT NULL,
  review_status public.recipe_review     DEFAULT 'pending'::public.recipe_review NOT NULL,
  review_reason text,
  revision      integer                  DEFAULT 1 NOT NULL,
  quarantined   boolean                  DEFAULT false NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.social_comments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_author_id_request_id_key UNIQUE (author_id, request_id);

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_body_check CHECK (char_length(btrim(body)) >= 1 AND char_length(btrim(body)) <= 500);

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_pkey PRIMARY KEY (id);

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_revision_check CHECK (revision > 0);

GRANT SELECT (author_id, body, created_at, id, post_id, quarantined, review_reason, review_status, revision, updated_at) ON public.social_comments TO authenticated;

GRANT ALL ON public.social_comments TO service_role;

CREATE INDEX social_comments_post_idx ON public.social_comments (post_id, created_at DESC, id DESC);

CREATE TRIGGER social_comment_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.social_comments
  FOR EACH ROW
  EXECUTE FUNCTION private.social_comment_changed();

CREATE POLICY "social comments: visible post and identity" ON public.social_comments
  FOR SELECT
  TO authenticated
  USING (private.social_can_view_comment(id));

CREATE TABLE public.social_counters (
  entity_id uuid                         NOT NULL,
  metric    public.social_counter_metric NOT NULL,
  shard     smallint                     NOT NULL,
  value     bigint                       DEFAULT 0 NOT NULL
);

ALTER TABLE public.social_counters
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_counters
  ADD CONSTRAINT social_counters_pkey PRIMARY KEY (entity_id, metric, shard);

ALTER TABLE public.social_counters
  ADD CONSTRAINT social_counters_shard_check CHECK (shard >= 0 AND shard <= 31);

ALTER TABLE public.social_counters
  ADD CONSTRAINT social_counters_value_check CHECK (value >= 0);

GRANT ALL ON public.social_counters TO service_role;

CREATE TABLE public.social_follows (
  follower_id uuid                     NOT NULL,
  followed_id uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.social_follows
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_follows
  ADD CONSTRAINT social_follows_not_self CHECK (follower_id <> followed_id);

ALTER TABLE public.social_follows
  ADD CONSTRAINT social_follows_pkey PRIMARY KEY (follower_id, followed_id);

GRANT SELECT ON public.social_follows TO authenticated;

GRANT ALL ON public.social_follows TO service_role;

CREATE INDEX social_follows_outgoing_idx ON public.social_follows (follower_id, created_at DESC, followed_id DESC);

CREATE INDEX social_follows_incoming_idx ON public.social_follows (followed_id, created_at DESC, follower_id DESC);

CREATE TRIGGER social_follow_changed
  AFTER INSERT OR DELETE ON public.social_follows
  FOR EACH ROW
  EXECUTE FUNCTION private.social_follow_changed();

CREATE POLICY "social follows: visible endpoints" ON public.social_follows
  FOR SELECT
  TO authenticated
  USING ((private.social_can_view_profile(follower_id) AND private.social_can_view_profile(followed_id)));

CREATE TABLE public.social_likes (
  post_id    uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.social_likes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_likes
  ADD CONSTRAINT social_likes_pkey PRIMARY KEY (post_id, user_id);

GRANT SELECT ON public.social_likes TO authenticated;

GRANT ALL ON public.social_likes TO service_role;

CREATE INDEX social_likes_user_idx ON public.social_likes (user_id, post_id);

CREATE TRIGGER social_like_changed
  AFTER INSERT OR DELETE ON public.social_likes
  FOR EACH ROW
  EXECUTE FUNCTION private.social_like_changed();

CREATE POLICY "social likes: visible post and identity" ON public.social_likes
  FOR SELECT
  TO authenticated
  USING ((private.social_can_view_post(post_id) AND private.social_can_view_profile(user_id)));

CREATE TABLE public.social_notifications (
  id           uuid                        DEFAULT gen_random_uuid() NOT NULL,
  recipient_id uuid                        NOT NULL,
  actor_id     uuid                        NOT NULL,
  kind         public.social_activity_kind NOT NULL,
  post_id      uuid,
  comment_id   uuid,
  created_at   timestamp with time zone    DEFAULT now() NOT NULL,
  read_at      timestamp with time zone
);

ALTER TABLE public.social_notifications
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.social_comments(id) ON DELETE CASCADE;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_not_self CHECK (recipient_id <> actor_id);

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_shape
    CHECK (kind = 'follow'::public.social_activity_kind AND post_id IS NULL AND comment_id IS NULL OR kind = 'like'::public.social_activity_kind AND post_id IS
    NOT NULL AND comment_id IS NULL OR kind = 'comment'::public.social_activity_kind AND post_id IS NOT NULL AND comment_id IS NOT NULL);

GRANT SELECT ON public.social_notifications TO authenticated;

GRANT ALL ON public.social_notifications TO service_role;

CREATE INDEX social_notifications_recipient_idx ON public.social_notifications (recipient_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX social_notifications_comment_unique ON public.social_notifications (comment_id)
  WHERE comment_id IS NOT NULL;

CREATE UNIQUE INDEX social_notifications_follow_unique ON public.social_notifications (recipient_id, actor_id)
  WHERE kind = 'follow'::public.social_activity_kind;

CREATE INDEX social_notifications_unread_idx ON public.social_notifications (recipient_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

CREATE INDEX social_notifications_post_idx ON public.social_notifications (post_id, actor_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX social_notifications_actor_idx ON public.social_notifications (actor_id, recipient_id);

CREATE POLICY "social notifications: recipient and visible content" ON public.social_notifications
  FOR SELECT
  TO authenticated
  USING (((recipient_id = ( SELECT auth.uid() AS uid)) AND private.social_can_view_notification(id)));

CREATE TABLE public.social_posts (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  author_id       uuid                     NOT NULL,
  source_entry_id uuid                     NOT NULL,
  food_name       text                     NOT NULL,
  icon_set        public.icon_set,
  icon_name       text,
  photo_path      text,
  photo_etag      text,
  caption         text                     DEFAULT ''::text NOT NULL,
  audience        public.social_audience   DEFAULT 'public'::public.social_audience NOT NULL,
  review_status   public.recipe_review     DEFAULT 'pending'::public.recipe_review NOT NULL,
  review_reason   text,
  revision        integer                  DEFAULT 1 NOT NULL,
  quarantined     boolean                  DEFAULT false NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  published_at    timestamp with time zone,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.social_posts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_caption_check CHECK (char_length(caption) <= 280);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_food_name_check CHECK (char_length(food_name) >= 1 AND char_length(food_name) <= 160);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_icon_complete CHECK ((icon_set IS NULL) = (icon_name IS NULL));

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_photo_owned CHECK (photo_path IS NULL OR photo_path ~~ (('meals/'::text || author_id::text) || '/%'::text));

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;

ALTER TABLE public.social_likes
  ADD CONSTRAINT social_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.social_posts(id) ON DELETE CASCADE;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_revision_check CHECK (revision > 0);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_source_entry_id_fkey FOREIGN KEY (source_entry_id) REFERENCES public.food_logs(id) ON DELETE CASCADE;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_source_entry_id_key UNIQUE (source_entry_id);

GRANT SELECT
  (audience, author_id, caption, created_at, food_name, icon_name, icon_set, id, photo_etag, photo_path, published_at, quarantined, review_reason, review_status, revision,
  updated_at) ON public.social_posts TO authenticated;

GRANT ALL ON public.social_posts TO service_role;

CREATE INDEX social_posts_author_idx ON public.social_posts (author_id, created_at DESC, id DESC);

CREATE INDEX social_posts_author_feed_idx ON public.social_posts (author_id, created_at DESC, id DESC)
  WHERE review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE INDEX social_posts_photo_idx ON public.social_posts (photo_path)
  WHERE photo_path IS NOT NULL AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE INDEX social_posts_discover_idx ON public.social_posts (created_at DESC, id DESC)
  WHERE audience = 'public'::public.social_audience AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE TRIGGER social_post_changed
  AFTER INSERT OR DELETE OR UPDATE ON public.social_posts
  FOR EACH ROW
  EXECUTE FUNCTION private.social_post_changed();

CREATE POLICY "social posts: approved audience or own" ON public.social_posts
  FOR SELECT
  TO authenticated
  USING (private.social_can_view_post(id));

CREATE TABLE public.social_profiles (
  user_id       uuid                     NOT NULL,
  handle        text                     COLLATE "C" NOT NULL,
  display_name  text                     NOT NULL,
  bio           text                     DEFAULT ''::text NOT NULL,
  avatar_path   text,
  photo_etag    text,
  review_status public.recipe_review     DEFAULT 'pending'::public.recipe_review NOT NULL,
  review_reason text,
  revision      integer                  DEFAULT 1 NOT NULL,
  quarantined   boolean                  DEFAULT false NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.social_profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_profiles
  ADD CONSTRAINT social_profiles_avatar_owned CHECK (avatar_path IS NULL OR avatar_path ~~ (('avatars/'::text || user_id::text) || '/%'::text));

ALTER TABLE public.social_profiles
  ADD CONSTRAINT social_profiles_bio_check CHECK (char_length(bio) <= 160);

ALTER TABLE public.social_profiles
  ADD CONSTRAINT social_profiles_display_name_check CHECK (char_length(btrim(display_name)) >= 1 AND char_length(btrim(display_name)) <= 60);

ALTER TABLE public.social_profiles
  ADD CONSTRAINT social_profiles_handle_check CHECK (handle ~ '^[a-z0-9_]{3,24}$'::text);

ALTER TABLE public.social_profiles
  ADD CONSTRAINT social_profiles_handle_key UNIQUE (handle);

ALTER TABLE public.social_profiles
  ADD CONSTRAINT social_profiles_pkey PRIMARY KEY (user_id);

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.social_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.social_follows
  ADD CONSTRAINT social_follows_followed_id_fkey FOREIGN KEY (followed_id) REFERENCES public.social_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.social_follows
  ADD CONSTRAINT social_follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.social_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.social_likes
  ADD CONSTRAINT social_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.social_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.social_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.social_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.social_profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.social_profiles
  ADD CONSTRAINT social_profiles_revision_check CHECK (revision > 0);

ALTER TABLE public.social_profiles
  ADD CONSTRAINT social_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT ON public.social_profiles TO authenticated;

GRANT ALL ON public.social_profiles TO service_role;

CREATE INDEX social_profiles_avatar_idx ON public.social_profiles (avatar_path)
  WHERE avatar_path IS NOT NULL AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE INDEX social_profiles_discover_idx ON public.social_profiles (created_at DESC, user_id DESC)
  WHERE review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE TRIGGER social_profile_deleted
  AFTER DELETE ON public.social_profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.social_profile_deleted();

CREATE POLICY "social profiles: visible identities" ON public.social_profiles
  FOR SELECT
  TO authenticated
  USING (private.social_can_view_profile(user_id));

CREATE TABLE public.social_rate_limits (
  user_id uuid                     NOT NULL,
  action  text                     NOT NULL,
  bucket  timestamp with time zone NOT NULL,
  used    integer                  NOT NULL
);

ALTER TABLE public.social_rate_limits
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_rate_limits
  ADD CONSTRAINT social_rate_limits_pkey PRIMARY KEY (user_id, action);

ALTER TABLE public.social_rate_limits
  ADD CONSTRAINT social_rate_limits_used_check CHECK (used > 0);

ALTER TABLE public.social_rate_limits
  ADD CONSTRAINT social_rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.social_rate_limits TO service_role;

CREATE TABLE public.social_reports (
  kind             public.social_content_kind NOT NULL,
  content_id       uuid                       NOT NULL,
  content_revision integer                    NOT NULL,
  reporter_id      uuid                       NOT NULL,
  reason           public.report_reason       NOT NULL,
  created_at       timestamp with time zone   DEFAULT now() NOT NULL,
  resolved_at      timestamp with time zone
);

ALTER TABLE public.social_reports
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_reports
  ADD CONSTRAINT social_reports_content_revision_check CHECK (content_revision > 0);

ALTER TABLE public.social_reports
  ADD CONSTRAINT social_reports_pkey PRIMARY KEY (kind, content_id, content_revision, reporter_id);

ALTER TABLE public.social_reports
  ADD CONSTRAINT social_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT ON public.social_reports TO authenticated;

GRANT ALL ON public.social_reports TO service_role;

CREATE INDEX social_reports_reporter_idx ON public.social_reports (reporter_id, kind, content_id, content_revision);

CREATE POLICY "social reports: own" ON public.social_reports
  FOR SELECT
  TO authenticated
  USING ((reporter_id = ( SELECT auth.uid() AS uid)));

CREATE VIEW public.social_comment_details WITH (security_invoker=true) AS SELECT c.id,
    c.post_id,
    c.author_id,
    a.handle,
    a.display_name,
    a.avatar_path,
    c.body,
    c.review_status,
    c.review_reason,
    c.revision,
    c.quarantined,
    c.created_at
   FROM (public.social_comments c
     JOIN public.social_profiles a ON ((a.user_id = c.author_id)));

CREATE FUNCTION public.social_comments (
  p_post_id   uuid,
  p_before_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                     DEFAULT NULL::uuid,
  p_limit     integer                  DEFAULT 20
)
  RETURNS SETOF public.social_comment_details
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  return query select d.* from public.social_comment_details d where d.post_id = p_post_id
    and (p_before_at is null or (d.created_at, d.id) < (p_before_at, p_before_id))
    order by d.created_at desc, d.id desc limit p_limit + 1;
end;
$function$;

GRANT ALL ON FUNCTION public.social_comments(uuid, timestamp WITH time zone, uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.social_comments(uuid, timestamp WITH time zone, uuid, integer) TO service_role;

GRANT SELECT ON public.social_comment_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.social_comment_details TO service_role;

CREATE VIEW public.social_notification_details WITH (security_invoker=true) AS SELECT n.id,
    n.kind,
    n.actor_id,
    a.handle AS actor_handle,
    a.display_name AS actor_display_name,
    a.avatar_path AS actor_avatar_path,
    n.post_id,
    n.comment_id,
    n.created_at,
    n.read_at
   FROM (public.social_notifications n
     JOIN public.social_profiles a ON ((a.user_id = n.actor_id)));

CREATE FUNCTION public.social_notifications (
  p_before_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                     DEFAULT NULL::uuid,
  p_limit     integer                  DEFAULT 20
)
  RETURNS SETOF public.social_notification_details
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  return query select d.* from public.social_notification_details d
    where (p_before_at is null or (d.created_at, d.id) < (p_before_at, p_before_id))
    order by d.created_at desc, d.id desc limit p_limit + 1;
end;
$function$;

GRANT ALL ON FUNCTION public.social_notifications(timestamp WITH time zone, uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.social_notifications(timestamp WITH time zone, uuid, integer) TO service_role;

GRANT SELECT ON public.social_notification_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.social_notification_details TO service_role;

CREATE VIEW public.social_post_details WITH (security_invoker=true) AS SELECT p.id,
    p.author_id,
    a.handle,
    a.display_name,
    a.avatar_path,
    p.food_name,
    p.icon_set,
    p.icon_name,
    p.photo_path,
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
         LIMIT 1), false) AS is_following
   FROM (public.social_posts p
     JOIN public.social_profiles a ON ((a.user_id = p.author_id)));

CREATE FUNCTION public.social_feed (
  p_mode      text                     DEFAULT 'following'::text,
  p_before_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                     DEFAULT NULL::uuid,
  p_limit     integer                  DEFAULT 20
)
  RETURNS SETOF public.social_post_details
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  return query
    with page as materialized (
      select c.id, c.created_at from private.social_feed_candidates(p_mode, p_before_at, p_before_id, p_limit) c
    )
    select d.* from page p join public.social_post_details d on d.id = p.id order by p.created_at desc, p.id desc;
end;
$function$;

GRANT ALL ON FUNCTION public.social_feed(text, timestamp WITH time zone, uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.social_feed(text, timestamp WITH time zone, uuid, integer) TO service_role;

CREATE FUNCTION public.social_post (
  p_id uuid
)
  RETURNS SETOF public.social_post_details
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select * from public.social_post_details where id = p_id;
$function$;

GRANT ALL ON FUNCTION public.social_post(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.social_post(uuid) TO service_role;

CREATE FUNCTION public.social_profile_posts (
  p_user_id   uuid,
  p_before_at timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_before_id uuid                     DEFAULT NULL::uuid,
  p_limit     integer                  DEFAULT 20
)
  RETURNS SETOF public.social_post_details
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  return query select d.* from public.social_post_details d where d.author_id = p_user_id
    and (p_before_at is null or (d.created_at, d.id) < (p_before_at, p_before_id))
    order by d.created_at desc, d.id desc limit p_limit + 1;
end;
$function$;

GRANT ALL ON FUNCTION public.social_profile_posts(uuid, timestamp WITH time zone, uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.social_profile_posts(uuid, timestamp WITH time zone, uuid, integer) TO service_role;

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
    created_at
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

GRANT ALL ON FUNCTION public.social_profile(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.social_profile(uuid) TO service_role;

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
  if v_query is null or v_query !~ '^[a-z0-9_]{1,24}$' then raise exception 'Invalid handle search' using errcode = '22023'; end if;
  if p_after_handle is not null and p_after_handle !~ '^[a-z0-9_]{3,24}$' then raise exception 'Invalid search cursor' using errcode = '22023'; end if;
  return query select d.* from public.social_profile_details d
    where starts_with(d.handle, v_query) and (p_after_handle is null or d.handle > p_after_handle)
    order by d.handle limit p_limit + 1;
end;
$function$;

GRANT ALL ON FUNCTION public.social_search_profiles(text, text, integer) TO authenticated;

GRANT ALL ON FUNCTION public.social_search_profiles(text, text, integer) TO service_role;

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

GRANT ALL ON FUNCTION public.social_suggestions(integer) TO authenticated;

GRANT ALL ON FUNCTION public.social_suggestions(integer) TO service_role;

GRANT SELECT ON public.social_profile_details TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.social_profile_details TO service_role;
-- Explicit privileges are not fully emitted by the schema diff. Reapply the
-- declarative grants and revokes so default PUBLIC execution cannot survive.
revoke all on schema private from public;

grant usage on schema private to authenticated, service_role;

revoke all on public.social_profiles, public.social_follows, public.social_posts,
  public.social_likes, public.social_comments, public.social_reports, public.social_counters,
  public.social_notifications, public.social_rate_limits from anon, authenticated;

grant all on public.social_profiles, public.social_follows, public.social_posts,
  public.social_likes, public.social_comments, public.social_reports, public.social_counters,
  public.social_notifications, public.social_rate_limits to service_role;

grant select on public.social_profiles, public.social_follows, public.social_likes,
  public.social_reports, public.social_notifications to authenticated;

grant select (id, author_id, food_name, icon_set, icon_name, photo_path, caption,
  audience, review_status, review_reason, revision, quarantined, photo_etag, created_at, published_at, updated_at)
  on public.social_posts to authenticated;

grant select (id, post_id, author_id, body, review_status, review_reason, revision,
  quarantined, created_at, updated_at) on public.social_comments to authenticated;

revoke execute on function private.social_pair_blocked, private.social_can_view_profile,
  private.social_can_view_post, private.social_can_view_comment,
  private.social_can_view_notification from public, anon;

grant execute on function private.social_pair_blocked, private.social_can_view_profile,
  private.social_can_view_post, private.social_can_view_comment,
  private.social_can_view_notification to authenticated, service_role;

revoke execute on function private.social_count from public, anon;

grant execute on function private.social_count to authenticated, service_role;

revoke execute on function private.social_require_user, private.social_claim,
  private.social_counter_change, private.social_lock_pair, private.social_block_before,
  private.social_block_after, private.social_follow_changed, private.social_like_changed,
  private.social_post_changed, private.social_comment_changed, private.social_profile_deleted,
  private.social_source_photo_changed from public, anon, authenticated;

revoke execute on function public.set_social_profile, public.create_social_post, public.update_social_post,
  public.delete_social_post, public.set_social_follow, public.remove_social_follower, public.set_social_like,
  public.create_social_comment, public.update_social_comment, public.delete_social_comment, public.report_social_content from public, anon;

grant execute on function public.set_social_profile, public.create_social_post, public.update_social_post,
  public.delete_social_post, public.set_social_follow, public.remove_social_follower, public.set_social_like,
  public.create_social_comment, public.update_social_comment, public.delete_social_comment, public.report_social_content to authenticated, service_role;

revoke execute on function public.claim_social_review, public.review_social_content, public.resolve_social_report from public, anon, authenticated;

grant execute on function public.claim_social_review, public.review_social_content, public.resolve_social_report to service_role;

revoke all on public.social_profile_details, public.social_post_details,
  public.social_comment_details, public.social_notification_details from anon, authenticated;

grant select on public.social_profile_details, public.social_post_details,
  public.social_comment_details, public.social_notification_details to authenticated, service_role;

revoke all on public.social_profile_details, public.social_post_details,
  public.social_comment_details, public.social_notification_details from anon;

revoke execute on function private.social_validate_page from public, anon;

grant execute on function private.social_validate_page to authenticated, service_role;

revoke execute on function private.social_feed_candidates from public, anon;

grant execute on function private.social_feed_candidates to authenticated, service_role;

revoke execute on function private.social_suggestion_candidates from public, anon;

grant execute on function private.social_suggestion_candidates to authenticated, service_role;

revoke execute on function public.social_profile, public.social_post, public.social_entry_post,
  public.social_feed, public.social_profile_posts, public.social_comments, public.social_connections,
  public.social_search_profiles, public.social_suggestions, public.social_blocked_profiles,
  public.social_notifications, public.social_unread_notification_count,
  public.mark_social_notifications_read,
  public.social_photo_claims from public, anon;

grant execute on function public.social_profile, public.social_post, public.social_entry_post,
  public.social_feed, public.social_profile_posts, public.social_comments, public.social_connections,
  public.social_search_profiles, public.social_suggestions, public.social_blocked_profiles,
  public.social_notifications, public.social_unread_notification_count,
  public.mark_social_notifications_read,
  public.social_photo_claims to authenticated, service_role;
