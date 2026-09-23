-- Public food is an explicit, moderated snapshot. Every privacy assertion runs
-- as a client role; postgres is used only to prepare fixtures and approve them.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set alice 'a8100000-0000-4000-8000-000000000001'
\set bob   'a8100000-0000-4000-8000-000000000002'
\set carol 'a8100000-0000-4000-8000-000000000003'
\set dan   'a8100000-0000-4000-8000-000000000004'
\set eve   'a8100000-0000-4000-8000-000000000005'
\set fresh 'a8100000-0000-4000-8000-000000000006'
\set frank 'a8100000-0000-4000-8000-000000000007'
\set entry 'a8110000-0000-4000-8000-000000000001'
\set second_entry 'a8110000-0000-4000-8000-000000000002'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id::text || '@social.example.test', '{}', '{}'
from unnest(array[:'alice'::uuid, :'bob'::uuid, :'carol'::uuid, :'dan'::uuid, :'eve'::uuid, :'fresh'::uuid, :'frank'::uuid]) id;

update public.profiles set display_name = 'Private name', birth_date = '1990-01-01',
  height_cm = 170, target_weight_kg = 65 where id = :'alice';
insert into public.food_logs
  (id, user_id, log_date, logged_at, item_name, item_icon_set, item_icon_name,
   base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor, note, photo_path)
values
  (:'entry', :'alice', '2020-01-01', '2020-01-01 10:30:00+00', 'Fixture nasi lemak', 'dishes', 'nasi-lemak',
   600, 60, 25, 28, '1 plate', 1, 'Private diary note', 'meals/' || :'alice' || '/social-fixture.jpg'),
  (:'second_entry', :'alice', '2020-01-02', '2020-01-02 10:30:00+00', 'Fixture rice', 'food', 'rice',
   200, 44, 4, 1, '1 bowl', 1, null, null);

select is((select count(*)::int from public.social_profiles where user_id = :'alice'), 0,
  'creating an account does not opt it into a public identity');
select is((select count(*)::int from public.social_posts where author_id = :'alice'), 0,
  'logging a meal never publishes it');
select ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'social_%' and not c.relrowsecurity
), 'every exposed social table has RLS');
select ok(not exists (
  select 1 from information_schema.columns where table_schema = 'public'
  and table_name in ('social_profiles', 'social_posts')
  and column_name in ('email', 'birth_date', 'sex', 'height_cm', 'target_weight_kg', 'log_date',
    'logged_at', 'note', 'base_kcal', 'base_carbs_g', 'base_protein_g', 'base_fat_g')
), 'social storage contains no private identity, diary dates, notes or nutrition');

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format('select public.create_social_post(%L, %L, %L)', :'entry', '', 'public'),
  '42501', null, 'publication requires an explicit public identity');
select public.set_social_profile('Social_ALICE', 'Alice fixture', '爱吃饭', null);
select is((select handle from public.social_profiles where user_id = :'alice'), 'social_alice',
  'handles normalize to lowercase while profile text accepts other languages');
select is((select avatar_path from public.social_profiles where user_id = :'alice'), null,
  'a private avatar is never copied implicitly');
select throws_ok($q$select public.set_social_profile('x', 'Alice', '', null)$q$,
  '23514', null, 'a handle shorter than three characters is rejected');
select throws_ok($q$select public.set_social_profile('a handle', 'Alice', '', null)$q$,
  '23514', null, 'spaces cannot become a handle');
select throws_ok($q$select public.set_social_profile('名字名字', 'Alice', '', null)$q$,
  '23514', null, 'non-ASCII handles cannot bypass normalized uniqueness');
select throws_ok($q$update public.social_profiles set review_status = 'approved'$q$, '42501', null,
  'an ordinary client cannot approve its profile');
reset role;

select public.review_social_content('profile', :'alice', 1, 'approved', null);
insert into public.social_profiles (user_id, handle, display_name, review_status)
values (:'bob', 'social_bob', 'Bob fixture', 'approved'),
       (:'carol', 'social_carol', 'Carol fixture', 'approved'),
       (:'dan', 'social_dan', 'Dan fixture', 'approved'),
       (:'eve', 'social_eve', 'Eve fixture', 'approved');

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($q$select public.set_social_profile('SOCIAL_ALICE', 'Imposter', '', null)$q$,
  '23505', null, 'normalized handles remain unique across accounts');
select throws_ok(format('select public.create_social_post(%L, %L, %L)', :'entry', 'Stolen', 'public'),
  '42501', null, 'another account cannot publish a private diary entry');
select is((select count(*)::int from public.food_logs where user_id = :'alice'), 0,
  'public identity does not expose its private diary');
select is((select count(*)::int from public.profiles where id = :'alice'), 0,
  'public identity does not expose its private health profile');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.create_social_post(:'entry', 'A good lunch', 'public') as post \gset
select is(public.create_social_post(:'entry', 'A good lunch', 'public'), :'post'::uuid,
  'retrying a publication returns its original post');
select is(public.create_social_post(:'entry', 'A different caption', 'followers'), :'post'::uuid,
  'a source entry has at most one published snapshot');
select is((select food_name from public.social_posts where id = :'post'), 'Fixture nasi lemak',
  'the server derives the public food name from the owned diary entry');
select is((select caption from public.social_posts where id = :'post'), 'A good lunch',
  'a repeated publication cannot silently edit the first snapshot');
select ok((select created_at > '2025-01-01'::timestamptz from public.social_posts where id = :'post'),
  'publication uses a new timestamp rather than exposing the historical meal time');
select throws_ok(format('select public.update_social_post(%L, repeat(%L, 281), %L)', :'post', 'x', 'public'),
  '23514', null, 'caption length is enforced on the server');
select throws_ok($q$insert into public.social_posts (author_id, source_entry_id, food_name, review_status)
  values (auth.uid(), gen_random_uuid(), 'Forged', 'approved')$q$, '42501', null,
  'direct writes cannot forge an approved snapshot');
update public.food_logs set item_name = 'Changed private food', note = 'More private notes' where id = :'entry';
select is((select food_name from public.social_posts where id = :'post'), 'Fixture nasi lemak',
  'editing the diary never silently rewrites published words');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_posts where id = :'post'), 0,
  'pending post text and media cannot be read by another account');
select throws_ok(format('select public.review_social_content(%L, %L, 1, %L, null)', 'post', :'post', 'approved'),
  '42501', null, 'clients cannot invoke service-only review approval');
reset role;
select is(public.review_social_content('post', :'post', 1, 'approved', null, '"fixture-etag"'), true, 'the service approves the revision it actually reviewed');

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_posts where id = :'post'), 1,
  'an approved public post is readable directly');
select throws_ok(format('select public.set_social_follow(%L, true)', :'bob'), '22023', null, 'self-follow is rejected');
select public.set_social_follow(:'alice', true);
select public.set_social_follow(:'alice', true);
select public.set_social_like(:'post', true);
select public.set_social_like(:'post', true);
select public.create_social_comment(:'post', 'Looks good', 'a8130000-0000-4000-8000-000000000001') as comment \gset
select is(public.create_social_comment(:'post', 'Looks good', 'a8130000-0000-4000-8000-000000000001'), :'comment'::uuid,
  'comment request UUID makes retries idempotent');
select throws_ok(format('select public.create_social_comment(%L, repeat(%L, 501), gen_random_uuid())', :'post', 'x'),
  '23514', null, 'comment length is enforced on the server');
select throws_ok(format('select public.create_social_comment(%L, %L, gen_random_uuid())', :'post', '   '),
  '23514', null, 'blank comments are rejected');
select throws_ok(format('select public.update_social_post(%L, %L, %L)', :'post', 'Hijack', 'public'),
  '42501', null, 'a reader cannot edit another account''s post');
reset role;
select is((select count(*)::int from public.social_follows where follower_id = :'bob' and followed_id = :'alice'), 1,
  'repeating a follow inserts only one canonical edge');
select is((select count(*)::int from public.social_likes where post_id = :'post' and user_id = :'bob'), 1,
  'repeating a like inserts only one canonical edge');
select is((select coalesce(sum(value), 0)::bigint from public.social_counters where entity_id = :'alice' and metric = 'followers'), 1::bigint,
  'a duplicate follow does not inflate sharded follower counts');
select is((select coalesce(sum(value), 0)::bigint from public.social_counters where entity_id = :'post' and metric = 'likes'), 1::bigint,
  'a duplicate like does not inflate sharded like counts');
select is((select coalesce(sum(value), 0)::bigint from public.social_counters where entity_id = :'alice' and metric = 'posts'), 1::bigint,
  'only the one approved publication contributes to the author''s post count');
select is((select count(*)::int from public.social_notifications where recipient_id = :'alice' and actor_id = :'bob' and kind = 'follow'), 1,
  'a duplicate follow creates no extra activity');
select is((select count(*)::int from public.social_notifications where recipient_id = :'alice' and actor_id = :'bob' and kind = 'like'), 1,
  'a duplicate like creates no extra activity');

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select is(public.social_unread_notification_count(), 2,
  'the unread badge reports each missed notification');
reset role;

update public.social_profiles set review_status = 'pending' where user_id = :'bob';
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok(format('select public.set_social_follow(%L, false)', :'alice'),
  'a pending profile can withdraw an existing follow');
select lives_ok(format('select public.set_social_like(%L, false)', :'post'),
  'a pending profile can withdraw an existing like');
select throws_ok(format('select public.set_social_follow(%L, true)', :'alice'), '42501', null,
  'a pending profile still cannot create a follow');
select throws_ok(format('select public.set_social_like(%L, true)', :'post'), '42501', null,
  'a pending profile still cannot create a like');
reset role;
select is((select count(*)::int from public.social_follows where follower_id = :'bob' and followed_id = :'alice'), 0,
  'the pending-profile unfollow actually removes its edge');
select is((select count(*)::int from public.social_likes where user_id = :'bob' and post_id = :'post'), 0,
  'the pending-profile unlike actually removes its edge');
update public.social_profiles set review_status = 'approved' where user_id = :'bob';
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.set_social_follow(:'alice', true);
select public.set_social_like(:'post', true);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_comments where id = :'comment'), 0,
  'even a post author cannot read another account''s unreviewed comment');
select public.update_social_post(:'post', 'Edited lunch', 'followers');
reset role;
select is(public.review_social_content('post', :'post', 1, 'approved', null, '"fixture-etag"'), false,
  'a delayed review cannot approve text edited after the request');
select is(public.review_social_content('post', :'post', 2, 'approved', null, '"fixture-etag"'), true,
  'review of the latest revision can approve the edit');
select public.review_social_content('comment', :'comment', 1, 'approved', null);
select id as comment_activity from public.social_notifications
  where comment_id = :'comment' \gset
update public.social_notifications set read_at = now() where id = :'comment_activity';
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format('select public.update_social_comment(%L, repeat(%L, 501))', :'comment', 'x'),
  '23514', null, 'comment edits enforce the same 500 character boundary');
select public.update_social_comment(:'comment', 'Looks delicious');
reset role;
select is((select review_status::text from public.social_comments where id = :'comment'), 'pending',
  'editing an approved comment requires a fresh review');
select is((select count(*)::int from public.social_notifications where id = :'comment_activity'), 1,
  'editing retains the existing comment activity while visibility is pending');
select is(public.review_social_content('comment', :'comment', 1, 'approved', null), false,
  'a stale comment review cannot approve text changed after it was read');
select is(public.review_social_content('comment', :'comment', 2, 'approved', null), true,
  'the current comment revision can be approved');
select ok((select read_at is not null from public.social_notifications where id = :'comment_activity'),
  'reapproval preserves the original read comment activity');

select set_config('request.jwt.claims', json_build_object('sub', :'carol', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_posts where id = :'post'), 0,
  'a non-follower cannot directly read a followers-only post');
select is((select count(*)::int from public.social_comments where id = :'comment'), 0,
  'comments inherit the followers-only post boundary');
select is((select count(*)::int from public.social_likes where post_id = :'post'), 0,
  'likes inherit the followers-only post boundary');
select throws_ok(format('select public.set_social_like(%L, true)', :'post'), '42501', null,
  'knowing a followers-only post ID does not permit liking it');
select lives_ok(format('select public.delete_social_comment(%L)', :'comment'),
  'deleting an unavailable comment is an idempotent no-op');
reset role;
select is((select count(*)::int from public.social_comments where id = :'comment'), 1,
  'an unrelated delete cannot remove the actual comment');

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_posts where id = :'post'), 1,
  'a follower can read followers-only posts');
select public.set_social_follow(:'alice', false);
select public.set_social_follow(:'alice', false);
select is((select count(*)::int from public.social_posts where id = :'post'), 0,
  'unfollowing immediately revokes followers-only visibility');
select public.set_social_follow(:'alice', true);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.remove_social_follower(:'bob');
select public.remove_social_follower(:'bob');
select public.set_social_follow(:'bob', true);
select public.update_social_post(:'post', 'Edited lunch', 'public');
reset role;
select public.review_social_content('post', :'post', 3, 'approved', null, '"fixture-etag"');

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.set_social_follow(:'alice', true);
-- This is the old released-client block write, intentionally not a new RPC.
insert into public.blocked_authors (user_id, author_id) values (:'bob', :'alice');
select is((select count(*)::int from public.social_posts where id = :'post'), 0,
  'an old client block write hides social posts immediately');
select is((select count(*)::int from public.social_profiles where user_id = :'alice'), 0,
  'a block hides the other public profile');
select throws_ok(format('select public.set_social_follow(%L, true)', :'alice'), '42501', null,
  'a blocked pair cannot recreate a follow');
reset role;
select is((select count(*)::int from public.social_follows
  where (follower_id = :'bob' and followed_id = :'alice') or (follower_id = :'alice' and followed_id = :'bob')), 0,
  'blocking removes follow edges in both directions transactionally');
select is((select coalesce(sum(value), 0)::bigint from public.social_counters where entity_id = :'alice' and metric = 'followers'), 0::bigint,
  'block cascades reconcile follower counters');

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_profiles where user_id = :'bob'), 0,
  'the blocked account cannot read the blocker''s identity');
select is((select count(*)::int from public.blocked_authors where user_id = :'bob'), 0,
  'symmetric block checks never reveal another account''s private block row');
select is((select count(*)::int from public.social_comments where id = :'comment'), 0,
  'a comment by an account that blocked the reader is hidden');
select is((select count(*)::int from public.social_notifications where actor_id = :'bob'), 0,
  'activity from either direction of a block is hidden');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
delete from public.blocked_authors where user_id = :'bob' and author_id = :'alice';
reset role;
select is((select count(*)::int from public.social_follows
  where (follower_id = :'bob' and followed_id = :'alice') or (follower_id = :'alice' and followed_id = :'bob')), 0,
  'unblocking does not silently restore follows');

-- A report hides its target for that reporter, and only distinct reporters count.
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_social_content('post', :'post', 'spam');
select public.report_social_content('post', :'post', 'spam');
select is((select count(*)::int from public.social_posts where id = :'post'), 0,
  'reporting hides the target immediately for its reporter');
reset role;
select is((select count(*)::int from public.social_reports where kind = 'post' and content_id = :'post'), 1,
  'a retry does not become another report');
select is((select quarantined from public.social_posts where id = :'post'), false,
  'one person cannot quarantine a post by reporting repeatedly');

select set_config('request.jwt.claims', json_build_object('sub', :'carol', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_posts where id = :'post'), 1,
  'one report does not hide the post from unrelated readers');
select is((select count(*)::int from public.social_reports where content_id = :'post'), 0,
  'another reader cannot inspect someone else''s report');
select public.report_social_content('post', :'post', 'dangerous');
reset role;
select is((select quarantined from public.social_posts where id = :'post'), false,
  'two distinct reports do not quarantine content');

select set_config('request.jwt.claims', json_build_object('sub', :'dan', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_social_content('post', :'post', 'inappropriate');
reset role;
select is((select quarantined from public.social_posts where id = :'post'), true,
  'three distinct reports quarantine the content');
select revision as quarantined_revision from public.social_posts where id = :'post' \gset
select is(public.review_social_content('post', :'post', :quarantined_revision, 'approved', null, '"fixture-etag"'), false,
  'an ordinary review retry cannot bypass quarantine');

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_reports where content_id = :'post'), 0,
  'the reported author cannot discover who reported them');
select public.update_social_post(:'post', 'Corrected text', 'public');
select throws_ok(format('select public.resolve_social_report(%L, %L, %L, null)', 'post', :'post', 'approved'),
  '42501', null, 'the reported author cannot resolve their own quarantine');
reset role;
select is((select quarantined from public.social_posts where id = :'post'), true,
  'editing preserves quarantine until a moderator resolves it');
select revision as corrected_revision from public.social_posts where id = :'post' \gset
select public.resolve_social_report('post', :'post', 'approved', null, :corrected_revision, '"fixture-etag"');
select is((select count(*)::int from public.social_reports where kind = 'post' and content_id = :'post'), 3,
  'resolving a report cycle preserves its audit rows');
select is((select count(*)::int from public.social_reports
    where kind = 'post' and content_id = :'post' and resolved_at is null), 0,
  'resolving a report cycle closes every outstanding report');

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_posts where id = :'post'), 0,
  'a resolved report continues to hide its target from that reporter');
reset role;

select revision as reopened_revision from public.social_posts where id = :'post' \gset
select set_config('request.jwt.claims', json_build_object('sub', :'eve', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_posts where id = :'post'), 1,
  'resolving reports restores the target for an unrelated reader');
select public.report_social_content('post', :'post', 'spam');
reset role;
select is(public.resolve_social_report('post', :'post', 'approved', null, :corrected_revision, '"fixture-etag"'), false,
  'a stale resolution cannot close a later report cycle');
select is((select count(*)::int from public.social_reports
    where kind = 'post' and content_id = :'post' and resolved_at is null), 1,
  'one report in a new revision starts a separate unresolved cycle');
select is((select quarantined from public.social_posts where id = :'post'), false,
  'resolved reports do not count toward a later quarantine threshold');

select set_config('request.jwt.claims', json_build_object('sub', :'fresh', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_social_content('post', :'post', 'dangerous');
reset role;
select is((select count(*)::int from public.social_reports
    where kind = 'post' and content_id = :'post' and content_revision = :reopened_revision and resolved_at is null), 2,
  'two reports on the current revision remain below the threshold');
select is((select quarantined from public.social_posts where id = :'post'), false,
  'two reports in the new cycle do not quarantine content');

select set_config('request.jwt.claims', json_build_object('sub', :'frank', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_social_content('post', :'post', 'inappropriate');
reset role;
select is((select quarantined from public.social_posts where id = :'post'), true,
  'three reports on the current revision quarantine the content again');
select revision as second_quarantined_revision from public.social_posts where id = :'post' \gset
select is(public.resolve_social_report('post', :'post', 'approved', null, :second_quarantined_revision, '"fixture-etag"'), true,
  'a moderator can resolve the later report cycle');
select is((select count(*)::int from public.social_reports where kind = 'post' and content_id = :'post'), 6,
  'multiple resolved report cycles remain available for audit');
select is((select count(distinct content_revision)::int from public.social_reports
    where kind = 'post' and content_id = :'post'), 2,
  'report audit rows retain the target revision from each cycle');
select is((select count(*)::int from public.social_reports
    where kind = 'post' and content_id = :'post' and resolved_at is null), 0,
  'resolving the later cycle closes only after a successful target update');

-- Media references are revocable even though snapshot words are immutable.
update public.food_logs set photo_path = 'meals/' || :'alice' || '/replacement.jpg' where id = :'entry';
select is((select photo_path from public.social_posts where id = :'post'), null,
  'source photo replacement detaches the previously published object');
select is((select food_name from public.social_posts where id = :'post'), 'Fixture nasi lemak',
  'photo detachment does not rewrite snapshot words');
select is((select icon_name from public.social_posts where id = :'post'), 'nasi-lemak',
  'a detached photo retains the food drawing');

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.delete_social_comment(:'comment');
select is((select count(*)::int from public.social_comments where id = :'comment'), 0,
  'the post author can remove a reviewed comment on their post');
select public.create_social_post(:'second_entry', '', 'public') as second_post \gset
select public.delete_social_post(:'second_post');
select is((select count(*)::int from public.food_logs where id = :'second_entry'), 1,
  'deleting a post preserves the logged meal');
delete from public.food_logs where id = :'entry';
reset role;
select is((select count(*)::int from public.social_posts where id = :'post'), 0,
  'deleting the source diary entry removes its post');
select is((select count(*)::int from public.social_likes where post_id = :'post'), 0,
  'source deletion cascades likes');
select is((select count(*)::int from public.social_notifications where post_id = :'post'), 0,
  'source deletion removes dependent activity rather than retaining copied text');
select is((select count(*)::int from public.social_reports where kind = 'post' and content_id = :'post'), 0,
  'source deletion removes orphaned reports');
select is((select count(*)::int from public.social_counters where entity_id = :'post'), 0,
  'post deletion cascades cannot recreate orphaned interaction counters');
select is((select coalesce(sum(value), 0)::bigint from public.social_counters where entity_id = :'alice' and metric = 'posts'), 0::bigint,
  'source and post deletions reconcile the author''s approved publication count');

-- Schema privileges are part of the API, including functions Postgres otherwise
-- grants to PUBLIC by default. Anon should gain no social route by inheritance.
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like '%social%'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
), 'anonymous callers cannot invoke any social RPC or private helper');
select ok(not has_table_privilege('authenticated', 'public.social_counters', 'UPDATE'),
  'clients cannot edit derived social counters');
select ok(not has_table_privilege('authenticated', 'public.social_follows', 'INSERT'),
  'clients cannot bypass follow serialization with direct graph inserts');
select ok(not has_table_privilege('authenticated', 'public.social_likes', 'INSERT'),
  'clients cannot bypass transactional likes and activity');
select ok(not exists(select 1 from public.social_counters where shard < 0 or shard > 31 or value < 0),
  'counter shards remain in their fixed range and never go negative');

insert into public.social_follows (follower_id, followed_id) values (:'dan', :'alice'), (:'alice', :'eve');
insert into public.social_posts (author_id, source_entry_id, food_name, review_status)
values (:'alice', :'second_entry', 'Account cascade fixture', 'approved');
delete from auth.users where id = :'alice';
select is((select count(*)::int from public.social_profiles where user_id = :'alice'), 0,
  'account deletion cascades public identity');
select is((select count(*)::int from public.social_notifications where recipient_id = :'alice' or actor_id = :'alice'), 0,
  'account deletion cascades inbound and outbound activity');
select is((select count(*)::int from public.social_counters where entity_id = :'alice'), 0,
  'account deletion leaves no profile counters');

-- A cascade finds its rows through an index only if the key leads one whose
-- predicate the cascade's own `col = $1` implies. Activity once had post and
-- comment indexes partial on `kind`, so every deletion scanned the whole table.
select is(array(
  select c.conrelid::regclass::text || '.' || a.attname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and c.conrelid::regclass::text like 'social\_%'
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
        and (i.indpred is null
          or pg_get_expr(i.indpred, i.indrelid) = format('(%I IS NOT NULL)', a.attname))
    )
  order by 1
), '{}'::text[], 'every social foreign key leads an index its cascade can use');
select is((select c.collname::text from pg_attribute a join pg_collation c on c.oid = a.attcollation
    where a.attrelid = 'public.social_profiles'::regclass and a.attname = 'handle'), 'C',
  'handles sort in byte order, so one unique index bounds every search page');

select * from finish();
rollback;
