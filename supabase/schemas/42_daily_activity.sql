-- ---------------------------------------------------------------------------
-- The rings: whole-day activity totals mirrored from the phone or watch.
--
-- Separate from `workouts` because it is a different fact, not a
-- rollup of one. A day has 9,400 steps and 12 stand hours whether or not any
-- workout was recorded, and summing sessions would never produce either.
--
-- Separate from `daily_logs` because the writer is a background sync, not the
-- user; see the note there.
--
-- Goals are stored per day, not read from the device's current settings, for
-- the same reason `daily_goals` is effective-dated: raising a move goal must
-- not retroactively fail last week.
-- ---------------------------------------------------------------------------

create table public.daily_activity (
  user_id                uuid not null references auth.users (id) on delete cascade,
  log_date               date not null,

  steps                  integer not null default 0 check (steps between 0 and 200000),
  move_kcal              integer not null default 0 check (move_kcal between 0 and 20000),
  move_goal_kcal         integer check (move_goal_kcal > 0),
  exercise_minutes       integer not null default 0 check (exercise_minutes between 0 and 1440),
  exercise_goal_minutes  integer check (exercise_goal_minutes > 0),
  stand_hours            smallint not null default 0 check (stand_hours between 0 and 24),
  stand_goal_hours       smallint check (stand_goal_hours between 1 and 24),

  source                 public.measurement_source not null default 'healthkit',
  -- The instant the device last handed us this day. "Synced 4 min ago" is a
  -- rendering of it; a stored minute count would need something to increment.
  synced_at              timestamptz not null default now(),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  primary key (user_id, log_date)
);

create index daily_activity_user_date_idx
  on public.daily_activity (user_id, log_date desc);

create trigger daily_activity_set_updated_at
  before update on public.daily_activity
  for each row execute function public.set_updated_at();

alter table public.daily_activity enable row level security;

grant select, insert, update, delete on public.daily_activity to authenticated;
grant select, insert, update, delete on public.daily_activity to service_role;

create policy "daily_activity: read own"
  on public.daily_activity for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "daily_activity: insert own"
  on public.daily_activity for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "daily_activity: update own"
  on public.daily_activity for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "daily_activity: delete own"
  on public.daily_activity for delete
  to authenticated
  using ((select auth.uid()) = user_id);
