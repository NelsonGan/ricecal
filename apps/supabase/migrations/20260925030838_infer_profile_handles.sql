-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_handle_check;

ALTER TABLE public.profiles
  DROP CONSTRAINT social_profiles_avatar_owned;

ALTER TABLE public.profiles
  DROP CONSTRAINT social_profiles_name_present;

DROP INDEX public.social_profiles_avatar_idx;

DROP INDEX public.social_profiles_discover_idx;

CREATE FUNCTION private.assign_profile_handle()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_base text;
  v_candidate text;
  v_suffix text;
  v_number integer := 0;
begin
  if new.handle is not null and new.handle <> '' then
    perform pg_advisory_xact_lock(hashtextextended('profile.handle:' || new.handle, 0));
    return new;
  end if;

  v_base := lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(new.display_name, '')));
  v_base := regexp_replace(v_base, '[[:space:]]+', '.', 'g');
  v_base := regexp_replace(v_base, '[^a-z0-9._]', '', 'g');
  v_base := trim(both '.' from regexp_replace(v_base, '[.]+', '.', 'g'));
  v_base := left(v_base, 24);
  if char_length(v_base) < 3 then
    v_base := 'user.' || left(replace(new.id::text, '-', ''), 8);
  end if;

  loop
    v_suffix := case when v_number = 0 then '' else '.' || v_number::text end;
    v_candidate := left(v_base, 24 - char_length(v_suffix)) || v_suffix;
    perform pg_advisory_xact_lock(hashtextextended('profile.handle:' || v_candidate, 0));
    exit when not exists (
      select 1 from public.profiles p where p.handle = v_candidate and p.id <> new.id
    );
    v_number := v_number + 1;
  end loop;
  new.handle := v_candidate;
  return new;
end;
$function$;

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
        p.social_joined_at is not null
        and p.review_status = 'approved' and not p.quarantined
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
        and a.social_joined_at is not null
        and a.review_status = 'approved' and not a.quarantined
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
    new.review_status := case when new.social_joined_at is not null then 'approved' else 'pending' end;
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
      where f.follower_id = v_user and a.social_joined_at is not null
        and a.review_status = 'approved' and not a.quarantined
        and f.followed_id not in (select h.user_id from hidden_authors h)
      order by f.created_at desc, f.followed_id desc limit 64
    ), paths as materialized (
      select f.followed_id from seeds s cross join lateral (
        select edge.followed_id from public.social_follows edge
          join public.profiles a on a.id = edge.followed_id
        where edge.follower_id = s.followed_id
          and (a.id = v_user or (a.social_joined_at is not null
            and a.review_status = 'approved' and not a.quarantined
            and a.id not in (select h.user_id from hidden_authors h)))
        order by edge.created_at desc, edge.followed_id desc limit 64
      ) f
    ), mutual as materialized (
      select p.followed_id as user_id, count(*) as weight from paths p group by p.followed_id
      order by count(*) desc, p.followed_id limit 256
    ), recent as materialized (
      select p.id as user_id, 0::bigint as weight from public.profiles p
      where p.social_joined_at is not null
        and p.review_status = 'approved' and not p.quarantined
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
  return query select d.* from public.social_profile_details d
    where starts_with(d.handle, v_query) and (p_after_handle is null or d.handle > p_after_handle)
    order by d.handle limit p_limit + 1;
end;
$function$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_handle_check CHECK (handle ~ '^[a-z0-9_.]{3,24}$'::text);

ALTER TABLE public.profiles
  ADD CONSTRAINT social_profiles_avatar_owned CHECK (social_joined_at IS NULL OR avatar_path IS NULL OR avatar_path ~~ (('avatars/'::text || id::text) || '/%'::text));

ALTER TABLE public.profiles
  ADD CONSTRAINT social_profiles_name_present CHECK (social_joined_at IS NULL OR char_length(btrim(display_name)) >= 1 AND char_length(btrim(display_name)) <= 60);

CREATE INDEX social_profiles_avatar_idx ON public.profiles (avatar_path)
  WHERE social_joined_at IS NOT NULL AND avatar_path IS NOT NULL AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE INDEX social_profiles_discover_idx ON public.profiles (created_at DESC, id DESC)
  WHERE social_joined_at IS NOT NULL AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE TRIGGER assign_profile_handle
  BEFORE INSERT OR UPDATE OF handle, display_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.assign_profile_handle();

REVOKE EXECUTE ON FUNCTION private.assign_profile_handle() FROM public, anon, authenticated;

-- A single UPDATE cannot safely pick distinct suffixes for repeated names.
-- Give each legacy row its own statement so the next row sees the prior handle.
DO $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.profiles WHERE handle IS NULL ORDER BY id LOOP
    UPDATE public.profiles SET handle = NULL WHERE id = v_id;
  END LOOP;
END;
$$;
