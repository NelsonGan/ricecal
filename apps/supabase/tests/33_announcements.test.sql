begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set owner 'a8900000-0000-4000-8000-000000000001'
\set other 'a8900000-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  id::text || '@announcements.example.test', '{}', '{}'
from unnest(array[:'owner'::uuid, :'other'::uuid]) id;

select is((select seen_announcements from public.profiles where id = :'owner'), '{}'::text[],
  'a new account has seen no announcements');
select ok(not has_function_privilege('anon', 'public.see_announcements(text[], boolean)', 'EXECUTE'),
  'signed-out callers cannot mark anything seen');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'seen_announcements', 'UPDATE'),
  'the list is written only through the function');

select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*)::int from public.see_announcements(array['feed_auto_share_2026_10'], true)), 1,
  'the first claim returns the row');
select is((select count(*)::int from public.see_announcements(array['feed_auto_share_2026_10'], false)), 0,
  'a second claim returns nothing and changes nothing');
select throws_ok($$
  update public.profiles set seen_announcements = '{}'
  where id = 'a8900000-0000-4000-8000-000000000001'
$$, '42501', null, 'the column cannot be written directly');
select throws_ok($$ select * from public.see_announcements(array['Not An Id'], null) $$,
  '22023', null, 'ids are validated');
select throws_ok($$ select * from public.see_announcements('{}'::text[], null) $$,
  '22023', null, 'an empty list is refused');

-- Onboarding marks several at once and leaves the setting alone.
select is((select count(*)::int from public.see_announcements(
  array['feed_auto_share_2026_10', 'later_news_2027_01'], null)), 1,
  'a list with one unseen id still claims');
reset role;

select is((select seen_announcements from public.profiles where id = :'owner'),
  array['feed_auto_share_2026_10', 'later_news_2027_01'], 'ids are appended once each');
select is((select auto_post_foods from public.profiles where id = :'owner'), true,
  'the first claim switched auto post foods on, and the later ones did not undo it');
select is((select seen_announcements from public.profiles where id = :'other'), '{}'::text[],
  'nobody else''s list moves');

select * from finish();
rollback;
