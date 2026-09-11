-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE FUNCTION public.has_account_password()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce((
    select u.encrypted_password is not null and u.encrypted_password <> ''
    from auth.users u
    where u.id = auth.uid()
  ), false);
$function$;

revoke execute on function public.has_account_password() from public, anon;
grant execute on function public.has_account_password() to authenticated;
