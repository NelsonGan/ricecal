begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, encrypted_password) values
  ('71000000-0000-0000-0000-000000000001', 'passwordless@example.test', ''),
  ('71000000-0000-0000-0000-000000000002', 'password@example.test', extensions.crypt('test-password', extensions.gen_salt('bf')));

select ok(not has_function_privilege('anon', 'public.has_account_password()', 'execute'), 'anonymous callers cannot inspect password status');
select ok(has_function_privilege('authenticated', 'public.has_account_password()', 'execute'), 'authenticated callers can inspect their own status');
select is((select prosecdef from pg_proc where oid = 'public.has_account_password()'::regprocedure), true, 'privileged access is confined to the account lookup');
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select is(public.has_account_password(), false, 'email code account has no password');
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select is(public.has_account_password(), true, 'password account reports its password');
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select is(public.has_account_password(), false, 'another account having a password does not affect this caller');
select set_config('request.jwt.claim.sub', '', true);
select is(public.has_account_password(), false, 'no subject reveals no account status');
reset role;
select * from finish();
rollback;
