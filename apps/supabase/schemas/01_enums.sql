-- ---------------------------------------------------------------------------
-- Domain enums.
--
-- Why enums and not check constraints: `supabase gen types typescript` turns a
-- Postgres enum into a TypeScript string-literal union and a `check (x in (...))`
-- into plain `string`. These values are already unions in the client (`Meal`,
-- `Goal`, `ActivityLevel` in src/data/types.ts), so an enum is what keeps the two
-- ends in step: adding a meal in SQL is a type error in the app until the app
-- handles it.
--
-- The cost is that a value can be added but never removed, and never renamed
-- inside a transaction on older servers. Every enum here is a closed set the
-- design owns rather than user data, so that trade is the right way round.
-- ---------------------------------------------------------------------------

create type public.meal as enum ('breakfast', 'lunch', 'dinner', 'snack');

create type public.sex as enum ('female', 'male');

-- There was a `weight_goal` here — lose/maintain/gain/track. The calorie plan is
-- read off the gap between the current and target weights now, which answers the
-- same question without a second source that can contradict the first.

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
-- `text` is a meal typed in words rather than photographed. It runs the same
-- recognition cascade the camera does and lands in the same row shape, so this
-- column is the only place the difference survives.
create type public.entry_source as enum (
  'search',
  'quick_add',
  'camera',
  'voice',
  'import',
  'text'
);

-- How much of an ingredient went into a pot. Three units and no more: the
-- kitchen scale, the measuring jug, and counting. "1 kg" is 1000 g and "2 tbsp"
-- is a weight somebody has to guess at anyway, so neither earns a value here —
-- what the recipe stores has to be a number the totals can be computed from.
create type public.recipe_unit as enum ('g', 'ml', 'piece');

-- Where a recipe someone asked to publish has got to.
--
-- `pending` is the state a recipe enters the moment it is made public and the
-- state it stays in if the review never runs, which is deliberate: the
-- community tab reads `approved` only, so a moderation pass that fails, times
-- out or is never deployed leaves the recipe invisible rather than published.
create type public.recipe_review as enum ('pending', 'approved', 'rejected');

create type public.unit_system as enum ('metric', 'imperial');

create type public.energy_unit as enum ('kcal', 'kj');

create type public.subscription_status as enum (
  'none',
  'trial',
  'active',
  'expired',
  'billing_retry'
);

-- `lifetime` is bought once and never renews, so a row carrying it has a null
-- `current_period_end` and stays `active` for good. It is a plan rather than a
-- fourth status because what it changes is what was paid for, not where the
-- payment has got to: every status question ("is this account entitled", "did
-- billing fail") has the same answer shape whichever of the three was bought.
create type public.subscription_plan as enum ('monthly', 'yearly', 'lifetime');

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

-- Why somebody reported a community recipe.
--
-- Four, and they are the four App Review guideline 1.2 is written about:
-- objectionable material, spam, physical harm, and somebody else's work. A free
-- text box is deliberately not offered — it would be a second moderation
-- surface with its own abuse problem, and none of the four needs elaborating to
-- be acted on.
create type public.report_reason as enum ('inappropriate', 'spam', 'dangerous', 'stolen');
