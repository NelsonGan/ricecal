-- ---------------------------------------------------------------------------
-- Discrete workouts: a run, a badminton game, an hour in the gym.
--
-- These give calories back to the day's budget, which is why `log_date` is
-- stored rather than derived from `started_at` — a midnight run belongs to the
-- day the user thinks it does, on the same rule as `food_logs`.
--
-- IDEMPOTENT SYNC
--
-- HealthKit and Health Connect hand out a stable identifier per workout and
-- will hand out the same one again on the next sync, on a reinstall, and on a
-- new phone. `(user_id, source, external_id)` is unique so the sync is an
-- upsert and re-running it is free. Manual entries have no external id and are
-- excluded from the constraint by the partial index.
-- ---------------------------------------------------------------------------

create table public.workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,

  kind          public.session_kind not null default 'other',
  -- "Evening run", "Badminton with Wei". Free text: the user's or the source
  -- app's name for it, falling back to the kind's label in the client.
  title         text check (char_length(title) <= 120),

  log_date      date not null default public.local_today(),
  started_at    timestamptz not null,
  duration_min  integer not null check (duration_min between 0 and 1440),
  kcal          integer not null default 0 check (kcal between 0 and 20000),

  distance_km   numeric(6, 2) check (distance_km >= 0),
  avg_hr        smallint check (avg_hr between 20 and 260),
  elevation_m   integer check (elevation_m >= 0),

  -- Seconds per kilometre, in order. An array and not a child table: splits
  -- are written once with the session, always read whole, and never queried
  -- across sessions. A table would be five joins for a sparkline.
  split_seconds integer[],

  source        public.measurement_source not null default 'manual',
  -- The identifier the syncing platform gave this workout.
  external_id   text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index workouts_external_idx
  on public.workouts (user_id, source, external_id)
  where external_id is not null;

create index workouts_user_date_idx
  on public.workouts (user_id, log_date desc, started_at desc);

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
