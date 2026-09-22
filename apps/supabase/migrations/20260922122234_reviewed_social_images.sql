-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

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
