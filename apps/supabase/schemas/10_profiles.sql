-- ---------------------------------------------------------------------------
-- One row per account: who the user is and what their body is doing.
--
-- The split against `user_settings` is not arbitrary. Everything here is an input
-- to the calorie budget or an identity fact; everything there is a preference
-- that changes only what is displayed. That line is what makes the recompute
-- trigger safe to attach to this table and only this table, since a user
-- switching to imperial must not silently rewrite their targets.
--
-- What is deliberately not here:
--
-- `weight_kg`. Current weight is the newest row in `weight_logs`, and a copy on
-- this table would be a cache with no invalidation story: the scale syncs a
-- reading, the profile still says what onboarding recorded, and the budget is
-- computed from the stale one. Onboarding writes its weight as the first
-- weigh-in, which also gives the weight chart a starting point for free.
--
-- `age`. Stored as `birth_date`, because an integer age is wrong within a year of
-- being written and nothing would ever correct it.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,

  display_name      text not null default '' check (char_length(display_name) <= 60),
  -- An object key in R2, under `avatars/<user>/`, never a URL. Storing the key
  -- is what kept the move off Supabase Storage a change of base URL rather
  -- than a data migration over every row — it has already paid for itself
  -- once. Read and written through the `photos` edge function.
  avatar_path       text,

  sex               public.sex,
  birth_date        date check (birth_date > date '1900-01-01'),
  height_cm         numeric(5, 1) check (height_cm between 80 and 260),
  -- Where the user is heading. With the newest row in `weight_logs` this is the
  -- whole of the calorie plan — the sign of the gap says lose or gain, its size
  -- says how hard, and equal says neither. There was a `weight_goal` enum beside
  -- it, asked for on its own onboarding screen, and it could only agree with
  -- these two numbers or contradict them; see `compute_targets`.
  target_weight_kg  numeric(5, 1) check (target_weight_kg between 20 and 400),
  activity_level    public.activity_level not null default 'light',

  -- i18n keys into onboarding.foodStyle.tags — the label is translated, the
  -- key is data. An array rather than a join table: it is a short, unordered,
  -- always-read-whole set that nothing else references.
  food_styles       text[] not null default '{}',
  -- Free text from the "how did you hear about us" step. No enum: the answer
  -- list is marketing's to change, and an unknown value must not fail a write.
  referral_source   text,

  -- IANA name. The server needs it to answer what day it is for this user without
  -- the client saying so: reminders, the weekly report job, the default on
  -- `food_logs.log_date` and the daily scan quota all depend on it. The column is
  -- plain text because validating against `pg_timezone_names` needs a
  -- non-immutable read, which a CHECK cannot do, so the trigger below is where that
  -- check happens.
  timezone          text not null default 'Asia/Kuala_Lumpur',

  -- Null until the last onboarding step commits. The router reads it to decide
  -- between the onboarding stack and the tabs, so it is a timestamp rather
  -- than a boolean: "when" answers questions "whether" cannot.
  onboarded_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- A timezone this database can actually use.
--
-- `authenticated` holds a table-wide update grant on `profiles`, so the client
-- writes this column directly, and `local_today` does
-- `now() at time zone <that text>`, which raises `invalid_parameter_value` for
-- anything that is not an IANA name. A single PATCH setting it to "x" therefore
-- turns a function that half the server depends on into one that throws for that
-- account.
--
-- The expensive case is the scan quota. `claim_scan` resolves the day through
-- `local_today`, and the edge function reads any error from that claim as "allow
-- uncounted", deliberately, because a database blip must not tell a paying user
-- they are cut off. Put together, one junk write buys an account unlimited scans
-- for ever, and the only trace is a log line. The meter cannot be the thing that
-- fixes this, so it is fixed at the source.
--
-- Ignored rather than refused. A junk value keeps whatever the row had before it,
-- and falls back to the default on an insert. Nobody's write fails over a string
-- the app never sends anyway, and raising would turn a corrupt value into a
-- failed save on a screen that has nothing to do with timezones. The column is
-- `not null`, so blanking it is not available.
--
-- Not `immutable`, hence not a CHECK: `pg_timezone_names` is a catalog read.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_valid_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.timezone is not null
     and not exists (
       select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone
     ) then
    -- `old` only exists on an update, and on an insert there is nothing to keep
    -- but the column's own default.
    new.timezone := case
      when tg_op = 'UPDATE' then coalesce(old.timezone, 'Asia/Kuala_Lumpur')
      else 'Asia/Kuala_Lumpur'
    end;
  end if;
  return new;
end;
$$;

-- Stated here and applied by a hand-written migration: `db diff` does not carry
-- grants, so a revoke that only lives in a schema file never happens.
revoke execute on function public.profiles_valid_timezone from public, anon, authenticated;

create trigger profiles_valid_timezone
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_valid_timezone();

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
