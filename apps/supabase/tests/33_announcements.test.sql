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

select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;

-- The app claims an announcement and switches auto post on in one write, and
-- only when the id is not in the list yet, so a second phone claims nothing.
update public.profiles
set seen_announcements = array['feed_auto_share_2026_10'], auto_post_foods = true
where id = :'owner' and not seen_announcements @> array['feed_auto_share_2026_10'];
update public.profiles
set seen_announcements = array['feed_auto_share_2026_10'], auto_post_foods = true
where id = :'other';
reset role;

select is((select seen_announcements from public.profiles where id = :'owner'),
  array['feed_auto_share_2026_10'], 'the owner records an announcement as seen');
select is((select auto_post_foods from public.profiles where id = :'owner'), true,
  'the same write switches auto post foods on');
select is((select seen_announcements from public.profiles where id = :'other'), '{}'::text[],
  'nobody can mark another account''s announcements');

set local role authenticated;
select is_empty($$
  update public.profiles set auto_post_foods = false
  where id = 'a8900000-0000-4000-8000-000000000001'
    and not seen_announcements @> array['feed_auto_share_2026_10']
  returning id
$$, 'a claim already made matches no row');
select throws_ok($$
  update public.profiles set seen_announcements = array_fill('x'::text, array[201])
  where id = 'a8900000-0000-4000-8000-000000000001'
$$, '23514', null, 'the list is bounded in count');
select throws_ok($$
  update public.profiles set seen_announcements = array[repeat('x', 9000)]
  where id = 'a8900000-0000-4000-8000-000000000001'
$$, '23514', null, 'and in size, since the client writes it');
reset role;

select * from finish();
rollback;
