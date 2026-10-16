-- ---------------------------------------------------------------------------
-- The free tier's routine ceiling. Enforced in the database for the reason the
-- recipe ceiling is (11_free_tier_limits): the client writes
-- `workout_routines` directly under RLS, so a limit in the app would only apply
-- to people running the app.
-- ---------------------------------------------------------------------------
begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

\set free '77777777-7777-4777-8777-777777777777'
\set pro  '88888888-8888-4888-8888-888888888888'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'free', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'routines-free@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  (:'pro', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'routines-pro@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.subscriptions (user_id, status, plan, current_period_end)
values (:'pro', 'active', 'yearly', now() + interval '30 days');

-- Written as the user, as the app writes them. Read from
-- `free_routine_limit()` rather than written as 3, so moving the number is not
-- a failing test.
select set_config('request.jwt.claims',
  json_build_object('sub', :'free', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.workout_routines (user_id, name)
select :'free', 'Day ' || n
  from generate_series(1, public.free_routine_limit()) as n;

select is(
  (select count(*)::integer from public.workout_routines where user_id = :'free'),
  public.free_routine_limit(),
  'a free account fills up to its ceiling'
);

select throws_ok(
  $$insert into public.workout_routines (user_id, name, template_id)
    values ('77777777-7777-4777-8777-777777777777', 'Push', 'push')$$,
  'P0001',
  'routine_limit_reached',
  'and the one after it is refused, a template added to My routines included'
);

-- Editing what is already there is not adding to it.
select lives_ok(
  $$update public.workout_routines set name = 'Leg day'
     where user_id = '77777777-7777-4777-8777-777777777777' and name = 'Day 1'$$,
  'an account at the ceiling can still edit its routines'
);

-- Deleting one makes room for another.
delete from public.workout_routines where user_id = :'free' and name = 'Leg day';

select lives_ok(
  $$insert into public.workout_routines (user_id, name)
    values ('77777777-7777-4777-8777-777777777777', 'Pull')$$,
  'and a deleted routine frees its place'
);

reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', :'pro', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.workout_routines (user_id, name)
select :'pro', 'Day ' || n
  from generate_series(1, public.free_routine_limit() + 2) as n;

select is(
  (select count(*)::integer from public.workout_routines where user_id = :'pro'),
  public.free_routine_limit() + 2,
  'a subscribed account walks straight past the same ceiling'
);

select * from finish();
rollback;
