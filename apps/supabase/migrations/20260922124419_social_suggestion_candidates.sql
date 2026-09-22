-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION private.social_suggestion_candidates (
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
        join public.social_profiles a on a.user_id = f.followed_id
      where f.follower_id = v_user and a.review_status = 'approved' and not a.quarantined
        and f.followed_id not in (select h.user_id from hidden_authors h)
      order by f.created_at desc, f.followed_id desc limit 64
    ), paths as materialized (
      select f.followed_id from seeds s cross join lateral (
        select edge.followed_id from public.social_follows edge
          join public.social_profiles a on a.user_id = edge.followed_id
        where edge.follower_id = s.followed_id
          and (a.user_id = v_user or (a.review_status = 'approved' and not a.quarantined
            and a.user_id not in (select h.user_id from hidden_authors h)))
        order by edge.created_at desc, edge.followed_id desc limit 64
      ) f
    ), mutual as materialized (
      select p.followed_id as user_id, count(*) as weight from paths p group by p.followed_id
      order by count(*) desc, p.followed_id limit 256
    ), recent as materialized (
      select p.user_id, 0::bigint as weight from public.social_profiles p
      where p.review_status = 'approved' and not p.quarantined
        and p.user_id not in (select h.user_id from hidden_authors h)
      order by p.created_at desc, p.user_id desc limit 512
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

GRANT ALL ON FUNCTION private.social_suggestion_candidates(integer) TO authenticated;

GRANT ALL ON FUNCTION private.social_suggestion_candidates(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.social_suggestions (
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

revoke execute on function private.social_suggestion_candidates from public, anon;

grant execute on function private.social_suggestion_candidates to authenticated, service_role;

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
