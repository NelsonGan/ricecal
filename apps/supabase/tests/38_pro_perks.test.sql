-- Pro perks: drawings and uploaded pictures for a group, the gold ring's
-- `is_pro`, and the warning before a free account's photographs are swept.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set free 'a3800000-0000-4000-8000-000000000001'
\set pro  'a3800000-0000-4000-8000-000000000002'
\set peer 'a3800000-0000-4000-8000-000000000003'
\set gone 'a3800000-0000-4000-8000-000000000004'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id::text || '@perks.example.test', '{}', '{}'
from unnest(array[:'free'::uuid, :'pro'::uuid, :'peer'::uuid, :'gone'::uuid]) id;
update public.profiles p set handle = 'perks.' || split_part(p.id::text, '-', 5)
where p.id in (:'free', :'pro', :'peer', :'gone');
insert into public.subscriptions (user_id, status, plan, current_period_end) values
  (:'pro', 'active', 'yearly', now() + interval '300 days'),
  -- Lapsed ten days ago: still inside the sixty days of grace.
  (:'gone', 'expired', 'monthly', now() - interval '10 days');

-- -- GROUP ICONS -------------------------------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', :'free', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$select public.create_group('Perks free', 'coffee', false)$$,
  'a free account may use a free drawing');
select lives_ok($$select public.create_group('Perks chilli', 'chilli', false)$$,
  'and the drawing an older app still offers');
select throws_ok($$select public.create_group('Perks sushi', 'sushi-roll', false)$$,
  'P0001', 'pro_group_icon', 'a Pro drawing is refused to a free account');
select throws_ok(
  format($$select public.create_group('Perks pic', 'rice-bowl', false, 'avatars/%s/icon.jpg')$$, :'free'),
  'P0001', 'pro_group_icon', 'and so is an uploaded picture');
reset role;

-- The free group, wearing a Pro drawing set while its leader paid, can still
-- be renamed, but cannot be moved onto another Pro drawing.
update public.groups set icon_name = 'sushi-roll' where name = 'Perks free';
create temp table fg as select id from public.groups where name = 'Perks free';
grant select on fg to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'free', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$select public.update_group((select id from fg), 'Perks renamed', 'sushi-roll', null)$$,
  'a group keeps the Pro drawing it already wears');
select throws_ok($$select public.update_group((select id from fg), null, 'pizza-slice', null)$$,
  'P0001', 'pro_group_icon', 'but cannot take another one');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'pro', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok(
  format($$select public.create_group('Perks pro', 'sushi-roll', false, 'avatars/%s/icon-1.jpg')$$, :'pro'),
  'a Pro account may use a Pro drawing and its own picture');
select throws_ok(
  format($$select public.create_group('Perks borrowed', 'rice-bowl', false, 'avatars/%s/icon.jpg')$$, :'free'),
  '22023', null, 'a picture from somebody else''s folder is refused');
select throws_ok(
  format($$select public.create_group('Perks meal', 'rice-bowl', false, 'meals/%s/icon.jpg')$$, :'pro'),
  '22023', null, 'and so is a meal key');
reset role;
create temp table pg as select id from public.groups where name = 'Perks pro';
grant select on pg to authenticated;
select is((select icon_path from public.groups where id = (select id from pg)),
  'avatars/' || :'pro' || '/icon-1.jpg', 'the picture is stored');

select set_config('request.jwt.claims', json_build_object('sub', :'pro', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select g->>'icon_path' from jsonb_array_elements(public.my_groups()) g where g->>'name' = 'Perks pro'),
  'avatars/' || :'pro' || '/icon-1.jpg', 'my_groups names the picture');
select is((select (g->'members'->0->>'is_pro')::boolean from jsonb_array_elements(public.my_groups()) g
  where g->>'name' = 'Perks pro'), true, 'and says its Pro member is Pro');
select is((select count(*)::integer from public.social_photo_claims(array['avatars/' || :'pro' || '/icon-1.jpg'])),
  1, 'a member is signed the group''s picture');
-- Picking a drawing takes the picture away.
select lives_ok($$select public.update_group((select id from pg), null, 'pizza-slice', null)$$,
  'the leader may change the drawing');
reset role;
select is((select icon_path from public.groups where id = (select id from pg)), null,
  'and choosing a drawing clears the picture');
update public.groups set icon_path = 'avatars/' || :'pro' || '/icon-1.jpg' where id = (select id from pg);

select set_config('request.jwt.claims', json_build_object('sub', :'peer', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::integer from public.social_photo_claims(array['avatars/' || :'pro' || '/icon-1.jpg'])),
  0, 'a stranger is not signed it');
reset role;
insert into public.group_invites (group_id, invitee_id, inviter_id) values ((select id from pg), :'peer', :'pro');
select set_config('request.jwt.claims', json_build_object('sub', :'peer', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::integer from public.social_photo_claims(array['avatars/' || :'pro' || '/icon-1.jpg'])),
  0, 'nor is somebody only invited, since a leader can invite a stranger');
select is((select i->>'icon_path' from jsonb_array_elements(public.my_group_invites()) i), null,
  'and the invite does not name the picture');
select is((select (i->'inviter'->>'is_pro')::boolean from jsonb_array_elements(public.my_group_invites()) i),
  true, 'and sees the inviter is Pro');
select throws_ok($$select public.is_entitled(gen_random_uuid())$$, '42501', null,
  'is_entitled stays closed to clients');
select is((select is_pro from public.social_profile_details where user_id = :'pro'), false,
  'the profile view does not say an account that never joined the feed is Pro');
reset role;
update public.profiles set social_joined_at = now(), display_name = 'Perks Pro' where id = :'pro';
select set_config('request.jwt.claims', json_build_object('sub', :'peer', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select is_pro from public.social_profile_details where user_id = :'pro'), true,
  'it does for a public feed profile');
reset role;
update public.profiles set is_private = true where id = :'pro';
select set_config('request.jwt.claims', json_build_object('sub', :'peer', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select is_pro from public.social_profile_details where user_id = :'pro'), false,
  'but not for a private one');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'pro', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select is_pro from public.social_profile_details where user_id = :'pro'), true,
  'which still sees its own');
reset role;

-- -- PHOTO REMOVALS ----------------------------------------------------------

insert into public.food_logs
  (user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g,
   serving_label, serving_factor, photo_path, source, logged_at)
values
  -- Due in two days, and in twenty.
  (:'free', 'Soon', 500, 60, 20, 18, '1 plate', 1, 'meals/' || :'free' || '/soon.jpg', 'camera',
   now() - interval '28 days'),
  (:'free', 'Later', 500, 60, 20, 18, '1 plate', 1, 'meals/' || :'free' || '/later.jpg', 'camera',
   now() - interval '10 days'),
  -- Past due: the hourly sweep has not got to it yet.
  (:'free', 'Overdue', 500, 60, 20, 18, '1 plate', 1, 'meals/' || :'free' || '/overdue.jpg', 'camera',
   now() - interval '31 days'),
  (:'free', 'Forged', 500, 60, 20, 18, '1 plate', 1, 'meals/' || :'peer' || '/forged.jpg', 'camera',
   now() - interval '28 days'),
  (:'pro', 'Kept', 500, 60, 20, 18, '1 plate', 1, 'meals/' || :'pro' || '/kept.jpg', 'camera',
   now() - interval '28 days'),
  -- Logged after the lapse: due at the end of the grace, fifty days away.
  (:'gone', 'Grace', 500, 60, 20, 18, '1 plate', 1, 'meals/' || :'gone' || '/grace.jpg', 'camera',
   now() - interval '5 days');

select set_config('request.jwt.claims', json_build_object('sub', :'free', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select array_agg(item_name order by removes_at) from public.upcoming_photo_removals(7)),
  array['Overdue', 'Soon'], 'a free account is told what goes this week, soonest first');
select ok((select removes_at from public.upcoming_photo_removals(7) where item_name = 'Soon')
  between now() + interval '47 hours' and now() + interval '49 hours', 'at thirty days after it was logged');
select is((select count(*)::integer from public.upcoming_photo_removals(30)), 3,
  'a longer window reaches the later photograph');
select throws_ok($$select * from public.upcoming_photo_removals(0)$$, '22023', null, 'the window is bounded');
select throws_ok(format($$select * from public.photo_removal_schedule(%L, now())$$, :'pro'), '42501', null,
  'the schedule for another account is closed');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'pro', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::integer from public.upcoming_photo_removals(30)), 0, 'Pro keeps everything');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'gone', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::integer from public.upcoming_photo_removals(30)), 0,
  'a lapsed subscriber in grace is told nothing yet');
reset role;

-- The schedule and the sweep must agree: what is past due is what is swept.
select is((select array_agg(photo_path order by photo_path) from public.expired_meal_photos()
  where photo_path like 'meals/a38%'),
  (select array_agg(s.photo_path order by s.photo_path) from public.photo_removal_schedule(:'free', now()) s),
  'a photograph past due on the schedule is exactly one the sweep takes');

insert into public.push_tokens (token, user_id, platform) values
  ('ExponentPushToken[perks-free]', :'free', 'ios'),
  ('ExponentPushToken[perks-pro]', :'pro', 'ios');
create temp table pushed as select * from public.photo_removal_push_targets(6, 200);
select is((select array_agg(token) from pushed where user_id in (:'free', :'pro')),
  array['ExponentPushToken[perks-free]'], 'the job pushes the free device and not the Pro one');
select is((select photo_count from pushed where user_id = :'free'), 2, 'counting what goes in the window');
select is((select count(*)::integer from public.photo_removal_push_targets(6, 200) where user_id = :'free'), 0,
  'and a second run in the same window pushes nobody again');

select * from finish();
rollback;
