-- ---------------------------------------------------------------------------
-- Domain enums.
--
-- WHY ENUMS AND NOT CHECK CONSTRAINTS
--
-- `supabase gen types typescript` turns a Postgres enum into a TypeScript
-- string-literal union and a `check (x in (...))` into plain `string`. These
-- values are already unions in the client (`Meal`, `Goal`, `ActivityLevel` in
-- src/mock/types.ts), so an enum is what keeps the two ends in step: adding a
-- meal in SQL is a type error in the app until the app handles it.
--
-- The cost is that a value can be added but never removed, and never renamed
-- inside a transaction on older servers. Every enum here is a closed set the
-- design owns, not user data, so that trade is the right way round.
-- ---------------------------------------------------------------------------

create type public.meal as enum ('breakfast', 'lunch', 'dinner', 'snack');

create type public.sex as enum ('female', 'male');

create type public.weight_goal as enum ('lose', 'maintain', 'gain', 'track');

create type public.activity_level as enum (
  'sedentary',
  'light',
  'on_feet',
  'very_active'
);

-- Where a dish is usually eaten. Drives the filter chips on the search screen.
create type public.food_place as enum (
  'mamak',
  'kopitiam',
  'hawker',
  'packaged',
  'home'
);

-- How an entry got created. Not shown anywhere today; it is the column that
-- makes "what fraction of logs come from the camera" answerable once the
-- scanning flow exists, and backfilling it later would be guesswork.
create type public.entry_source as enum (
  'search',
  'quick_add',
  'camera',
  'voice',
  'import'
);

create type public.unit_system as enum ('metric', 'imperial');

create type public.energy_unit as enum ('kcal', 'kj');

create type public.subscription_status as enum (
  'none',
  'trial',
  'active',
  'expired',
  'billing_retry'
);

create type public.subscription_plan as enum ('monthly', 'yearly');

-- The icon sets shipped in src/ui/icons.generated.ts. A catalogue row names an
-- illustration by (set, name); the set is closed, the name is not, so only the
-- set is an enum.
create type public.icon_set as enum ('body', 'dishes', 'food', 'system', 'ui');

-- Where movement data came from. Genuinely closed: there are two health stores
-- on two platforms, and everything else — Garmin, Strava, Fitbit, Samsung
-- Health — reaches us by writing into one of them rather than by being a third
-- provider. `demo` is the seeded provider the simulator and the design gallery
-- run on, and it is a value rather than a flag so a demo row can be found and
-- deleted by the same query that would disconnect a real one.
create type public.health_provider as enum ('apple_health', 'health_connect', 'demo');
