-- Settings edits on an existing account must respect public review and privacy.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set owner 'a8700000-0000-4000-8000-000000000001'
\set reader 'a8700000-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  id::text || '@profile-settings.example.test', '{}', '{}'
from unnest(array[:'owner'::uuid, :'reader'::uuid]) id;
update public.profiles set handle = 'settings_cook', display_name = 'First name', bio = 'First bio',
  birth_date = '1990-01-01' where id = :'owner';
update public.profiles set review_status = 'approved' where id = :'owner';

select set_config('request.jwt.claims', json_build_object('sub', :'reader', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::integer from public.social_profile(:'owner')), 1,
  'another account can read an approved identity');
select ok(not exists(select 1 from public.profiles where id = :'owner'),
  'the same account cannot read private profile columns');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format('update public.profiles set review_status = %L where id = %L', 'approved', :'owner'),
  '42501', null, 'the owner cannot approve a settings edit');
update public.profiles set display_name = 'Second name', bio = 'Second bio' where id = :'owner';
select is((select review_status::text from public.profiles where id = :'owner'), 'pending',
  'changing public fields in Settings requires a new review');
select is((select revision from public.profiles where id = :'owner'), 2,
  'the public identity revision advances once for the edit');
select throws_ok(format('update public.profiles set display_name = %L where id = %L', '', :'owner'),
  '23514', null, 'a public identity needs a visible name');
select throws_ok(format('update public.profiles set avatar_path = %L where id = %L',
  'avatars/other-user/photo.jpg', :'owner'),
  '23514', null, 'a public identity cannot use another avatar key');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'reader', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::integer from public.social_profile(:'owner')), 0,
  'unreviewed Settings changes are hidden from other accounts');
reset role;

select ok(public.review_social_content('profile', :'owner', 2, 'approved', null),
  'the exact new revision can be approved');
select set_config('request.jwt.claims', json_build_object('sub', :'reader', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select display_name from public.social_profile(:'owner')), 'Second name',
  'the reviewed Settings name appears in the public profile');
select is((select bio from public.social_profile(:'owner')), 'Second bio',
  'the reviewed Settings bio appears in the public profile');
select ok(not exists(select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'social_profiles' and column_name = 'birth_date'),
  'the public identity view has no health fields');
reset role;
select * from finish();
rollback;
