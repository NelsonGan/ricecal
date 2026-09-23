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

DROP INDEX public.social_comments_post_idx;

DROP INDEX public.social_follows_incoming_idx;

DROP INDEX public.social_follows_outgoing_idx;

DROP INDEX public.social_likes_user_idx;

DROP INDEX public.social_notifications_actor_idx;

DROP INDEX public.social_notifications_comment_unique;

DROP INDEX public.social_notifications_follow_unique;

DROP INDEX public.social_notifications_post_idx;

DROP INDEX public.social_notifications_recipient_idx;

DROP INDEX public.social_notifications_unread_idx;

DROP INDEX public.social_posts_author_feed_idx;

DROP INDEX public.social_posts_author_idx;

DROP INDEX public.social_posts_discover_idx;

DROP INDEX public.social_posts_photo_idx;

DROP VIEW public.social_comment_details;

DROP VIEW public.social_notification_details;

DROP VIEW public.social_post_details;

DROP VIEW public.social_profile_details;

DROP TRIGGER social_profile_deleted ON public.social_profiles;

DROP POLICY "social comments: visible post and identity" ON public.social_comments;

DROP POLICY "social follows: visible endpoints" ON public.social_follows;

DROP TABLE public.social_follows;

DROP POLICY "social likes: visible post and identity" ON public.social_likes;

DROP TABLE public.social_likes;

DROP POLICY "social notifications: recipient and visible content" ON public.social_notifications;

DROP TABLE public.social_notifications;

DROP TABLE public.social_comments;

DROP POLICY "social posts: approved audience or own" ON public.social_posts;

DROP TABLE public.social_posts;

DROP POLICY "social profiles: visible identities" ON public.social_profiles;

DROP TABLE public.social_profiles;

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
    select 1 from public.profiles p where p.id = p_user and p.handle is not null and (
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

CREATE FUNCTION private.social_profile_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.handle is distinct from old.handle or new.display_name is distinct from old.display_name
      or new.bio is distinct from old.bio or new.avatar_path is distinct from old.avatar_path then
    new.review_status := 'pending';
    new.review_reason := null;
    new.photo_etag := null;
    new.revision := case when old.handle is null then 1 else old.revision + 1 end;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.social_profile_deleted()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from public.social_counters where entity_id = old.id;
  delete from public.social_reports where kind = 'profile' and content_id = old.id;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.social_require_user (
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
  if p_identity and not exists (select 1 from public.profiles p where p.id = v_user and p.handle is not null
      and p.review_status = 'approved' and not p.quarantined) then
    raise exception 'Create an approved public profile first' using errcode = '42501';
  end if;
  return v_user;
end;
$function$;

CREATE OR REPLACE FUNCTION public.report_social_content (
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
    when 'profile' then select p.id, p.revision, private.social_can_view_profile(p.id)
      into v_author, v_revision, v_visible from public.profiles p where p.id = p_id for update;
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
      when 'profile' then update public.profiles set quarantined = true, review_status = 'pending', revision = revision + 1, updated_at = now()
        where id = p_id and revision = v_revision and not quarantined;
      when 'post' then update public.social_posts set quarantined = true, review_status = 'pending', revision = revision + 1, updated_at = now()
        where id = p_id and revision = v_revision and not quarantined;
      when 'comment' then update public.social_comments set quarantined = true, review_status = 'pending', revision = revision + 1, updated_at = now()
        where id = p_id and revision = v_revision and not quarantined;
    end case;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_social_report (
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
  if p_kind = 'profile' then select avatar_path is not null into v_has_photo from public.profiles where id = p_id;
  elsif p_kind = 'post' then select photo_path is not null into v_has_photo from public.social_posts where id = p_id; end if;
  if p_status = 'approved' and v_has_photo and (p_photo_etag is null or char_length(p_photo_etag) not between 1 and 128 or p_photo_etag !~ '^"[a-zA-Z0-9-]+"$' ) then
    raise exception 'A reviewed image ETag is required' using errcode = '22023';
  end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Invalid review status' using errcode = '22023'; end if;
  case p_kind
    when 'profile' then update public.profiles set quarantined = false, review_status = p_status, review_reason = left(p_reason, 280), revision = revision + 1, updated_at = now(),
      photo_etag = case when p_status = 'approved' and avatar_path is not null then p_photo_etag end where id = p_id and revision = p_revision;
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

CREATE OR REPLACE FUNCTION public.review_social_content (
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
  if p_kind = 'profile' then select avatar_path is not null into v_has_photo from public.profiles where id = p_id;
  elsif p_kind = 'post' then select photo_path is not null into v_has_photo from public.social_posts where id = p_id; end if;
  if p_status = 'approved' and v_has_photo and (p_photo_etag is null or char_length(p_photo_etag) not between 1 and 128 or p_photo_etag !~ '^"[a-zA-Z0-9-]+"$' ) then
    raise exception 'A reviewed image ETag is required' using errcode = '22023';
  end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Invalid review status' using errcode = '22023'; end if;
  case p_kind
    when 'profile' then update public.profiles set review_status = p_status, review_reason = left(p_reason, 280), updated_at = now(),
        photo_etag = case when p_status = 'approved' and avatar_path is not null then p_photo_etag end
      where id = p_id and revision = p_revision and review_status = 'pending' and not quarantined;
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
  update public.profiles set handle = lower(btrim(p_handle)), display_name = btrim(p_display_name),
    bio = btrim(coalesce(p_bio, '')), avatar_path = p_avatar_path
    where id = v_user;
  if not found then raise exception 'Profile unavailable' using errcode = '42501'; end if;
  return v_user;
end;
$function$;

CREATE OR REPLACE FUNCTION public.social_blocked_profiles (
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
  from public.blocked_authors b left join public.profiles p on p.id = b.author_id
  where b.user_id = v_user and (p_before_at is null or (b.created_at, b.author_id) < (p_before_at, p_before_id))
  order by b.created_at desc, b.author_id desc limit p_limit + 1;
end;
$function$;

ALTER TABLE public.profiles
  ADD COLUMN handle text COLLATE "C";

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_handle_check CHECK (handle ~ '^[a-z0-9_]{3,24}$'::text);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_handle_key UNIQUE (handle);

ALTER TABLE public.profiles
  ADD COLUMN bio text DEFAULT ''::text NOT NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_check CHECK (char_length(bio) <= 160);

ALTER TABLE public.profiles
  ADD COLUMN photo_etag text;

ALTER TABLE public.profiles
  ADD COLUMN review_status public.recipe_review DEFAULT 'pending'::public.recipe_review NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN review_reason text;

ALTER TABLE public.profiles
  ADD COLUMN revision integer DEFAULT 1 NOT NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_revision_check CHECK (revision > 0);

ALTER TABLE public.profiles
  ADD COLUMN quarantined boolean DEFAULT false NOT NULL;

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (activity_level, avatar_path, bio, birth_date, display_name, food_styles, handle, height_cm, onboarded_at, referral_source, sex, target_weight_kg, timezone)
  ON public.profiles TO authenticated;

CREATE INDEX social_profiles_avatar_idx ON public.profiles (avatar_path)
  WHERE handle IS NOT NULL AND avatar_path IS NOT NULL AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE INDEX social_profiles_discover_idx ON public.profiles (created_at DESC, id DESC)
  WHERE handle IS NOT NULL AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE TRIGGER social_profile_changed
  BEFORE UPDATE OF handle, display_name, bio, avatar_path ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.social_profile_changed();

CREATE TRIGGER social_profile_deleted
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.social_profile_deleted();

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
  ADD CONSTRAINT social_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_author_id_request_id_key UNIQUE (author_id, request_id);

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_body_check CHECK (char_length(btrim(body)) >= 1 AND char_length(btrim(body)) <= 500);

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_pkey PRIMARY KEY (id);

ALTER TABLE public.social_comments
  ADD CONSTRAINT social_comments_revision_check CHECK (revision > 0);

CREATE INDEX social_comments_post_idx ON public.social_comments (post_id, created_at DESC, id DESC);

CREATE POLICY "social comments: visible post and identity" ON public.social_comments
  FOR SELECT
  TO authenticated
  USING (private.social_can_view_comment(id));

CREATE TABLE public.social_follows (
  follower_id uuid                     NOT NULL,
  followed_id uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.social_follows
  ADD CONSTRAINT social_follows_followed_id_fkey FOREIGN KEY (followed_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.social_follows
  ADD CONSTRAINT social_follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.social_follows
  ADD CONSTRAINT social_follows_not_self CHECK (follower_id <> followed_id);

ALTER TABLE public.social_follows
  ADD CONSTRAINT social_follows_pkey PRIMARY KEY (follower_id, followed_id);

CREATE INDEX social_follows_incoming_idx ON public.social_follows (followed_id, created_at DESC, follower_id DESC);

CREATE INDEX social_follows_outgoing_idx ON public.social_follows (follower_id, created_at DESC, followed_id DESC);

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
  ADD CONSTRAINT social_likes_pkey PRIMARY KEY (post_id, user_id);

ALTER TABLE public.social_likes
  ADD CONSTRAINT social_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX social_likes_user_idx ON public.social_likes (user_id, post_id);

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
  ADD CONSTRAINT social_notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.social_comments(id) ON DELETE CASCADE;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_not_self CHECK (recipient_id <> actor_id);

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.social_notifications
  ADD CONSTRAINT social_notifications_shape
    CHECK (kind = 'follow'::public.social_activity_kind AND post_id IS NULL AND comment_id IS NULL OR kind = 'like'::public.social_activity_kind AND post_id IS
    NOT NULL AND comment_id IS NULL OR kind = 'comment'::public.social_activity_kind AND post_id IS NOT NULL AND comment_id IS NOT NULL);

CREATE INDEX social_notifications_actor_idx ON public.social_notifications (actor_id, recipient_id);

CREATE UNIQUE INDEX social_notifications_comment_unique ON public.social_notifications (comment_id)
  WHERE comment_id IS NOT NULL;

CREATE UNIQUE INDEX social_notifications_follow_unique ON public.social_notifications (recipient_id, actor_id)
  WHERE kind = 'follow'::public.social_activity_kind;

CREATE INDEX social_notifications_post_idx ON public.social_notifications (post_id, actor_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX social_notifications_recipient_idx ON public.social_notifications (recipient_id, created_at DESC, id DESC);

CREATE INDEX social_notifications_unread_idx ON public.social_notifications (recipient_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

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
  kcal            integer,
  carbs_g         numeric,
  protein_g       numeric,
  fat_g           numeric,
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
  ADD CONSTRAINT social_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_caption_check CHECK (char_length(caption) <= 280);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_carbs_g_check CHECK (carbs_g >= 0::numeric);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_fat_g_check CHECK (fat_g >= 0::numeric);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_food_name_check CHECK (char_length(food_name) >= 1 AND char_length(food_name) <= 160);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_icon_complete CHECK ((icon_set IS NULL) = (icon_name IS NULL));

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_kcal_check CHECK (kcal >= 0);

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
  ADD CONSTRAINT social_posts_protein_g_check CHECK (protein_g >= 0::numeric);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_revision_check CHECK (revision > 0);

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_source_entry_id_fkey FOREIGN KEY (source_entry_id) REFERENCES public.food_logs(id) ON DELETE CASCADE;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_source_entry_id_key UNIQUE (source_entry_id);

CREATE INDEX social_posts_author_feed_idx ON public.social_posts (author_id, created_at DESC, id DESC)
  WHERE review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE INDEX social_posts_author_idx ON public.social_posts (author_id, created_at DESC, id DESC);

CREATE INDEX social_posts_discover_idx ON public.social_posts (created_at DESC, id DESC)
  WHERE audience = 'public'::public.social_audience AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE INDEX social_posts_photo_idx ON public.social_posts (photo_path)
  WHERE photo_path IS NOT NULL AND review_status = 'approved'::public.recipe_review AND NOT quarantined;

CREATE POLICY "social posts: approved audience or own" ON public.social_posts
  FOR SELECT
  TO authenticated
  USING (private.social_can_view_post(id));

CREATE VIEW public.social_profiles AS SELECT id AS user_id,
    handle,
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
  WHERE ((handle IS NOT NULL) AND private.social_can_view_profile(id));

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

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.social_profiles TO authenticated;

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.social_profiles TO service_role;

-- db diff drops grants when it recreates the social tables for their new
-- foreign keys. Restore the declarative privileges after all objects exist.
REVOKE ALL ON public.social_follows, public.social_posts, public.social_likes,
  public.social_comments, public.social_notifications,
  public.social_profiles, public.social_profile_details, public.social_post_details,
  public.social_comment_details, public.social_notification_details FROM anon, authenticated;
GRANT ALL ON public.social_follows, public.social_posts, public.social_likes,
  public.social_comments, public.social_notifications TO service_role;
GRANT SELECT ON public.social_profiles, public.social_profile_details,
  public.social_post_details, public.social_comment_details,
  public.social_notification_details TO authenticated;
GRANT SELECT ON public.social_follows, public.social_likes,
  public.social_notifications TO authenticated;
GRANT SELECT (id, author_id, food_name, icon_set, icon_name, photo_path, kcal,
  carbs_g, protein_g, fat_g, caption, audience, review_status, review_reason,
  revision, quarantined, photo_etag, created_at, published_at, updated_at)
  ON public.social_posts TO authenticated;
GRANT SELECT (id, post_id, author_id, body, review_status, review_reason,
  revision, quarantined, created_at, updated_at)
  ON public.social_comments TO authenticated;

-- pg-delta recreates tables for their new foreign keys but omits their RLS
-- setting and change triggers. Restore both before clients can use them.
ALTER TABLE public.social_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_notifications ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER social_follow_changed AFTER INSERT OR DELETE ON public.social_follows
  FOR EACH ROW EXECUTE FUNCTION private.social_follow_changed();
CREATE TRIGGER social_like_changed AFTER INSERT OR DELETE ON public.social_likes
  FOR EACH ROW EXECUTE FUNCTION private.social_like_changed();
CREATE TRIGGER social_post_changed AFTER INSERT OR UPDATE OR DELETE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION private.social_post_changed();
CREATE TRIGGER social_comment_changed AFTER INSERT OR UPDATE OR DELETE ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION private.social_comment_changed();

-- Recreated RPCs otherwise regain Postgres's default PUBLIC execute grant.
REVOKE EXECUTE ON FUNCTION private.social_profile_changed() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.social_comments(uuid,timestamptz,uuid,integer),
  public.social_feed(text,timestamptz,uuid,integer),
  public.social_notifications(timestamptz,uuid,integer), public.social_post(uuid),
  public.social_profile(uuid), public.social_profile_posts(uuid,timestamptz,uuid,integer),
  public.social_search_profiles(text,text,integer), public.social_suggestions(integer)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.social_comments(uuid,timestamptz,uuid,integer),
  public.social_feed(text,timestamptz,uuid,integer),
  public.social_notifications(timestamptz,uuid,integer), public.social_post(uuid),
  public.social_profile(uuid), public.social_profile_posts(uuid,timestamptz,uuid,integer),
  public.social_search_profiles(text,text,integer), public.social_suggestions(integer)
  TO authenticated, service_role;
