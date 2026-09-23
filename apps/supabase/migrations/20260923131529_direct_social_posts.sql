-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP INDEX public.social_profiles_avatar_idx;

DROP INDEX public.social_profiles_discover_idx;

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
        (p.social_joined_at is not null or p.handle is not null)
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
        where f.follower_id = v_user and (a.handle is not null or a.social_joined_at is not null)
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
        and (a.handle is not null or a.social_joined_at is not null)
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
    new.revision := case when old.handle is null and old.social_joined_at is null
      then 1 else old.revision + 1 end;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.social_require_user (
  p_identity boolean DEFAULT true
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null or not exists (select 1 from auth.users where id = v_user) then
    raise exception 'Sign in to continue' using errcode = '42501';
  end if;
  if p_identity then
    update public.profiles set social_joined_at = coalesce(social_joined_at, now()),
      review_status = 'approved', review_reason = null
      where id = v_user and (social_joined_at is null or review_status = 'pending') and not quarantined;
    if not exists (select 1 from public.profiles p where p.id = v_user and not p.quarantined) then
      raise exception 'Profile unavailable' using errcode = '42501';
    end if;
  end if;
  return v_user;
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
      where f.follower_id = v_user and (a.handle is not null or a.social_joined_at is not null)
        and a.review_status = 'approved' and not a.quarantined
        and f.followed_id not in (select h.user_id from hidden_authors h)
      order by f.created_at desc, f.followed_id desc limit 64
    ), paths as materialized (
      select f.followed_id from seeds s cross join lateral (
        select edge.followed_id from public.social_follows edge
          join public.profiles a on a.id = edge.followed_id
        where edge.follower_id = s.followed_id
          and (a.id = v_user or ((a.handle is not null or a.social_joined_at is not null)
            and a.review_status = 'approved' and not a.quarantined
            and a.id not in (select h.user_id from hidden_authors h)))
        order by edge.created_at desc, edge.followed_id desc limit 64
      ) f
    ), mutual as materialized (
      select p.followed_id as user_id, count(*) as weight from paths p group by p.followed_id
      order by count(*) desc, p.followed_id limit 256
    ), recent as materialized (
      select p.id as user_id, 0::bigint as weight from public.profiles p
      where (p.handle is not null or p.social_joined_at is not null)
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

CREATE OR REPLACE FUNCTION public.create_social_post (
  p_entry_id uuid,
  p_caption  text,
  p_audience public.social_audience
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid := private.social_require_user();
  v_id uuid;
  v_entry public.food_logs;
  v_totals record;
begin
  -- The source lock also serializes publication against its deletion or photo replacement.
  select * into v_entry from public.food_logs where id = p_entry_id and user_id = v_user for share;
  if not found then raise exception 'Meal unavailable' using errcode = '42501'; end if;
  select id into v_id from public.social_posts where source_entry_id = p_entry_id and author_id = v_user;
  if found then return v_id; end if;
  if not private.social_claim(v_user, 'post', 30) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  -- The diary's own arithmetic (typed overrides, then parts, then the portion),
  -- so a post never disagrees with the entry it was shared from.
  select d.kcal, d.carbs_g, d.protein_g, d.fat_g into v_totals
  from public.food_log_details d where d.id = p_entry_id;
  insert into public.social_posts(author_id, source_entry_id, food_name, icon_set, icon_name, photo_path,
    kcal, carbs_g, protein_g, fat_g, caption, audience, review_status, published_at)
  values (v_user, p_entry_id, left(coalesce(v_entry.display_label, v_entry.item_name), 160),
    coalesce(v_entry.icon_set, v_entry.item_icon_set), coalesce(v_entry.icon_name, v_entry.item_icon_name),
    case when v_entry.photo_path like 'meals/' || v_user::text || '/%' then v_entry.photo_path end,
    v_totals.kcal, v_totals.carbs_g, v_totals.protein_g, v_totals.fat_g,
    btrim(coalesce(p_caption, '')), p_audience, 'approved', now())
  on conflict (source_entry_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.social_posts where source_entry_id = p_entry_id and author_id = v_user;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_social_profile (
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
  update public.profiles set handle = nullif(lower(btrim(p_handle)), ''), display_name = btrim(p_display_name),
    bio = btrim(coalesce(p_bio, '')), avatar_path = p_avatar_path,
    social_joined_at = coalesce(social_joined_at, now()), review_status = 'approved', review_reason = null
    where id = v_user;
  if not found then raise exception 'Profile unavailable' using errcode = '42501'; end if;
  return v_user;
end;
$function$;

CREATE OR REPLACE FUNCTION public.social_photo_claims (
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
      where sp.photo_path = k.key and sp.review_status = 'approved' and not sp.quarantined limit 1
    ) p
    union all
    select p.user_id, p.avatar_path, p.photo_etag, 'avatar'::text from keys k cross join lateral (
      select sp.user_id, sp.avatar_path, sp.photo_etag from public.social_profiles sp
      where sp.avatar_path = k.key and sp.review_status = 'approved' and not sp.quarantined limit 1
    ) p;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_social_post (
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
  update public.social_posts set caption = btrim(coalesce(p_caption, '')), audience = p_audience,
    review_status = 'approved', review_reason = null, revision = revision + 1, updated_at = now(),
    published_at = coalesce(published_at, now())
  where id = p_id and author_id = v_user;
  if not found then raise exception 'Post unavailable' using errcode = '42501'; end if;
  return p_id;
end;
$function$;

ALTER TABLE public.profiles
  ADD COLUMN social_joined_at timestamp with time zone;

CREATE INDEX social_profiles_avatar_idx ON public.profiles (avatar_path)
  WHERE (handle IS NOT NULL OR social_joined_at IS NOT NULL) AND avatar_path IS NOT NULL AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE INDEX social_profiles_discover_idx ON public.profiles (created_at DESC, id DESC)
  WHERE (handle IS NOT NULL OR social_joined_at IS NOT NULL) AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE OR REPLACE VIEW public.social_profiles AS SELECT id AS user_id,
    COALESCE(handle, ''::text) AS handle,
    display_name,
    bio,
    avatar_path,
    photo_etag,
    review_status,
    review_reason,
    revision,
    quarantined,
    created_at,
    updated_at
   FROM public.profiles p
  WHERE private.social_can_view_profile(id);