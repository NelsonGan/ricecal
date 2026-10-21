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
select is(public.invite_to_group((select id from g), 'nobody@example.test'), null,
  'an unknown email answers like any other, so it cannot be used to test addresses');
select throws_ok($$select public.invite_to_group((select id from g), '@nobody.here')$$,
  'P0001', 'No account found', 'an unknown handle says so, since handles are public');

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
set local role authenticated;

-- Chat: a message per day, hidden from a reporter, idempotent by request id.
select set_config('request.jwt.claims', json_build_object('sub', :'ben', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok(format('select public.send_group_message(%L, %L, %L, %L)', (select id from g),
  (select d from bday), 'eating now!!', 'a3620000-0000-4000-8000-000000000001'), 'Ben writes');
select lives_ok(format('select public.send_group_message(%L, %L, %L, %L)', (select id from g),
  (select d from bday), 'eating now!!', 'a3620000-0000-4000-8000-000000000001'), 'a retry is the same message');
reset role;
-- now() is fixed inside the test's transaction, so Ana's read mark is put
-- before the message.
update public.group_members set chat_read_at = now() - interval '1 minute' where user_id = :'ana';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'ana', 'role', 'authenticated')::text, true);
select is(jsonb_array_length(public.group_messages((select id from g), (select d from bday))), 1, 'one message');
select is((public.group_board((select id from g), (select d from bday))->'chat'->>'unread')::int, 1, 'and it is unread');
select lives_ok(format('select public.report_group_message(%L)',
  public.group_messages((select id from g), (select d from bday))->0->>'id'), 'Ana reports it');
select is(jsonb_array_length(public.group_messages((select id from g), (select d from bday))), 0,
  'a reported message disappears for the reporter');

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
