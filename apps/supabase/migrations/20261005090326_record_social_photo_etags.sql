-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.record_social_photo_etags (
  p_etags jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
     and p.created_at < now() - interval '10 minutes';
  get diagnostics v_posts = row_count;
  with tags as (
    select key, value from jsonb_each_text(p_etags)
     where char_length(value) <= 128 and value ~ '^"[a-zA-Z0-9-]+"$'
  )
  update public.profiles p set photo_etag = t.value
    from tags t
   where p.avatar_path = t.key and p.photo_etag is null
     and p.updated_at < now() - interval '10 minutes';
  get diagnostics v_avatars = row_count;
  return v_posts + v_avatars;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_social_photo_etags(jsonb) FROM public, anon, authenticated;
GRANT ALL ON FUNCTION public.record_social_photo_etags(jsonb) TO service_role;
