-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.social_counter_change (
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
