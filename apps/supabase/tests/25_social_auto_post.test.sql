begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set owner 'a8800000-0000-4000-8000-000000000001'
\set reader 'a8800000-0000-4000-8000-000000000002'
\set first 'a8810000-0000-4000-8000-000000000001'
\set second 'a8810000-0000-4000-8000-000000000002'
\set third 'a8810000-0000-4000-8000-000000000003'
\set fourth 'a8810000-0000-4000-8000-000000000004'
\set fifth 'a8810000-0000-4000-8000-000000000005'
\set sixth 'a8810000-0000-4000-8000-000000000006'
\set seventh 'a8810000-0000-4000-8000-000000000007'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  id::text || '@auto-post.example.test', '{}', '{}'
from unnest(array[:'owner'::uuid, :'reader'::uuid]) id;

select is((select auto_post_foods from public.profiles where id = :'owner'), false,
  'automatic posting is off by default');

select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values (:'first', :'owner', 'Private rice', 200, 40, 4, 2, '1 bowl', 1);
set constraints social_auto_post_food immediate;
reset role;
select is((select count(*)::int from public.social_posts where source_entry_id = :'first'), 0,
  'logging while opted out does not publish');

set local role authenticated;
update public.profiles set auto_post_foods = true where id = :'owner';
reset role;
set constraints social_auto_post_food deferred;
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values (:'second', :'owner', 'Shared rice', 200, 40, 4, 2, '1 bowl', 1);
update public.food_logs set quantity = 2 where id = :'second';
set constraints social_auto_post_food immediate;
select is((select count(*)::int from public.social_posts where source_entry_id = :'second'), 1,
  'logging while opted in creates one post');
select is((select kcal from public.social_posts where source_entry_id = :'second'), 400,
  'automatic post uses the diary total including quantity');
select is((select audience::text from public.social_posts where source_entry_id = :'second'), 'public',
  'a discoverable profile shares to everyone');
select ok((select social_joined_at is not null from public.profiles where id = :'owner'),
  'the first automatic post joins the account to the social feed');

set local role authenticated;
update public.profiles set is_private = true where id = :'owner';
reset role;
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values (:'third', :'owner', 'Followers rice', 200, 40, 4, 2, '1 bowl', 1);
select is((select audience::text from public.social_posts where source_entry_id = :'third'), 'followers',
  'a private profile shares only with followers');

insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values (:'fourth', :'owner', 'Quick rice', 200, 40, 4, 2, '1 bowl', 1);
set local role authenticated;
select is(public.create_social_post(:'fourth', 'My words', 'followers')::text,
  public.social_entry_post(:'fourth')::text,
  'manual share reuses the automatic post');
reset role;
select is((select count(*)::int from public.social_posts where source_entry_id = :'fourth'), 1,
  'one meal cannot create duplicate posts');
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor, log_date)
values (:'seventh', :'owner', 'Last week rice', 200, 40, 4, 2, '1 bowl', 1, public.local_today(:'owner') - 3);
select is((select count(*)::int from public.social_posts where source_entry_id = :'seventh'), 0,
  'a meal filled in for an earlier day is not posted as news');
select is((select used from public.social_rate_limits where user_id = :'owner' and action = 'post'), 3,
  'automatic posts spend the regular hourly posting budget');
update public.social_rate_limits set used = 30
where user_id = :'owner' and action = 'post';
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values (:'sixth', :'owner', 'Later rice', 200, 40, 4, 2, '1 bowl', 1);
select is((select count(*)::int from public.food_logs where id = :'sixth'), 1,
  'the hourly post limit does not block a diary entry');
select is((select count(*)::int from public.social_posts where source_entry_id = :'sixth'), 0,
  'automatic posting respects the hourly post limit');
update public.profiles set quarantined = true where id = :'owner';
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values (:'fifth', :'owner', 'Unshared rice', 200, 40, 4, 2, '1 bowl', 1);
select is((select count(*)::int from public.social_posts where source_entry_id = :'fifth'), 0,
  'a quarantined profile can still log food without publishing');
set local role authenticated;
update public.profiles set auto_post_foods = false where id = :'owner';
reset role;
delete from public.food_logs where id = :'second';
select is((select count(*)::int from public.social_posts where source_entry_id = :'second'), 0,
  'deleting a meal removes its automatic post');
reset role;

-- Sign in with Apple that shares neither a name nor an email leaves the
-- display name empty, and the feed refuses an account with no name. Such an
-- account with automatic posting on could not save a single meal.
\set nameless 'a8800000-0000-4000-8000-000000000003'
\set nameless_meal 'a8810000-0000-4000-8000-000000000008'
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values (:'nameless', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  null, '{"provider":"apple"}', '{}');
update public.profiles set auto_post_foods = true where id = :'nameless';
select is((select display_name from public.profiles where id = :'nameless'), '',
  'an Apple account with no name and no email starts with an empty name');
select lives_ok(format(
  $sql$insert into public.food_logs
    (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
  values (%L, %L, 'Nameless rice', 200, 40, 4, 2, '1 bowl', 1)$sql$, :'nameless_meal', :'nameless'),
  'an account with no name can still log food with automatic posting on');
select is((select count(*)::int from public.food_logs where id = :'nameless_meal'), 1,
  'the meal is saved');
select is((select count(*)::int from public.social_posts where source_entry_id = :'nameless_meal'), 0,
  'nothing is posted for an account with no name');
select ok((select social_joined_at is null from public.profiles where id = :'nameless'),
  'an account with no name does not join the feed');

select * from finish();
rollback;
