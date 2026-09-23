-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

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
        where f.follower_id = v_user and a.handle is not null and a.review_status = 'approved' and not a.quarantined
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
        and a.handle is not null and a.review_status = 'approved' and not a.quarantined
        and sp.author_id not in (select e.user_id from excluded_authors e)
        and sp.id not in (select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'post')
        and (p_before_at is null or (sp.created_at, sp.id) < (p_before_at, p_before_id))
      order by sp.created_at desc, sp.id desc limit p_limit + 1;
  end if;
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
      where f.follower_id = v_user and a.handle is not null and a.review_status = 'approved' and not a.quarantined
        and f.followed_id not in (select h.user_id from hidden_authors h)
      order by f.created_at desc, f.followed_id desc limit 64
    ), paths as materialized (
      select f.followed_id from seeds s cross join lateral (
        select edge.followed_id from public.social_follows edge
          join public.profiles a on a.id = edge.followed_id
        where edge.follower_id = s.followed_id
          and (a.id = v_user or (a.handle is not null and a.review_status = 'approved' and not a.quarantined
            and a.id not in (select h.user_id from hidden_authors h)))
        order by edge.created_at desc, edge.followed_id desc limit 64
      ) f
    ), mutual as materialized (
      select p.followed_id as user_id, count(*) as weight from paths p group by p.followed_id
      order by count(*) desc, p.followed_id limit 256
    ), recent as materialized (
      select p.id as user_id, 0::bigint as weight from public.profiles p
      where p.handle is not null and p.review_status = 'approved' and not p.quarantined
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
  ADD CONSTRAINT social_profiles_avatar_owned CHECK (handle IS NULL OR avatar_path IS NULL OR avatar_path ~~ (('avatars/'::text || id::text) || '/%'::text));

ALTER TABLE public.profiles
  ADD CONSTRAINT social_profiles_name_present CHECK (handle IS NULL OR char_length(btrim(display_name)) >= 1 AND char_length(btrim(display_name)) <= 60);