-- ---------------------------------------------------------------------------
-- The daily budget, effective-dated.
--
-- WHY THIS IS NOT ONE ROW PER USER
--
-- The weekly report draws each day's intake against that day's target. With a
-- single mutable row, a user who tightens their goal on Thursday redraws
-- Monday through Wednesday against a target that did not exist yet, and every
-- past week silently rewrites itself every time the goal moves. Days are
-- immutable history; the target that applied to them has to be too.
--
-- The cost is one extra primary-key column and `order by effective_from desc
-- limit 1` on the read, both of which are in `current_targets` and
-- `targets_on()` so no caller writes them. Retrofitting this later would mean
-- reconstructing targets that were never recorded, which is not possible.
--
-- WHO WRITES IT
--
-- Normally nobody: the trigger in 80_targets_sync.sql recomputes a row when
-- the profile or the current weight changes. The Goals screen writes directly
-- with `is_custom = true`, which is the flag that tells the trigger to leave
-- this user's targets alone from then on.
-- ---------------------------------------------------------------------------

create table public.daily_goals (
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- The first day this budget applies to. It stays in force until a row with a
  -- later date supersedes it, so there are no gaps and no end dates to keep
  -- consistent.
  effective_from  date not null,

  kcal            integer not null check (kcal between 800 and 10000),
  carbs_g         integer not null check (carbs_g >= 0),
  protein_g       integer not null check (protein_g >= 0),
  fat_g           integer not null check (fat_g >= 0),
  water_glasses   smallint not null default 8 check (water_glasses between 1 and 30),

  -- True once the user has overridden the computed budget by hand. The
  -- recompute trigger reads exactly this and stops.
  is_custom       boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (user_id, effective_from)
);

-- The only access pattern: newest row at or before some date, for one user.
create index daily_goals_user_effective_idx
  on public.daily_goals (user_id, effective_from desc);

create trigger daily_goals_set_updated_at
  before update on public.daily_goals
  for each row execute function public.set_updated_at();

alter table public.daily_goals enable row level security;

-- No delete for `authenticated`. Deleting a past target would change what the
-- history is measured against, which is the thing this table exists to stop.
grant select, insert, update on public.daily_goals to authenticated;
grant select, insert, update, delete on public.daily_goals to service_role;

create policy "daily_goals: read own"
  on public.daily_goals for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "daily_goals: insert own"
  on public.daily_goals for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "daily_goals: update own"
  on public.daily_goals for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
