-- Email identities also exist for passwordless accounts. Return only whether
-- the caller has a password; never expose the hash or accept another user id.
create or replace function public.has_account_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.encrypted_password is not null and u.encrypted_password <> ''
    from auth.users u
    where u.id = auth.uid()
  ), false);
$$;

revoke execute on function public.has_account_password() from public, anon;
grant execute on function public.has_account_password() to authenticated;
