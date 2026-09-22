-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER TABLE public.social_reports
  DROP CONSTRAINT social_reports_pkey;

DROP INDEX public.social_reports_reporter_idx;

CREATE OR REPLACE FUNCTION private.social_comment_changed()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER TABLE public.social_reports
  ADD COLUMN content_revision integer NOT NULL;

ALTER TABLE public.social_reports
  ADD CONSTRAINT social_reports_content_revision_check CHECK (content_revision > 0);

ALTER TABLE public.social_reports
  ADD CONSTRAINT social_reports_pkey PRIMARY KEY (kind, content_id, content_revision, reporter_id);

ALTER TABLE public.social_reports
  ADD COLUMN resolved_at timestamp with time zone;

CREATE INDEX social_reports_unresolved_idx ON public.social_reports (kind, content_id, content_revision)
  WHERE resolved_at IS NULL;

CREATE INDEX social_reports_reporter_idx ON public.social_reports (reporter_id, kind, content_id, content_revision);