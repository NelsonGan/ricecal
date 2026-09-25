begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set first 'f1300000-0000-4000-8000-000000000001'
\set second 'f1300000-0000-4000-8000-000000000002'
\set unicode 'f1300000-0000-4000-8000-000000000003'
\set viewer 'f1300000-0000-4000-8000-000000000004'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (:'first', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'first@handles.example.test', '{}', '{"full_name":"Nelson Gan"}');
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (:'second', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'second@handles.example.test', '{}', '{"full_name":"Nelson Gan"}');
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (:'unicode', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'unicode@handles.example.test', '{}', '{"full_name":"李 小明"}');
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (:'viewer', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'viewer@handles.example.test', '{}', '{"full_name":"Viewer"}');

select is((select handle from public.profiles where id = :'first'), 'nelson.gan',
  'a new profile gets a lowercase dotted handle from its name');
select is((select handle from public.profiles where id = :'second'), 'nelson.gan.1',
  'a repeated name gets a unique numeric suffix');
select is((select handle from public.profiles where id = :'unicode'), 'user.f1300000',
  'a name without Latin letters still gets a handle');
select is((select count(*)::int from public.profiles where id in (:'first', :'second', :'unicode', :'viewer')
  and handle is null), 0, 'every new profile has a handle');
select ok(not has_function_privilege('authenticated', 'private.assign_profile_handle()', 'EXECUTE'),
  'clients cannot call the privileged handle trigger function');

update public.profiles set display_name = 'Nelson New Name' where id = :'first';
select is((select handle from public.profiles where id = :'first'), 'nelson.gan',
  'changing a name keeps its existing handle');
update public.profiles set handle = null where id = :'first';
select is((select handle from public.profiles where id = :'first'), 'nelson.new.name',
  'an older client clearing a handle gets one from the current name');

select set_config('request.jwt.claims', json_build_object('sub', :'viewer', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_profiles where user_id = :'first'), 1,
  'a new account appears in discovery without a social action');
select is((select count(*)::int from public.social_search_profiles('nelson.new')
  where handle = 'nelson.new.name'), 1, 'an inferred handle can be found in search');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'first', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.set_social_profile('nelson.new.name', 'Nelson New Name', '', null);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'viewer', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_search_profiles('nelson.')
  where handle = 'nelson.new.name'), 1, 'a joined profile can be found with a dotted handle prefix');
reset role;

select * from finish();
rollback;
