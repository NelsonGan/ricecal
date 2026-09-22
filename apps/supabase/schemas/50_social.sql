-- Social publication is separate from the private diary and health profile.
-- Clients write through authenticated functions, never the moderation columns.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.social_audience as enum ('public', 'followers');
create type public.social_content_kind as enum ('profile', 'post', 'comment');
create type public.social_activity_kind as enum ('follow', 'like', 'comment');
create type public.social_counter_metric as enum ('followers', 'following', 'posts', 'likes', 'comments');

create table public.social_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_path text,
  photo_etag text,
  review_status public.recipe_review not null default 'pending',
  review_reason text,
  revision integer not null default 1 check (revision > 0),
  quarantined boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profiles_avatar_owned check (
    avatar_path is null or avatar_path like 'avatars/' || user_id::text || '/%'
  )
);
create index social_profiles_discover_idx on public.social_profiles(created_at desc, user_id desc)
  where review_status = 'approved' and not quarantined;
create index social_profiles_handle_prefix_idx on public.social_profiles(handle text_pattern_ops);

create table public.social_follows (
  follower_id uuid not null references public.social_profiles(user_id) on delete cascade,
  followed_id uuid not null references public.social_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint social_follows_not_self check (follower_id <> followed_id)
);
create index social_follows_outgoing_idx on public.social_follows(follower_id, created_at desc, followed_id desc);
create index social_follows_incoming_idx on public.social_follows(followed_id, created_at desc, follower_id desc);
create index blocked_authors_reverse_idx on public.blocked_authors(author_id, user_id);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.social_profiles(user_id) on delete cascade,
  source_entry_id uuid not null unique references public.food_logs(id) on delete cascade,
  request_id uuid not null,
  food_name text not null check (char_length(food_name) between 1 and 160),
  icon_set public.icon_set,
  icon_name text,
  photo_path text,
  photo_etag text,
  caption text not null default '' check (char_length(caption) <= 280),
  audience public.social_audience not null default 'public',
  review_status public.recipe_review not null default 'pending',
  review_reason text,
  revision integer not null default 1 check (revision > 0),
  quarantined boolean not null default false,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (author_id, request_id),
  constraint social_posts_icon_complete check ((icon_set is null) = (icon_name is null)),
  constraint social_posts_photo_owned check (
    photo_path is null or photo_path like 'meals/' || author_id::text || '/%'
  )
);
create index social_posts_author_idx on public.social_posts(author_id, created_at desc, id desc);
create index social_posts_author_feed_idx on public.social_posts(author_id, created_at desc, id desc)
  where review_status = 'approved' and not quarantined;
create index social_posts_discover_idx on public.social_posts(created_at desc, id desc)
  where audience = 'public' and review_status = 'approved' and not quarantined;

create table public.social_likes (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references public.social_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index social_likes_user_idx on public.social_likes(user_id, post_id);

create table public.social_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  author_id uuid not null references public.social_profiles(user_id) on delete cascade,
  request_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  review_status public.recipe_review not null default 'pending',
  review_reason text,
  revision integer not null default 1 check (revision > 0),
  quarantined boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, request_id)
);
create index social_comments_post_idx on public.social_comments(post_id, created_at desc, id desc);
create index social_comments_author_idx on public.social_comments(author_id);

create table public.social_reports (
  kind public.social_content_kind not null,
  content_id uuid not null,
  content_revision integer not null check (content_revision > 0),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason public.report_reason not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (kind, content_id, content_revision, reporter_id)
);
-- Resolution closes a counting cycle without deleting its audit rows. Every
-- row still hides that target from its reporter, including after resolution.
create index social_reports_reporter_idx on public.social_reports(reporter_id, kind, content_id, content_revision);
create index social_reports_unresolved_idx on public.social_reports(kind, content_id, content_revision)
  where resolved_at is null;

-- At most 32 lazily created rows per counter. Popular accounts and posts do
-- not make every writer contend on the same counter row.
create table public.social_counters (
  entity_id uuid not null,
  metric public.social_counter_metric not null,
  shard smallint not null check (shard between 0 and 31),
  value bigint not null default 0 check (value >= 0),
  primary key (entity_id, metric, shard)
);

create table public.social_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.social_profiles(user_id) on delete cascade,
  actor_id uuid not null references public.social_profiles(user_id) on delete cascade,
  kind public.social_activity_kind not null,
  post_id uuid references public.social_posts(id) on delete cascade,
  comment_id uuid references public.social_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint social_notifications_not_self check (recipient_id <> actor_id),
  constraint social_notifications_shape check (
    (kind = 'follow' and post_id is null and comment_id is null)
    or (kind = 'like' and post_id is not null and comment_id is null)
    or (kind = 'comment' and post_id is not null and comment_id is not null)
  )
);
create unique index social_notifications_follow_unique on public.social_notifications(recipient_id, actor_id)
  where kind = 'follow';
create unique index social_notifications_like_unique on public.social_notifications(post_id, actor_id)
  where kind = 'like';
create unique index social_notifications_comment_unique on public.social_notifications(comment_id)
  where kind = 'comment';
create index social_notifications_recipient_idx on public.social_notifications(recipient_id, created_at desc, id desc);
create index social_notifications_pair_idx on public.social_notifications(recipient_id, actor_id);
create index social_notifications_unread_idx on public.social_notifications(recipient_id, created_at desc, id desc)
  where read_at is null;

-- One rolling hourly bucket per account/action, rather than an accumulating
-- history of requests. Each claim serializes only that account and action.
create table public.social_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  bucket timestamptz not null,
  used integer not null check (used > 0),
  primary key (user_id, action)
);

alter table public.social_profiles enable row level security;
alter table public.social_follows enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_likes enable row level security;
alter table public.social_comments enable row level security;
alter table public.social_reports enable row level security;
alter table public.social_counters enable row level security;
alter table public.social_notifications enable row level security;
alter table public.social_rate_limits enable row level security;
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

create or replace function private.social_pair_blocked(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocked_authors b
    where (b.user_id = (select auth.uid()) and b.author_id = p_other)
       or (b.author_id = (select auth.uid()) and b.user_id = p_other)
  );
$$;

create or replace function private.social_can_view_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
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
$$;

create or replace function private.social_can_view_post(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
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
$$;

create or replace function private.social_can_view_comment(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
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
$$;

create or replace function private.social_can_view_notification(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.social_notifications n
    where n.id = p_id and n.recipient_id = (select auth.uid())
      and private.social_can_view_profile(n.actor_id)
      and (n.post_id is null or private.social_can_view_post(n.post_id))
      and (n.comment_id is null or private.social_can_view_comment(n.comment_id))
  );
$$;

revoke execute on function private.social_pair_blocked, private.social_can_view_profile,
  private.social_can_view_post, private.social_can_view_comment,
  private.social_can_view_notification from public, anon;
grant execute on function private.social_pair_blocked, private.social_can_view_profile,
  private.social_can_view_post, private.social_can_view_comment,
  private.social_can_view_notification to authenticated, service_role;

create policy "social profiles: visible identities" on public.social_profiles for select
  to authenticated using (private.social_can_view_profile(user_id));
create policy "social follows: visible endpoints" on public.social_follows for select
  to authenticated using (private.social_can_view_profile(follower_id) and private.social_can_view_profile(followed_id));
create policy "social posts: approved audience or own" on public.social_posts for select
  to authenticated using (private.social_can_view_post(id));
create policy "social likes: visible post and identity" on public.social_likes for select
  to authenticated using (private.social_can_view_post(post_id) and private.social_can_view_profile(user_id));
create policy "social comments: visible post and identity" on public.social_comments for select
  to authenticated using (private.social_can_view_comment(id));
create policy "social reports: own" on public.social_reports for select
  to authenticated using (reporter_id = (select auth.uid()));
create policy "social notifications: recipient and visible content" on public.social_notifications for select
  to authenticated using (recipient_id = (select auth.uid()) and private.social_can_view_notification(id));

create or replace function private.social_require_user(p_identity boolean default true)
returns uuid language plpgsql stable security definer set search_path = '' as $$
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
$$;

create or replace function private.social_claim(p_user uuid, p_action text, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function private.social_count(p_entity uuid, p_metric public.social_counter_metric)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(c.value), 0)::bigint from public.social_counters c
  where c.entity_id = p_entity and c.metric = p_metric;
$$;
revoke execute on function private.social_count from public, anon;
grant execute on function private.social_count to authenticated, service_role;

create or replace function private.social_counter_change(
  p_entity uuid, p_metric public.social_counter_metric, p_actor uuid, p_delta integer
)
returns void language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function private.social_lock_pair(p_left uuid, p_right uuid)
returns void language sql volatile set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(
    'social-pair:' || least(p_left, p_right)::text || ':' || greatest(p_left, p_right)::text, 0));
$$;

create or replace function private.social_block_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.social_lock_pair(new.user_id, new.author_id);
  return new;
end;
$$;
create trigger social_block_before before insert on public.blocked_authors
  for each row execute function private.social_block_before();

create or replace function private.social_block_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.social_follows f
  where (f.follower_id = new.user_id and f.followed_id = new.author_id)
     or (f.follower_id = new.author_id and f.followed_id = new.user_id);
  delete from public.social_notifications n
  where (n.actor_id = new.user_id and n.recipient_id = new.author_id)
     or (n.actor_id = new.author_id and n.recipient_id = new.user_id);
  return null;
end;
$$;
create trigger social_block_after after insert on public.blocked_authors
  for each row execute function private.social_block_after();

create or replace function private.social_follow_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
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
$$;
create trigger social_follow_changed after insert or delete on public.social_follows
  for each row execute function private.social_follow_changed();

create or replace function private.social_like_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row public.social_likes; v_owner uuid; v_delta integer;
begin
  if tg_op = 'INSERT' then v_row := new; v_delta := 1; else v_row := old; v_delta := -1; end if;
  perform private.social_counter_change(v_row.post_id, 'likes', v_row.user_id, v_delta);
  if tg_op = 'INSERT' then
    select author_id into v_owner from public.social_posts where id = v_row.post_id;
    if v_owner <> v_row.user_id then
      insert into public.social_notifications(recipient_id, actor_id, kind, post_id)
      values (v_owner, v_row.user_id, 'like', v_row.post_id) on conflict do nothing;
    end if;
  else
    delete from public.social_notifications where post_id = v_row.post_id and actor_id = v_row.user_id and kind = 'like';
  end if;
  return null;
end;
$$;
create trigger social_like_changed after insert or delete on public.social_likes
  for each row execute function private.social_like_changed();

create or replace function private.social_post_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
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
$$;
create trigger social_post_changed after insert or update or delete on public.social_posts
  for each row execute function private.social_post_changed();

create or replace function private.social_comment_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
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
$$;
create trigger social_comment_changed after insert or update or delete on public.social_comments
  for each row execute function private.social_comment_changed();

create or replace function private.social_profile_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.social_counters where entity_id = old.user_id;
  delete from public.social_reports where kind = 'profile' and content_id = old.user_id;
  return null;
end;
$$;
create trigger social_profile_deleted after delete on public.social_profiles
  for each row execute function private.social_profile_deleted();

-- The image remains governed by diary retention. Replacing it must not attach
-- an unreviewed new image to a published post.
create or replace function private.social_source_photo_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.photo_path is distinct from old.photo_path then
    update public.social_posts set photo_path = null, photo_etag = null, revision = revision + 1, updated_at = now()
    where source_entry_id = new.id and photo_path is not null;
  end if;
  return null;
end;
$$;
create trigger social_source_photo_changed after update of photo_path on public.food_logs
  for each row execute function private.social_source_photo_changed();

revoke execute on function private.social_require_user, private.social_claim,
  private.social_counter_change, private.social_lock_pair, private.social_block_before,
  private.social_block_after, private.social_follow_changed, private.social_like_changed,
  private.social_post_changed, private.social_comment_changed, private.social_profile_deleted,
  private.social_source_photo_changed from public, anon, authenticated;

create or replace function public.set_social_profile(
  p_handle text, p_display_name text, p_bio text default '', p_avatar_path text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.create_social_post(
  p_entry_id uuid, p_caption text, p_audience public.social_audience, p_request_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(); v_id uuid; v_entry public.food_logs;
begin
  -- The source lock also serializes publication against its deletion or photo replacement.
  select * into v_entry from public.food_logs where id = p_entry_id and user_id = v_user for share;
  if not found then raise exception 'Meal unavailable' using errcode = '42501'; end if;
  select id into v_id from public.social_posts where author_id = v_user
    and (source_entry_id = p_entry_id or request_id = p_request_id);
  if found then return v_id; end if;
  if p_request_id is null then raise exception 'A request id is required' using errcode = '22023'; end if;
  if not private.social_claim(v_user, 'post', 30) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  insert into public.social_posts(author_id, source_entry_id, request_id, food_name, icon_set, icon_name, photo_path, caption, audience)
  values (v_user, p_entry_id, p_request_id, left(coalesce(v_entry.display_label, v_entry.item_name), 160),
    coalesce(v_entry.icon_set, v_entry.item_icon_set), coalesce(v_entry.icon_name, v_entry.item_icon_name),
    case when v_entry.photo_path like 'meals/' || v_user::text || '/%' then v_entry.photo_path end,
    btrim(coalesce(p_caption, '')), p_audience)
  on conflict do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.social_posts where author_id = v_user
    and (source_entry_id = p_entry_id or request_id = p_request_id); end if;
  return v_id;
end;
$$;

create or replace function public.update_social_post(p_id uuid, p_caption text, p_audience public.social_audience)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user();
begin
  if not private.social_claim(v_user, 'post-edit', 30) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  update public.social_posts set caption = btrim(coalesce(p_caption, '')), audience = p_audience, photo_etag = null,
    review_status = 'pending', review_reason = null, revision = revision + 1, updated_at = now()
  where id = p_id and author_id = v_user;
  if not found then raise exception 'Post unavailable' using errcode = '42501'; end if;
  return p_id;
end;
$$;

create or replace function public.delete_social_post(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false);
begin
  delete from public.social_posts where id = p_id and author_id = v_user;
end;
$$;

create or replace function public.set_social_follow(p_target_id uuid, p_following boolean)
returns void language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.remove_social_follower(p_follower_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false);
begin
  perform private.social_lock_pair(v_user, p_follower_id);
  delete from public.social_follows where follower_id = p_follower_id and followed_id = v_user;
end;
$$;

create or replace function public.set_social_like(p_post_id uuid, p_liked boolean)
returns void language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.create_social_comment(p_post_id uuid, p_body text, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.update_social_comment(p_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user();
begin
  if not private.social_claim(v_user, 'comment-edit', 60) then raise exception 'Try again later' using errcode = 'P0001'; end if;
  update public.social_comments set body = btrim(p_body), review_status = 'pending', review_reason = null,
    revision = revision + 1, updated_at = now()
  where id = p_id and author_id = v_user and private.social_can_view_post(post_id);
  if not found then raise exception 'Comment unavailable' using errcode = '42501'; end if;
  return p_id;
end;
$$;

create or replace function public.delete_social_comment(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.social_require_user(false);
begin
  delete from public.social_comments c where c.id = p_id and (c.author_id = v_user
    or exists (select 1 from public.social_posts p where p.id = c.post_id and p.author_id = v_user));
end;
$$;

create or replace function public.report_social_content(p_kind public.social_content_kind, p_id uuid, p_reason public.report_reason)
returns void language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.claim_social_review(p_user uuid)
returns boolean language sql security definer set search_path = '' as $$
  select private.social_claim(p_user, 'review', 60);
$$;

create or replace function public.review_social_content(
  p_kind public.social_content_kind, p_id uuid, p_revision integer,
  p_status public.recipe_review, p_reason text default null, p_photo_etag text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
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
$$;

-- Quarantine has a separate moderator operation, so retrying an ordinary
-- author review never overrides three independent reports.
create or replace function public.resolve_social_report(
  p_kind public.social_content_kind, p_id uuid, p_status public.recipe_review, p_reason text default null,
  p_revision integer default null, p_photo_etag text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
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
$$;

revoke execute on function public.set_social_profile, public.create_social_post, public.update_social_post,
  public.delete_social_post, public.set_social_follow, public.remove_social_follower, public.set_social_like,
  public.create_social_comment, public.update_social_comment, public.delete_social_comment, public.report_social_content from public, anon;
grant execute on function public.set_social_profile, public.create_social_post, public.update_social_post,
  public.delete_social_post, public.set_social_follow, public.remove_social_follower, public.set_social_like,
  public.create_social_comment, public.update_social_comment, public.delete_social_comment, public.report_social_content to authenticated, service_role;
revoke execute on function public.claim_social_review, public.review_social_content, public.resolve_social_report from public, anon, authenticated;
grant execute on function public.claim_social_review, public.review_social_content, public.resolve_social_report to service_role;
