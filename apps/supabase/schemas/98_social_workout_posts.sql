-- Workouts on the feed. Sharing them is on by default, unlike meals, but only
-- reaches someone who is already on the feed: a saved workout never makes a
-- public profile on its own, which is what a default that joined people up
-- would do to everyone who has never opened the Feed tab.
alter table public.profiles
  add column auto_post_workouts boolean not null default true;

grant update (auto_post_workouts) on public.profiles to authenticated;

-- The one way a workout post is made: `save_workout` for a new workout
-- (`p_auto`), and `create_social_workout_post` from its page. Both pass the
-- record count, scored where row security confines it to the author's sets.
--
-- An automatic post fails quietly, so a full posting budget or a profile under
-- review never fails the save of the workout itself; a shared one says why.
create or replace function private.social_insert_workout_post(
  p_workout_id uuid, p_records integer, p_caption text,
  p_audience public.social_audience, p_auto boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_private boolean := false;
  v_id uuid;
begin
  if p_auto then
    -- Lock the profile before the rate row, as sharing a meal does.
    select p.is_private into v_private from public.profiles p
    where p.id = v_user and p.auto_post_workouts and p.social_joined_at is not null
      and p.review_status = 'approved' and not p.quarantined
    for update;
    if not found then return null; end if;
  else
    v_user := private.social_require_user();
    -- Shared by hand, the sharer says who sees it, as for a meal. Defaulted
    -- below, a private profile's workout went public.
    if p_audience is null then
      raise exception 'Choose who sees the post' using errcode = '22023';
    end if;
  end if;

  -- An automatic post is for a workout that just happened. A past workout
  -- logged today from last month would otherwise top everyone's feed.
  perform 1 from public.workouts w
  where w.id = p_workout_id and w.user_id = v_user
    and (not p_auto or w.ended_at > now() - interval '24 hours')
  for share;
  if not found then
    if p_auto then return null; end if;
    raise exception 'Workout unavailable' using errcode = '42501';
  end if;

  select p.id into v_id from public.social_posts p
  where p.source_workout_id = p_workout_id and p.author_id = v_user;
  if found then return v_id; end if;

  if not private.social_claim(v_user, 'post', 30) then
    if p_auto then return null; end if;
    raise exception 'Try again later' using errcode = 'P0001';
  end if;

  insert into public.social_posts (
    author_id, kind, source_workout_id, workout_records, caption, audience,
    review_status, published_at
  ) values (
    v_user, 'workout', p_workout_id, least(greatest(coalesce(p_records, 0), 0), 32767),
    btrim(coalesce(p_caption, '')),
    coalesce(p_audience, case when v_private then 'followers'::public.social_audience
                              else 'public'::public.social_audience end),
    'approved', now()
  )
  on conflict (source_workout_id) do nothing
  returning id into v_id;
  if v_id is null then
    select p.id into v_id from public.social_posts p
    where p.source_workout_id = p_workout_id and p.author_id = v_user;
  end if;
  return v_id;
end;
$$;
revoke execute on function private.social_insert_workout_post from public, anon;
grant execute on function private.social_insert_workout_post to authenticated, service_role;

-- Share a workout from its page. Invoker, so the record count is this
-- account's own scoring; the insert itself is the private function's.
create or replace function public.create_social_workout_post(
  p_workout_id uuid, p_caption text, p_audience public.social_audience
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_records integer; v_id uuid;
begin
  -- Already shared: answered before the record count, which scores the
  -- whole history.
  v_id := public.social_workout_post(p_workout_id);
  if v_id is not null then return v_id; end if;
  select s.pr_count into v_records from public.workout_summaries s where s.id = p_workout_id;
  if not found then raise exception 'Workout unavailable' using errcode = '42501'; end if;
  return private.social_insert_workout_post(p_workout_id, v_records, p_caption, p_audience, false);
end;
$$;
revoke execute on function public.create_social_workout_post from public, anon;
grant execute on function public.create_social_workout_post to authenticated, service_role;

-- A workout post's workout as its own page draws it, for a tap on the card in
-- the feed: every exercise and set, in the rows group_workout_detail hands a
-- group, under the post's own visibility rather than a group's. A post can
-- reach strangers, so this is less than a group reads: never the notes, the
-- heart rate, nor the burn or a bodyweight set's load, which are worked out
-- from the owner's weight (the total volume is the card's own figure). The
-- records are the count taken when it was posted, as the card draws them,
-- since scoring them here would read the owner's whole history.
create or replace function public.social_workout_post_detail(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_workout uuid; v_author uuid; v_records integer;
begin
  select p.source_workout_id, p.author_id, p.workout_records into v_workout, v_author, v_records
  from public.social_posts p
  where p.id = p_post_id and p.kind = 'workout' and private.social_can_view_post(p.id);
  if v_workout is null or not exists (
    select 1 from public.workouts w where w.id = v_workout and w.user_id = v_author) then
    raise exception 'Post unavailable' using errcode = '42501', hint = 'post_gone';
  end if;
  return jsonb_build_object(
    'owner', (select jsonb_build_object('id', a.user_id,
        'name', coalesce(nullif(btrim(a.display_name), ''), a.handle), 'handle', a.handle,
        'avatar_path', case when a.review_status = 'approved' and not a.quarantined then a.avatar_path end,
        'is_pro', private.social_is_pro(a.user_id))
      from private.social_profiles a where a.user_id = v_author),
    'records', coalesce(v_records, 0),
    'summary', (
      select jsonb_build_object('id', w.id, 'user_id', w.user_id, 'name', w.name, 'notes', null,
        'started_at', w.started_at, 'ended_at', w.ended_at, 'duration_s', w.duration_s,
        'log_date', w.log_date, 'routine_id', null, 'kcal', null, 'health_workout_id', null,
        'set_count', (select count(*) from public.workout_set_values v where v.workout_id = w.id),
        'volume_kg', coalesce((select sum(v.volume_kg) from public.workout_set_values v where v.workout_id = w.id), 0),
        'exercises', '[]'::jsonb)
      from public.workouts w where w.id = v_workout),
    'exercises', coalesce((
      select jsonb_agg(to_jsonb(e) - 'notes' || jsonb_build_object('notes', null) order by e.position)
      from public.workout_exercises e where e.workout_id = v_workout), '[]'::jsonb),
    -- Field by field rather than the whole row: a bodyweight exercise's load is
    -- the owner's own weigh-in, so neither it nor the volume made from it goes.
    'sets', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'workout_exercise_id', v.workout_exercise_id,
          'exercise_id', v.exercise_id, 'exercise_position', v.exercise_position, 'position', v.position,
          'kind', v.kind, 'weight_kg', v.weight_kg, 'reps', v.reps, 'duration_s', v.duration_s,
          'distance_m', v.distance_m, 'rpe', v.rpe,
          'volume_kg', case when v.tracking = 'weight_reps' then v.volume_kg end,
          'e1rm_kg', v.e1rm_kg) order by v.exercise_position, v.position)
      from public.workout_set_values v where v.workout_id = v_workout), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.social_workout_post_detail from public, anon;
grant execute on function public.social_workout_post_detail to authenticated, service_role;
