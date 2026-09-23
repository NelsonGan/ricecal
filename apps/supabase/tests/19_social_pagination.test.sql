-- Timestamps alone are not a cursor. These fixtures intentionally tie every
-- timestamp, then delete the cursor and insert a newer post between requests.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set viewer 'a8200000-0000-4000-8000-000000000001'
\set author 'a8200000-0000-4000-8000-000000000002'
\set other 'a8200000-0000-4000-8000-000000000003'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id::text || '@paging.example.test', '{}', '{}'
from unnest(array[:'viewer'::uuid, :'author'::uuid, :'other'::uuid]) id;
insert into public.social_profiles (user_id, handle, display_name, review_status)
values (:'viewer', 'paging_viewer', 'Viewer fixture', 'approved'),
       (:'author', 'paging_author', 'Author fixture', 'approved'),
       (:'other', 'paging_other', 'Other fixture', 'approved');
-- Existing simulator fixtures must not become extra Discover rows. These
-- temporary blocks affect only this newly created reader and roll back below.
insert into public.blocked_authors (user_id, author_id)
select :'viewer', user_id from public.social_profiles
where user_id not in (:'viewer', :'author', :'other');
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
select ('a8210000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, :'author',
       'Pagination rice ' || n, 200, 44, 4, 1, '1 bowl', 1 from generate_series(1, 60) n;
insert into public.social_posts
  (id, author_id, source_entry_id, food_name, caption, audience, review_status, created_at, published_at)
select ('a8220000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, :'author',
       ('a8210000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'Pagination rice ' || n, '', 'public', 'approved', '2026-01-01 12:00:00+00', '2026-01-01 12:00:00+00'
from generate_series(1, 60) n;
insert into public.social_comments
  (id, post_id, author_id, request_id, body, review_status, created_at)
select ('a8230000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'a8220000-0000-4000-8000-000000000001', :'other', gen_random_uuid(),
       'Paging comment ' || n, 'approved', '2026-01-02 12:00:00+00'
from generate_series(1, 5) n;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from private.social_feed_candidates('discover', null, null, 20)), 0,
  'the privileged candidate helper returns no IDs without an authenticated user claim');
select is((select count(*)::int from private.social_suggestion_candidates(12)), 0,
  'the privileged suggestions helper returns no identities without an authenticated user claim');
reset role;
select ok(not has_function_privilege('anon', 'private.social_feed_candidates(text,timestamptz,uuid,integer)', 'EXECUTE'),
  'anonymous callers have no direct candidate-helper privilege');
select ok(not has_function_privilege('anon', 'private.social_suggestion_candidates(integer)', 'EXECUTE'),
  'anonymous callers have no direct suggestion-helper privilege');

select set_config('request.jwt.claims', json_build_object('sub', :'viewer', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_feed(p_mode => 'following')), 0,
  'following is empty when neither the viewer nor followed people have posted');
select is((select count(*)::int from public.social_feed(p_mode => 'discover', p_limit => 2)), 3,
  'feed returns one sentinel beyond the requested page size');
select is((select array_agg(id) from public.social_feed(p_mode => 'discover', p_limit => 2)),
  array['a8220000-0000-4000-8000-000000000060', 'a8220000-0000-4000-8000-000000000059',
        'a8220000-0000-4000-8000-000000000058']::uuid[],
  'tied post timestamps are ordered by descending immutable UUID');
select is((select count(*)::int from public.social_feed(p_mode => 'discover', p_limit => 50)), 51,
  'the maximum feed page is bounded at 50 plus one sentinel');
select throws_ok($q$select * from public.social_feed(p_mode => 'discover', p_limit => 51)$q$,
  '22023', null, 'oversized page requests are rejected');
select throws_ok($q$select * from public.social_feed(p_mode => 'discover', p_limit => 0)$q$,
  '22023', null, 'zero-sized page requests are rejected');
select throws_ok($q$select * from public.social_feed(p_mode => 'discover', p_limit => -1)$q$,
  '22023', null, 'negative page requests are rejected');
select throws_ok($q$select * from public.social_feed(p_mode => 'discover', p_limit => null)$q$,
  '22023', null, 'null cannot remove the SQL limit');
select throws_ok($q$select * from public.social_feed(p_mode => 'bogus')$q$,
  '22023', null, 'unknown feed modes are rejected');
select throws_ok($q$select * from public.social_feed(p_mode => 'discover', p_before_at => now())$q$,
  '22023', null, 'timestamp-only cursors are rejected');
select throws_ok($q$select * from public.social_feed(p_mode => 'discover', p_before_id => gen_random_uuid())$q$,
  '22023', null, 'UUID-only cursors are rejected');
select throws_ok($q$select * from public.social_feed(p_mode => 'discover', p_before_at => 'infinity', p_before_id => gen_random_uuid())$q$,
  '22023', null, 'non-finite cursor timestamps are rejected');
select is((select array_agg(id) from public.social_feed(p_mode => 'discover', p_limit => 2,
  p_before_at => '2026-01-01 12:00:00+00', p_before_id => 'a8220000-0000-4000-8000-000000000059')),
  array['a8220000-0000-4000-8000-000000000058', 'a8220000-0000-4000-8000-000000000057',
        'a8220000-0000-4000-8000-000000000056']::uuid[],
  'the next page uses both cursor components without duplicates or skipped ties');
select is((select count(*)::int from public.social_feed(p_mode => 'discover', p_limit => 2,
  p_before_at => '2026-01-01 12:00:00+00', p_before_id => 'a8220000-0000-4000-8000-000000000003')), 2,
  'an exactly full final page has no sentinel');
select is((select count(*)::int from public.social_feed(p_mode => 'discover', p_limit => 2,
  p_before_at => '2026-01-01 12:00:00+00', p_before_id => 'a8220000-0000-4000-8000-000000000001')), 0,
  'paging beyond the final row returns an empty result');
select is((select count(*)::int from public.social_profile_posts(p_user_id => :'author', p_limit => 2)), 3,
  'profile posts use the same bounded sentinel contract');
select is((select array_agg(id) from public.social_comments(
  p_post_id => 'a8220000-0000-4000-8000-000000000001', p_limit => 2)),
  array['a8230000-0000-4000-8000-000000000005', 'a8230000-0000-4000-8000-000000000004',
        'a8230000-0000-4000-8000-000000000003']::uuid[],
  'comment ties use the same deterministic cursor order');
select is((select array_agg(id) from public.social_comments(
  p_post_id => 'a8220000-0000-4000-8000-000000000001', p_limit => 2,
  p_before_at => '2026-01-02 12:00:00+00', p_before_id => 'a8230000-0000-4000-8000-000000000004')),
  array['a8230000-0000-4000-8000-000000000003', 'a8230000-0000-4000-8000-000000000002',
        'a8230000-0000-4000-8000-000000000001']::uuid[],
  'comment continuation skips precisely the visible preceding rows');
select public.set_social_follow(:'author', true);
select is((select count(*)::int from public.social_feed(p_mode => 'discover')), 0,
  'Discover excludes followed authors');
select is((select count(*)::int from public.social_feed(p_mode => 'following', p_limit => 2)), 3,
  'Following includes the followed author''s posts');
reset role;

delete from public.social_posts where id = 'a8220000-0000-4000-8000-000000000059';
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor)
values ('a8210000-0000-4000-8000-000000000061', :'author', 'New rice', 200, 44, 4, 1, '1 bowl', 1);
insert into public.social_posts
  (id, author_id, source_entry_id, food_name, audience, review_status, created_at, published_at)
values ('a8220000-0000-4000-8000-000000000061', :'author',
  'a8210000-0000-4000-8000-000000000061', 'New rice', 'public', 'approved',
  '2026-01-02 12:00:00+00', '2026-01-02 12:00:00+00');
select set_config('request.jwt.claims', json_build_object('sub', :'viewer', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select array_agg(id) from public.social_feed(p_mode => 'following', p_limit => 2,
  p_before_at => '2026-01-01 12:00:00+00', p_before_id => 'a8220000-0000-4000-8000-000000000059')),
  array['a8220000-0000-4000-8000-000000000058', 'a8220000-0000-4000-8000-000000000057',
        'a8220000-0000-4000-8000-000000000056']::uuid[],
  'deleting the cursor and inserting a newer post does not disturb continuation');
select is((select id from public.social_feed(p_mode => 'following', p_limit => 1) limit 1),
  'a8220000-0000-4000-8000-000000000061'::uuid,
  'refreshing from the head includes the new post');
select is((select count(*)::int from public.social_connections(p_user_id => :'author', p_direction => 'followers')), 1,
  'follower connections show the current edge');
select is((select count(*)::int from public.social_connections(p_user_id => :'viewer', p_direction => 'following')), 1,
  'following connections show the reverse direction');
select throws_ok(format('select * from public.social_connections(p_user_id => %L, p_direction => %L)', :'viewer', 'bogus'),
  '22023', null, 'invalid connection directions are rejected');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'author', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.update_social_post('a8220000-0000-4000-8000-000000000058', 'An edited caption', 'public');
select is((select created_at from public.social_posts where id = 'a8220000-0000-4000-8000-000000000058'),
  '2026-01-01 12:00:00+00'::timestamptz, 'editing a post preserves its position in all feed cursors');
select is((select count(*)::int from public.social_notifications() where kind = 'follow'), 1,
  'a follow activity row belongs to its recipient');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'viewer', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_notifications()), 0,
  'activity cannot leak to another account');
reset role;

insert into public.social_reports (kind, content_id, content_revision, reporter_id, reason)
select 'post', id, revision, :'viewer', 'spam' from public.social_posts
where author_id = :'author' and id >= 'a8220000-0000-4000-8000-000000000051';
select set_config('request.jwt.claims', json_build_object('sub', :'viewer', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select array_agg(id) from public.social_feed(p_mode => 'following', p_limit => 2)),
  array['a8220000-0000-4000-8000-000000000050', 'a8220000-0000-4000-8000-000000000049',
        'a8220000-0000-4000-8000-000000000048']::uuid[],
  'reported candidates are excluded before limiting, so older visible rows fill the page');
select is((select array_agg(id) from private.social_feed_candidates('following', null, null, 2)),
  array['a8220000-0000-4000-8000-000000000050', 'a8220000-0000-4000-8000-000000000049',
        'a8220000-0000-4000-8000-000000000048']::uuid[],
  'the privileged selector itself returns only unreported IDs for the current viewer');
select public.set_social_follow(:'author', false);
select is((select array_agg(id) from public.social_feed(p_mode => 'discover', p_limit => 2)),
  array['a8220000-0000-4000-8000-000000000050', 'a8220000-0000-4000-8000-000000000049',
        'a8220000-0000-4000-8000-000000000048']::uuid[],
  'Discover also fills its page after filtering many more recent reported posts');
reset role;

select * from finish();
rollback;
