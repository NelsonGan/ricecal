-- Public media, report targets and activity each need their own direct-read
-- checks. A correctly filtered feed does not prove these other routes safe.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set alice 'a8500000-0000-4000-8000-000000000001'
\set bob   'a8500000-0000-4000-8000-000000000002'
\set carol 'a8500000-0000-4000-8000-000000000003'
\set dan   'a8500000-0000-4000-8000-000000000004'
\set fresh 'a8500000-0000-4000-8000-000000000005'
\set entry 'a8510000-0000-4000-8000-000000000001'
\set post 'a8520000-0000-4000-8000-000000000001'
\set comment 'a8530000-0000-4000-8000-000000000001'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       id::text || '@visibility.example.test', '{}', '{}'
from unnest(array[:'alice'::uuid, :'bob'::uuid, :'carol'::uuid, :'dan'::uuid, :'fresh'::uuid]) id;
update public.profiles p set handle = v.handle, display_name = v.name,
  social_joined_at = now(), review_status = 'approved',
  avatar_path = v.avatar_path, photo_etag = v.photo_etag
from (values (:'alice'::uuid, 'visibility_alice', 'Alice fixture', 'avatars/' || :'alice' || '/fixture.jpg', '"avatar-etag"'),
             (:'bob'::uuid, 'visibility_bob', 'Bob fixture', null, null),
             (:'carol'::uuid, 'visibility_carol', 'Carol fixture', null, null),
             (:'dan'::uuid, 'visibility_dan', 'Dan fixture', null, null)) v(id, handle, name, avatar_path, photo_etag)
where p.id = v.id;
update public.profiles set review_status = 'approved', photo_etag = case when id = :'alice' then '"avatar-etag"' end
where id in (:'alice', :'bob', :'carol', :'dan');
insert into public.blocked_authors (user_id, author_id)
select viewer, p.user_id from unnest(array[:'alice'::uuid, :'bob'::uuid, :'carol'::uuid, :'dan'::uuid, :'fresh'::uuid]) viewer
cross join public.social_profiles p
where p.user_id not in (:'alice', :'bob', :'carol', :'dan', :'fresh');
insert into public.food_logs
  (id, user_id, item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, serving_label, serving_factor, photo_path)
values (:'entry', :'alice', 'Visible rice', 200, 44, 4, 1, '1 bowl', 1, 'meals/' || :'alice' || '/fixture.jpg');
insert into public.social_posts
  (id, author_id, source_entry_id, food_name, review_status, photo_path, photo_etag)
values (:'post', :'alice', :'entry', 'Visible rice', 'approved', 'meals/' || :'alice' || '/fixture.jpg', '"meal-etag"');
insert into public.social_comments (id, post_id, author_id, request_id, body, review_status)
values (:'comment', :'post', :'carol', gen_random_uuid(), 'A public comment', 'approved');

select set_config('request.jwt.claims', json_build_object('sub', :'fresh', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_post(:'post')), 1,
  'an account can browse before opting into a public identity');
select is((select count(*)::int from public.social_suggestions() where user_id = :'alice'), 1,
  'suggestions work for a new account with no graph');
select is((select count(*)::int from public.social_profiles where user_id = :'fresh'), 1,
  'a new account can view its own social identity without a handle');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'alice' || '/fixture.jpg'])), 1,
  'a visible post authorizes its exact reviewed photo key');
select is((select photo_etag from public.social_photo_claims(array['meals/' || :'alice' || '/fixture.jpg'])), '"meal-etag"',
  'photo claims carry the validator for the reviewed bytes');
select is((select count(*)::int from public.social_photo_claims(array['avatars/' || :'alice' || '/fixture.jpg'])), 1,
  'an approved public identity authorizes its selected avatar');
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'alice' || '/private.jpg'])), 0,
  'knowing an author prefix does not authorize other diary photographs');
select is((select count(*)::int from public.social_photo_claims(array[
  'meals/' || :'alice' || '/fixture.jpg', 'meals/' || :'alice' || '/fixture.jpg'])), 1,
  'duplicate photo keys return one authorization claim');
select throws_ok($q$select * from public.social_photo_claims(array[]::text[])$q$, '22023', null,
  'an empty photo batch is rejected');
select throws_ok($q$select * from public.social_photo_claims(array[null]::text[])$q$, '22023', null,
  'a null key cannot bypass media validation');
select throws_ok($q$select * from public.social_photo_claims(array_fill('x'::text, array[101]))$q$, '22023', null,
  'media authorization has a bounded batch size');
select throws_ok(format('select source_entry_id from public.social_posts where id = %L', :'post'), '42501', null,
  'a raw public post read cannot expose the private source diary ID');
select throws_ok(format('select request_id from public.social_comments where id = %L', :'comment'), '42501', null,
  'a raw public comment read cannot expose client retry tokens');
select is(public.social_entry_post(:'entry'), null,
  'the private diary-to-post lookup only answers its owner');
select ok(not (select to_jsonb(p) ?| array['source_entry_id','request_id','note','email','photo_etag'] from public.social_post(:'post') p),
  'feed DTOs expose only intentional public fields');
select public.set_social_follow(:'alice', true);
select public.set_social_like(:'post', true);
select is((select count(*)::int from public.social_suggestions() where user_id in (:'alice', :'bob')), 0,
  'suggestions exclude the viewer and existing follows');
select is((select count(*)::int from private.social_suggestion_candidates(12) where user_id in (:'alice', :'bob')), 0,
  'the privileged suggestion selector also excludes self and existing follows');
reset role;
insert into public.blocked_authors (user_id, author_id) values (:'carol', :'bob');
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from private.social_suggestion_candidates(12) where user_id = :'carol'), 0,
  'the privileged suggestion selector respects a block made by the other account');
reset role;
delete from public.blocked_authors where user_id = :'carol' and author_id = :'bob';
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select array_agg(handle) from public.social_search_profiles('visibility_', p_limit => 2)),
  array['visibility_alice','visibility_bob','visibility_carol'], 'handle search uses a total order and sentinel');
select is((select array_agg(handle) from public.social_search_profiles('visibility_', p_after_handle => 'visibility_bob', p_limit => 2)),
  array['visibility_carol','visibility_dan'], 'handle search continues after the supplied handle');
select throws_ok($q$select * from public.social_search_profiles('%')$q$, '22023', null,
  'a wildcard cannot turn a handle lookup into an unbounded substring query');
insert into public.blocked_authors (user_id, author_id) values (:'bob', :'fresh');
select is((select count(*)::int from public.social_blocked_profiles() where user_id = :'fresh'), 1,
  'a legacy recipe block remains manageable when its author has no public social profile');
select ok((select handle ~ '^[a-z0-9_.]{3,24}$' from public.social_blocked_profiles()
  where user_id = :'fresh'), 'a block list shows the assigned handle of a discoverable account');
select is((select avatar_path from public.social_blocked_profiles() where user_id = :'fresh'), null,
  'a legacy block exposes no private avatar');
delete from public.blocked_authors where user_id = :'bob' and author_id = :'fresh';
select is((select count(*)::int from public.social_blocked_profiles() where user_id = :'fresh'), 0,
  'the legacy recipe block can be removed from the social block list');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select is(public.social_entry_post(:'entry'), :'post'::uuid,
  'the owner can find the post belonging to a historical logged meal');
select ok(public.social_unread_notification_count() > 0,
  'visible interactions create unread activity for the recipient');
select is(public.social_unread_notification_count(),
  (select count(*)::integer from public.social_notifications()),
  'the badge counts every visible unread activity row');
select array_agg(id)::text as activity_ids from public.social_notifications() \gset
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.mark_social_notifications_read(:'activity_ids'::uuid[]);
reset role;
select is((select count(*)::int from public.social_notifications where recipient_id = :'alice' and read_at is not null), 0,
  'another account cannot mark a recipient''s activity read');
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.mark_social_notifications_read(:'activity_ids'::uuid[]);
select is(public.social_unread_notification_count(), 0,
  'marking the recipient''s own activity clears the unread count');
select throws_ok($q$select public.mark_social_notifications_read(array_fill(gen_random_uuid(), array[101]))$q$,
  '22023', null, 'activity updates are bounded to 100 IDs');
reset role;

-- Comment reports cannot expose their reporters or leave a stale count/activity.
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_social_content('comment', :'comment', 'spam');
select is((select count(*)::int from public.social_comments where id = :'comment'), 0,
  'a reported comment disappears only for its reporter before threshold');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'dan', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_social_content('comment', :'comment', 'spam');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_social_content('comment', :'comment', 'spam');
reset role;
select is((select quarantined from public.social_comments where id = :'comment'), true,
  'three comment reports quarantine the comment');
select is((select coalesce(sum(value), 0)::bigint from public.social_counters where entity_id = :'post' and metric = 'comments'), 0::bigint,
  'quarantined comments are removed from approved comment counts');
select is((select count(*)::int from public.social_notifications where comment_id = :'comment'), 1,
  'quarantining a comment retains its activity audit row');
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_notifications() where comment_id = :'comment'), 0,
  'quarantined comment activity is hidden from its recipient');
reset role;
update public.social_notifications set read_at = null where comment_id = :'comment';
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select is(public.social_unread_notification_count(), 0,
  'hidden activity does not contribute to the unread badge');
reset role;

-- A report on a profile governs all surfaces, including direct photo requests.
select set_config('request.jwt.claims', json_build_object('sub', :'bob', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_social_content('profile', :'alice', 'spam');
select is((select count(*)::int from public.social_post(:'post')), 0,
  'reporting a profile hides that author''s direct post reads');
select is((select count(*)::int from private.social_feed_candidates('following', null, null, 50) where id = :'post'), 0,
  'the privileged selector excludes posts from a reported followed profile');
select is((select count(*)::int from public.social_photo_claims(array[
  'avatars/' || :'alice' || '/fixture.jpg', 'meals/' || :'alice' || '/fixture.jpg'])), 0,
  'reporting a profile revokes both public avatar and post media authorization');
select is((select count(*)::int from public.social_search_profiles('visibility_alice')), 0,
  'a reported profile is hidden from handle search');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'carol', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_social_content('profile', :'alice', 'spam');
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'dan', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.report_social_content('profile', :'alice', 'spam');
reset role;
select is((select quarantined from public.profiles where id = :'alice'), true,
  'three independent profile reports quarantine the identity');
select set_config('request.jwt.claims', json_build_object('sub', :'fresh', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_post(:'post')), 0,
  'a quarantined profile hides its posts from unrelated accounts');
select is((select count(*)::int from private.social_feed_candidates('discover', null, null, 50) where id = :'post'), 0,
  'the privileged selector excludes quarantined profile posts before returning IDs');
select is((select count(*)::int from private.social_suggestion_candidates(12) where user_id = :'alice'), 0,
  'the privileged suggestion selector excludes a quarantined identity');
reset role;

select revision as profile_revision from public.profiles where id = :'alice' \gset
select throws_ok(format('select public.resolve_social_report(%L, %L, %L, null, %s)',
  'profile', :'alice', 'approved', :profile_revision), '22023', null,
  'a moderator cannot approve a public avatar without its reviewed byte validator');
select throws_ok(format('select public.resolve_social_report(%L, %L, %L, null, %s, %L)',
  'profile', :'alice', 'approved', :profile_revision, 'unquoted-etag'), '22023', null,
  'an unquoted value cannot become a reviewed object ETag');
select public.resolve_social_report('profile', :'alice', 'approved', null, :profile_revision, '"avatar-etag"');
select is(public.resolve_social_report('profile', :'alice', 'approved', null, :profile_revision, '"old-etag"'), false,
  'a stale moderator response cannot overwrite a newer resolution');

-- Retention writes null on the source, and public media stops being readable.
update public.food_logs set photo_path = null where id = :'entry';
select set_config('request.jwt.claims', json_build_object('sub', :'fresh', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_photo_claims(array['meals/' || :'alice' || '/fixture.jpg'])), 0,
  'photo retention immediately revokes the public photo claim');
reset role;

select is((select count(*)::int from public.subscriptions where user_id = :'alice'), 0,
  'social publication and moderation do not require a paid subscription');
select is((select count(*)::int from public.scan_usage where user_id = :'alice'), 0,
  'social interaction and review never consume scan allowance');

-- The badge stops at a bounded 99+ sentinel even when the history is larger.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select ('a8600000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'badge-' || n || '@visibility.example.test', '{}', '{}'
from generate_series(1, 101) n;
update public.profiles p set handle = 'badge_actor_' || n, display_name = 'Badge actor ' || n,
  social_joined_at = now()
from generate_series(1, 101) n
where p.id = ('a8600000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
update public.profiles set review_status = 'approved' where handle like 'badge_actor_%';
insert into public.social_notifications (recipient_id, actor_id, kind)
select :'alice', ('a8600000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'follow'
from generate_series(1, 101) n;
select set_config('request.jwt.claims', json_build_object('sub', :'alice', 'role', 'authenticated')::text, true);
set local role authenticated;
select is(public.social_unread_notification_count(), 100,
  'the unread badge returns its 99+ sentinel without counting an unbounded history');
reset role;

select * from finish();
rollback;
