-- A per-follower bound is distinct from a follower-count bound: a celebrity
-- may have many followers, while one reader cannot create unlimited fan-in.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set viewer 'a8300000-0000-4000-8000-000000000001'

-- Private onboarding side effects are irrelevant to this graph-only fixture.
set local session_replication_role = replica;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select ('a8300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'limit-' || n || '@social.example.test', '{}', '{}'
from generate_series(1, 5002) n;
insert into public.profiles (id, handle, display_name, review_status)
select ('a8300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'limit_' || lpad(n::text, 5, '0'), 'Limit fixture ' || n, 'approved'
from generate_series(1, 5002) n;
set local session_replication_role = origin;
insert into public.social_follows (follower_id, followed_id)
select :'viewer', ('a8300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
from generate_series(2, 5000) n;

select set_config('request.jwt.claims', json_build_object('sub', :'viewer', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($q$select public.set_social_follow('a8300000-0000-4000-8000-000000005001', true)$q$,
  'the 5,000th following edge is accepted');
select lives_ok($q$select public.set_social_follow('a8300000-0000-4000-8000-000000005001', true)$q$,
  'an idempotent follow retry is accepted at the cap');
select throws_ok($q$select public.set_social_follow('a8300000-0000-4000-8000-000000005002', true)$q$,
  'P0001', 'Following limit reached', 'the 5,001st follow is rejected');
select is((select count(*)::int from public.social_connections(p_user_id => :'viewer', p_direction => 'following', p_limit => 50)), 51,
  'a large following list still has a bounded page');
select public.set_social_follow('a8300000-0000-4000-8000-000000005001', false);
select lives_ok($q$select public.set_social_follow('a8300000-0000-4000-8000-000000005002', true)$q$,
  'unfollowing releases one place at the cap');
reset role;
select is((select count(*)::bigint from public.social_follows where follower_id = :'viewer'), 5000::bigint,
  'the graph remains exactly at its per-reader limit');
select is((select sum(value) from public.social_counters where entity_id = :'viewer' and metric = 'following'), 5000::numeric,
  'sharded following counts reconcile with the canonical graph');
select ok((select count(*) from public.social_counters where entity_id = :'viewer' and metric = 'following') <= 32,
  '5,000 outgoing edges use at most 32 counter rows');
select ok((select count(*) from public.social_counters where entity_id = :'viewer' and metric = 'following' and value > 0) > 16,
  'a large graph spreads counter writes across shards');

-- The same graph can point inward without any celebrity cap.
insert into public.social_follows (follower_id, followed_id)
select ('a8300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, :'viewer'
from generate_series(2, 5002) n;
select is((select sum(value) from public.social_counters where entity_id = :'viewer' and metric = 'followers'), 5001::numeric,
  'an account may have more than 5,000 followers');
select ok((select count(*) from public.social_counters where entity_id = :'viewer' and metric = 'followers') <= 32,
  'celebrity follower reads sum a bounded number of shards');

-- Counters must agree after rows disappear through the account cascade too.
delete from auth.users where id = 'a8300000-0000-4000-8000-000000000003';
select is((select sum(value) from public.social_counters where entity_id = :'viewer' and metric = 'followers'),
  (select count(*)::numeric from public.social_follows where followed_id = :'viewer'),
  'follower deletion reconciles surviving account counters');
select is((select sum(value) from public.social_counters where entity_id = :'viewer' and metric = 'following'),
  (select count(*)::numeric from public.social_follows where follower_id = :'viewer'),
  'followed account deletion reconciles surviving account counters');

select * from finish();
rollback;
