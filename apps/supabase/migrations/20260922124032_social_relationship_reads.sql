-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

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
  from public.blocked_authors b left join public.social_profiles p on p.user_id = b.author_id
  where b.user_id = v_user and (p_before_at is null or (b.created_at, b.author_id) < (p_before_at, p_before_id))
  order by b.created_at desc, b.author_id desc limit p_limit + 1;
end;
$function$;

CREATE INDEX social_notifications_pair_idx ON public.social_notifications (recipient_id, actor_id);

CREATE OR REPLACE VIEW public.social_post_details WITH (security_invoker=true) AS SELECT p.id,
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

CREATE OR REPLACE VIEW public.social_profile_details WITH (security_invoker=true) AS SELECT user_id,
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

-- The schema diff omits revokes; preserve the declarative API boundary.
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

revoke execute on function public.social_profile, public.social_post, public.social_entry_post,
  public.social_feed, public.social_profile_posts, public.social_comments, public.social_connections,
  public.social_search_profiles, public.social_suggestions, public.social_blocked_profiles,
  public.social_notifications, public.social_has_unread_notifications, public.mark_social_notifications_read,
  public.social_photo_claims from public, anon;

grant execute on function public.social_profile, public.social_post, public.social_entry_post,
  public.social_feed, public.social_profile_posts, public.social_comments, public.social_connections,
  public.social_search_profiles, public.social_suggestions, public.social_blocked_profiles,
  public.social_notifications, public.social_has_unread_notifications, public.mark_social_notifications_read,
  public.social_photo_claims to authenticated, service_role;
