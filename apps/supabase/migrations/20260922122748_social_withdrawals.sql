-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.set_social_follow (
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

CREATE OR REPLACE FUNCTION public.set_social_like (
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
-- Preserve explicit privileges that the schema diff omits.
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
