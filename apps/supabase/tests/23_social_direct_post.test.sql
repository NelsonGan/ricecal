begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set writer 'a8600000-0000-4000-8000-000000000001'
\set reader 'a8600000-0000-4000-8000-000000000002'
\set entry  'a8610000-0000-4000-8000-000000000001'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  id::text || '@direct-post.example.test', '{}', '{}'
from unnest(array[:'writer'::uuid, :'reader'::uuid]) id;
update public.profiles set display_name = 'Dinner cook' where id = :'writer';
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor, photo_path)
values
  (:'entry', :'writer', 'Rice bowl', 280, 45, 8, 6, '1 bowl', 1,
    'meals/' || :'writer' || '/bowl.jpg');

select is((select is_private from public.profiles where id = :'writer'), false,
  'an unused account starts discoverable');

select set_config('request.jwt.claims', json_build_object('sub', :'writer', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.create_social_post(:'entry', 'Dinner', 'public') as post \gset
select is((select review_status::text from public.social_posts where id = :'post'), 'approved',
  'posting publishes immediately');
select ok((select published_at is not null from public.social_posts where id = :'post'),
  'an immediate post has a publication time');
select ok((select handle <> '' from public.social_profiles where user_id = :'writer'),
  'posting uses the assigned handle');
select public.set_social_profile('', 'Dinner cook', 'Likes rice', null);
select is((select revision from public.social_profiles where user_id = :'writer'), 2,
  'editing a public profile advances its moderation revision');
select public.update_social_post(:'post', 'Later dinner', 'public');
select is((select review_status::text from public.social_posts where id = :'post'), 'approved',
  'editing a post stays published');
reset role;
select handle as writer_handle from public.profiles where id = :'writer' \gset

select set_config('request.jwt.claims', json_build_object('sub', :'reader', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_profiles where user_id = :'writer'), 1,
  'an author is visible after choosing to post');
select is((select count(*)::int from public.social_post(:'post')), 1,
  'another account can read the post without a review step');
select is((select count(*)::int from public.social_feed('discover') where id = :'post'), 1,
  'Discover includes an immediate post from an author');
select is((select count(*)::int from public.social_search_profiles(:'writer_handle')), 1,
  'a profile is searchable by default');
select is((select count(*)::int from public.social_suggestions() where user_id = :'writer'), 1,
  'a profile appears in suggestions by default');
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'writer' || '/bowl.jpg'])), 1,
  'a visible immediate post authorizes its photo key');
select is((select photo_etag from public.social_photo_claims(array['meals/' || :'writer' || '/bowl.jpg'])), null,
  'the signer will pin the current bytes when an immediate post has no reviewed ETag');
select public.set_social_follow(:'writer', true);
select is((select count(*)::int from public.social_feed('following') where id = :'post'), 1,
  'following works without manually setting a handle or bio');
select public.set_social_follow(:'writer', false);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'writer', 'role', 'authenticated')::text, true);
set local role authenticated;
update public.profiles set is_private = true where id = :'writer';
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'reader', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_search_profiles(:'writer_handle')), 0,
  'a private profile is absent from search');
select is((select count(*)::int from public.social_suggestions() where user_id = :'writer'), 0,
  'a private profile is absent from suggestions');
select is((select count(*)::int from public.social_feed('discover') where id = :'post'), 0,
  'a private profile is absent from Discover');
select public.set_social_follow(:'writer', true);
select is((select count(*)::int from public.social_feed('following') where id = :'post'), 1,
  'an existing follower can still see posts');
select is((select count(*)::int from public.social_profile(:'writer')), 1,
  'a shared profile link remains accessible');
reset role;

select * from finish();
rollback;
