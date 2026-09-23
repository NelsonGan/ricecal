-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.social_unread_notification_count()
  RETURNS integer
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select count(*)::integer from (
    select 1 from public.social_notifications n
    where n.recipient_id = (select auth.uid()) and n.read_at is null
    limit 100
  ) unread;
$function$;

REVOKE EXECUTE ON FUNCTION public.social_unread_notification_count() FROM PUBLIC, anon;

GRANT ALL ON FUNCTION public.social_unread_notification_count() TO authenticated;

GRANT ALL ON FUNCTION public.social_unread_notification_count() TO service_role;
