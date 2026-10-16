begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\set owner 'a8900000-0000-4000-8000-000000000001'
\set reader 'a8900000-0000-4000-8000-000000000002'
\set stranger 'a8900000-0000-4000-8000-000000000003'
\set lurker 'a8900000-0000-4000-8000-000000000004'
\set fresh 'a8910000-0000-4000-8000-000000000001'
\set again 'a8910000-0000-4000-8000-000000000002'
\set imported 'a8910000-0000-4000-8000-000000000003'
\set old 'a8910000-0000-4000-8000-000000000004'
\set unshared 'a8910000-0000-4000-8000-000000000005'
\set lurking 'a8910000-0000-4000-8000-000000000006'
\set budget 'a8910000-0000-4000-8000-000000000007'
\set held 'a8910000-0000-4000-8000-000000000008'

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  id::text || '@workout-post.example.test', '{}', '{}'
from unnest(array[:'owner'::uuid, :'reader'::uuid, :'stranger'::uuid, :'lurker'::uuid]) id;

-- Three of them are on the feed; the lurker has never opened it.
update public.profiles set social_joined_at = now(), review_status = 'approved'
where id in (:'owner', :'reader', :'stranger');
insert into public.social_follows (follower_id, followed_id) values (:'reader', :'owner');

select is((select auto_post_workouts from public.profiles where id = :'owner'), true,
  'sharing workouts is on by default');

-- A workout document as the app sends it, ending a minute ago unless told.
create function pg_temp.workout(p_id uuid, p_name text, p_ended timestamptz default now() - interval '1 minute',
  p_post boolean default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'name', p_name, 'notes', 'Knee felt off',
    'started_at', p_ended - interval '1 hour', 'ended_at', p_ended,
    'log_date', (p_ended - interval '1 hour')::date,
    'exercises', jsonb_build_array(
      jsonb_build_object('exercise_id', 'barbell-bench-press', 'exercise_name', 'Bench Press (Barbell)',
        'tracking', 'weight_reps', 'sets', jsonb_build_array(
          jsonb_build_object('kind', 'warmup', 'weight_kg', 20, 'reps', 10),
          jsonb_build_object('kind', 'normal', 'weight_kg', 60, 'reps', 8))),
      jsonb_build_object('exercise_id', 'barbell-squat', 'exercise_name', 'Squat (Barbell)',
        'tracking', 'weight_reps', 'sets', jsonb_build_array(
          jsonb_build_object('kind', 'normal', 'weight_kg', 100, 'reps', 5))))
  ) || case when p_post is null then '{}'::jsonb else jsonb_build_object('post', p_post) end;
$$;
grant execute on function pg_temp.workout to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.save_workout(pg_temp.workout(:'fresh', 'Push day'));
reset role;
select is((select count(*)::int from public.social_posts where source_workout_id = :'fresh'), 1,
  'a new workout from someone on the feed is posted');
select is((select kind::text || '/' || audience::text from public.social_posts where source_workout_id = :'fresh'),
  'workout/public', 'it is a public workout post from a discoverable profile');
select is((select workout_records::int from public.social_posts where source_workout_id = :'fresh'),
  (select pr_count::int from public.workout_summaries where id = :'fresh'),
  'the post carries the workout''s record count');

set local role authenticated;
select public.save_workout(pg_temp.workout(:'fresh', 'Push day, edited'));
reset role;
select is((select count(*)::int from public.social_posts where source_workout_id = :'fresh'), 1,
  'saving the same workout again does not post it twice');

set local role authenticated;
select public.save_workout(pg_temp.workout(:'imported', 'From Strong', p_post => false));
select public.save_workout(pg_temp.workout(:'old', 'Last month', now() - interval '30 days'));
reset role;
select is((select count(*)::int from public.social_posts where source_workout_id in (:'imported', :'old')), 0,
  'an import and a workout that ended long ago are not posted');

set local role authenticated;
update public.profiles set auto_post_workouts = false where id = :'owner';
select public.save_workout(pg_temp.workout(:'unshared', 'Quiet day'));
reset role;
select is((select count(*)::int from public.social_posts where source_workout_id = :'unshared'), 0,
  'turning sharing off stops the automatic post');

select set_config('request.jwt.claims', json_build_object('sub', :'lurker', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.save_workout(pg_temp.workout(:'lurking', 'First workout'));
reset role;
select is((select count(*)::int from public.social_posts where source_workout_id = :'lurking'), 0,
  'a workout never puts someone who is not on the feed onto it');
select ok((select social_joined_at is null from public.profiles where id = :'lurker'),
  'and leaves their profile off the feed');

-- Sharing by hand.
select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;
select isnt(public.create_social_workout_post(:'old', 'Throwback', 'followers'), null,
  'an older workout can be shared by hand');
select is(public.create_social_workout_post(:'old', 'Again', 'public')::text,
  public.social_workout_post(:'old')::text, 'sharing it again returns the same post');
reset role;
select is((select audience::text from public.social_posts where source_workout_id = :'old'), 'followers',
  'the audience chosen when it was shared stands');
select is(private.social_count(:'owner', 'posts'), 0::bigint,
  'workout posts stay out of the post count an app from before them draws over its meals');

set local role authenticated;
select throws_ok(format('select public.create_social_workout_post(%L, %L, null)', :'unshared', ''),
  '22023', null, 'a workout shared by hand says who sees it, rather than going public');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'stranger', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(format('select public.create_social_workout_post(%L, %L, %L)', :'unshared', '', 'public'),
  '42501', null, 'nobody can share another account''s workout');

-- Reading. A food-only default keeps apps from before workout posts safe.
select is((select count(*)::int from public.social_feed(p_mode => 'discover')), 0,
  'the feed returns only meals unless asked for workouts');
select is((select count(*)::int from public.social_feed(p_mode => 'discover', p_kinds => '{food,workout}')), 1,
  'asked for workouts, a stranger sees the public one');
select is((select workout_name || '|' || workout_sets || '|' || workout_volume_kg || '|' || jsonb_array_length(workout_exercises)
  from public.social_feed(p_mode => 'discover', p_kinds => '{workout}')),
  'Push day, edited|3|1180.00|2', 'a post reads the workout as it is now');
select is((select count(*)::int from public.social_post(:'old'::uuid)), 0,
  'one post is food-only by default too');
select is(public.social_workout_count(:'owner'), 1,
  'a stranger counts only the workouts they can see');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', :'reader', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.social_profile_posts(:'owner', p_kinds => '{workout}')), 2,
  'a follower sees the public and the followers-only workout');
select is(public.social_workout_count(:'owner'), 2, 'and counts both');
select is((select count(*)::int from public.social_profile_posts(:'owner')), 0,
  'a profile''s posts are meals only unless workouts are asked for');
reset role;

-- An automatic post never costs the save.
update public.profiles set auto_post_workouts = true where id = :'owner';
insert into public.social_rate_limits (user_id, action, bucket, used)
values (:'owner', 'post', date_trunc('hour', now()), 30)
on conflict (user_id, action) do update set bucket = excluded.bucket, used = excluded.used;
select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok(format('select public.save_workout(pg_temp.workout(%L, %L))', :'budget', 'Spent'),
  'a save lands when the hour''s posting budget is spent');
reset role;
select is((select count(*)::int from public.social_posts where source_workout_id = :'budget'), 0,
  'and posts nothing');
delete from public.social_rate_limits where user_id = :'owner';
update public.profiles set quarantined = true where id = :'owner';
set local role authenticated;
select lives_ok(format('select public.save_workout(pg_temp.workout(%L, %L))', :'held', 'Held'),
  'a save lands while the profile is held for review');
reset role;
select is((select count(*)::int from public.social_posts where source_workout_id = :'held'), 0,
  'and posts nothing');
update public.profiles set quarantined = false where id = :'owner';

-- The count restates `social_can_view_post` to ask about the author once, so
-- hold it to that for every viewer, with one post the stranger reported and
-- one still in review.
insert into public.social_reports (kind, content_id, content_revision, reporter_id, reason)
select 'post', id, 1, :'stranger', 'spam' from public.social_posts where source_workout_id = :'fresh';
update public.social_posts set review_status = 'pending' where source_workout_id = :'old';
create function pg_temp.count_agrees(p_viewer uuid, p_author uuid) returns boolean
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_viewer, 'role', 'authenticated')::text, true);
  return public.social_workout_count(p_author) = (
    select count(*)::integer from public.social_posts p
    where p.author_id = p_author and p.kind = 'workout' and private.social_can_view_post(p.id));
end;
$$;
select ok(bool_and(pg_temp.count_agrees(viewer, :'owner')),
  'the workout count agrees with what each viewer can open')
from unnest(array[:'owner'::uuid, :'reader'::uuid, :'stranger'::uuid, :'lurker'::uuid]) viewer;
select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
select is(public.social_workout_count(:'owner'), 2, 'the author counts a post still in review');
select set_config('request.jwt.claims', json_build_object('sub', :'stranger', 'role', 'authenticated')::text, true);
select is(public.social_workout_count(:'owner'), 0, 'and a stranger counts neither that nor the one they reported');

-- A deleted workout takes its post with it.
delete from public.workouts where id = :'fresh';
select is((select count(*)::int from public.social_posts where source_workout_id = :'fresh'), 0,
  'deleting a workout deletes its post');

-- The table holds the line on its own.
select throws_ok(format(
  'insert into public.social_posts (author_id, kind, source_workout_id, food_name, review_status) values (%L, %L, %L, %L, %L)',
  :'owner', 'workout', :'unshared', 'Rice', 'approved'), '23514', null,
  'a workout post cannot carry a meal');
select throws_ok(format(
  'insert into public.social_posts (author_id, kind, source_workout_id, review_status) values (%L, %L, %L, %L)',
  :'stranger', 'workout', :'unshared', 'approved'), '23503', null,
  'a post can only point at its author''s own workout');

select ok(not has_function_privilege('anon', 'public.create_social_workout_post(uuid,text,public.social_audience)', 'EXECUTE'),
  'anonymous callers cannot share a workout');
select ok(not has_function_privilege('anon', 'private.social_insert_workout_post(uuid,integer,text,public.social_audience,boolean)', 'EXECUTE'),
  'anonymous callers cannot reach the posting function');

select * from finish();
rollback;
