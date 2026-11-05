-- Joins and likes as quiet lines in a group's chat, foods of one's own
-- (recipes) shared into it, who reacted to a message, the per-group switch for
-- sharing one's own foods and workouts, and a photo added to a meal after it
-- was posted. Access is asserted as a client role.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ana  'a4000000-0000-4000-8000-000000000001'
\set ben  'a4000000-0000-4000-8000-000000000002'
\set cai  'a4000000-0000-4000-8000-000000000003'
\set dee  'a4000000-0000-4000-8000-000000000004'
\set meal 'a4010000-0000-4000-8000-000000000001'
\set late 'a4010000-0000-4000-8000-000000000002'
\set other_group 'a4020000-0000-4000-8000-000000000002'
\set recipe 'a4030000-0000-4000-8000-000000000001'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id::text || '@chat-events.example.test', '{}', '{"full_name": "Fixture"}'
from unnest(array[:'ana'::uuid, :'ben'::uuid, :'cai'::uuid, :'dee'::uuid]) id;
update public.profiles p set display_name = initcap(split_part(p.id::text, '-', 1)),
  handle = case p.id when :'ana' then 'ana.events' when :'ben' then 'ben.events'
    when :'cai' then 'cai.events' else 'dee.events' end
where p.id in (:'ana', :'ben', :'cai', :'dee');

-- Broadcasts are recorded rather than sent (see 36_groups).
create temp table broadcasts (topic text, event text, ids jsonb);
grant select on broadcasts to authenticated;
create or replace function private.group_chat_broadcast(p_group uuid, p_event text, p_ids jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into pg_temp.broadcasts values ('group-chat:' || p_group::text, p_event, p_ids);
$$;

select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.proname in ('group_message_reactors', 'group_recipe', 'group_recipe_label', 'group_reaction_event',
      'group_messages', 'send_group_message', 'set_group_preferences')
    and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
), 'none of the new or replaced functions is executable by PUBLIC');
select ok(not has_function_privilege('anon', 'public.group_message_reactors(uuid)', 'EXECUTE'),
  'anon cannot list who reacted');
select ok(not has_function_privilege('authenticated', 'private.group_recipe(uuid)', 'EXECUTE'),
  'clients cannot read a recipe around its checks');

-- Ana makes a group: no line for the one who made it.
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table g as select public.create_group('Events fixture', 'rice-bowl', false) as id;
reset role;
grant select on g to authenticated;
select is((select count(*)::int from public.group_messages where group_id = (select id from g)), 0,
  'making a group writes no join line');

-- Ben joins (by invite), and so does Dee into a second group with Ana only.
insert into public.group_members(group_id, user_id) values ((select id from g), :'ben');
insert into public.groups(id, name, leader_id) values (:'other_group', 'Events other', :'ana');
insert into public.group_members(group_id, user_id) values (:'other_group', :'ana'), (:'other_group', :'dee');
select is((select event from public.group_messages where group_id = (select id from g) and author_id = :'ben'),
  'joined', 'a member joining writes a join line, by them');
select ok(exists (select 1 from broadcasts where event = 'event'
    and ids ? (select id::text from public.group_messages where group_id = (select id from g) and author_id = :'ben')),
  'announced under its own event, which an app from before events does not hear');
select is((select count(*)::int from public.group_messages where group_id = :'other_group'), 1,
  'the second group''s first member writes nothing, the second a join line');

-- Leaving and joining again does not add another line.
delete from public.group_members where group_id = (select id from g) and user_id = :'ben';
insert into public.group_members(group_id, user_id) values ((select id from g), :'ben');
select is((select count(*)::int from public.group_messages where group_id = (select id from g) and event = 'joined'), 1,
  'joining again within a day writes no second join line');

set local role authenticated;
select is(jsonb_array_length(public.group_messages((select id from g))), 0,
  'an app that does not ask for events is never shown one');
select is(public.group_messages((select id from g), p_events => true)->0->'event'->>'kind', 'joined',
  'an app that asks gets the join line');
select is(public.group_messages((select id from g), p_events => true)->0->'author'->>'id', :'ben',
  'naming who joined');
select is((public.group_chat_summary((select id from g))->>'unread')::int, 0,
  'a join line is never unread');
select is(public.group_chat_summary((select id from g))->'last', 'null'::jsonb,
  'nor the chat bar''s latest message');

-- Nothing can be done to an event: it is the server's, not a message.
reset role;
create temp table joined as
  select id from public.group_messages where group_id = (select id from g) and author_id = :'ben';
grant select on joined to authenticated;
set local role authenticated;
select throws_ok(format('select public.set_group_message_reaction(%L, %L)', (select id from joined), '❤️'),
  '42501', null, 'a join line takes no reaction');
select throws_ok(format('select public.report_group_message(%L)', (select id from joined)),
  '42501', null, 'nor a report');
select lives_ok(format('select public.send_group_message(%L, %L, %L, %L)', (select id from g),
  'welcome', 'a4040000-0000-4000-8000-000000000001', (select id from joined)), 'answering one sends on its own');
reset role;
select is((select reply_to_id from public.group_messages where request_id = 'a4040000-0000-4000-8000-000000000001'),
  null, 'without quoting it');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
select public.delete_group_message((select id from joined));
reset role;
select ok(exists (select 1 from public.group_messages where id = (select id from joined)),
  'its author cannot delete it either');

-- Likes. Ana logs a meal; Ben likes it.
reset role;
insert into public.food_logs (id, user_id, log_date, logged_at, item_name, item_icon_set, item_icon_name,
  base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values (:'meal', :'ana', public.local_today(:'ana'), now(), 'Nasi lemak', 'dishes', 'nasi-lemak',
  640, 70, 20, 30, '1 plate', 1);
set local role authenticated;
select lives_ok(format('select public.set_group_reaction(%L, 1::smallint)', :'meal'), 'Ben likes Ana''s meal');
create temp table liked as
  select e from jsonb_array_elements(public.group_messages((select id from g), p_events => true)) e
  where e->'event'->>'kind' = 'liked';
select is((select count(*)::int from liked), 1, 'a like is a line in the chat');
select is((select e->'author'->>'id' from liked), :'ben', 'by whoever liked it');
select is((select e->'event'->'food'->>'name' from liked), 'Nasi lemak', 'naming the food');
select is((select e->'event'->'food'->'owner'->>'id' from liked), :'ana', 'and whose it is');
reset role;
select is((select count(*)::int from public.group_messages where event = 'liked' and group_id = :'other_group'), 0,
  'only in a group the two share');
set local role authenticated;
select public.set_group_reaction(:'meal', -1::smallint);
reset role;
select is((select count(*)::int from public.group_messages where event = 'liked' and entry_id = :'meal'), 0,
  'turning it into a dislike takes the line away, and a dislike is never told');
set local role authenticated;
select public.set_group_reaction(:'meal', 1::smallint);
reset role;
select is((select count(*)::int from public.group_messages where event = 'liked' and entry_id = :'meal'), 1, 'liking again tells again');
set local role authenticated;
select public.set_group_reaction(:'meal', 0::smallint);
reset role;
select is((select count(*)::int from public.group_messages where event = 'liked' and entry_id = :'meal'), 0,
  'and taking the like back takes it away');

-- Who reacted to a message.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
create temp table said as select public.send_group_message((select id from g), 'makan?',
  'a4040000-0000-4000-8000-000000000002') as id;
grant select on said to authenticated;
select public.set_group_message_reaction((select id from said), '🔥');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
select public.set_group_message_reaction((select id from said), '❤️');
select is(jsonb_array_length(public.group_message_reactors((select id from said))), 2, 'both reactions are listed');
select is(public.group_message_reactors((select id from said))->0->'person'->>'id', :'ben', 'the viewer''s first');
select is((public.group_message_reactors((select id from said))->0->>'mine')::boolean, true, 'marked as theirs');
select is(public.group_message_reactors((select id from said))->1->>'emoji', '🔥', 'with each person''s emoji');
select set_config('request.jwt.claims', json_build_object('sub', :'dee', 'role', 'authenticated')::text, true);
select throws_ok(format('select public.group_message_reactors(%L)', (select id from said)),
  '42501', null, 'a non-member cannot see who reacted');

-- Sharing one's own foods and workouts, per group. An older app's call leaves the switch alone.
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select lives_ok(format('select public.set_group_preferences(%L, null, true, true, false)', (select id from g)),
  'Ana stops sharing her own into the first group');
select is((public.group_details((select id from g))->>'share_updates')::boolean, false, 'settings show it');
select lives_ok(format('select public.set_group_preferences(%L, null, true, true)', (select id from g)),
  'an app from before the switch sends its four arguments');
select is((public.group_details((select id from g))->>'share_updates')::boolean, false, 'which leave it alone');
create temp table post as select public.create_social_post(:'meal', '', 'followers') as id;
reset role;
select is((select array_agg(group_id::text) from public.group_messages where post_id = (select id from post)),
  array[:'other_group'::text], 'a posted food then goes only to the group still sharing');
update public.group_members set share_updates = true where group_id = (select id from g) and user_id = :'ana';

-- A meal logged and posted without a photo, which gets one later.
insert into public.food_logs (id, user_id, log_date, logged_at, item_name, item_icon_set, item_icon_name,
  base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values (:'late', :'ana', public.local_today(:'ana'), now(), 'Roti canai', 'dishes', 'roti-canai',
  300, 40, 6, 12, '1 piece', 1);
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table late_post as select public.create_social_post(:'late', '', 'followers') as id;
reset role;
update public.food_logs set icon_set = null, icon_name = null, item_icon_set = null, item_icon_name = null,
  photo_path = 'meals/' || :'ana' || '/later.jpg' where id = :'late';
select is((select photo_path from public.social_posts where id = (select id from late_post)), null,
  'the feed post keeps only the photo it was published with');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select e->'food'->>'photo_path'
  from jsonb_array_elements(public.group_messages((select id from g))) e
  where e->'food'->>'post_id' = (select id::text from late_post)),
  'meals/' || :'ana' || '/later.jpg', 'the chat card shows the photo added after posting, as the board does');
reset role;
update public.food_logs set log_date = public.local_today(:'ana') - 90 where id = :'late';
set local role authenticated;
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'ana' || '/later.jpg'])), 1,
  'and may sign it past the board''s sixty days, as a shared photo can be');
select set_config('request.jwt.claims', json_build_object('sub', :'cai', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'ana' || '/later.jpg'])), 0,
  'which nobody outside the group may');

-- A food of Ana's own (a recipe) shared into the chat.
reset role;
-- The slug is the trigger's own, made when the row is written.
insert into public.recipes (id, owner_id, name, servings, share_slug)
values (:'recipe', :'ana', 'Ayam masak merah', 4, '');
create temp table slug as select share_slug as s from public.recipes where id = :'recipe';
grant select on slug to authenticated;
insert into public.recipe_ingredients (recipe_id, name, amount, unit, kcal_per_unit, protein_g_per_unit, position)
values (:'recipe', 'Chicken', 1000, 'g', 2, 0.25, 0);
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format('select public.send_group_message(%L, null, %L, null, null, null, null, %L)', (select id from g),
  'a4040000-0000-4000-8000-000000000003', :'recipe'), '42501', null, 'nobody can share someone else''s food');
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select lives_ok(format('select public.send_group_message(%L, null, %L, null, null, null, null, %L)', (select id from g),
  'a4040000-0000-4000-8000-000000000004', :'recipe'), 'Ana shares her own');
reset role;
select is((select body from public.group_messages where request_id = 'a4040000-0000-4000-8000-000000000004'),
  'Ayam masak merah (500 kcal)', 'its body is the name and a serving''s calories, for a push and an older app');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table card as
  select e->'recipe' as r from jsonb_array_elements(public.group_messages((select id from g))) e
  where e->'recipe' <> 'null';
select is((select r->>'name' from card), 'Ayam masak merah', 'a member sees the card');
select is((select (r->>'kcal')::int from card), 500, 'with a serving''s calories');
select is((select r->>'share_slug' from card), (select s from slug),
  'and the link that opens it and keeps a copy');
select ok(exists (select 1 from public.get_shared_recipe((select s from slug))),
  'which reads the private recipe through the link path');
reset role;
insert into public.recipe_reports(recipe_id, reporter_id, reason) values (:'recipe', :'ben', 'spam');
set local role authenticated;
select is((select count(*)::int from jsonb_array_elements(public.group_messages((select id from g))) e
  where e->'recipe' <> 'null'), 0, 'a food the viewer reported is not drawn as a card');
reset role;
delete from public.recipes where id = :'recipe';
select is((select count(*)::int from public.group_messages where request_id = 'a4040000-0000-4000-8000-000000000004'), 0,
  'deleting the food takes its message with it');

select * from finish();
rollback;
