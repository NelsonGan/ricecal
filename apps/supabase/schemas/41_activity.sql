-- ---------------------------------------------------------------------------
-- Movement, as read from the phone's health store.
--
-- Four tables, and the reason there are four rather than one is that they are
-- written at four different granularities by the same sync pass, and each one
-- answers a screen:
--
--   health_connections  is this phone connected, and how far back has it read
--   activity_days       the day's totals — the budget, and every chart column
--   activity_sessions   one workout — the list on Activity, and its detail
--   activity_hours      steps by hour — the one chart that needs finer than a day
--
-- WHY THIS IS STORED AT ALL
--
-- Apple Health and Health Connect are both on-device stores. Nothing about
-- them is a server, and a naive reading is that the app should just query them
-- when a screen opens. It cannot:
--
--   * The budget is computed in the database (`compute_targets`), the charts
--     are computed in the database (`trend_series`), and the weekly report job
--     has no client to ask. A figure that only exists on the handset cannot
--     take part in any of them.
--   * Health data is per-device. Read it live and a user's history restarts
--     when they change phones, while the diary beside it does not.
--   * Apple's store answers slowly enough that a range query per screen is felt.
--
-- So the phone is the READER and this is the record. Which also fixes the
-- direction of trust: the store is authoritative for a day it has data for, and
-- every write here is an upsert keyed so that reading the same day twice — or
-- from two devices — converges rather than doubling.
--
-- WHY NOTHING HERE IS WRITTEN BY A SERVER
--
-- Unlike the scan cascade, this needs no edge function and holds no secret.
-- There is no third party to authenticate against: the data is already on the
-- device, behind a permission the user granted to the app itself. `authenticated`
-- writes its own rows directly, and the shape of the keys is what makes that
-- safe to do repeatedly.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- Heart rate samples, sleep, blood glucose, cycle tracking, workout routes.
-- All of them are readable and none of them is on a screen. A calorie diary
-- that quietly hoovers a user's medical history because the permission was
-- already granted is a different app; the permission list in
-- `src/lib/health` is short on purpose and this schema is what holds it short.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. THE CONNECTION
--
-- One row per user per provider, and normally exactly one row: a user has an
-- iPhone or an Android. The pair is still the key because switching platforms
-- must not lose the old phone's history, and because `demo` coexists with a
-- real provider on a developer's simulator.
-- ---------------------------------------------------------------------------

create table public.health_connections (
  user_id        uuid not null references auth.users (id) on delete cascade,
  provider       public.health_provider not null,

  -- Off rather than deleted when a user disconnects. The rows they already
  -- synced stay — they are history now, the same way a weigh-in is — and
  -- reconnecting later must not re-read a year it already has.
  connected      boolean not null default true,

  -- What the store actually said yes to, as the provider's own type names.
  -- Android grants per record type and a user can grant steps but not workouts;
  -- iOS will not even tell you a read was denied (see the note in
  -- `providers/apple.ts`), so on that platform this is what we asked for.
  -- Either way the Activity screen needs it to explain a missing tile rather
  -- than draw a zero.
  permissions    text[] not null default '{}',

  -- "Apple Watch Series 9", "Galaxy Watch". Cosmetic, and null until a sample
  -- carries a device name.
  device_name    text,

  -- The oldest day already backfilled, and the newest instant read. Together
  -- they are the sync cursor that survives a reinstall — the provider's own
  -- anchor tokens do not, because they are opaque handles into a local store
  -- that a new device does not share.
  backfilled_from  date,
  last_synced_at   timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  primary key (user_id, provider)
);

create trigger health_connections_set_updated_at
  before update on public.health_connections
  for each row execute function public.set_updated_at();

alter table public.health_connections enable row level security;

grant select, insert, update, delete on public.health_connections to authenticated;
grant select, insert, update, delete on public.health_connections to service_role;

create policy "health_connections: read own"
  on public.health_connections for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "health_connections: insert own"
  on public.health_connections for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "health_connections: update own"
  on public.health_connections for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "health_connections: delete own"
  on public.health_connections for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- 2. THE DAY
--
-- One row per user per local calendar day. `log_date` rather than an instant,
-- for the reason `food_logs.log_date` is a date: a run at 00:30 belongs to the
-- day the runner thinks it does, and it has to land on the same day as the
-- supper afterwards or the balance chart pairs the wrong two bars.
--
-- Every column is nullable except steps and active energy, and that asymmetry
-- is the whole Android story. Health Connect has no stand hours, frequently no
-- basal rate, and exercise minutes only if something wrote them. Null means the
-- provider does not report it; zero means it reported none. The Activity screen
-- draws a tile for the first and a real zero for the second, and conflating
-- them is what makes an Android user think the app is broken.
-- ---------------------------------------------------------------------------

create table public.activity_days (
  user_id           uuid not null references auth.users (id) on delete cascade,
  log_date          date not null,
  provider          public.health_provider not null,

  -- What moving cost, above resting. THIS is the number that extends the
  -- budget, and the reason resting sits in a separate column rather than being
  -- added in: the calorie goal is already a Mifflin-St Jeor figure that
  -- includes basal metabolism, so adding resting energy to it again would
  -- credit a user roughly 1,500 kcal for being alive twice.
  active_kcal       integer not null default 0 check (active_kcal between 0 and 20000),
  -- Basal, as the store measured it. Read for the "where the burn comes from"
  -- breakdown only, never added to the budget.
  resting_kcal      integer check (resting_kcal between 0 and 20000),

  steps             integer not null default 0 check (steps between 0 and 200000),
  distance_m        integer check (distance_m between 0 and 1000000),
  -- Apple's Exercise ring, and Health Connect's exercise sessions summed.
  exercise_minutes  integer check (exercise_minutes between 0 and 1440),
  -- Apple only. Null on Android is the normal case, not a gap.
  stand_hours       smallint check (stand_hours between 0 and 24),
  flights           integer check (flights between 0 and 2000),

  -- The ring goals as the WATCH had them that day, which is why they are here
  -- and not in `user_settings`: Apple's Move goal is set on the watch and can
  -- change any morning, and a chart drawn against today's goal would silently
  -- restate every past day. Null where the provider has no such goal — Health
  -- Connect has none at all, and nobody has a step goal, which is why the step
  -- goal IS in `user_settings`.
  move_goal_kcal    integer check (move_goal_kcal between 0 and 20000),
  exercise_goal_min integer check (exercise_goal_min between 0 and 1440),
  stand_goal_hr     smallint check (stand_goal_hr between 0 and 24),

  -- When the phone last read this day out of the store. Shown as "2 min ago" on
  -- the Activity screen, and the reason a day can be re-read: today's totals
  -- keep growing, and a watch that was out of range backfills yesterday hours
  -- late.
  synced_at         timestamptz not null default now(),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  primary key (user_id, log_date)
);

create trigger activity_days_set_updated_at
  before update on public.activity_days
  for each row execute function public.set_updated_at();

alter table public.activity_days enable row level security;

grant select, insert, update, delete on public.activity_days to authenticated;
grant select, insert, update, delete on public.activity_days to service_role;

create policy "activity_days: read own"
  on public.activity_days for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "activity_days: insert own"
  on public.activity_days for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "activity_days: update own"
  on public.activity_days for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "activity_days: delete own"
  on public.activity_days for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- 3. THE WORKOUT
--
-- WHY `external_id` IS NOT NULL AND UNIQUE
--
-- This is the table that makes the sync idempotent, and it is the only one that
-- could not get there with a natural key. A day is keyed by its date and an
-- hour by its hour, so re-reading either overwrites itself. A workout has no
-- such key — two badminton sessions can start in the same minute on two
-- devices — so it carries the store's own identifier and every write is an
-- upsert onto it. Without this, "sync the last seven days on every foreground"
-- means a user's Tuesday run appears forty times by Friday.
--
-- The id is the provider's: `HKWorkout.uuid` on iOS, the record id on Health
-- Connect. Scoped by user AND provider because neither namespace is global and
-- the same user may hold rows from both after switching phones.
-- ---------------------------------------------------------------------------

create table public.activity_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  provider       public.health_provider not null,
  external_id    text not null check (char_length(external_id) between 1 and 200),

  -- The local day this session counts towards, which is the day it STARTED. A
  -- midnight run that finishes at 00:40 is Saturday's run to the person who ran
  -- it, and splitting it across two days to be arithmetically pure would put
  -- half a workout on a chart nobody would recognise.
  log_date       date not null,

  -- A slug, not an enum, and this is the one place in the schema that breaks
  -- that convention on purpose. Apple ships around eighty workout types and
  -- adds to them in point releases; an enum would make a sync fail — silently,
  -- mid-backfill — the first time somebody logged a type Postgres had never
  -- heard of. The client normalises to a known set and falls back to `other`,
  -- so an unrecognised type costs an icon rather than the whole session.
  kind           text not null check (char_length(kind) between 1 and 60),
  -- What the store called it, kept verbatim for the detail screen's subtitle.
  kind_label     text check (char_length(kind_label) <= 120),

  started_at     timestamptz not null,
  ended_at       timestamptz not null,
  duration_s     integer not null check (duration_s between 0 and 86400),

  active_kcal    integer not null default 0 check (active_kcal between 0 and 20000),
  distance_m     integer check (distance_m between 0 and 1000000),
  avg_hr         smallint check (avg_hr between 20 and 260),
  max_hr         smallint check (max_hr between 20 and 260),
  elevation_m    integer check (elevation_m between -500 and 20000),

  -- Seconds spent in each of four bands, as `{"easy":492,"steady":870,...}`.
  -- Jsonb rather than four columns because it is null far more often than not —
  -- it needs a watch writing per-minute samples, and Strava writing one session
  -- average gives nothing to band — and because the bands are a client-side
  -- decision about a max heart rate that this table has no business encoding.
  hr_zones       jsonb,

  -- "Apple Watch", "Strava", "Samsung Health". The provenance line on the
  -- detail screen, and on Android the answer to "why does this one have no
  -- zones".
  source_name    text check (char_length(source_name) <= 120),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint activity_sessions_ends_after_start check (ended_at >= started_at),
  constraint activity_sessions_external_unique unique (user_id, provider, external_id)
);

-- The list on Activity and on History: this user, newest first, sometimes
-- narrowed to a day.
create index activity_sessions_user_date_idx
  on public.activity_sessions (user_id, log_date desc, started_at desc);

create trigger activity_sessions_set_updated_at
  before update on public.activity_sessions
  for each row execute function public.set_updated_at();

alter table public.activity_sessions enable row level security;

grant select, insert, update, delete on public.activity_sessions to authenticated;
grant select, insert, update, delete on public.activity_sessions to service_role;

create policy "activity_sessions: read own"
  on public.activity_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "activity_sessions: insert own"
  on public.activity_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "activity_sessions: update own"
  on public.activity_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "activity_sessions: delete own"
  on public.activity_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------------
-- 4. THE HOUR
--
-- Steps by hour, for the one chart on the Activity screens that a daily total
-- cannot draw: "your busiest hour was 3pm".
--
-- Keyed by (date, hour) as two columns rather than by an instant. The hour is a
-- LOCAL hour — "3pm" is the claim being made — and a `timestamptz` would need
-- every read to know the timezone the write happened in, which is exactly the
-- bug `log_date` exists to avoid one table up.
--
-- Only the last month is ever written; older days keep their `activity_days`
-- total and lose their shape. Nothing on any screen asks for the hourly
-- breakdown of a day in March, and 24 rows a day forever to answer a question
-- nobody has is a table that outgrows the diary it decorates.
-- ---------------------------------------------------------------------------

create table public.activity_hours (
  user_id      uuid not null references auth.users (id) on delete cascade,
  log_date     date not null,
  hour         smallint not null check (hour between 0 and 23),

  steps        integer not null default 0 check (steps between 0 and 100000),
  active_kcal  integer not null default 0 check (active_kcal between 0 and 5000),
  distance_m   integer check (distance_m between 0 and 200000),

  created_at   timestamptz not null default now(),

  primary key (user_id, log_date, hour)
);

alter table public.activity_hours enable row level security;

grant select, insert, update, delete on public.activity_hours to authenticated;
grant select, insert, update, delete on public.activity_hours to service_role;

create policy "activity_hours: read own"
  on public.activity_hours for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "activity_hours: insert own"
  on public.activity_hours for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "activity_hours: update own"
  on public.activity_hours for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "activity_hours: delete own"
  on public.activity_hours for delete
  to authenticated
  using ((select auth.uid()) = user_id);
