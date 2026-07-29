-- ---------------------------------------------------------------------------
-- One row per account: who the user is and what their body is doing.
--
-- The split against `user_settings` is not arbitrary. Everything here is an
-- INPUT TO THE CALORIE BUDGET or an identity fact; everything there is a
-- preference that changes only what is displayed. That line is what makes the
-- recompute trigger in 80_targets_sync.sql safe to attach to this table and
-- only this table — a user switching to imperial must not silently rewrite
-- their targets.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- `weight_kg`. Current weight is the newest row in `weight_logs`, and a copy on
-- this table would be a cache with no invalidation story: the scale syncs a
-- reading, the profile still says what onboarding recorded, and the budget is
-- computed from the stale one. Onboarding writes its weight as the first
-- weigh-in, which also gives the weight chart a starting point for free.
--
-- `age`. Stored as `birth_date`, because an integer age is wrong within a
-- year of being written and nothing would ever correct it. The onboarding
-- stepper still collects a number; the client converts.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,

  display_name      text not null default '' check (char_length(display_name) <= 60),
  -- A path inside the `avatars` bucket, never a URL. Storing the path is what
  -- keeps a move to another object store (R2, per SETUP.md §3) a change of
  -- base URL rather than a data migration over every row.
  avatar_path       text,

  sex               public.sex,
  birth_date        date check (birth_date > date '1900-01-01'),
  height_cm         numeric(5, 1) check (height_cm between 80 and 260),
  target_weight_kg  numeric(5, 1) check (target_weight_kg between 20 and 400),
  activity_level    public.activity_level not null default 'light',
  weight_goal       public.weight_goal not null default 'track',

  -- i18n keys into onboarding.foodStyle.tags — the label is translated, the
  -- key is data. An array rather than a join table: it is a short, unordered,
  -- always-read-whole set that nothing else references.
  food_styles       text[] not null default '{}',
  -- Free text from the "how did you hear about us" step. No enum: the answer
  -- list is marketing's to change, and an unknown value must not fail a write.
  referral_source   text,

  -- IANA name. The server needs it to answer "what day is it for this user"
  -- without the client saying so — reminders, the weekly report job, and the
  -- default on `food_logs.log_date` all depend on it. Unconstrained text:
  -- validating against pg_timezone_names needs a non-immutable function, which
  -- a CHECK cannot use.
  timezone          text not null default 'Asia/Kuala_Lumpur',

  -- Null until the last onboarding step commits. The router reads it to decide
  -- between the onboarding stack and the tabs, so it is a timestamp rather
  -- than a boolean: "when" answers questions "whether" cannot.
  onboarded_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

-- No delete policy. An account is deleted through auth, and the cascade takes
-- the profile with it; a client that can delete its own profile row can strand
-- an auth user with no profile and no way to make one.
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: insert own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
