-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP FUNCTION public.social_comments(p_post_id uuid, p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer);

DROP FUNCTION public.social_feed(p_mode text, p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer);

DROP FUNCTION public.social_notifications(p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer);

DROP FUNCTION public.social_post(p_id uuid);

DROP FUNCTION public.social_profile_posts(p_user_id uuid, p_before_at timestamp WITH time zone, p_before_id uuid, p_limit integer);

DROP FUNCTION public.social_profile(p_user_id uuid);

DROP FUNCTION public.social_search_profiles(p_query text, p_after_handle text, p_limit integer);

DROP FUNCTION public.social_suggestions(p_limit integer);

DROP INDEX public.social_profiles_avatar_idx;

DROP INDEX public.social_profiles_discover_idx;

DROP VIEW public.social_comment_details;

DROP VIEW public.social_notification_details;

DROP VIEW public.social_post_details;

DROP VIEW public.social_profile_details;

DROP VIEW public.social_profiles;

CREATE OR REPLACE FUNCTION private.social_can_view_profile (
  p_user uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles p where p.id = p_user and (
      p.id = (select auth.uid()) or (
        p.review_status = 'approved' and not p.quarantined
        and not private.social_pair_blocked(p.id)
        and not exists (select 1 from public.social_reports r
          where r.kind = 'profile' and r.content_id = p.id
            and r.reporter_id = (select auth.uid()))
      )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION private.social_feed_candidates (
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
          join public.profiles a on a.id = f.followed_id
        where f.follower_id = v_user and a.social_joined_at is not null
          and a.review_status = 'approved' and not a.quarantined
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
        join public.profiles a on a.id = sp.author_id
      where sp.audience = 'public' and sp.review_status = 'approved' and not sp.quarantined
        and not a.is_private and a.review_status = 'approved' and not a.quarantined
        and sp.author_id not in (select e.user_id from excluded_authors e)
        and sp.id not in (select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'post')
        and (p_before_at is null or (sp.created_at, sp.id) < (p_before_at, p_before_id))
      order by sp.created_at desc, sp.id desc limit p_limit + 1;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.social_profile_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.handle is distinct from old.handle or new.display_name is distinct from old.display_name
      or new.bio is distinct from old.bio or new.avatar_path is distinct from old.avatar_path then
    new.review_status := 'approved';
    new.review_reason := null;
    new.photo_etag := null;
    new.revision := case when old.social_joined_at is null
      then 1 else old.revision + 1 end;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.social_suggestion_candidates (
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
        join public.profiles a on a.id = f.followed_id
      where f.follower_id = v_user
        and a.review_status = 'approved' and not a.quarantined
        and f.followed_id not in (select h.user_id from hidden_authors h)
      order by f.created_at desc, f.followed_id desc limit 64
    ), paths as materialized (
      select f.followed_id from seeds s cross join lateral (
        select edge.followed_id from public.social_follows edge
          join public.profiles a on a.id = edge.followed_id
        where edge.follower_id = s.followed_id
          and (a.id = v_user or (not a.is_private
            and a.review_status = 'approved' and not a.quarantined
            and a.id not in (select h.user_id from hidden_authors h)))
        order by edge.created_at desc, edge.followed_id desc limit 64
      ) f
    ), mutual as materialized (
      select p.followed_id as user_id, count(*) as weight from paths p group by p.followed_id
      order by count(*) desc, p.followed_id limit 256
    ), recent as materialized (
      select p.id as user_id, 0::bigint as weight from public.profiles p
      where not p.is_private and p.review_status = 'approved' and not p.quarantined
        and p.id not in (select h.user_id from hidden_authors h)
      order by p.created_at desc, p.id desc limit 512
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

ALTER TABLE public.profiles
  ALTER COLUMN review_status SET DEFAULT 'approved'::public.recipe_review;

ALTER TABLE public.profiles
  ADD COLUMN is_private boolean DEFAULT false NOT NULL;

REVOKE UPDATE (activity_level, avatar_path, bio, birth_date, display_name, food_styles, handle, height_cm, onboarded_at, referral_source, sex, target_weight_kg, timezone)
  ON public.profiles FROM authenticated;

GRANT UPDATE
  (activity_level, avatar_path, bio, birth_date, display_name, food_styles, handle, height_cm, is_private, onboarded_at, referral_source, sex, target_weight_kg, timezone)
  ON public.profiles TO authenticated;

CREATE INDEX social_profiles_avatar_idx ON public.profiles (avatar_path)
  WHERE avatar_path IS NOT NULL AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE INDEX social_profiles_discover_idx ON public.profiles (created_at DESC, id DESC)
  WHERE NOT is_private AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE VIEW public.social_profiles AS SELECT id AS user_id,
    COALESCE(handle, ''::text) AS handle,
    display_name,
    bio,
        CASE
            WHEN (avatar_path ~~ (('avatars/'::text || (id)::text) || '/%'::text)) THEN avatar_path
            ELSE NULL::text
        END AS avatar_path,
        CASE
            WHEN (avatar_path ~~ (('avatars/'::text || (id)::text) || '/%'::text)) THEN photo_etag
            ELSE NULL::text
        END AS photo_etag,
    review_status,
    review_reason,
    revision,
    quarantined,
    created_at,
    updated_at,
    is_private
   FROM public.profiles p
  WHERE private.social_can_view_profile(id);

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
    p.kcal,
    p.carbs_g,
    p.protein_g,
    p.fat_g,
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

CREATE OR REPLACE FUNCTION public.social_search_profiles (
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

GRANT SELECT ON public.social_profiles TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.social_profiles TO service_role;

-- Recreated read functions regain Postgres' default PUBLIC execute grant.
REVOKE EXECUTE ON FUNCTION public.social_comments(uuid,timestamptz,uuid,integer),
  public.social_feed(text,timestamptz,uuid,integer),
  public.social_notifications(timestamptz,uuid,integer),
  public.social_post(uuid), public.social_profile_posts(uuid,timestamptz,uuid,integer),
  public.social_profile(uuid), public.social_search_profiles(text,text,integer),
  public.social_suggestions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_comments(uuid,timestamptz,uuid,integer),
  public.social_feed(text,timestamptz,uuid,integer),
  public.social_notifications(timestamptz,uuid,integer),
  public.social_post(uuid), public.social_profile_posts(uuid,timestamptz,uuid,integer),
  public.social_profile(uuid), public.social_search_profiles(text,text,integer),
  public.social_suggestions(integer) TO authenticated, service_role;

-- Accounts with no social action were held at pending by the old rule.
UPDATE public.profiles SET review_status = 'approved'
WHERE social_joined_at IS NULL AND review_status = 'pending' AND NOT quarantined;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_comment_details FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_comment_details FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_notification_details FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_notification_details FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_post_details FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_post_details FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_profile_details FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_profile_details FROM authenticated;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_profiles FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.social_profiles FROM authenticated;