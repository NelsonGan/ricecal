-- Groups read members' diaries live and keep their own rules for who is in,
-- who leads, who may nudge and who may see a photo. Every assertion about
-- access runs as a client role.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ana   'a3600000-0000-4000-8000-000000000001'
\set ben   'a3600000-0000-4000-8000-000000000002'
\set cai   'a3600000-0000-4000-8000-000000000003'
\set dee   'a3600000-0000-4000-8000-000000000004'
\set breakfast_entry 'a3610000-0000-4000-8000-000000000001'
\set moved_entry     'a3610000-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id::text || '@groups.example.test', '{}', '{}'
from unnest(array[:'ana'::uuid, :'ben'::uuid, :'cai'::uuid, :'dee'::uuid]) id;

-- A timezone where it is late morning now, so lunch (09:00 here) is over and
-- the test does not depend on when it runs.
create temp table fixture as
  select name as tz from pg_timezone_names
  where extract(hour from now() at time zone name) between 10 and 12
  order by name limit 1;
grant select on fixture to authenticated;

update public.profiles p set timezone = (select tz from fixture),
  display_name = initcap(split_part(p.id::text, '-', 1)),
  handle = case p.id when :'ana' then 'ana.groups' when :'ben' then 'ben.groups'
    when :'cai' then 'cai.groups' else 'dee.groups' end
where p.id in (:'ana', :'ben', :'cai', :'dee');
update public.meal_times set at = case meal when 'breakfast' then time '06:00'
  when 'lunch' then time '09:00' when 'dinner' then time '23:00' else at end
where user_id in (:'ana', :'ben', :'cai', :'dee');

-- Ben's calendar day, read once here: under a client role his profile, and so
-- his timezone, is hidden, and local_today would fall back to the default zone.
create temp table bday as select public.local_today(:'ben') as d;
grant select on bday to authenticated;

-- Ben ate breakfast at 06:30 and a second plate at 06:45 that he will move.
insert into public.food_logs
  (id, user_id, log_date, logged_at, item_name, item_icon_set, item_icon_name,
   base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor, note, photo_path)
select v.id, :'ben', (select d from bday),
  ((select d from bday) + v.at) at time zone (select tz from fixture),
  v.name, 'dishes', 'nasi-lemak', 600, 60, 25, 28, '1 plate', 1, 'Private note', v.photo
from (values
  (:'breakfast_entry'::uuid, time '06:30', 'Roti canai', 'meals/' || :'ben' || '/groups-fixture.jpg'),
  (:'moved_entry'::uuid, time '06:45', 'Teh tarik', null)
) v(id, at, name, photo);

select ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (c.relname like 'group%' or c.relname = 'push_tokens') and not c.relrowsecurity
), 'every group table has RLS');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and (p.proname like '%group%' or p.proname like '%push_token%')
    and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))
), 'no group function is executable by PUBLIC');

-- Ana makes a private group.
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select count(*) from public.groups$$, '42501', null, 'group tables are closed to clients');
select lives_ok($$select public.create_group('Groups fixture table', 'rice-bowl', false)$$, 'a group can be made');
reset role;
create temp table g as select id from public.groups where name = 'Groups fixture table';
grant select on g to authenticated;
select is((select leader_id from public.groups where id = (select id from g)), :'ana'::uuid,
  'the maker leads');

-- Cai cannot join a private group uninvited, or read it.
select set_config('request.jwt.claims', json_build_object('sub', :'cai', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select public.join_group((select id from g))$$, '42501', null,
  'a private group cannot be joined without an invite');
select throws_ok($$select public.group_board((select id from g), current_date)$$, '42501', null,
  'a non-member cannot read the board');

-- Ana invites Ben by handle and Cai by email; an unknown address finds nobody.
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select ok(public.invite_to_group((select id from g), '@ben.groups') is not null, 'invite by handle');
select ok(public.invite_to_group((select id from g), :'cai' || '@GROUPS.example.test') is not null,
  'invite by email, ignoring case');
select ok(public.invite_to_group((select id from g), 'nobody@example.test') is not null,
  'an unknown email answers like any other, so it cannot be used to test addresses');
-- Asking twice must not tell them apart either: a repeat for a real account
-- once returned the same invite id, while an unknown address got a new one.
select isnt(public.invite_to_group((select id from g), :'cai' || '@groups.example.test'),
  public.invite_to_group((select id from g), :'cai' || '@groups.example.test'),
  'a repeated email invite to an account answers with a new id each time');
select isnt(public.invite_to_group((select id from g), 'nobody@example.test'),
  public.invite_to_group((select id from g), 'nobody@example.test'),
  'a repeated email invite to nobody answers with a new id each time');
-- An hour later the invite is renewed and pushed again, under a new id.
reset role;
create temp table cai_invite as
  select i.id from public.group_invites i where i.invitee_id = :'cai';
grant select on cai_invite to authenticated;
update public.group_invites set created_at = now() - interval '2 hours' where invitee_id = :'cai';
set local role authenticated;
select isnt(public.invite_to_group((select id from g), :'cai' || '@groups.example.test'),
  (select id from cai_invite), 'a renewed invite does not answer with its old id');
select is(jsonb_array_length(public.group_details((select id from g))->'invites'), 1,
  'settings lists the handle invite and not who an address found');
select throws_ok($$select public.invite_to_group((select id from g), '@nobody.here')$$,
  'P0001', 'No account found', 'an unknown handle says so, since handles are public');
-- An address then a handle for the same person must look exactly like the
-- handle alone. Otherwise the pair says whose address it was: the handle once
-- answered with the id the address had, and stayed off the sender's list.
reset role;
create temp table dee_by_email as
  select public.invite_to_group((select id from g), :'dee' || '@groups.example.test') as id;
create temp table dee_by_handle as
  select public.invite_to_group((select id from g), '@dee.groups') as id;
grant select on dee_by_email, dee_by_handle to authenticated;
set local role authenticated;
select isnt((select id from dee_by_handle), (select id from dee_by_email),
  'a handle invite after an address invite answers with its own id');
select is(jsonb_array_length(public.group_details((select id from g))->'invites'), 2,
  'a handle invite after an address invite is listed like any handle invite');
reset role;
select is((select by_email from public.group_invites where invitee_id = :'dee'), false,
  'the invite now counts as sent by handle');
delete from public.group_invites where invitee_id = :'dee';
set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
select is(public.group_invite_count(), 1, 'the invitee sees one invite');
select is(public.respond_to_group_invite((select id from g), true), 'joined', 'Ben accepts');
select is(public.group_invite_count(), 0, 'accepting clears the invite');
select set_config('request.jwt.claims', json_build_object('sub', :'cai', 'role', 'authenticated')::text, true);
select is(public.respond_to_group_invite((select id from g), true), 'joined', 'Cai accepts');
reset role;
select is((select member_count::int from public.groups where id = (select id from g)), 3,
  'the member count follows joins');
set local role authenticated;
select throws_ok(format('select public.group_board(%L, %L)', (select id from g), public.local_today(:'cai') - 61),
  '22023', null, 'the board does not reach past sixty days');

-- The board puts Ben's entries in breakfast by his own meal times, and shows
-- the viewer first.
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select is(public.group_board((select id from g), (select d from bday))->'members'->0->'person'->>'id',
  :'ana', 'the viewer is the first row');
select is((
  select count(*)::int from jsonb_array_elements(public.group_board((select id from g), (select d from bday))->'members') m,
    jsonb_array_elements(m->'entries') e
  where m->'person'->>'id' = :'ben' and e->>'meal' = 'breakfast'), 2,
  'both of Ben''s morning plates are breakfast');
select ok(not (public.group_board((select id from g), (select d from bday))::text like '%Private note%'),
  'the board never carries a diary note');

-- Moving an entry is Ben's alone, and moves it everywhere.
select throws_ok(format('select public.set_entry_board_meal(%L, %L)', :'moved_entry', 'lunch'), '42501', null,
  'nobody else can move an entry');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
select lives_ok(format('select public.set_entry_board_meal(%L, %L)', :'moved_entry', 'lunch'), 'the owner moves it');
select is((
  select e->>'meal' from jsonb_array_elements(public.group_board((select id from g), (select d from bday))->'members') m,
    jsonb_array_elements(m->'entries') e where e->>'id' = :'moved_entry'), 'lunch', 'the board follows the move');

-- Reactions: never your own, counted on the board, cleared by 0.
select throws_ok(format('select public.set_group_reaction(%L, 1::smallint)', :'breakfast_entry'), '42501', null,
  'nobody reacts to their own food');
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select lives_ok(format('select public.set_group_reaction(%L, 1::smallint)', :'breakfast_entry'), 'Ana likes it');
select set_config('request.jwt.claims', json_build_object('sub', :'cai', 'role', 'authenticated')::text, true);
select lives_ok(format('select public.set_group_reaction(%L, -1::smallint)', :'breakfast_entry'), 'Cai dislikes it');
select is((
  select (e->>'likes') || '/' || (e->>'dislikes') || '/' || (e->>'mine')
  from jsonb_array_elements(public.group_board((select id from g), (select d from bday))->'members') m,
    jsonb_array_elements(m->'entries') e where e->>'id' = :'breakfast_entry'), '1/1/-1',
  'counts and the viewer''s own reaction');

-- Dee shares no group with Ben, so cannot react or see the photo.
select set_config('request.jwt.claims', json_build_object('sub', :'dee', 'role', 'authenticated')::text, true);
select throws_ok(format('select public.set_group_reaction(%L, 1::smallint)', :'breakfast_entry'), '42501', null,
  'a stranger cannot react');
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'ben' || '/groups-fixture.jpg'])), 0,
  'a stranger cannot claim a member''s photo');
select set_config('request.jwt.claims', json_build_object('sub', :'cai', 'role', 'authenticated')::text, true);
select is((select owner_id from public.social_photo_claims(array['meals/' || :'ben' || '/groups-fixture.jpg'])), :'ben'::uuid,
  'a fellow member can claim the photo');

-- Nudges: lunch is open for Ben, breakfast is logged, and the first nudge
-- closes it for everyone for an hour.
select is((
  select m->'nudgeable' from jsonb_array_elements(public.group_board((select id from g), (select d from bday))->'members') m
  where m->'person'->>'id' = :'ana'), '["breakfast", "lunch"]'::jsonb,
  'an empty meal past its time can be nudged; a future one cannot');
select is((
  select m->'nudgeable' from jsonb_array_elements(public.group_board((select id from g), (select d from bday))->'members') m
  where m->'person'->>'id' = :'ben'), '[]'::jsonb, 'Ben''s breakfast is logged, and the moved plate fills his lunch');
reset role;
delete from public.food_logs where id = :'moved_entry';
select set_config('request.jwt.claims', json_build_object('sub', :'cai', 'role', 'authenticated')::text, true);
set local role authenticated;
select ok(public.nudge_group_member((select id from g), :'ben', (select d from bday), 'lunch') is not null,
  'Cai nudges Ben for lunch');
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select throws_ok(format('select public.nudge_group_member(%L, %L, %L, %L)',
  (select id from g), :'ben', (select d from bday), 'lunch'), 'P0001', 'Nudged recently',
  'a second member cannot nudge within the hour');
select is((
  select m->'nudges'->'lunch'->'by'->>'id' from jsonb_array_elements(public.group_board((select id from g), (select d from bday))->'members') m
  where m->'person'->>'id' = :'ben'), :'cai', 'the board says who nudged');
select throws_ok(format('select public.nudge_group_member(%L, %L, %L, %L)',
  (select id from g), :'ben', (select d from bday) - 1, 'dinner'), 'P0001', null,
  'a past day cannot be nudged');
reset role;
select is((select count(*)::int from public.group_push_targets(:'cai', 'nudge',
  (select id from public.group_nudges where nudger_id = :'cai'))), 0,
  'a nudge to someone with no device sends nothing');

-- A block holds inside the group: Ben blocks Cai, and Cai loses Ben's food,
-- his photo and the ability to react to or nudge him.
reset role;
insert into public.blocked_authors(user_id, author_id) values (:'ben', :'cai');
select set_config('request.jwt.claims', json_build_object('sub', :'cai', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((
  select count(*)::int from jsonb_array_elements(public.group_board((select id from g), (select d from bday))->'members') m
  where m->'person'->>'id' = :'ben'), 0, 'a blocked member is left off the board');
select throws_ok(format('select public.set_group_reaction(%L, 1::smallint)', :'breakfast_entry'), '42501', null,
  'a blocked member cannot react');
select throws_ok(format('select public.nudge_group_member(%L, %L, %L, %L)',
  (select id from g), :'ben', (select d from bday), 'dinner'), '42501', null, 'a blocked member cannot nudge');
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'ben' || '/groups-fixture.jpg'])), 0,
  'a blocked member cannot claim the photo');
reset role;
delete from public.blocked_authors where user_id = :'ben' and author_id = :'cai';
-- realtime.messages is partitioned by day and the Realtime server makes the
-- partitions; CI runs Postgres alone, where there are none and realtime.send
-- would swallow the failure. So the broadcasts are caught one step earlier.
create temp table broadcasts (topic text, event text, ids jsonb);
grant select on broadcasts to authenticated;
create or replace function private.group_chat_broadcast(p_group uuid, p_event text, p_ids jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into pg_temp.broadcasts values ('group-chat:' || p_group::text, p_event, p_ids);
$$;
set local role authenticated;

-- Chat: one thread for the group, hidden from a reporter, idempotent by request id.
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok(format('select public.send_group_message(%L, %L, %L)', (select id from g),
  'eating now!!', 'a3620000-0000-4000-8000-000000000001'), 'Ben writes');
select lives_ok(format('select public.send_group_message(%L, %L, %L)', (select id from g),
  'eating now!!', 'a3620000-0000-4000-8000-000000000001'), 'a retry is the same message');
reset role;
-- now() is fixed inside the test's transaction, so Ana's read mark is put
-- before the message.
update public.group_members set chat_read_at = now() - interval '1 minute' where user_id = :'ana';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select is(jsonb_array_length(public.group_messages((select id from g))), 1, 'one message');
select is(public.group_chat_summary((select id from g)),
  jsonb_build_object('unread', 1, 'last', jsonb_build_object(
    'author', public.group_messages((select id from g))->0->'author', 'body', 'eating now!!')),
  'and the chat bar counts it unread and shows it');
select ok(not public.group_board((select id from g), (select d from bday)) ? 'chat',
  'the board itself carries no chat');
select lives_ok(format('select public.report_group_message(%L)',
  public.group_messages((select id from g))->0->>'id'), 'Ana reports it');
select is(jsonb_array_length(public.group_messages((select id from g))), 0,
  'a reported message disappears for the reporter');
select is(public.group_chat_summary((select id from g)), '{"unread": 0, "last": null}'::jsonb,
  'and from the chat bar');
reset role;

-- The thread is read a page at a time from the newest back.
insert into public.group_messages(id, group_id, author_id, body, request_id, created_at)
select ('a3620000-0000-4000-8000-1000000000' || lpad(n::text, 2, '0'))::uuid, (select id from g), :'ben',
  'page ' || n, ('a3620000-0000-4000-8000-2000000000' || lpad(n::text, 2, '0'))::uuid,
  now() - interval '1 hour' + n * interval '1 minute'
from generate_series(1, 5) n;
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
create temp table page1 as select public.group_messages((select id from g), null, null, 3) as p;
select is((select array_agg(e->>'body' order by o) from page1, jsonb_array_elements(p) with ordinality x(e, o)),
  array['page 3', 'page 4', 'page 5'], 'the newest page, oldest first, without what Ana reported');
select is((select array_agg(e->>'body' order by o) from page1,
    jsonb_array_elements(public.group_messages((select id from g), (p->0->>'created_at')::timestamptz,
      (p->0->>'id')::uuid, 3)) with ordinality x(e, o)),
  array['page 1', 'page 2'], 'and the page before it from the cursor');
select is(jsonb_array_length(public.group_messages((select id from g), now() - interval '2 hours', null, 3)), 0,
  'nothing before the first message');
reset role;
delete from public.group_messages where body like 'page %';
delete from broadcasts where ids::text like '%a3620000-0000-4000-8000-1000000000%';

-- Chat push: every other member with the group's notifications on hears the
-- message once, and a block either way keeps it from them.
insert into public.push_tokens(token, user_id, platform) values
  ('ExponentPushToken[groups-ana]', :'ana', 'ios'),
  ('ExponentPushToken[groups-ben]', :'ben', 'ios'),
  ('ExponentPushToken[groups-cai]', :'cai', 'ios');
update public.group_members set notify = true where group_id = (select id from g);
update public.group_members set notify = false where group_id = (select id from g) and user_id = :'cai';
create temp table sent as
  select id from public.group_messages where author_id = :'ben' and request_id = 'a3620000-0000-4000-8000-000000000001';
select is((select array_agg(t.token order by t.token) from public.group_message_push_targets(:'ben', (select id from sent)) t),
  array['ExponentPushToken[groups-ana]'], 'a message rings the members with notifications on, not its author');
select is((select count(*)::int from public.group_message_push_targets(:'ben', (select id from sent))), 0,
  'and only once');
select is((select count(*)::int from public.group_message_push_targets(:'ana', (select id from sent))), 0,
  'nobody can push someone else''s message');
insert into public.group_messages(id, group_id, author_id, body, request_id)
values ('a3620000-0000-4000-8000-0000000000aa', (select id from g), :'ben', 'blocked?',
  'a3620000-0000-4000-8000-000000000002');
insert into public.blocked_authors(user_id, author_id) values (:'ana', :'ben');
select is((select count(*)::int from public.group_message_push_targets(:'ben', 'a3620000-0000-4000-8000-0000000000aa')), 0,
  'a member who blocked the author is not pushed');
delete from public.blocked_authors where user_id = :'ana' and author_id = :'ben';
delete from public.group_messages where id = 'a3620000-0000-4000-8000-0000000000aa';
-- Someone looking at the open thread marks it read as the message arrives,
-- before the groups function asks, and is not pushed what they just saw.
-- now() is the message's time inside this transaction.
insert into public.group_messages(id, group_id, author_id, body, request_id)
values ('a3620000-0000-4000-8000-0000000000ab', (select id from g), :'ben', 'seen?',
  'a3620000-0000-4000-8000-000000000003');
update public.group_members set chat_read_at = now() where user_id = :'ana';
select is((select count(*)::int from public.group_message_push_targets(:'ben', 'a3620000-0000-4000-8000-0000000000ab')), 0,
  'a member who read the chat since the message is not pushed');
update public.group_messages set pushed_at = null where id = 'a3620000-0000-4000-8000-0000000000ab';
update public.group_members set chat_read_at = now() - interval '1 second' where user_id = :'ana';
select is((select array_agg(t.token) from public.group_message_push_targets(:'ben', 'a3620000-0000-4000-8000-0000000000ab') t),
  array['ExponentPushToken[groups-ana]'], 'one who last read it before the message is');
delete from public.group_messages where id = 'a3620000-0000-4000-8000-0000000000ab';
delete from public.push_tokens where token like 'ExponentPushToken[groups-%';
-- Their own broadcasts are not what the live chat checks below count.
delete from broadcasts where ids @> '["a3620000-0000-4000-8000-0000000000aa"]'
  or ids @> '["a3620000-0000-4000-8000-0000000000ab"]';

-- Live chat: each write is announced on the group's private topic by id alone,
-- and only a member may listen there.
create temp table topic as select 'group-chat:' || (select id from g)::text as t;
grant select on topic to authenticated;
select is((select array_agg(b.event) from broadcasts b where b.topic = (select t from topic)),
  array['message'], 'a sent message is broadcast on the group''s topic');
select is((select b.ids from broadcasts b where b.event = 'message'),
  jsonb_build_array((select id from public.group_messages where group_id = (select id from g))),
  'the broadcast carries the id and nothing else');
select policies_are('realtime', 'messages', array['Group members hear their chat'],
  'the only way onto realtime.messages here is listening');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select ok(private.group_chat_listener((select t from topic)), 'a member may listen on the chat topic');
select ok(not private.group_chat_listener((select t from topic) || ':2026-01-01'), 'but on nothing longer');
select set_config('request.jwt.claims', json_build_object('sub', :'dee', 'role', 'authenticated')::text, true);
select ok(not private.group_chat_listener((select t from topic)), 'someone outside the group cannot');
select ok(not private.group_chat_listener('group-chat:not-a-uuid'),
  'a malformed topic is refused, not cast');
select ok(not private.group_chat_listener(replace((select t from topic), 'group-chat:', 'group-board:')),
  'and so is another kind of topic on the same group');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
select lives_ok(format('select public.delete_group_message(%L)',
  (select b.ids->>0 from broadcasts b where b.event = 'message')), 'Ben deletes his message');
reset role;
select is((select b.ids from broadcasts b where b.event = 'removed'),
  (select b.ids from broadcasts b where b.event = 'message'), 'a deleted message is broadcast as removed');
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;

-- Leaving: the leader must hand over; the last one out deletes the group.
select throws_ok($$select public.leave_group((select id from g))$$, 'P0001', 'Choose a new leader',
  'a leader with members names a successor');
select lives_ok(format('select public.leave_group(%L, %L)', (select id from g), :'cai'), 'Ana hands over to Cai');
reset role;
select is((select leader_id from public.groups where id = (select id from g)), :'cai'::uuid, 'Cai leads');
delete from auth.users where id = :'cai';
select is((select leader_id from public.groups where id = (select id from g)), :'ben'::uuid,
  'a deleted leader hands the group to the next member');
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$select public.leave_group((select id from g))$$, 'the last member leaves');
reset role;
select is((select count(*)::int from public.groups where id = (select id from g)), 0, 'and the group is gone');

-- A public group's name can be reported; it leaves the reporter's list.
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.create_group('Hawker fixture', null, true);
select set_config('request.jwt.claims', json_build_object('sub', :'dee', 'role', 'authenticated')::text, true);
select ok(public.public_groups('Hawker fixture', 5)::text like '%Hawker fixture%', 'a public group is listed');
reset role;
create temp table hawker as select id from public.groups where name = 'Hawker fixture';
grant select on hawker to authenticated;
set local role authenticated;
select lives_ok($$select public.report_group((select id from hawker))$$, 'a stranger reports its name');
select ok(not (public.public_groups('Hawker fixture', 5)::text like '%Hawker fixture%'),
  'a reported group leaves the reporter''s list');
reset role;

-- Ten is the cap.
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.create_group('Groups fixture big', null, true);
reset role;
create temp table big as select id from public.groups where name = 'Groups fixture big';
grant select on big to authenticated;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select ('a3630000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'filler' || n || '@groups.example.test', '{}', '{}'
from generate_series(1, 9) n;
insert into public.group_members(group_id, user_id)
select (select id from big), ('a3630000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid
from generate_series(1, 9) n;
select set_config('request.jwt.claims', json_build_object('sub', :'dee', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format('select public.join_group(%L)', (select id from big)),
  'P0001', 'This group is full', 'the eleventh person cannot join');
reset role;

select * from finish();
rollback;
