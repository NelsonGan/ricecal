-- The jobs Worker's food and workout update pushes: who hears a share, once,
-- through which group, how often, and when not at all.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ana 'a3900000-0000-4000-8000-000000000001'
\set ben 'a3900000-0000-4000-8000-000000000002'
\set cai 'a3900000-0000-4000-8000-000000000003'
\set dee 'a3900000-0000-4000-8000-000000000004'
\set eve 'a3900000-0000-4000-8000-000000000005'
\set g1  'a3910000-0000-4000-8000-000000000001'
\set g2  'a3910000-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id::text || '@digests.example.test', '{}', '{"full_name": "Fixture"}'
from unnest(array[:'ana'::uuid, :'ben'::uuid, :'cai'::uuid, :'dee'::uuid, :'eve'::uuid]) id;
update public.profiles set display_name = 'Ana' where id = :'ana';
update public.profiles set display_name = 'Eve' where id = :'eve';

-- Somewhere it is midday and somewhere it is three in the morning, whatever
-- time the suite runs.
create temp table zones as select
  (select name from pg_timezone_names where name like 'Etc/GMT%'
     and extract(hour from now() at time zone name) = 12 limit 1) as day,
  (select name from pg_timezone_names where name like 'Etc/GMT%'
     and extract(hour from now() at time zone name) = 3 limit 1) as night;
update public.profiles set timezone = (select day from zones) where id in (:'ben', :'cai', :'dee');

-- Ana, Ben and Cai in one group; Ana, Ben and Eve in a second. Everyone has
-- read and been told up to two hours ago; Ben read the second group last.
-- Cai muted chat and kept updates.
insert into public.groups(id, name, leader_id) values (:'g1', 'Digest one', :'ana'), (:'g2', 'Digest two', :'ana');
insert into public.group_members(group_id, user_id, joined_at, chat_read_at, updates_told_until, notify) values
  (:'g1', :'ana', now() - interval '1 day', now() - interval '1 day', now() - interval '2 hours', true),
  (:'g1', :'ben', now() - interval '1 day', now() - interval '3 hours', now() - interval '2 hours', true),
  (:'g1', :'cai', now() - interval '1 day', now() - interval '3 hours', now() - interval '2 hours', false),
  (:'g2', :'ana', now() - interval '1 day', now() - interval '1 day', now() - interval '2 hours', true),
  (:'g2', :'ben', now() - interval '1 day', now() - interval '150 minutes', now() - interval '2 hours', true),
  (:'g2', :'eve', now() - interval '1 day', now() - interval '1 day', now() - interval '2 hours', true);
insert into public.push_tokens(token, user_id, platform) values
  ('ExponentPushToken[digest-ben-phone]', :'ben', 'ios'),
  ('ExponentPushToken[digest-ben-pad]', :'ben', 'ios'),
  ('ExponentPushToken[digest-cai]', :'cai', 'ios'),
  ('ExponentPushToken[digest-dee]', :'dee', 'ios');

-- A workout someone finished, shared into their chats `ago` back.
create function pg_temp.workout(p_user uuid, p_id uuid, p_name text, p_ago interval) returns void language sql as $$
  insert into public.workouts (id, user_id, name, started_at, ended_at, log_date)
  values (p_id, p_user, p_name, now() - interval '50 minutes', now() - interval '5 minutes', current_date);
  update public.group_messages set created_at = now() - p_ago where workout_id = p_id;
$$;
-- Lets the ten minute spacing pass for everyone.
create function pg_temp.later() returns void language sql as $$
  update public.group_members set updates_pushed_at = now() - interval '11 minutes'
  where updates_pushed_at is not null;
$$;

select ok(not has_function_privilege('authenticated', 'public.group_update_digests(integer)', 'EXECUTE'),
  'clients cannot run the digest');

select pg_temp.workout(:'ana', 'a3920000-0000-4000-8000-000000000001', 'Push day', interval '10 minutes');
select is((select count(*)::int from public.group_messages
  where workout_id = 'a3920000-0000-4000-8000-000000000001' and automatic), 2,
  'the workout is shared into both of Ana''s groups');
create temp table run1 as select * from public.group_update_digests();
select is((select array_agg(token order by token) from run1),
  array['ExponentPushToken[digest-ben-pad]', 'ExponentPushToken[digest-ben-phone]', 'ExponentPushToken[digest-cai]'],
  'each device hears it once, Ben''s two though he shares two groups with Ana, and Cai though he muted chat');
select is((select array_agg(distinct group_id) from run1 where user_id = :'ben'), array[:'g2'::uuid],
  'through the group whose chat they read last');
select is((select array[actor_name, body, more::text] from run1 where user_id = :'cai'),
  array['Ana', 'Push day (45 min)', '0'], 'naming who and what');
select is((select count(*)::int from public.group_update_digests()), 0, 'and a second run sends nothing');

-- Two more inside ten minutes wait, then go as one push naming the newest.
-- (The clock stands still in a test, so each share is dated after the last.)
select pg_temp.workout(:'ana', 'a3920000-0000-4000-8000-000000000002', 'Legs', interval '9 minutes');
select pg_temp.workout(:'ana', 'a3920000-0000-4000-8000-000000000003', 'Arms', interval '8 minutes');
select is((select count(*)::int from public.group_update_digests()), 0,
  'nobody is pushed twice within ten minutes');
select pg_temp.later();
create temp table run2 as select * from public.group_update_digests();
select is((select array[body, more::text] from run2 where user_id = :'cai'),
  array['Arms (45 min)', '1'], 'once the spacing passes, one push names the newest and counts the rest');

-- Too fresh to push: someone may be watching it land.
select pg_temp.later();
select pg_temp.workout(:'ana', 'a3920000-0000-4000-8000-000000000004', 'Run', interval '0 seconds');
select is((select count(*)::int from public.group_update_digests()), 0,
  'a share under half a minute old waits');
update public.group_messages set created_at = now() - interval '7 minutes'
  where workout_id = 'a3920000-0000-4000-8000-000000000004';

-- Ben read it in the first group's open chat: he has seen it, though the
-- second group is the one it would reach him through.
update public.group_members set chat_read_at = now() where user_id = :'ben' and group_id = :'g1';
select is((select array_agg(distinct user_id) from public.group_update_digests()), array[:'cai'::uuid],
  'a member who read it in any group is not pushed it');

-- Back to Ben reading the second group last, without the run he saw. (A read
-- only ever moves forward; winding it back is the test's doing.)
delete from public.workouts where id = 'a3920000-0000-4000-8000-000000000004';
update public.group_members set chat_read_at = now() - interval '3 hours' where user_id = :'ben' and group_id = :'g1';

-- A push names one group and counts only its shares; another group's waits.
-- Fay is in a group with Gus and one with Eve, and read Gus's last.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id::text || '@digests.example.test', '{}', '{"full_name": "Fixture"}'
from unnest(array['a3900000-0000-4000-8000-000000000006'::uuid, 'a3900000-0000-4000-8000-000000000007'::uuid]) id;
update public.profiles set display_name = 'Gus' where id = 'a3900000-0000-4000-8000-000000000007';
update public.profiles set timezone = (select day from zones) where id = 'a3900000-0000-4000-8000-000000000006';
insert into public.groups(id, name, leader_id) values
  ('a3910000-0000-4000-8000-000000000003', 'Digest three', 'a3900000-0000-4000-8000-000000000007'),
  ('a3910000-0000-4000-8000-000000000004', 'Digest four', :'eve');
insert into public.group_members(group_id, user_id, joined_at, chat_read_at, updates_told_until) values
  ('a3910000-0000-4000-8000-000000000003', 'a3900000-0000-4000-8000-000000000007', now() - interval '1 day', now() - interval '1 day', now() - interval '2 hours'),
  ('a3910000-0000-4000-8000-000000000003', 'a3900000-0000-4000-8000-000000000006', now() - interval '1 day', now() - interval '2 hours', now() - interval '2 hours'),
  ('a3910000-0000-4000-8000-000000000004', :'eve', now() - interval '1 day', now() - interval '1 day', now() - interval '2 hours'),
  ('a3910000-0000-4000-8000-000000000004', 'a3900000-0000-4000-8000-000000000006', now() - interval '1 day', now() - interval '3 hours', now() - interval '2 hours');
-- Eve is in the second group too, so her swim also reaches Ben there.
insert into public.push_tokens(token, user_id, platform) values
  ('ExponentPushToken[digest-fay]', 'a3900000-0000-4000-8000-000000000006', 'ios');
select pg_temp.workout(:'eve', 'a3920000-0000-4000-8000-000000000005', 'Swim', interval '3 minutes');
select pg_temp.workout('a3900000-0000-4000-8000-000000000007', 'a3920000-0000-4000-8000-000000000006', 'Walk', interval '35 seconds');
create temp table run3 as select * from public.group_update_digests()
  where user_id = 'a3900000-0000-4000-8000-000000000006';
select is((select array_agg(array[group_id::text, actor_name, body, more::text]) from run3),
  array[array['a3910000-0000-4000-8000-000000000003', 'Gus', 'Walk (45 min)', '0']],
  'Fay hears the newest share''s group, counting nothing from the other');
select pg_temp.later();
select is((select array_agg(array[group_id::text, actor_name, body]) from public.group_update_digests()
    where user_id = 'a3900000-0000-4000-8000-000000000006'),
  array[array['a3910000-0000-4000-8000-000000000004', 'Eve', 'Swim (45 min)']],
  'and the other group''s share gets the next push of its own');

-- A page at a time, so an answer stays under PostgREST's row cap.
select pg_temp.later();
select pg_temp.workout(:'ana', 'a3920000-0000-4000-8000-000000000007', 'Row', interval '40 seconds');
select is((select array_agg(distinct user_id) from public.group_update_digests(1)), array[:'ben'::uuid],
  'a page holds the first people due, with every device of each');
select is((select array_agg(distinct user_id) from public.group_update_digests(1)), array[:'cai'::uuid],
  'and the next call the next');

-- Quiet hours, mutes, blocks and age each keep a push away.
select pg_temp.later();
select pg_temp.workout(:'ana', 'a3920000-0000-4000-8000-000000000008', 'Hike', interval '35 seconds');
update public.profiles set timezone = (select night from zones) where id = :'cai';
select is((select array_agg(distinct user_id) from public.group_update_digests()), array[:'ben'::uuid],
  'nobody is pushed during their night');
update public.profiles set timezone = (select day from zones) where id = :'cai';
update public.group_members set notify_updates = false where user_id = :'cai';
insert into public.blocked_authors(user_id, author_id) values (:'ben', :'ana');
select pg_temp.later();
select pg_temp.workout(:'ana', 'a3920000-0000-4000-8000-000000000009', 'Yoga', interval '32 seconds');
select is((select count(*)::int from public.group_update_digests()), 0,
  'nor anyone who muted updates or blocked the poster');
delete from public.blocked_authors where user_id = :'ben';
update public.group_members set notify_updates = true where user_id = :'cai';
update public.group_members set updates_told_until = now() - interval '2 hours', updates_pushed_at = null;
update public.group_messages set created_at = now() - interval '61 minutes' where automatic and created_at > now() - interval '1 hour';
select is((select count(*)::int from public.group_update_digests()), 0, 'a share over an hour old is not pushed');

-- Dee joins after a share, having read nothing: her membership starts told
-- up to the moment she joined.
update public.group_messages set created_at = now() - interval '1 minute'
  where workout_id = 'a3920000-0000-4000-8000-000000000009';
insert into public.group_members(group_id, user_id, joined_at, chat_read_at) values
  (:'g1', :'dee', now(), now() - interval '1 day');
select ok(not exists (select 1 from public.group_update_digests() where user_id = :'dee'),
  'a member hears nothing shared before they joined');

select * from finish();
rollback;
