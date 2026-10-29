-- Replies, reactions and food in a group's chat, invite suggestions, and the
-- handle a new email account gets. Access is asserted as a client role.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ana  'a3700000-0000-4000-8000-000000000001'
\set ben  'a3700000-0000-4000-8000-000000000002'
\set cai  'a3700000-0000-4000-8000-000000000003'
\set dee  'a3700000-0000-4000-8000-000000000004'
\set meal 'a3710000-0000-4000-8000-000000000001'
\set other_group 'a3720000-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id::text || '@chat-extras.example.test', '{}', '{"full_name": "Fixture"}'
from unnest(array[:'ana'::uuid, :'ben'::uuid, :'cai'::uuid, :'dee'::uuid]) id;
update public.profiles p set display_name = initcap(split_part(p.id::text, '-', 1)),
  handle = case p.id when :'ana' then 'ana.extras' when :'ben' then 'ben.extras'
    when :'cai' then 'cai.extras' else 'dee.extras' end
where p.id in (:'ana', :'ben', :'cai', :'dee');

-- Broadcasts are recorded rather than sent (see 36_groups).
create temp table broadcasts (topic text, event text, ids jsonb);
grant select on broadcasts to authenticated;
create or replace function private.group_chat_broadcast(p_group uuid, p_event text, p_ids jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into pg_temp.broadcasts values ('group-chat:' || p_group::text, p_event, p_ids);
$$;

-- Ana and Ben share a group; Ana alone is in a second one.
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table g as select public.create_group('Extras fixture', 'rice-bowl', false) as id;
reset role;
insert into public.groups(id, name, leader_id) values (:'other_group', 'Extras other', :'ana');
insert into public.group_members(group_id, user_id) values ((select id from g), :'ben'), (:'other_group', :'ana');
grant select on g to authenticated;

select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.proname in ('send_group_message', 'set_group_message_reaction', 'group_invite_suggestions',
      'group_post_food', 'group_food_label', 'group_reactions_changed', 'group_share_posted_food',
      'group_food_reactions')
    and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
), 'none of the new functions is executable by PUBLIC');
select ok(not has_function_privilege('authenticated', 'private.group_post_food(uuid)', 'EXECUTE'),
  'clients cannot read a post''s meal around its checks');
select ok(not has_table_privilege('authenticated', 'public.group_message_reactions', 'SELECT'),
  'reactions are closed to clients');

-- Replies.
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table first_msg as select public.send_group_message((select id from g), 'cheat day lah',
  'a3730000-0000-4000-8000-000000000001') as id;
-- now() is fixed inside the test's transaction, so the first message is put
-- a minute back to give the thread an order.
reset role;
update public.group_messages set created_at = now() - interval '1 minute' where id = (select id from first_msg);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select lives_ok(format('select public.send_group_message(%L, %L, %L, %L)', (select id from g),
  'respect', 'a3730000-0000-4000-8000-000000000002', (select id from first_msg)), 'Ana answers it');
select is(public.group_messages((select id from g))->1->'reply_to'->>'body', 'cheat day lah',
  'the reply carries what it answers');
select is(public.group_messages((select id from g))->1->'reply_to'->'author'->>'id', :'ben',
  'and who wrote it');
select is(public.group_messages((select id from g))->0->'reply_to', 'null'::jsonb,
  'a plain message answers nothing');
-- An answer to something gone or elsewhere is sent on its own, not refused:
-- the sender's retry would carry the same reply and fail for ever.
select lives_ok(format('select public.send_group_message(%L, %L, %L, %L)', :'other_group',
  'wrong thread', 'a3730000-0000-4000-8000-000000000003', (select id from first_msg)),
  'a reply to a message in another group is still sent');
select is(public.group_messages(:'other_group')->-1->'reply_to', 'null'::jsonb,
  'without quoting the other group''s message');
select lives_ok(format('select public.send_group_message(%L, %L, %L)', (select id from g),
  'old app', 'a3730000-0000-4000-8000-000000000004'), 'the three-argument send of 1.0 still lands');

-- Reactions.
select lives_ok(format('select public.set_group_message_reaction(%L, %L)', (select id from first_msg), '❤️'),
  'Ana reacts');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
select lives_ok(format('select public.set_group_message_reaction(%L, %L)', (select id from first_msg), '😂'),
  'Ben reacts to his own message');
select lives_ok(format('select public.set_group_message_reaction(%L, %L)', (select id from first_msg), '❤️'),
  'and changes his mind');
select is(public.group_messages((select id from g))->0->'reactions',
  '[{"emoji": "❤️", "count": 2}]'::jsonb, 'one reaction each, counted by emoji');
select is(public.group_messages((select id from g))->0->>'my_reaction', '❤️', 'the viewer''s own is named');
select throws_ok(format('select public.set_group_message_reaction(%L, %L)', (select id from first_msg), '💩'),
  '23514', null, 'only the offered emoji are stored');
select lives_ok(format('select public.set_group_message_reaction(%L, null)', (select id from first_msg)),
  'a reaction is taken back with null');
select is(public.group_messages((select id from g))->0->'reactions',
  '[{"emoji": "❤️", "count": 1}]'::jsonb, 'and leaves the rest');
reset role;
select ok(exists (select 1 from broadcasts where event = 'reacted' and ids ? (select id::text from first_msg)),
  'a reaction is announced under its own event, which an older chat ignores');
select set_config('request.jwt.claims', json_build_object('sub', :'cai', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format('select public.set_group_message_reaction(%L, %L)', (select id from first_msg), '❤️'),
  '42501', null, 'a non-member cannot react');
reset role;

-- Ana posts a meal: it goes to both her groups' chats as an update.
insert into public.food_logs (id, user_id, log_date, logged_at, item_name, item_icon_set, item_icon_name,
  base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor, photo_path)
values (:'meal', :'ana', public.local_today(:'ana'), now(), 'Nasi lemak', 'dishes', 'nasi-lemak',
  640.4, 70, 20, 30, '1 plate', 1, 'meals/' || :'ana' || '/extras.jpg');
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table post as select public.create_social_post(:'meal', '', 'followers') as id;
reset role;
select is((select count(*)::int from public.group_messages where post_id = (select id from post)), 2,
  'a posted food is shared into each of the author''s groups');
select ok((select bool_and(automatic and pushed_at is null) from public.group_messages where post_id = (select id from post)),
  'marked automatic and not pushed yet');
select is((select count(*)::int from public.group_message_push_targets(:'ana',
  (select id from public.group_messages where post_id = (select id from post) and group_id = (select id from g)))), 0,
  'and the chat message lookup refuses it');
select is((select body from public.group_messages where post_id = (select id from post) limit 1),
  'Nasi lemak (640 kcal)', 'its body is the name and calories, for a push and for an older app');

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table food_msg as
  select e from jsonb_array_elements(public.group_messages((select id from g))) e where e->'food' <> 'null';
select is((select e->'food'->>'name' from food_msg), 'Nasi lemak',
  'a member who does not follow Ana still sees the food card');
select is((select (e->'food'->>'kcal')::numeric from food_msg), 640::numeric, 'with its calories');
select is((select (e->'food'->>'protein_g')::numeric from food_msg), 20::numeric, 'and macros');
select is((select e->'food'->>'entry_id' from food_msg), :'meal'::text,
  'with the diary entry its thumbs are cast on');
select is((select (e->'food'->>'likes')::int from food_msg), 0, 'and no likes yet');
select public.set_group_reaction(:'meal', 1::smallint);
select is((select (e->'food'->>'likes')::int
  from jsonb_array_elements(public.group_messages((select id from g))) e where e->'food' <> 'null'), 1,
  'a like on the board counts on the chat card');
select is((select (e->'food'->>'mine')::int
  from jsonb_array_elements(public.group_messages((select id from g))) e where e->'food' <> 'null'), 1,
  'and is the viewer''s own');
select public.set_group_reaction(:'meal', 0::smallint);
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'ana' || '/extras.jpg'])), 1,
  'and may sign its photo');
select throws_ok(format('select public.send_group_message(%L, null, %L, null, %L)', (select id from g),
  'a3730000-0000-4000-8000-000000000005', (select id from post)), '42501', null,
  'nobody can share someone else''s post');
reset role;
-- The meal falls outside the board's sixty days: only the chat keeps its photo.
update public.food_logs set log_date = public.local_today(:'ana') - 90 where id = :'meal';
set local role authenticated;
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'ana' || '/extras.jpg'])), 1,
  'a photo shared into the chat stays signable past the board''s sixty days');
reset role;
update public.social_posts set quarantined = true where id = (select id from post);
set local role authenticated;
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'ana' || '/extras.jpg'])), 0,
  'and is withdrawn with the post when moderation hides it');
reset role;
update public.social_posts set quarantined = false where id = (select id from post);
update public.food_logs set log_date = public.local_today(:'ana') where id = :'meal';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select lives_ok(format('select public.send_group_message(%L, null, %L, null, %L)', (select id from g),
  'a3730000-0000-4000-8000-000000000006', (select id from post)), 'Ana shares it again by hand');
reset role;
select is((select pushed_at from public.group_messages where request_id = 'a3730000-0000-4000-8000-000000000006'),
  null, 'a food sent by hand is pushed like any message');
select is((select automatic from public.group_messages where request_id = 'a3730000-0000-4000-8000-000000000006'),
  false, 'and is not an update');

-- Deleting the meal takes the post, and so the food messages, with it.
delete from public.food_logs where id = :'meal';
select is((select count(*)::int from public.group_messages where author_id = :'ana' and body like 'Nasi lemak%'), 0,
  'a deleted meal leaves no food message behind');

-- Workouts and sports go to the chat on their own too, while fresh.
reset role;
insert into public.workouts (id, user_id, name, started_at, ended_at, log_date, health_workout_id) values
  -- On the day the board is read for, in the members' own time zone: a UTC
  -- date put it on yesterday's board for the hours Malaysia is a day ahead.
  ('a3740000-0000-4000-8000-000000000001', :'ana', 'Push day', now() - interval '70 minutes',
   now() - interval '25 minutes', public.local_today(:'ben'), 'hk-push-day'),
  ('a3740000-0000-4000-8000-000000000002', :'ana', 'Old legs', now() - interval '3 days',
   now() - interval '3 days' + interval '40 minutes', (now() - interval '3 days')::date, null);
select is((select count(*)::int from public.group_messages
  where workout_id = 'a3740000-0000-4000-8000-000000000001' and automatic), 2,
  'a workout just finished is shared into each group as an update');
select is((select body from public.group_messages where workout_id = 'a3740000-0000-4000-8000-000000000001' limit 1),
  'Push day (45 min)', 'its body is the name and minutes');
select is((select count(*)::int from public.group_messages where workout_id = 'a3740000-0000-4000-8000-000000000002'), 0,
  'one logged after the fact is not');
insert into public.activity_sessions (id, user_id, provider, external_id, log_date, kind, kind_label,
  started_at, ended_at, duration_s, active_kcal, distance_m) values
  ('a3750000-0000-4000-8000-000000000001', :'ana', 'apple_health', 'hk-run', current_date, 'running', null,
   now() - interval '40 minutes', now() - interval '8 minutes', 1920, 310, 5200),
  ('a3750000-0000-4000-8000-000000000002', :'ana', 'apple_health', 'hk-push-day', current_date, 'strength', null,
   now() - interval '70 minutes', now() - interval '25 minutes', 2700, 200, null),
  ('a3750000-0000-4000-8000-000000000003', :'ana', 'demo', 'demo-walk', current_date, 'walking', null,
   now() - interval '30 minutes', now() - interval '5 minutes', 1500, 90, 2000),
  ('a3750000-0000-4000-8000-000000000004', :'ana', 'apple_health', 'hk-old-swim', current_date - 5, 'swimming', null,
   now() - interval '5 days', now() - interval '5 days' + interval '30 minutes', 1800, 250, 1000);
select is((select body from public.group_messages where activity_id = 'a3750000-0000-4000-8000-000000000001'
  and group_id = (select id from g)), 'Running (32 min)', 'a run a health store recorded is shared, named from its kind');
select is((select count(*)::int from public.group_messages where activity_id in
  ('a3750000-0000-4000-8000-000000000002', 'a3750000-0000-4000-8000-000000000003', 'a3750000-0000-4000-8000-000000000004')), 0,
  'but not the health copy of a logger workout, demo data, or a backfilled old swim');
update public.activity_sessions set active_kcal = 320 where id = 'a3750000-0000-4000-8000-000000000001';
insert into public.activity_sessions (user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s)
values (:'ana', 'apple_health', 'hk-run', current_date, 'running', now() - interval '40 minutes', now() - interval '8 minutes', 1920)
on conflict (user_id, provider, external_id) do update set duration_s = excluded.duration_s;
select is((select count(*)::int from public.group_messages where activity_id = 'a3750000-0000-4000-8000-000000000001'), 2,
  'a sync that finds the run already there shares it no second time');
-- A watch's Health copy that syncs before the logger kept its id is matched by time.
insert into public.activity_sessions (id, user_id, provider, external_id, log_date, kind,
  started_at, ended_at, duration_s) values
  ('a3750000-0000-4000-8000-000000000006', :'ana', 'apple_health', 'hk-watch-copy', current_date, 'strength',
   now() - interval '69 minutes', now() - interval '26 minutes', 2580);
select is((select count(*)::int from public.group_messages where activity_id = 'a3750000-0000-4000-8000-000000000006'), 0,
  'a Health copy that overlaps a logger workout is not shared again');
update public.profiles set auto_post_workouts = false where id = :'ana';
insert into public.activity_sessions (id, user_id, provider, external_id, log_date, kind, started_at, ended_at, duration_s)
values ('a3750000-0000-4000-8000-000000000005', :'ana', 'apple_health', 'hk-ride', current_date, 'cycling',
  now() - interval '20 minutes', now() - interval '2 minutes', 1080);
select is((select count(*)::int from public.group_messages where activity_id = 'a3750000-0000-4000-8000-000000000005'), 0,
  'nothing is shared with Auto post workouts off');
update public.profiles set auto_post_workouts = true where id = :'ana';

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table run_card as
  select e from jsonb_array_elements(public.group_messages((select id from g))) e
  where e->'workout'->>'id' = 'a3750000-0000-4000-8000-000000000001';
select is((select e->'workout'->>'source' from run_card), 'activity', 'the run draws as a workout card');
select is((select (e->'workout'->>'distance_m')::int from run_card), 5200, 'with its distance');
select is((select (e->'workout'->>'kcal')::int from run_card), 320, 'and what it burned, read live');
select throws_ok(format('select public.send_group_message(%L, null, %L, null, null, %L)', (select id from g),
  'a3730000-0000-4000-8000-000000000007', 'a3740000-0000-4000-8000-000000000002'), '42501', null,
  'nobody can share someone else''s workout');
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select lives_ok(format('select public.send_group_message(%L, null, %L, null, null, %L)', (select id from g),
  'a3730000-0000-4000-8000-000000000008', 'a3740000-0000-4000-8000-000000000002'), 'Ana shares an older workout by hand');
select throws_ok(format('select public.send_group_message(%L, null, %L, null, null, %L, %L)', (select id from g),
  'a3730000-0000-4000-8000-000000000009', 'a3740000-0000-4000-8000-000000000002',
  'a3750000-0000-4000-8000-000000000001'), '22023', null, 'a message shares one thing at most');
reset role;
update public.workouts set notes = 'Felt awful, skipped the warm-up'
where id = 'a3740000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
-- A fellow member's workout opens like its own page, from the board or the chat.
select is(public.group_workout_detail((select id from g), 'workout', 'a3740000-0000-4000-8000-000000000001')
  ->'summary'->>'name', 'Push day', 'a member reads a fellow member''s workout');
select is(public.group_workout_detail((select id from g), 'workout', 'a3740000-0000-4000-8000-000000000001')
  ->'summary'->'notes', 'null'::jsonb, 'but never its notes');
select is(public.group_workout_detail((select id from g), 'activity', 'a3750000-0000-4000-8000-000000000001')
  ->'session'->>'kind', 'running', 'and a run a health store recorded');
select is(public.group_workout_detail((select id from g), 'activity', 'a3750000-0000-4000-8000-000000000001')
  ->'session'->>'external_id', '', 'without the health store''s own id for it');
select ok((select (e->'workout'->>'count')::int = jsonb_array_length(e->'workout'->'all')
    and e->'workout'->>'id' = e->'workout'->'all'->0->>'id'
    and not (e->'workout' ? 'started_at')
  from jsonb_array_elements(public.group_board((select id from g), public.local_today(:'ben'))->'members') e
  where e->'person'->>'id' = :'ana'), 'the board''s tile is the first of the day''s workouts it lists');
select is(public.group_board((select id from g), public.local_today(:'ben'))->'members'
    ->(select o - 1 from jsonb_array_elements(public.group_board((select id from g), public.local_today(:'ben'))->'members')
       with ordinality x(e, o) where e->'person'->>'id' = :'ana')::int->'workout'->>'id',
  'a3740000-0000-4000-8000-000000000001', 'the board''s workout tile names the workout it opens');
reset role;
-- Older than the board reaches and never shared in this group: not readable.
update public.workouts set started_at = now() - interval '90 days', ended_at = now() - interval '90 days' + interval '40 minutes',
  log_date = (now() - interval '90 days')::date where id = 'a3740000-0000-4000-8000-000000000002';
delete from public.group_messages where workout_id = 'a3740000-0000-4000-8000-000000000002' and group_id = (select id from g);
set local role authenticated;
select throws_ok(format('select public.group_workout_detail(%L, %L, %L)', (select id from g), 'workout',
  'a3740000-0000-4000-8000-000000000002'), '42501', null,
  'a workout past the board''s sixty days and not shared there stays private');
select set_config('request.jwt.claims', json_build_object('sub', :'cai', 'role', 'authenticated')::text, true);
select throws_ok(format('select public.group_workout_detail(%L, %L, %L)', (select id from g), 'workout',
  'a3740000-0000-4000-8000-000000000001'), '42501', null, 'a non-member reads nothing');
reset role;
delete from public.workouts where id = 'a3740000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.group_messages where workout_id = 'a3740000-0000-4000-8000-000000000002'), 0,
  'deleting a workout takes its messages with it');

-- Invite suggestions: people Ana follows or who follow her, not already in.
insert into public.social_follows(follower_id, followed_id) values
  (:'ana', :'cai'), (:'cai', :'ana'), (:'dee', :'ana'), (:'ana', :'ben');
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select array_agg(e->>'handle' order by o) from jsonb_array_elements(
    public.group_invite_suggestions((select id from g))) with ordinality x(e, o)),
  array['cai.extras', 'dee.extras'], 'mutual follows first, and no member');
select is(jsonb_array_length(public.group_invite_suggestions((select id from g), 1)), 1, 'up to the limit');
select ok(public.invite_to_group((select id from g), '@cai.extras') is not null, 'Ana invites Cai');
select is((select array_agg(e->>'handle') from jsonb_array_elements(
    public.group_invite_suggestions((select id from g))) e), array['dee.extras'],
  'someone already invited is not suggested');
select set_config('request.jwt.claims', json_build_object('sub', :'cai', 'role', 'authenticated')::text, true);
select throws_ok(format('select public.group_invite_suggestions(%L)', (select id from g)), '42501', null,
  'only a member is offered suggestions');
reset role;

-- An app from before twenty-member groups takes ten as full, so the lists
-- where it offers Join report a group of ten to nineteen as nine; the true
-- size travels as member_total.
select is(private.group_size_for_join(12::smallint), 9, 'a group with room reads as nine to an older app');
select is(private.group_size_for_join(20::smallint), 20, 'a full group keeps its real count');
select is(private.group_size_for_join(4::smallint), 4, 'and a small one is unchanged');
reset role;
update public.groups set is_public = true where id = (select id from g);
update public.groups set member_count = 15 where id = (select id from g);
select set_config('request.jwt.claims', json_build_object('sub', :'dee', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select (e->>'member_count')::int || '/' || (e->>'member_total')::int
  from jsonb_array_elements(public.public_groups('Extras fixture')) e), '9/15',
  'the public list keeps an older app''s Join live and gives the true size beside it');
reset role;

-- A friend in two of the poster's groups hears a share once, not once a group,
-- through the group whose chat they read last.
insert into public.group_members(group_id, user_id) values (:'other_group', :'ben');
update public.group_members set chat_read_at = now() - interval '2 minutes' where user_id = :'ben' and group_id = (select id from g);
update public.group_members set chat_read_at = now() - interval '1 minute' where user_id = :'ben' and group_id = :'other_group';
insert into public.push_tokens(token, user_id, platform) values
  ('ExponentPushToken[extras-ben-phone]', :'ben', 'ios'),
  ('ExponentPushToken[extras-ben-pad]', :'ben', 'ios');
update public.group_messages set pushed_at = now() where author_id = :'ana' and automatic;
insert into public.workouts (id, user_id, name, started_at, ended_at, log_date) values
  ('a3740000-0000-4000-8000-000000000009', :'ana', 'Leg day', now() - interval '50 minutes',
   now() - interval '5 minutes', public.local_today(:'ana'));
select is((select count(*)::int from public.group_messages where workout_id = 'a3740000-0000-4000-8000-000000000009'), 2,
  'the workout is shared into both groups');
create temp table both_pushes as select * from public.group_update_push_targets(:'ana');
select is((select array_agg(token order by token) from both_pushes),
  array['ExponentPushToken[extras-ben-pad]', 'ExponentPushToken[extras-ben-phone]'],
  'each of the friend''s devices hears it once');
select is((select array_agg(distinct group_id) from both_pushes), array[:'other_group'::uuid],
  'through the group whose chat they read last');
-- Ben watched the next one arrive in the first group's open chat.
update public.group_messages set pushed_at = now() where author_id = :'ana' and automatic;
insert into public.workouts (id, user_id, name, started_at, ended_at, log_date) values
  ('a3740000-0000-4000-8000-00000000000a', :'ana', 'Arm day', now() - interval '40 minutes',
   now() - interval '4 minutes', public.local_today(:'ana'));
update public.group_members set chat_read_at = now() where user_id = :'ben' and group_id = (select id from g);
select is((select count(*)::int from public.group_update_push_targets(:'ana')), 0,
  'one already read in either group is not pushed through the other');
delete from public.workouts where id = 'a3740000-0000-4000-8000-00000000000a';
delete from public.push_tokens where token like 'ExponentPushToken[extras-ben-%';
delete from public.workouts where id = 'a3740000-0000-4000-8000-000000000009';
delete from public.group_members where group_id = :'other_group' and user_id = :'ben';

-- A new email account does not publish its address as its handle.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('a3700000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'nelson.gan+ricecal@extras.example.test', '{}', '{}');
select is((select display_name from public.profiles where id = 'a3700000-0000-4000-8000-000000000009'),
  'Nelson Gan', 'an email account is named from its address, without its +tag');
select matches((select handle from public.profiles where id = 'a3700000-0000-4000-8000-000000000009'),
  '^nelson\.gan\.[a-z0-9]{4}$', 'and its handle ends in four random characters');

select * from finish();
rollback;
