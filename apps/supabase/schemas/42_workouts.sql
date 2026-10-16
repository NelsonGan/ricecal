-- ---------------------------------------------------------------------------
-- Workouts the user logs in the app: the gym sessions recorded set by set on
-- the Workouts tab.
--
-- Not the same thing as `activity_sessions`, and the two are kept apart on
-- purpose. A session is what a health store says happened (a watch saw a run);
-- a workout is what the user wrote down (three sets of bench at 60 kg). A
-- workout can be SAVED to Apple Health, and then the store holds a copy of it,
-- but the store has no idea what a set is, so the record of the lifting lives
-- here and nowhere else.
--
-- Five tables:
--
--   custom_exercises   exercises the user named, beside the built-in catalogue
--   workout_routines   templates: the plan a workout starts from
--   workouts           one finished session
--   workout_exercises  the exercises in it, in order
--   workout_sets       the sets of each, in order
--
-- The built-in exercise catalogue is NOT a table. It is hard-coded in the app
-- (`features/workouts/catalogue.ts`) because every entry carries a drawing made
-- for it, and a row the server could add would arrive with no picture. So
-- `exercise_id` is a soft reference, exactly as `food_logs.food_id` is: a
-- catalogue id, or the uuid of one of the user's custom exercises, with no
-- constraint behind it. A saved exercise carries its own name and tracking, so
-- a workout still reads correctly after either side changes.
--
-- A workout is written whole, by `save_workout`, and never a row at a time.
-- The logger keeps an in-progress workout on the phone until it is finished,
-- because a gym is where the signal is worst and a set must never depend on a
-- request landing. Finishing sends the whole thing as one document, keyed by an
-- id the phone minted, so a retry after a dropped connection converges on one
-- workout instead of two.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Custom exercises.
-- ---------------------------------------------------------------------------

create table public.custom_exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  tracking    public.exercise_tracking not null default 'weight_reps',
  -- The catalogue's own vocabularies (`EQUIPMENT`, `CATEGORIES`). Text rather
  -- than enums because they belong to the app's catalogue, which can grow a
  -- value in a release without a migration.
  equipment   text not null default 'other' check (char_length(equipment) between 1 and 40),
  category    text not null default 'fullBody' check (char_length(category) between 1 and 40),
  -- `{"chest": 0.6, "triceps": 0.4}`, the same shape the catalogue uses, so a
  -- custom exercise takes part in the muscle split like any other.
  -- Bounded in bytes as well as shape: on the free plan a full database goes
  -- read-only for everyone, and one request could otherwise write megabytes.
  muscles     jsonb not null default '{}'::jsonb
                check (jsonb_typeof(muscles) = 'object' and octet_length(muscles::text) <= 4096),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Two custom exercises with the same name are one exercise typed twice.
create unique index custom_exercises_user_name_key
  on public.custom_exercises (user_id, lower(btrim(name)));

create trigger custom_exercises_set_updated_at
  before update on public.custom_exercises
  for each row execute function public.set_updated_at();

alter table public.custom_exercises enable row level security;

grant select, insert, update, delete on public.custom_exercises to authenticated;
grant select, insert, update, delete on public.custom_exercises to service_role;

create policy "custom_exercises: read own"
  on public.custom_exercises for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "custom_exercises: insert own"
  on public.custom_exercises for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "custom_exercises: update own"
  on public.custom_exercises for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "custom_exercises: delete own"
  on public.custom_exercises for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- 2. Routines.
--
-- A routine is a plan, so its exercises are one jsonb document rather than two
-- more tables: nothing ever asks a question ACROSS routines ("every routine
-- with squats in it"), a routine is always read and written whole, and the
-- logger copies it into a workout as a whole. The shape is the logger's own:
--
--   [{ "exercise_id": "barbell-squat", "exercise_name": "Squat (Barbell)",
--      "tracking": "weight_reps", "rest_s": 120, "superset": null,
--      "notes": null,
--      "sets": [{ "kind": "warmup", "weight_kg": 40, "reps": 10 }, ...] }]
--
-- The weights in a routine are targets, and the logger shows the last time's
-- figures beside them, which is the comparison people actually use.
-- ---------------------------------------------------------------------------

create table public.workout_routines (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  notes         text check (char_length(notes) <= 1000),
  exercises     jsonb not null default '[]'::jsonb
                  check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 40
                         and octet_length(exercises::text) <= 65536),
  -- The built-in template this was copied from, if any. Kept so "already in
  -- your routines" can be said on the template screen.
  template_id   text check (char_length(template_id) <= 80),
  -- Lower first. The routines list is in the user's order, not by name.
  position      integer not null default 0,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- The target of `workouts.routine_id`, for the reason the workout's own
  -- children are keyed by owner too (see section 4).
  constraint workout_routines_id_user_key unique (id, user_id)
);

create index workout_routines_user_idx on public.workout_routines (user_id, position);

create trigger workout_routines_set_updated_at
  before update on public.workout_routines
  for each row execute function public.set_updated_at();

alter table public.workout_routines enable row level security;

grant select, insert, update, delete on public.workout_routines to authenticated;
grant select, insert, update, delete on public.workout_routines to service_role;

create policy "workout_routines: read own"
  on public.workout_routines for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "workout_routines: insert own"
  on public.workout_routines for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "workout_routines: update own"
  on public.workout_routines for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "workout_routines: delete own"
  on public.workout_routines for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- How many routines a free account may keep, enforced here for the reason the
-- recipe ceiling is (`free_recipe_limit` in 22_recipes.sql): the client writes
-- `workout_routines` directly, so a limit in the app would only apply to people
-- running the app. A template added to "My routines" and a workout saved as a
-- routine are inserts like any other, so neither is a way past it.
--
-- The message is a token the app matches on (`isRoutineLimit`) and words in the
-- user's language beside a paywall; `hint` is the readable half for a log.
create or replace function public.free_routine_limit()
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 3;
$$;

revoke execute on function public.free_routine_limit from public, anon;
grant execute on function public.free_routine_limit to authenticated, service_role;

create or replace function public.workout_routines_enforce_free_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_entitled(new.user_id) then
    return new;
  end if;

  if (
    select pg_catalog.count(*)
      from public.workout_routines r
     where r.user_id = new.user_id
  ) >= public.free_routine_limit() then
    raise exception 'routine_limit_reached'
      using errcode = 'P0001',
            hint = 'A free account may keep ' || public.free_routine_limit()
                   || ' routines. Pro removes the limit.';
  end if;

  return new;
end;
$$;

-- Stated here and applied by a hand-written line in the migration: `db diff`
-- does not carry grants.
revoke execute on function public.workout_routines_enforce_free_limit from public, anon, authenticated;

create trigger workout_routines_enforce_free_limit
  before insert on public.workout_routines
  for each row execute function public.workout_routines_enforce_free_limit();


-- ---------------------------------------------------------------------------
-- 3. The workout.
--
-- `id` has no default: the phone mints it when the workout STARTS, so the
-- document it keeps while the user trains already has the key the save will
-- use. That is what makes `save_workout` idempotent.
--
-- `log_date` is the local day the workout started, sent by the phone for the
-- reason `food_logs.log_date` is: an evening session that runs past midnight is
-- that evening's session.
--
-- The 24-hour ceiling is a sanity bound and not a product rule. A workout left
-- running for two days is a workout somebody forgot to finish, and the app asks
-- them when it actually ended before it saves; see "Finishing late" in the
-- README.
-- ---------------------------------------------------------------------------

create table public.workouts (
  id                 uuid primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 80),
  notes              text check (char_length(notes) <= 2000),
  started_at         timestamptz not null,
  ended_at           timestamptz not null,
  duration_s         integer generated always as (extract(epoch from (ended_at - started_at))::integer) stored,
  -- The phone's own date for the start, so within a day of the UTC one; a
  -- client sending 9999-12-31 put the workout on a calendar nobody reaches.
  log_date           date not null,
  routine_id         uuid,
  -- An estimate from the exercises' MET values and the user's weight, made on
  -- the phone at save time. It is what is written to Apple Health; nothing in
  -- the budget reads it, because the budget hears movement only from the
  -- health store. See "Workouts and the budget" in the README.
  kcal               integer check (kcal between 0 and 10000),
  -- The HKWorkout this was saved to Apple Health as, so an edit or a delete
  -- can replace or remove the copy. Null when it was not saved there.
  health_workout_id  text check (char_length(health_workout_id) <= 200),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint workouts_ends_after_start check (ended_at >= started_at),
  constraint workouts_at_most_a_day check (ended_at - started_at <= interval '24 hours'),
  constraint workouts_log_date_near_start check (
    log_date between (started_at at time zone 'UTC')::date - 1
                 and (started_at at time zone 'UTC')::date + 1
  ),
  -- Keyed by owner as well as id, so a workout can only name its own user's
  -- routine. Deleting the routine clears the column and keeps the workout.
  constraint workouts_routine_fkey foreign key (routine_id, user_id)
    references public.workout_routines (id, user_id) on delete set null (routine_id),
  -- The target of the composite foreign keys below.
  constraint workouts_id_user_key unique (id, user_id)
);

-- History, newest first, and a day's workouts on Today.
create index workouts_user_started_idx on public.workouts (user_id, started_at desc);
create index workouts_user_date_idx on public.workouts (user_id, log_date);
create index workouts_routine_idx on public.workouts (routine_id) where routine_id is not null;

create trigger workouts_set_updated_at
  before update on public.workouts
  for each row execute function public.set_updated_at();

alter table public.workouts enable row level security;

grant select, insert, update, delete on public.workouts to authenticated;
grant select, insert, update, delete on public.workouts to service_role;

create policy "workouts: read own"
  on public.workouts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "workouts: insert own"
  on public.workouts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "workouts: update own"
  on public.workouts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "workouts: delete own"
  on public.workouts for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- 4. The exercises in a workout.
--
-- The foreign key is (workout_id, user_id) rather than workout_id alone. A
-- foreign key check bypasses row security, so with the id alone a user could
-- attach rows of their own to somebody else's workout just by knowing its id.
-- The pair makes the database refuse any child whose owner is not the parent's.
-- ---------------------------------------------------------------------------

create table public.workout_exercises (
  id             uuid primary key default gen_random_uuid(),
  workout_id     uuid not null,
  user_id        uuid not null references auth.users (id) on delete cascade,
  position       smallint not null check (position between 0 and 99),
  exercise_id    text not null check (char_length(exercise_id) between 1 and 80),
  exercise_name  text not null check (char_length(btrim(exercise_name)) between 1 and 120),
  tracking       public.exercise_tracking not null,
  -- Exercises sharing a number are a superset: done back to back, resting
  -- after the last of them.
  superset       smallint check (superset between 0 and 99),
  rest_s         integer check (rest_s between 0 and 3600),
  notes          text check (char_length(notes) <= 1000),

  constraint workout_exercises_workout_fkey foreign key (workout_id, user_id)
    references public.workouts (id, user_id) on delete cascade,
  constraint workout_exercises_position_key unique (workout_id, position),
  constraint workout_exercises_id_user_key unique (id, user_id)
);

-- Every read of an exercise's history starts here.
create index workout_exercises_user_exercise_idx
  on public.workout_exercises (user_id, exercise_id);

alter table public.workout_exercises enable row level security;

-- No update: `save_workout` replaces a workout's exercises and sets whole.
grant select, insert, delete on public.workout_exercises to authenticated;
grant select, insert, delete on public.workout_exercises to service_role;

create policy "workout_exercises: read own"
  on public.workout_exercises for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "workout_exercises: insert own"
  on public.workout_exercises for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "workout_exercises: delete own"
  on public.workout_exercises for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- 5. The sets.
--
-- Every measurement is nullable, and which ones are filled is the exercise's
-- tracking: a bench press set has weight and reps, a plank has a duration, a
-- run has a distance and a duration. Weight is kilograms, always, and for an
-- assisted exercise it is the assistance (the machine taking that much off).
-- Only finished sets are saved: a set the user never ticked is not a set.
-- ---------------------------------------------------------------------------

create table public.workout_sets (
  id                   uuid primary key default gen_random_uuid(),
  workout_exercise_id  uuid not null,
  user_id              uuid not null references auth.users (id) on delete cascade,
  position             smallint not null check (position between 0 and 99),
  kind                 public.workout_set_kind not null default 'normal',
  weight_kg            numeric(6, 2) check (weight_kg between 0 and 1000),
  reps                 smallint check (reps between 0 and 1000),
  duration_s           integer check (duration_s between 0 and 86400),
  distance_m           numeric(9, 1) check (distance_m between 0 and 1000000),
  -- Rate of perceived exertion, 6 to 10 in half steps, as lifters use it.
  rpe                  numeric(3, 1) check (rpe between 1 and 10),

  constraint workout_sets_exercise_fkey foreign key (workout_exercise_id, user_id)
    references public.workout_exercises (id, user_id) on delete cascade,
  constraint workout_sets_position_key unique (workout_exercise_id, position)
);

create index workout_sets_user_idx on public.workout_sets (user_id);

alter table public.workout_sets enable row level security;

grant select, insert, delete on public.workout_sets to authenticated;
grant select, insert, delete on public.workout_sets to service_role;

create policy "workout_sets: read own"
  on public.workout_sets for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "workout_sets: insert own"
  on public.workout_sets for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "workout_sets: delete own"
  on public.workout_sets for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- Save a whole workout, atomically.
--
-- One document in, one workout out, replacing whatever was saved under the
-- same id. It is how a finished workout is saved, how an edited one is saved
-- again, and how a save that timed out is retried: the id was minted on the
-- phone, so a second arrival of the same document rewrites the same rows
-- instead of adding a twin.
--
-- Replace rather than diff. An edit can reorder, remove and add exercises and
-- sets all at once, and the children have no identity worth preserving: a set
-- is its position in its exercise.
--
-- `security invoker`, so every write below is checked by the same policies a
-- direct insert would be, and an id that belongs to another account fails the
-- update policy rather than being overwritten.
-- ---------------------------------------------------------------------------
create or replace function public.save_workout(p_workout jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user      uuid := (select auth.uid());
  v_id        uuid;
  v_exercise  jsonb;
  v_set       jsonb;
  v_ex_id     uuid;
  v_ex_pos    integer := 0;
  v_set_pos   integer;
  v_inserted  boolean;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_workout is null or jsonb_typeof(p_workout) <> 'object' then
    raise exception 'Expected a workout' using errcode = '22023';
  end if;
  if jsonb_typeof(p_workout -> 'exercises') is distinct from 'array' then
    raise exception 'Expected a list of exercises' using errcode = '22023';
  end if;
  if jsonb_array_length(p_workout -> 'exercises') > 60 then
    raise exception 'Too many exercises' using errcode = '22023';
  end if;

  v_id := (p_workout ->> 'id')::uuid;

  insert into public.workouts as w (
    id, user_id, name, notes, started_at, ended_at, log_date, routine_id, kcal, health_workout_id
  )
  values (
    v_id,
    v_user,
    btrim(p_workout ->> 'name'),
    nullif(btrim(p_workout ->> 'notes'), ''),
    (p_workout ->> 'started_at')::timestamptz,
    (p_workout ->> 'ended_at')::timestamptz,
    (p_workout ->> 'log_date')::date,
    -- A routine deleted while the workout was running is not an error: the
    -- workout still happened, it just no longer has a plan to point at.
    (select r.id from public.workout_routines r
      where r.id = (p_workout ->> 'routine_id')::uuid and r.user_id = v_user),
    (p_workout ->> 'kcal')::integer,
    nullif(p_workout ->> 'health_workout_id', '')
  )
  on conflict (id) do update set
    name = excluded.name,
    notes = excluded.notes,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    log_date = excluded.log_date,
    routine_id = excluded.routine_id,
    -- A workout the Apple Watch recorded keeps the energy it measured and
    -- the Health copy it saved (43_workout_heart_rates.sql). A save sent
    -- before the watch's trace landed, retried after it, or an older build
    -- editing the workout, would otherwise put the phone's estimate and no
    -- Health copy back over them.
    kcal = case
      when exists (select 1 from public.workout_heart_rates h
                    where h.workout_id = w.id and h.active_kcal is not null)
        then w.kcal
      else excluded.kcal
    end,
    health_workout_id = case
      when exists (select 1 from public.workout_heart_rates h where h.workout_id = w.id)
        then coalesce(w.health_workout_id, excluded.health_workout_id)
      else excluded.health_workout_id
    end
  where w.user_id = v_user
  -- A row with no previous version was inserted rather than updated: a retry
  -- or an edit of the same workout is not a new workout to post.
  returning (xmax = 0) into v_inserted;

  -- The `where` above makes a foreign id a silent no-op rather than an error,
  -- so check that the row really is ours before touching its children.
  if not exists (select 1 from public.workouts w where w.id = v_id and w.user_id = v_user) then
    raise exception 'Workout belongs to another account' using errcode = '42501';
  end if;

  delete from public.workout_exercises e where e.workout_id = v_id and e.user_id = v_user;

  for v_exercise in select value from jsonb_array_elements(p_workout -> 'exercises')
  loop
    if jsonb_typeof(v_exercise -> 'sets') is distinct from 'array' then
      raise exception 'Expected a list of sets' using errcode = '22023';
    end if;
    if jsonb_array_length(v_exercise -> 'sets') > 99 then
      raise exception 'Too many sets' using errcode = '22023';
    end if;
    -- An exercise with nothing done is not part of the workout, and one saved
    -- anyway blanked that exercise's PREVIOUS column the next time.
    if jsonb_array_length(v_exercise -> 'sets') = 0 then
      raise exception 'An exercise needs a set' using errcode = '22023';
    end if;

    insert into public.workout_exercises (
      workout_id, user_id, position, exercise_id, exercise_name, tracking, superset, rest_s, notes
    )
    values (
      v_id,
      v_user,
      v_ex_pos,
      v_exercise ->> 'exercise_id',
      btrim(v_exercise ->> 'exercise_name'),
      (v_exercise ->> 'tracking')::public.exercise_tracking,
      (v_exercise ->> 'superset')::smallint,
      (v_exercise ->> 'rest_s')::integer,
      nullif(btrim(v_exercise ->> 'notes'), '')
    )
    returning id into v_ex_id;

    v_set_pos := 0;
    for v_set in select value from jsonb_array_elements(v_exercise -> 'sets')
    loop
      -- A set with no number in it counted in every total of sets and muscles.
      if jsonb_typeof(v_set) is distinct from 'object'
        or num_nonnulls(v_set ->> 'weight_kg', v_set ->> 'reps', v_set ->> 'duration_s', v_set ->> 'distance_m') = 0
      then
        raise exception 'A set needs a number' using errcode = '22023';
      end if;
      insert into public.workout_sets (
        workout_exercise_id, user_id, position, kind, weight_kg, reps, duration_s, distance_m, rpe
      )
      values (
        v_ex_id,
        v_user,
        v_set_pos,
        coalesce((v_set ->> 'kind')::public.workout_set_kind, 'normal'),
        (v_set ->> 'weight_kg')::numeric,
        (v_set ->> 'reps')::smallint,
        (v_set ->> 'duration_s')::integer,
        (v_set ->> 'distance_m')::numeric,
        (v_set ->> 'rpe')::numeric
      );
      v_set_pos := v_set_pos + 1;
    end loop;

    v_ex_pos := v_ex_pos + 1;
  end loop;

  -- The routines list is ordered by use as well as by hand: "last done 3 days
  -- ago" is how somebody running a split knows which day is next.
  update public.workout_routines r
     set last_used_at = greatest(r.last_used_at, (p_workout ->> 'started_at')::timestamptz)
   where r.id = (p_workout ->> 'routine_id')::uuid and r.user_id = v_user;

  -- A new workout goes to the feed for someone who is on it and shares
  -- workouts, which is the default (98_social_workout_posts.sql). An import
  -- sends "post": false, since years of history at once is not news. The
  -- record count is taken here, where row security limits the scoring to this
  -- account's own sets; the posting function runs as its owner and would
  -- score every account's. Scoring reads the whole history, so the posting
  -- function's own checks (ended in the last day, a profile in good standing)
  -- are made first, and a workout that will not be posted is not scored.
  if v_inserted and coalesce((p_workout ->> 'post')::boolean, true)
     and (p_workout ->> 'ended_at')::timestamptz > now() - interval '24 hours'
     and exists (
       select 1 from public.profiles p
       where p.id = v_user and p.auto_post_workouts and p.social_joined_at is not null
         and p.review_status = 'approved' and not p.quarantined
     ) then
    perform private.social_insert_workout_post(
      v_id, (select s.pr_count from public.workout_summaries s where s.id = v_id), '', null, true
    );
  end if;

  return v_id;
end;
$$;

comment on function public.save_workout(jsonb) is
  'Writes a whole workout (exercises and sets included) under the id the phone '
  'minted, replacing any earlier save of the same id. Idempotent, so a retried '
  'save converges on one workout.';

revoke all on function public.save_workout(jsonb) from public, anon;
grant execute on function public.save_workout(jsonb) to authenticated;
