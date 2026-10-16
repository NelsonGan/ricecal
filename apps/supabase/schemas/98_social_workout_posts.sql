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
declare v_records integer;
begin
  select s.pr_count into v_records from public.workout_summaries s where s.id = p_workout_id;
  if not found then raise exception 'Workout unavailable' using errcode = '42501'; end if;
  return private.social_insert_workout_post(p_workout_id, v_records, p_caption, p_audience, false);
end;
$$;
revoke execute on function public.create_social_workout_post from public, anon;
grant execute on function public.create_social_workout_post to authenticated, service_role;
