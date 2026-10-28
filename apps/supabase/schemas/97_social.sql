-- Read contracts contain only publication fields. The source diary identifier,
-- request tokens and reviewed image validators never travel with a feed card.
-- Scalar relationship lookups keep both index keys. An EXISTS projection can
-- instead hash the entire graph and run its visibility checks for every edge.
-- A published post reveals only these fields of its source entry. The diary
-- stays owner-only, so this helper checks post visibility before reading it.
create or replace function private.social_post_food(p_post_id uuid)
returns table (
  food_name text, icon_set public.icon_set, icon_name text, photo_path text,
  kcal integer, carbs_g numeric, protein_g numeric, fat_g numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_entry_id uuid;
  v_author_id uuid;
  v_photo_path text;
begin
  select p.source_entry_id, p.author_id, p.photo_path
    into v_entry_id, v_author_id, v_photo_path
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'food' and private.social_can_view_post(p.id);
  if not found then return; end if;

  -- Look up the one entry by primary key. Joining the expanded diary view to
  -- posts made Postgres scan every logged meal belonging to a busy author.
  return query select left(d.food_name, 160), d.icon_set, d.icon_name,
    -- A replacement photo must pass the existing review and signing path.
    case when d.photo_path = v_photo_path then d.photo_path end,
    d.kcal, d.carbs_g, d.protein_g, d.fat_g
  from public.food_log_details d
  where d.id = v_entry_id and d.user_id = v_author_id;
end;
$$;
revoke execute on function private.social_post_food from public, anon;
grant execute on function private.social_post_food to authenticated, service_role;

-- The same for a workout: what a card draws, read live, so an edit to the
-- workout shows in its post. Never its notes, which are the author's own.
-- Figures follow workout_summaries' definitions, taken for the one workout
-- rather than through that view, which scores records over every account's
-- sets when read as its owner.
create or replace function private.social_post_workout(p_post_id uuid)
returns table (
  workout_name text, workout_started_at timestamptz, workout_duration_s integer,
  workout_sets integer, workout_volume_kg numeric, workout_exercises jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_workout_id uuid;
  v_author_id uuid;
begin
  select p.source_workout_id, p.author_id into v_workout_id, v_author_id
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'workout' and private.social_can_view_post(p.id);
  if not found then return; end if;

  return query select w.name, w.started_at, w.duration_s,
    coalesce(stats.set_count, 0), coalesce(stats.volume_kg, 0),
    coalesce(list.exercises, '[]'::jsonb)
  from public.workouts w
  left join lateral (
    select count(*)::integer as set_count, sum(v.volume_kg) as volume_kg
    from public.workout_set_values v where v.workout_id = w.id
  ) stats on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'exercise_id', e.exercise_id,
      'exercise_name', e.exercise_name,
      'sets', (select count(*) from public.workout_sets s where s.workout_exercise_id = e.id)
    ) order by e.position) as exercises
    from public.workout_exercises e where e.workout_id = w.id
  ) list on true
  where w.id = v_workout_id and w.user_id = v_author_id;
end;
$$;
revoke execute on function private.social_post_workout from public, anon;
grant execute on function private.social_post_workout to authenticated, service_role;

-- Whether a person is Pro, for the gold ring the app draws round their face.
-- Only ever read through the views below, which have already decided the
-- caller may see this profile; `is_entitled` itself stays closed to clients,
-- since it would answer for any id. Only for somebody who has joined the feed
-- and kept their profile public, the people whose face the feed already shows
-- to strangers: an account that never posted, or a private one, is not listed
-- as paying to anybody who asks the view. The caller always sees their own.
create or replace function private.social_is_pro(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.is_entitled(p.id) from public.profiles p
     where p.id = p_user
       and (p.id = (select auth.uid()) or (p.social_joined_at is not null and not p.is_private))
  ), false);
$$;
revoke execute on function private.social_is_pro from public, anon;
grant execute on function private.social_is_pro to authenticated, service_role;

create or replace view public.social_profile_details with (security_invoker = true) as
select p.user_id, p.handle, p.display_name, p.bio, p.avatar_path,
  p.review_status, p.review_reason, p.revision, p.quarantined,
  private.social_count(p.user_id, 'followers') as follower_count,
  private.social_count(p.user_id, 'following') as following_count,
  private.social_count(p.user_id, 'posts') as post_count,
  coalesce((select true from public.social_follows f where f.follower_id = (select auth.uid()) and f.followed_id = p.user_id limit 1), false) as is_following,
  coalesce((select true from public.social_follows f where f.followed_id = (select auth.uid()) and f.follower_id = p.user_id limit 1), false) as is_followed_by,
  p.created_at,
  -- Appended, so every column an older app reads keeps its place.
  private.social_is_pro(p.user_id) as is_pro
from public.social_profiles p;

create or replace view public.social_post_details with (security_invoker = true) as
select p.id, p.author_id, a.handle, a.display_name, a.avatar_path,
  food.food_name, food.icon_set, food.icon_name, food.photo_path,
  food.kcal, food.carbs_g, food.protein_g, food.fat_g,
  p.caption, p.audience,
  p.review_status, p.review_reason, p.revision, p.quarantined, p.created_at, p.published_at,
  private.social_count(p.id, 'likes') as like_count,
  private.social_count(p.id, 'comments') as comment_count,
  coalesce((select true from public.social_likes l where l.post_id = p.id and l.user_id = (select auth.uid()) limit 1), false) as is_liked,
  coalesce((select true from public.social_follows f where f.follower_id = (select auth.uid()) and f.followed_id = p.author_id limit 1), false) as is_following,
  -- Appended, so every column an older app reads keeps its place.
  p.kind,
  workout.workout_name, workout.workout_started_at, workout.workout_duration_s,
  workout.workout_sets, workout.workout_volume_kg, workout.workout_exercises,
  p.workout_records,
  private.social_is_pro(p.author_id) as author_is_pro
from public.social_posts p
join public.social_profiles a on a.user_id = p.author_id
left join lateral private.social_post_food(p.id) food on true
left join lateral private.social_post_workout(p.id) workout on true
-- A post whose source cannot be read is not a post, as the inner join to the
-- food made it before workouts were shareable.
where food.food_name is not null or workout.workout_name is not null;

create or replace view public.social_comment_details with (security_invoker = true) as
select c.id, c.post_id, c.author_id, a.handle, a.display_name, a.avatar_path,
  c.body, c.review_status, c.review_reason, c.revision, c.quarantined, c.created_at
from public.social_comments c join public.social_profiles a on a.user_id = c.author_id;

create or replace view public.social_notification_details with (security_invoker = true) as
select n.id, n.kind, n.actor_id, a.handle as actor_handle, a.display_name as actor_display_name,
  a.avatar_path as actor_avatar_path, n.post_id, n.comment_id, n.created_at, n.read_at
from public.social_notifications n join public.social_profiles a on a.user_id = n.actor_id;

revoke all on public.social_profile_details, public.social_post_details,
  public.social_comment_details, public.social_notification_details from anon, authenticated;
grant select on public.social_profile_details, public.social_post_details,
  public.social_comment_details, public.social_notification_details to authenticated, service_role;
revoke all on public.social_profile_details, public.social_post_details,
  public.social_comment_details, public.social_notification_details from anon;

create or replace function private.social_validate_page(p_before_at timestamptz, p_before_id uuid, p_limit integer)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if (p_before_at is null) <> (p_before_id is null) or (p_before_at is not null and not isfinite(p_before_at))
      or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Invalid page cursor or size' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function private.social_validate_page from public, anon;
grant execute on function private.social_validate_page to authenticated, service_role;

create or replace function public.social_profile(p_user_id uuid)
returns setof public.social_profile_details language sql stable security invoker set search_path = '' as $$
  select * from public.social_profile_details where user_id = p_user_id;
$$;

-- `p_kinds` defaults to food so an app from before workout posts, which can
-- only draw a meal, is never handed one. Read lists do the same below.
create or replace function public.social_post(
  p_id uuid, p_kinds public.social_post_kind[] default '{food}'
)
returns setof public.social_post_details language sql stable security invoker set search_path = '' as $$
  select * from public.social_post_details where id = p_id and kind = any(p_kinds);
$$;

-- The workout's own post, for its page to offer Share or Edit post.
create or replace function public.social_workout_post(p_workout_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.social_posts p
  where p.source_workout_id = p_workout_id and p.author_id = (select auth.uid());
$$;

-- How many of a profile's workout posts its viewer can see, which the profile
-- adds to the meal count the server keeps. `social_can_view_post`'s rules, with
-- the ones about the author asked once rather than once a post: through it, a
-- long history took 70 ms on every profile open. Keep the two in step.
create or replace function public.social_workout_count(p_user_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  -- Materialized, or the planner folds it into the scan and asks about the
  -- author once a post again.
  with viewer as materialized (
    select (select auth.uid()) as id,
      private.social_can_view_profile(p_user_id) as sees_author,
      exists (select 1 from public.social_follows f
        where f.follower_id = (select auth.uid()) and f.followed_id = p_user_id) as follows
  )
  select count(*)::integer
  from viewer v
  join public.social_posts p on p.author_id = p_user_id and p.kind = 'workout'
  where v.id is not null and (
    p.author_id = v.id or (
      v.sees_author and p.review_status = 'approved' and not p.quarantined
      and (p.audience = 'public' or v.follows)
      and not exists (select 1 from public.social_reports r
        where r.kind = 'post' and r.content_id = p.id and r.reporter_id = v.id)
    )
  );
$$;

create or replace function public.social_entry_post(p_entry_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.social_posts p where p.source_entry_id = p_entry_id and p.author_id = (select auth.uid());
$$;

-- Candidate selection uses explicit joins so thousands of authors do not run
-- nested row-policy functions for every post. Only visible ids leave this private
-- helper; the public function still hydrates its small page through invoker RLS.
create or replace function private.social_feed_candidates(
  p_mode text, p_before_at timestamptz, p_before_id uuid, p_limit integer,
  p_kinds public.social_post_kind[] default '{food}'
)
returns table (id uuid, created_at timestamptz)
-- A page is at most 51 rows. Costed at the default 1,000, the join that
-- hydrates the page switched to a scan of every post with a visibility check
-- each, about a second at 7,000 posts.
language plpgsql stable security definer rows 51 set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  if p_mode not in ('following', 'discover') or p_mode is null then raise exception 'Invalid feed' using errcode = '22023'; end if;
  if p_kinds is null or cardinality(p_kinds) = 0 then raise exception 'Invalid feed' using errcode = '22023'; end if;
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
            and sp.kind = any(p_kinds)
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
        and sp.kind = any(p_kinds)
        and not a.is_private and a.review_status = 'approved' and not a.quarantined
        and sp.author_id not in (select e.user_id from excluded_authors e)
        and sp.id not in (select r.content_id from public.social_reports r where r.reporter_id = v_user and r.kind = 'post')
        and (p_before_at is null or (sp.created_at, sp.id) < (p_before_at, p_before_id))
      order by sp.created_at desc, sp.id desc limit p_limit + 1;
  end if;
end;
$$;
revoke execute on function private.social_feed_candidates from public, anon;
grant execute on function private.social_feed_candidates to authenticated, service_role;

create or replace function public.social_feed(
  p_mode text default 'following', p_before_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 20,
  p_kinds public.social_post_kind[] default '{food}'
)
returns setof public.social_post_details language plpgsql stable security invoker set search_path = '' as $$
begin
  return query
    with page as materialized (
      select c.id, c.created_at from private.social_feed_candidates(p_mode, p_before_at, p_before_id, p_limit, p_kinds) c
    )
    select d.* from page p join public.social_post_details d on d.id = p.id order by p.created_at desc, p.id desc;
end;
$$;

-- One profile's page of posts of the asked kinds. Picked here rather than
-- through the view: row security runs before a kind filter, so a Workouts tab
-- checked the visibility of every meal it skipped (260 ms for an author with
-- 2,000 meals and two workouts).
create or replace function private.social_profile_post_candidates(
  p_user_id uuid, p_before_at timestamptz, p_before_id uuid, p_limit integer,
  p_kinds public.social_post_kind[]
)
returns table (id uuid, created_at timestamptz)
language sql stable security definer rows 51 set search_path = '' as $$
  select sp.id, sp.created_at from public.social_posts sp
  where sp.author_id = p_user_id and sp.kind = any(p_kinds)
    and (p_before_at is null or (sp.created_at, sp.id) < (p_before_at, p_before_id))
    and private.social_can_view_post(sp.id)
  order by sp.created_at desc, sp.id desc limit p_limit + 1;
$$;
revoke execute on function private.social_profile_post_candidates from public, anon;
grant execute on function private.social_profile_post_candidates to authenticated, service_role;

create or replace function public.social_profile_posts(
  p_user_id uuid, p_before_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 20,
  p_kinds public.social_post_kind[] default '{food}'
)
returns setof public.social_post_details language plpgsql stable security invoker set search_path = '' as $$
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  return query
    with page as materialized (
      select c.id, c.created_at
      from private.social_profile_post_candidates(p_user_id, p_before_at, p_before_id, p_limit, p_kinds) c
    )
    select d.* from page p join public.social_post_details d on d.id = p.id
    order by p.created_at desc, p.id desc;
end;
$$;

create or replace function public.social_comments(
  p_post_id uuid, p_before_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 20
)
returns setof public.social_comment_details language plpgsql stable security invoker set search_path = '' as $$
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  return query select d.* from public.social_comment_details d where d.post_id = p_post_id
    and (p_before_at is null or (d.created_at, d.id) < (p_before_at, p_before_id))
    order by d.created_at desc, d.id desc limit p_limit + 1;
end;
$$;

create or replace function public.social_connections(
  p_user_id uuid, p_direction text default 'followers', p_before_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 20
)
returns table (
  user_id uuid, handle text, display_name text, bio text, avatar_path text,
  review_status public.recipe_review, review_reason text, revision integer, quarantined boolean,
  follower_count bigint, following_count bigint, post_count bigint,
  is_following boolean, is_followed_by boolean, created_at timestamptz, connection_created_at timestamptz
)
language plpgsql stable security invoker set search_path = '' as $$
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
    -- Named rather than `d.*`: the view grows at its end, and this function's
    -- columns are fixed by an older app.
    select d.user_id, d.handle, d.display_name, d.bio, d.avatar_path,
      d.review_status, d.review_reason, d.revision, d.quarantined,
      d.follower_count, d.following_count, d.post_count,
      d.is_following, d.is_followed_by, d.created_at, p.created_at
    from page p join public.social_profile_details d on d.user_id = p.other_id
    order by p.created_at desc, p.other_id desc;
end;
$$;

create or replace function public.social_search_profiles(p_query text, p_after_handle text default null, p_limit integer default 20)
returns setof public.social_profile_details language plpgsql stable security invoker set search_path = '' as $$
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
$$;

-- Limit graph traversal before profile DTOs and counters are loaded. The same
-- current profile, report and block checks apply before every candidate limit.
create or replace function private.social_suggestion_candidates(p_limit integer)
returns table (user_id uuid, weight bigint)
language plpgsql stable security definer set search_path = '' as $$
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
$$;
revoke execute on function private.social_suggestion_candidates from public, anon;
grant execute on function private.social_suggestion_candidates to authenticated, service_role;

create or replace function public.social_suggestions(p_limit integer default 12)
returns setof public.social_profile_details language plpgsql stable security invoker set search_path = '' as $$
begin
  return query
    with page as materialized (
      select c.user_id, c.weight from private.social_suggestion_candidates(p_limit) c
    )
    select d.* from page p join public.social_profile_details d on d.user_id = p.user_id order by p.weight desc, p.user_id;
end;
$$;

-- This one deliberately bypasses profile visibility, but only for rows in the
-- caller's own block list. Unapproved text and images are never echoed back.
create or replace function public.social_blocked_profiles(
  p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 20
)
returns table (
  user_id uuid, handle text, display_name text, bio text, avatar_path text,
  review_status public.recipe_review, review_reason text, revision integer, quarantined boolean,
  follower_count bigint, following_count bigint, post_count bigint,
  is_following boolean, is_followed_by boolean, created_at timestamptz, connection_created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false);
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  return query select b.author_id,
    case when p.review_status = 'approved' and not p.quarantined then p.handle else '' end,
    case when p.review_status = 'approved' and not p.quarantined then p.display_name else '' end,
    ''::text, null::text, coalesce(p.review_status, 'pending'::public.recipe_review), null::text,
    coalesce(p.revision, 1), coalesce(p.quarantined, false),
    0::bigint, 0::bigint, 0::bigint, false, false, coalesce(p.created_at, b.created_at), b.created_at
  from public.blocked_authors b left join public.profiles p on p.id = b.author_id
  where b.user_id = v_user and (p_before_at is null or (b.created_at, b.author_id) < (p_before_at, p_before_id))
  order by b.created_at desc, b.author_id desc limit p_limit + 1;
end;
$$;

create or replace function public.social_notifications(
  p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 20
)
returns setof public.social_notification_details language plpgsql stable security invoker set search_path = '' as $$
begin
  perform private.social_validate_page(p_before_at, p_before_id, p_limit);
  return query select d.* from public.social_notification_details d
    where (p_before_at is null or (d.created_at, d.id) < (p_before_at, p_before_id))
    order by d.created_at desc, d.id desc limit p_limit + 1;
end;
$$;

create or replace function public.social_unread_notification_count()
returns integer language sql stable security invoker set search_path = '' as $$
  select count(*)::integer from (
    select 1 from public.social_notifications n
    where n.recipient_id = (select auth.uid()) and n.read_at is null
    limit 100
  ) unread;
$$;

create or replace function public.mark_social_notifications_read(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false);
begin
  if p_ids is null or cardinality(p_ids) > 100 then raise exception 'At most 100 activity ids' using errcode = '22023'; end if;
  update public.social_notifications set read_at = now() where recipient_id = v_user and id = any(p_ids) and read_at is null;
end;
$$;

create index social_posts_photo_idx on public.social_posts(photo_path)
  where photo_path is not null and review_status = 'approved' and not quarantined;
-- Photo claims match on the view's avatar_path, which hides a path the profile
-- does not own. An index on the raw column could never serve that comparison,
-- so it indexes the same expression the view selects.
create index social_profiles_avatar_idx on public.profiles
  ((case when avatar_path like 'avatars/' || id::text || '/%' then avatar_path end))
  where (case when avatar_path like 'avatars/' || id::text || '/%' then avatar_path end) is not null
    and review_status = 'approved' and not quarantined;

create or replace function public.social_photo_claims(p_keys text[])
returns table (owner_id uuid, photo_path text, photo_etag text, kind text)
language plpgsql stable security invoker set search_path = '' as $$
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
    ) p
    union all
    -- Diary photos of people the caller shares a group with (97_groups.sql).
    select c.owner_id, c.photo_path, null::text, 'meal'::text
    from private.group_photo_claims(p_keys) c
    union all
    -- Pictures uploaded as a group's icon, for its members and invitees.
    select c.owner_id, c.photo_path, null::text, 'avatar'::text
    from private.group_icon_claims(p_keys) c;
end;
$$;

-- A photo published straight away has no reviewed ETag, so the signer read one
-- from R2 with a HEAD on every signature. A key's only upload URL is minted
-- before the meal, and so the post, can name it, and it lapses after ten
-- minutes (`UPLOAD_TTL_SECONDS` in functions/_shared/r2.ts). Past that the
-- object cannot change under its key, and the signer records what it read so
-- later signatures skip the round trip. Only ever fills a missing tag: a
-- reviewed one, or one a photo change cleared, is left alone.
create or replace function public.record_social_photo_etags(p_etags jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_posts integer; v_avatars integer;
begin
  if p_etags is null or jsonb_typeof(p_etags) <> 'object' then
    raise exception 'An object of photo key to ETag is required' using errcode = '22023';
  end if;
  with tags as (
    select key, value from jsonb_each_text(p_etags)
     where char_length(value) <= 128 and value ~ '^"[a-zA-Z0-9-]+"$'
  )
  update public.social_posts p set photo_etag = t.value
    from tags t
   where p.photo_path = t.key and p.photo_etag is null
     and p.created_at < now() - interval '10 minutes'
     -- What `social_posts_photo_idx` is limited to, which are also the only
     -- posts `social_photo_claims` hands the signer. Without it each call read
     -- the whole table.
     and p.review_status = 'approved' and not p.quarantined;
  get diagnostics v_posts = row_count;
  with tags as (
    select key, value from jsonb_each_text(p_etags)
     where char_length(value) <= 128 and value ~ '^"[a-zA-Z0-9-]+"$'
  )
  update public.profiles p set photo_etag = t.value
    from tags t
   where p.photo_etag is null
     and p.updated_at < now() - interval '10 minutes'
     -- Spelled as `social_profiles_avatar_idx` is, for the same reason: it is
     -- the only avatar `social_photo_claims` admits, and the index cannot serve
     -- a plain `avatar_path = key`.
     and case when p.avatar_path like 'avatars/' || p.id::text || '/%' then p.avatar_path end = t.key
     and p.review_status = 'approved' and not p.quarantined;
  get diagnostics v_avatars = row_count;
  return v_posts + v_avatars;
end;
$$;
revoke execute on function public.record_social_photo_etags from public, anon, authenticated;
grant execute on function public.record_social_photo_etags to service_role;

revoke execute on function public.social_profile, public.social_post, public.social_entry_post,
  public.social_workout_post, public.social_workout_count,
  public.social_feed, public.social_profile_posts, public.social_comments, public.social_connections,
  public.social_search_profiles, public.social_suggestions, public.social_blocked_profiles,
  public.social_notifications, public.social_unread_notification_count,
  public.mark_social_notifications_read,
  public.social_photo_claims from public, anon;
grant execute on function public.social_profile, public.social_post, public.social_entry_post,
  public.social_workout_post, public.social_workout_count,
  public.social_feed, public.social_profile_posts, public.social_comments, public.social_connections,
  public.social_search_profiles, public.social_suggestions, public.social_blocked_profiles,
  public.social_notifications, public.social_unread_notification_count,
  public.mark_social_notifications_read,
  public.social_photo_claims to authenticated, service_role;
