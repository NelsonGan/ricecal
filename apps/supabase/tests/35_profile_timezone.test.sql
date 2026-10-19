begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- The timezone guard skips its zone lookup for the column default and for an
-- unchanged value. These pin that the skip opened nothing: a junk zone must
-- still never reach the row, because `local_today` throws on one and the scan
-- quota reads that throw as "allow".

\set owner 'f3500000-0000-4000-8000-000000000001'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (:'owner', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'owner@timezone.example.test', '{}', '{}');

select is((select timezone from public.profiles where id = :'owner'), 'Asia/Kuala_Lumpur',
  'a new account gets the default zone');

select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;

update public.profiles set timezone = 'Asia/Tokyo' where id = :'owner';
select is((select timezone from public.profiles where id = :'owner'), 'Asia/Tokyo',
  'a real zone is kept');

update public.profiles set timezone = 'Asia/Tokyo' where id = :'owner';
select is((select timezone from public.profiles where id = :'owner'), 'Asia/Tokyo',
  'writing the same zone again keeps it');

update public.profiles set timezone = 'x' where id = :'owner';
select is((select timezone from public.profiles where id = :'owner'), 'Asia/Tokyo',
  'a junk zone keeps the zone the row had');

update public.profiles set timezone = 'UTC+8' where id = :'owner';
select is((select timezone from public.profiles where id = :'owner'), 'Asia/Tokyo',
  'a POSIX offset is not an IANA name and is ignored too');

update public.profiles set timezone = 'Asia/Kuala_Lumpur' where id = :'owner';
select is((select timezone from public.profiles where id = :'owner'), 'Asia/Kuala_Lumpur',
  'moving back to the default zone is kept');

update public.profiles set display_name = 'Renamed' where id = :'owner';
select lives_ok($$ select public.local_today() $$,
  'local_today still answers for the account');

reset role;

-- An insert carrying junk falls back to the default, the path the skip sits on.
\set direct 'f3500000-0000-4000-8000-000000000002'
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (:'direct', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'direct@timezone.example.test', '{}', '{}');
delete from public.profiles where id = :'direct';
insert into public.profiles (id, display_name, timezone) values (:'direct', 'Direct', 'Not/AZone');
select is((select timezone from public.profiles where id = :'direct'), 'Asia/Kuala_Lumpur',
  'an insert with a junk zone gets the default');

select * from finish();
rollback;
