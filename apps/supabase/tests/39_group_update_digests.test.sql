-- The jobs Worker's food and workout update pushes: who hears a share, once,
-- how often, and when not at all.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set ana 'a3900000-0000-4000-8000-000000000001'
\set ben 'a3900000-0000-4000-8000-000000000002'
\set cai 'a3900000-0000-4000-8000-000000000003'
\set dee 'a3900000-0000-4000-8000-000000000004'
\set g1  'a3910000-0000-4000-8000-000000000001'
\set g2  'a3910000-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id::text || '@digests.example.test', '{}', '{"full_name": "Fixture"}'
from unnest(array[:'ana'::uuid, :'ben'::uuid, :'cai'::uuid, :'dee'::uuid]) id;
update public.profiles set display_name = 'Ana' where id = :'ana';

-- Somewhere it is midday and somewhere it is three in the morning, whatever
-- time the suite runs.
create temp table zones as select
  (select name from pg_timezone_names where name like 'Etc/GMT%'
     and extract(hour from now() at time zone name) = 12 limit 1) as day,
  (select name from pg_timezone_names where name like 'Etc/GMT%'
     and extract(hour from now() at time zone name) = 3 limit 1) as night;
update public.profiles set timezone = (select day from zones) where id in (:'ben', :'cai', :'dee');

-- Ana, Ben and Cai in one group; Ana and Ben in a second; Dee joins later.
insert into public.groups(id, name, leader_id) values (:'g1', 'Digest one', :'ana'), (:'g2', 'Digest two', :'ana');
insert into public.group_members(group_id, user_id, joined_at, chat_read_at) values
  (:'g1', :'ana', now() - interval '1 day', now() - interval '1 day'),
  (:'g1', :'ben', now() - interval '1 day', now() - interval '2 hours'),
  (:'g1', :'cai', now() - interval '1 day', now() - interval '2 hours'),
  (:'g2', :'ana', now() - interval '1 day', now() - interval '1 day'),
  (:'g2', :'ben', now() - interval '1 day', now() - interval '90 minutes');
insert into public.push_tokens(token, user_id, platform) values
  ('ExponentPushToken[digest-ben]', :'ben', 'ios'),
  ('ExponentPushToken[digest-cai]', :'cai', 'ios'),
  ('ExponentPushToken[digest-dee]', :'dee', 'ios');

-- A workout Ana finished, shared into her chats `ago` back.
create function pg_temp.workout(p_id uuid, p_name text, p_ago interval) returns void language sql as $$
  insert into public.workouts (id, user_id, name, started_at, ended_at, log_date)
  values (p_id, 'a3900000-0000-4000-8000-000000000001', p_name, now() - interval '50 minutes',
    now() - interval '5 minutes', current_date);
  update public.group_messages set created_at = now() - p_ago where workout_id = p_id;
$$;

select ok(not has_function_privilege('authenticated', 'public.group_update_digests()', 'EXECUTE'),
  'clients cannot run the digest');
select ok(not has_table_privilege('authenticated', 'public.group_update_cursors', 'SELECT'),
  'or read who was told what');

select pg_temp.workout('a3920000-0000-4000-8000-000000000001', 'Push day', interval '1 minute');
select is((select count(*)::int from public.group_messages
  where workout_id = 'a3920000-0000-4000-8000-000000000001' and automatic and pushed_at is null), 2,
  'the workout is shared into both of Ana''s groups');
create temp table run1 as select * from public.group_update_digests();
select is((select array_agg(token order by token) from run1),
  array['ExponentPushToken[digest-ben]', 'ExponentPushToken[digest-cai]'],
  'each member hears it once, Ben though he shares two groups with Ana');
select is((select group_id from run1 where token = 'ExponentPushToken[digest-ben]'), :'g2'::uuid,
  'through the group whose chat they read last');
select is((select array[actor_name, body, more::text] from run1 where token = 'ExponentPushToken[digest-cai]'),
  array['Ana', 'Push day (45 min)', '0'], 'naming who and what');
select is((select count(*)::int from public.group_update_digests()), 0, 'and a second run sends nothing');

-- Two more inside fifteen minutes wait, then go as one push naming the newest.
-- The clock stands still inside a test, so the cursor the run set is put back
-- to just after the first workout, where a later minute would leave it.
update public.group_update_cursors set notified_until = now() - interval '50 seconds';
select pg_temp.workout('a3920000-0000-4000-8000-000000000002', 'Legs', interval '40 seconds');
select pg_temp.workout('a3920000-0000-4000-8000-000000000003', 'Arms', interval '20 seconds');
select is((select count(*)::int from public.group_update_digests()), 0,
  'nobody is pushed twice within fifteen minutes');
update public.group_update_cursors set pushed_at = now() - interval '16 minutes'
  where user_id in (:'ben', :'cai');
create temp table run2 as select * from public.group_update_digests();
select is((select array[body, more::text] from run2 where token = 'ExponentPushToken[digest-cai]'),
  array['Arms (45 min)', '1'], 'once the spacing passes, one push names the newest and counts the rest');

-- Too fresh to push: someone may be watching it land.
update public.group_update_cursors set pushed_at = null, notified_until = now() - interval '15 seconds';
select pg_temp.workout('a3920000-0000-4000-8000-000000000004', 'Run', interval '0 seconds');
select is((select count(*)::int from public.group_update_digests()), 0,
  'a share under ten seconds old waits');
update public.group_messages set created_at = now() - interval '12 seconds'
  where workout_id = 'a3920000-0000-4000-8000-000000000004';

-- Ben read it in the first group's open chat: he has seen it, in both groups.
update public.group_members set chat_read_at = now() where user_id = :'ben' and group_id = :'g1';
select is((select array_agg(token) from public.group_update_digests()),
  array['ExponentPushToken[digest-cai]'], 'a member who read it in any group is not pushed it');

-- Quiet hours, mutes, blocks, age and joining after it each keep a push away.
update public.group_update_cursors set pushed_at = null, notified_until = now() - interval '1 hour';
update public.group_members set chat_read_at = now() - interval '2 hours' where user_id = :'ben';
update public.profiles set timezone = (select night from zones) where id = :'cai';
select is((select array_agg(token) from public.group_update_digests()),
  array['ExponentPushToken[digest-ben]'], 'nobody is pushed during their night');
update public.profiles set timezone = (select day from zones) where id = :'cai';
update public.group_update_cursors set pushed_at = null, notified_until = now() - interval '1 hour';
update public.group_members set notify_updates = false where user_id = :'cai';
insert into public.blocked_authors(user_id, author_id) values (:'ben', :'ana');
select is((select count(*)::int from public.group_update_digests()), 0,
  'nor anyone who muted updates or blocked the poster');
delete from public.blocked_authors where user_id = :'ben';
update public.group_members set notify_updates = true where user_id = :'cai';
update public.group_update_cursors set pushed_at = null, notified_until = now() - interval '2 hours';
update public.group_messages set created_at = now() - interval '61 minutes' where author_id = :'ana' and automatic;
select is((select count(*)::int from public.group_update_digests()), 0, 'a share over an hour old is not pushed');
update public.group_messages set created_at = now() - interval '1 minute' where author_id = :'ana' and automatic;
insert into public.group_members(group_id, user_id, joined_at) values (:'g1', :'dee', now());
update public.group_update_cursors set pushed_at = null, notified_until = now() - interval '2 hours';
select ok(not exists (select 1 from public.group_update_digests() where token = 'ExponentPushToken[digest-dee]'),
  'and a member hears nothing shared before they joined');

select * from finish();
rollback;
