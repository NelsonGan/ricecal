# RiceCal

A calorie diary built for Malaysian eating. Take a photo of your plate, describe
it in words, or scan a barcode, and get calories and macros back.

This file is the only documentation in the repo. Everything about how the
project works is here.

---

## Contents

- [Repo layout](#repo-layout)
- [Getting set up](#getting-set-up)
- [The shape of the whole thing](#the-shape-of-the-whole-thing)
- [The database](#the-database)
- [The food catalogue](#the-food-catalogue)
- [Launching, and where a user lands](#launching-and-where-a-user-lands)
- [Language](#language)
- [Signing in](#signing-in)
- [Logging a meal](#logging-a-meal)
- [Correcting an entry](#correcting-an-entry)
- [What to eat next](#what-to-eat-next)
- [Food people write](#food-people-write)
- [The social food feed](#the-social-food-feed)
- [Groups](#groups)
- [The diary screen](#the-diary-screen)
- [Water](#water)
- [Home screen widgets](#home-screen-widgets)
- [History behind the charts](#history-behind-the-charts)
- [Weekly and monthly reviews](#weekly-and-monthly-reviews)
- [Activity and health](#activity-and-health)
- [Workouts](#workouts)
- [Photos](#photos)
- [Money: free and Pro](#money-free-and-pro)
- [Asking for a rating](#asking-for-a-rating)
- [News announcements](#news-announcements)
- [Periodic jobs](#periodic-jobs)
- [Analytics](#analytics)
- [The design system](#the-design-system)
- [Deploying](#deploying)
- [Testing](#testing)
- [Rules you must not break](#rules-you-must-not-break)
- [Traps](#traps)
- [Conventions](#conventions)

---

## Repo layout

```
apps/mobile      Expo / React Native app (expo-router, NativeWind, react-query)
apps/supabase    Postgres schema, RLS, pgTAP tests, Deno edge functions
apps/cloudflare  workers/ and d1/, one directory per Worker and per database
packages/shared  the few constants both sides need
```

Inside the mobile app:

```
app/             routes (expo-router)
src/data/        every read and write, as react-query hooks
src/features/    screens' building blocks, grouped by feature
src/lib/         helpers that are not UI: health stores, analytics, nutrition
src/ui/          the design system, which knows nothing about food
src/theme/       colour roles and the palette swap
src/i18n/en/     all user-facing copy, and the shape every locale must meet
src/i18n/*.ts    one file per translated locale
src/lib/dates.ts date and time patterns, per language, in token order
src/lib/units.ts kg <-> lb and cm <-> ft/in, for a database that stores metric
```

---

## Getting set up

You need Node 24+, pnpm, Docker (for the local Supabase stack), and Xcode or
Android Studio.

```bash
pnpm install
pnpm db:start            # local Supabase stack on ports 544xx
pnpm ios                 # or: pnpm android
```

`pnpm check` runs typecheck, tests and lint across the workspace. CI runs the
same thing on every push.

Agent skills live in `.agents/skills/`, with Claude's copies in `.claude/skills/`.
Keep both copies in sync when changing a workflow. In Codex, use
`$update-whats-new` to prepare the store release note and open its PR in
`ricecal-screenshots-creator`. The skill does not upload to either store.

Useful commands:

| command | what it does |
|---|---|
| `pnpm db:reset` | rebuild the local database from every migration |
| `pnpm db:diff <name>` | generate a migration from your schema edits |
| `pnpm db:test` | pgTAP tests |
| `pnpm db:types` | regenerate the TypeScript `Database` type |
| `pnpm foods:gate` | grade catalogue search against 30 fixed queries |
| `pnpm foods:servings` | repoint a row whose default portion is a unit of measure |
| `pnpm eval:prompts` | grade the model prompts |
| `pnpm eval:scan` | drive the deployed scan pipeline end to end |
| `pnpm eval:refine --repeat=3` | test real AI ingredient corrections against local Supabase |

Expo Device Hub (`expo-device-hub`, a dev dependency that adds nothing to the
app) gives every `npx expo start` a live device dashboard: stream, tap and type
into simulators and emulators, and boot, shut down or create them, at
`http://127.0.0.1:8082/_expo/plugins/expo-device-hub`. Test on the "RiceCal
iPhone 18 Pro" simulator and the `RiceCal_Pixel_10` emulator (Pixel 10, Android
16). The Hub and `pnpm android` need `ANDROID_HOME` (the Android SDK, e.g.
`~/Library/Android/sdk`) and `JAVA_HOME` (JDK 17) in the shell that starts
Metro; without them the Hub lists only iOS simulators.

Run one simulator at a time. This machine does not have room for the iOS
simulator and the Android emulator together, and the result is not just
slowness: a Gradle build running beside a test run pushed 18 tests past their
timeout with nothing actually broken. Shut one down before booting the other,
and stop the build daemons afterwards (`./gradlew --stop`, then
`pkill -f GradleDaemon`, `pkill -f kotlin-daemon`).

---

## The shape of the whole thing

Three layers, and the boundary between them is the same in every feature.

### Postgres owns every number

A day's calories, an entry's macros, the budget in force, days under goal: each
one is a view or a function. The arithmetic happens once, in the place a future
reminder job or weekly report can read without a client.
`src/lib/nutrition.ts` holds what is left, which is presentation plus one
projection of a budget that does not exist yet because onboarding has not
finished.

### The catalogue is not in Postgres

It lives in Cloudflare D1, behind the Worker in
`apps/cloudflare/workers/catalogue`. `product` holds 3.25 million barcoded
packets, and `food`, `food_serving` and `food_alias` hold about 53,000
searchable dishes. `site_search_count` is a separate one-row aggregate used by
the marketing site; it records completed public searches without retaining
queries or visitor data.

It left Postgres because the barcode layer made the catalogue's size the
diary's problem. It crossed a plan ceiling once and took the whole database
read-only in the middle of a load.

A foreign key cannot cross into another database, so **an entry carries its own
numbers**. `food_logs` holds `item_name`, `base_kcal` and the rest of the
snapshot, and `food_log_details` does the same arithmetic it always did (base ×
factor × quantity) over the row instead of over a join. `food_id` and
`serving_id` survive as soft references with no constraint, so a future job
could re-snapshot.

The trade runs the other way now: correcting a dish in the catalogue no longer
corrects the diaries that used it. What it buys is a catalogue that can be
truncated and rebuilt without touching anybody's diary.

### The app reads the Worker directly

For a while this went through a `catalogue` edge function, because the only
credential the Worker understood was a shared secret, and a secret in a phone
is not a secret. What changed is that the project signs its JWTs
asymmetrically: Supabase publishes an ES256 public key, so the Worker can
verify a user's own token while holding nothing that could forge one. The phone
carries no secret, and the extra hop is gone. Measured, a search went from about
420 ms to about 177 ms, having previously travelled to Singapore and back
before it started.

Two credentials reach that Worker, and `ROUTES` in its `index.ts` is the policy:

- A **user's JWT** reaches `/search` and `/food`, and nothing else.
- The **shared secret** is our own server (the scan cascade, the barcode
  function) and reaches everything, including writes.

A user token asking for anything outside those two routes gets a 404 rather
than a 403, because a signed-in person has no business knowing the write route
is there. Rate limits are keyed on the account, since an account is now what it
costs to read the catalogue.

### The client reads through hooks

Everything in `src/data` is a react-query hook, one file per area, and no screen
imports `supabase` directly. Every mutation owns what it invalidates, so a
screen never has to know what its write touches.

`keys.ts` holds every query key in the app in one file. Without that, a mutation
invalidating "the day" could spell it differently from the query that reads it.
The failure mode is a screen that silently does not refresh, which looks like a
caching bug and is really a typo.

### Edge functions own the model

The client never talks to OpenRouter and never sees the key. It uploads a photo
(or a sentence) and invokes a function, which does everything else and writes
the row itself as `service_role`. It has to, because a scan also writes
`food_scan_items`, which is the pipeline's working notes and is granted to
`service_role` alone.

**The prompts are hosted in PostHog**, with the copy in the code as the fallback
([Hosted prompts](#hosted-prompts)).

**Two models, and only the fallback is paid from OpenRouter credits.** Every
call asks Claude Haiku 5.5 first (`PRIMARY_ROUTE` in `llm.ts`), which runs on
our own Anthropic key through OpenRouter's BYOK. Anything that goes wrong there
(an error, a 429, an answer that will not parse, or no answer within 15
seconds) goes once to `qwen/qwen3.7-flash`, which OpenRouter bills to credits
as before and which keeps its 25 seconds and its one retry. Haiku writes about
250 tokens a second, so 15 seconds covers the largest ceiling any call asks for. Haiku must never run on credits, and three things hold
that line:

- Every request for an Anthropic model, on either route, names
  `provider: { only: ['anthropic'], allow_fallbacks: false }` (`routeFor`).
  OpenRouter also serves Claude from Bedrock, Vertex, Azure and Claude Platform
  on AWS, on its own accounts, which it bills to credits.
- The Anthropic key in OpenRouter (Settings, Integrations) must be set never to
  use shared capacity. Without that, a key that is rate limited or failing runs
  the call on OpenRouter's own Anthropic account instead of answering with an
  error. No request field can say this; it lives only in that setting.
- Every Anthropic answer's `usage.is_byok` is checked. A `false` logs an error and
  sends the rest of that isolate's calls to Qwen, and PostHog records it as
  `byok: false` on the event.

**Haiku's system prompts are cached for an hour, for the calls that repeat.**
A photo scan, a typed meal and a correction each send a fixed system prompt
(about 3,400, 6,100 and 2,500 tokens) ahead of the meal's own text or photo, so
the Anthropic route sends it as one block marked `cache_control: { type:
'ephemeral', ttl: '1h' }` (`CACHED_SPANS` and `cachedSystem` in `llm.ts`). A hit
costs a tenth of the input price, but the one-hour write costs twice it, so a
call comes out ahead only with a little over one hit an hour. Those three
arrive within an hour of the last of their kind 82 to 100% of the time; the
recipe calls and moderation come once a day or less, so they are left uncached
rather than pay a write nobody reads, and the catalogue pick and nutrition
estimate are under Haiku's 512-token minimum. A photo scan's input cost halved
in testing, and a typed meal fell from about $0.0007 to $0.0002. Two things keep
it working: a cached system prompt must stay byte-for-byte fixed (per-request
text belongs in the user message, after the cached block), and the cache is per
Anthropic workspace, which every call shares through the one BYOK key. A photo
with a typed note uses its own variant of the prompt, and so its own cache
entry.

**Haiku does not honour `response_format: json_object`.** With reasoning off it
works things out in its answer: a paragraph before the JSON, or a nutrition
estimate's arithmetic running out of tokens before any JSON arrives. Its route
adds one line to every system prompt telling it to reply with the JSON object
alone, and `parseAnswer` takes the JSON from after any paragraph that still
comes. An answer that will not parse goes to Qwen like any other failure (about
one text call in a hundred did, across the prompt evals). In production it is
about 2% of photos. Each one logs `answer did not parse (…)` with a shape built
only from lengths, counts and fixed labels (`objects=2 error=after-json` is a
second object after the first; `error=expected-comma at-char=letter` is a quote
left unescaped; `error=unexpected-token at-char=]` is a trailing comma), since
the answer itself is diary content. Most of that 2% is a key with one quote too
many (`""grams":`, `"kc"al_low":`), which logs as `error=expected-colon
at-char=letter prev-char="`. `parseAnswer` takes that quote out, at most three
per answer and only when what is left is a plain snake_case key followed by its
colon, and logs `answer repaired (stray-key-quotes=N)`. A wrong key would read
as an empty meal instead of going to Qwen, so any other answer still goes to
Qwen. A generic
`json_schema` response format is not the fix: Haiku answers it with `{}`.

`OPENROUTER_BYOK_MODEL=off` as a function secret sends everything to Qwen
without a deploy, which is the switch to reach for if Haiku's answers go wrong
rather than failing. The Anthropic organisation's concurrency limit is low, so
a burst of calls answers 429 and lands on Qwen rather than failing the scan.

**Every call sends `reasoning: { enabled: false }`, and it is not an
optimisation.** `qwen3.7-flash` reasons by default, reasoning tokens come out of
`max_tokens`, and a model that thinks past the ceiling returns
`finish_reason: length` with an EMPTY body — no JSON, no error message, nothing
to parse. Every caller in `llm.ts` had somewhere quiet to put that, so removing
the line does not break loudly: it makes the vision call fail, which used to
write a guessed "Mixed meal" onto real diaries, and it makes the fix-by-typing
interpreter fail, which answered "could not apply that, try rewording it" to
corrections that were fine. The line has been removed twice and put back twice,
the first time for speed (20-30s a call, three calls past the client's 60s
timeout) and the second for this. Models with no reasoning mode ignore it.

The ceilings themselves are generous for the same reason. A ceiling is not a
bill — tokens are charged as they are generated, so an answer that fits in 200
costs 200 whatever `max_tokens` says — and the only thing a tight one buys is
the silent failure above. The interpreter was at 600 for a prompt whose bottom
rung asks for the same object `analysePhoto` gets 2400 for.

### Caching

Cached queries persist to MMKV, so a relaunch has yesterday's answers before the
first request returns. `SCHEMA_VERSION` in `packages/shared` is the cache
buster: bump it whenever the shape of anything persisted changes, or old data
rehydrates into new code.

**A query with no connection is paused, never sent.** That is
`networkMode: 'online'`, the same signal that already gates every write.
Reading the cache is untouched; only the request is.

**Offline and unreachable are different screens.** A paused query resumes by
itself when the connection returns, so its screen ("Waiting for a connection")
offers nothing to press. A query that was sent and failed while the phone is
online will not be retried by anything while the app stays open, so the launch
screen and Today say the request did not go through and offer **Try again**
(`useOnline` in `lib/online.ts` tells the two apart). Both used to say
"Waiting for a connection", which sent a user on working mobile data to check
their settings, relaunch and reinstall, and Today drew the failed day as a day with
nothing logged. The weigh-in sheet likewise closes and says "saved" only once the
server has the reading.

The one exception is the photo query, because `resolveStoredImage` asks the disk
before it asks the server, so it is the only query worth running with no
connection. Paused, a diary of plates this phone had already downloaded drew as
a column of empty tiles.

This was `offlineFirst` for a while, which reads like the offline-tolerant
setting and is the reverse: it sends the first request whatever the connection
and pauses only the retries. Nothing in the app is written against that. The
router, Today and the search panel all key on a query being paused, and none of
them could say so until the doomed first request had failed. That took thirty
seconds, because a request waits on the access token and Supabase will not hand
one over until it has finished retrying a refresh it cannot send. A launch with
no signal was a spinner for all of it.

The quieter half is what that cost the diary. A failed query ends `error`, only
a `success` is dehydrated, and the persister writes the whole snapshot. So each
offline launch saved a copy with the failed queries missing, and offline worked
once and then less. The profile went first, being the one query whose screen
redirects away while it is still in flight: losing its last observer cancels the
retry that would have paused, and it settles as an error over data that was
perfectly good.

---

## The database

`apps/supabase/schemas/*.sql` is the source of truth. You edit those files. You
do not write migrations by hand and you do not touch the dashboard.

```bash
pnpm db:start
# edit apps/supabase/schemas/*.sql
pnpm db:diff add_water_goal    # generates apps/supabase/migrations/<ts>_add_water_goal.sql
pnpm db:reset                  # applies every migration to an empty database
pnpm db:test                   # pgTAP
pnpm db:types                  # regenerates the TypeScript Database type
```

Then open a PR. `supabase-migrations.yml` re-runs the last three steps on a
throwaway Postgres, and merging to `main` deploys through the Supabase GitHub
integration.

`migrations/` starts from one squashed baseline. The first week's twenty-nine
migrations recorded how the schema was arrived at, and none of it needed
replaying: the deployed project was already at the end of the chain, and every
other database is built from scratch.

### Things a diff cannot see

These have to be hand-written into a migration, because `supabase db diff`
only emits structure:

| what | why |
|---|---|
| a `REVOKE` on a new function | the diff emits the grants a function ENDS UP with, not the revoke that shaped them, so `create function`'s default EXECUTE-to-PUBLIC survives into the migration |
| seed data of any kind | the rows are data, and a diff only emits structure |
| `create extension` / `drop extension` | the diff engine does not track extensions at all |
| `cron.schedule(…)` calls | a schedule is a row in `cron.job`, so it is data too |
| a policy on `realtime.messages` | the table belongs to the Realtime service's schema, which the diff does not compare at all, so it emits neither the policy nor a drop for it; `20261022031315_group_chat_live.sql` restates it from `51_groups.sql` |
| `ROWS n` on an existing function | the diff compares bodies and arguments, not the planner's row estimate, so changing only the hint emits nothing; a function the migration creates carries it |

Nothing schedules anything here any more, and there is no seed function left
either — `seed_archetype_foods()` went with the archetypes — but the rule is
what made both the arrival and the removal hand-written. The revoke is the one
that bites regularly: a green local `db diff` is not evidence that it reached a
migration, and `02_rls.test.sql` asserts it in the database rather than in the
file.

The `auth` schema is **not** one of these. The diff tracks triggers on
`auth.users` perfectly well, and putting `on_auth_user_created` in a migration
made the next diff emit `DROP TRIGGER` for it. It stays declarative, in
`16_new_user.sql`.

Sixteen service-only tables (scan items and misses, groups and their chat,
push tokens, recipe saves, social counters and rate limits, job runs) have no
client grant, no permissive policy and a restrictive `"Server only"` policy that
denies every client row.
`98_client_table_privileges.sql` also removes `TRUNCATE`, `REFERENCES`, `TRIGGER`
and `MAINTAIN` from client roles on every public table. These operations do not
need an RLS policy to run. `02_rls.test.sql` checks both boundaries.

### The tables

```
auth.users
  └── profiles ────────────── body + target weight: the calorie budget's inputs
       ├── user_settings ──── display, notifications, privacy
       ├── meal_times ─────── when each meal is, and whether to remind
       ├── daily_goals ────── the budget, effective-dated
       ├── subscriptions ──── read-only mirror of RevenueCat
       ├── scan_usage ─────── scans spent, one row per local day, per tier
       ├── food_logs ──────── what was eaten, with its own numbers
       │    └── food_log_ingredients   what a scanned plate was made of
       ├── daily_logs ─────── water in ml, and a day note
       ├── recipes ────────── home cooking → recipe_ingredients
       ├── recipe_reports ─── a community recipe somebody reported
       ├── blocked_authors ── cooks this account never wants to see again
       ├── weight_logs ────── current weight, typed or synced
       ├── custom_exercises ─ exercises the user named, beside the catalogue
       ├── workout_routines ─ the plans a workout starts from
       ├── workouts ───────── one logged session, saved whole by save_workout
       │    └── workout_exercises → workout_sets
       └── health_connections  which health store, and how far back it has read
            ├── activity_days ───── one day of movement, keyed by local date
            ├── activity_sessions  one workout, keyed by the store's own id
            └── activity_hours ──── steps by local hour, month plus timezone buffer

food_scan_items       what the model claimed, and where it landed
food_scan_misses      the catalogue-widening backlog
barcode_misses        the same, for packets
job_runs              what each periodic job did, written by the job itself
```

`foods`, `food_servings`, `food_aliases` and `food_sources` are **not** here.
They are in Cloudflare D1, and nothing in Postgres joins to them.

There WAS an `archetypes` table here — sixty generic rows the scan cascade fell
back on, ending at a terminal "Mixed meal" — and it is gone with the tier that
read it. See "The scan cascade" for why a cascade with no floor is the safer
shape.

Read shapes are views, all `security_invoker`: `food_log_details`,
`food_log_ingredient_details`, `daily_nutrition`, `user_food_stats`,
`current_daily_goals`, `recipe_details`, `recipe_ingredient_details`, and for
workouts `workout_set_values`, `workout_set_details` and `workout_summaries`
(see "Workouts").

Plus `goals_on(date)`, `logging_streak()`, `day_marks(from, to)`,
`day_plates(from, to)`, and three range families:

- `trend_days` / `trend_series` / `trend_summary` for the diary
- `activity_days_range` / `activity_series` / `activity_summary` for movement
- `review_days` / `review_periods` / `review_summary` / `review_series` /
  `review_meals` for a finished week or month

The review family takes dates rather than a named window, because "the week of 3
August" stopped moving when the week ended and `local_today()` has no name for
it.

### Decisions worth knowing

**Targets are effective-dated.** `daily_goals` is one row per change, not one
mutable row. A target tightened on Thursday does not redraw Monday. You cannot
retrofit this, because you cannot reconstruct targets that were never recorded.

**The budget is computed in the database.** `compute_targets()` is
Mifflin-St Jeor with an activity multiplier and a goal delta. A trigger
recomputes it when the profile or the newest weigh-in changes, and stops dead if
`is_custom` is set.

**Mifflin-St Jeor on actual body weight, at every size.** That is the Academy of
Nutrition and Dietetics' own recommendation, for obese adults as much as for
anybody else: of the equations in wide use it is the one that lands within 10% of
indirect calorimetry most often. It is known to drift above a BMI of about 35,
and the published answer to that is indirect calorimetry rather than a different
formula, so the app does not invent a correction. It states its number, and every
figure on the goals screen can be typed over.

**Protein is per kilogram of ADJUSTED body weight.** 1.6 g/kg is prescribed
against a body that is mostly lean, and total body weight stops standing in for
that above the healthy BMI band: 250 kg asked for 400 g of protein a day. The
basis is the reference weight for the height (BMI 25) plus a quarter of anything
above it, which is the clinical adjustment and is a no-op for everyone inside the
band. Calories still use actual weight; only protein does this.

**The budget has a ceiling, and it is the column's.** `daily_goals.kcal` is
checked at 10,000 and the formula can ask for 10,680 at the top of the weight
field's range, so `compute_targets` caps itself. Without it the trigger's insert
is rejected and the account is left with no budget at all.

**Current weight is not on `profiles`.** It is the newest `weight_logs` row. A
column would be a cache with no invalidation story: the scale syncs, the profile
still says what onboarding recorded, and the budget is computed from the stale
one.

**Age is stored as `birth_date`.** An integer age is wrong within a year of
being written and nothing would ever correct it. The column is checked against
1850 rather than 1900, because the age field accepts 150 and the oldest birth
date a fixed year allows moves forward every year.

**The body questions answer within one set of bounds**, exported from
`lib/nutrition.ts` because two screens ask the same questions: 120 to 220 cm, 20
to 500 kg, 13 to 150 years. Weight stopped at 200 and age at 100, and both turned
away real people. Each is inside its column's own check, and the target-weight
slider shares that floor and its top end follows the current weight — a target ON
the current weight is how a user says they have no goal, and a fixed track that
stopped at 120 made that unsayable for anybody outside it.

**`log_date` is a date; `logged_at` is an instant.** Supper at 00:30 belongs to
the day the user thinks it does, which is why the day is stored and not derived.
`local_today()` reads `profiles.timezone`, because `current_date` on a UTC
server is the previous day for the first eight hours of every Malaysian morning.

**`activity_sessions` is keyed by the health store's own id**, because two
badminton games can start in the same minute.

**`meal_times.at` is a `time`, not a timestamp**, because "08:00 in the user's
own clock" stays true when they fly somewhere else.

**One wide `user_settings` rather than three narrow tables.** All of it is 1:1
with the user, always read together, always written a field at a time.

### Conventions

Every table gets the same four parts: table, `enable row level security`,
grants, policies. `apps/supabase/schemas/_template.sql.example` is the canonical
copy.

- **`(select auth.uid())`, never bare `auth.uid()`.** The subquery form is
  evaluated once per statement instead of once per row.
- **A policy per command.** `for all` makes it easy to omit the with-check half
  and let a user insert rows attributed to someone else.
- **`set search_path = ''` on every function**, with every name schema
  qualified. Without it a caller can shadow a table we reference.
- **Grants are the outer gate.** Where a client must never write, there is no
  grant at all, not merely no policy, so a policy added later by mistake cannot
  become an entitlement or a self-approving review.
- **Every function the app calls revokes `public, anon` and grants who may
  call it**, invoker or definer. Postgres gives PUBLIC EXECUTE on any new
  function and a later `grant` does not take it away. Helpers that a column
  default or a trigger reaches (`local_today`, `compute_targets`,
  `current_weight_kg`) keep it, since a trigger can fire as Supabase's own auth
  role inside an account deletion.
- **Enums for closed domains.** `supabase gen types` turns them into string
  literal unions, which keeps `Meal` in SQL and `Meal` in TypeScript the same
  set.
- **`updated_at` by trigger**, so no write path has to remember.
- **Every view in `public` is `security_invoker`.** A view that must read past
  RLS lives in `private` and is read through an invoker view of the same
  name; `02_rls.test.sql` fails on any other.
- **A server-only table still gets a policy:** `"Server only"`, restrictive,
  `using (false) with check (false)` for `anon` and `authenticated`. With no
  client grant it changes nothing today, but a permissive policy added by
  mistake still admits no row, and `02_rls.test.sql` fails on a public table
  with RLS and no policy at all. Edge functions use the service role and
  definer functions run as their owner, so both pass by it.

**What the Security and Performance Advisors still report, on purpose.** Each
was checked against the code (October 2026) and is not a finding:

- *Signed-in users can execute a security definer function*: those are the
  app's RPC API. Each decides inside what its caller may do (most through
  `private.social_require_user` or `private.group_require_member`).
  `02_rls.test.sql` asserts the parts that would make one unsafe: every
  definer function pins `search_path = ''`, and none is executable by `anon` or
  `PUBLIC`. The advisor's alternative, an invoker wrapper in `public` over a
  definer copy in `private`, reaches the same code with the same rights and
  doubles every function, so it is not done.
- *Unindexed foreign key* on four composite `(id, user_id)` ownership keys
  (`social_posts`, `workout_exercises`, `workout_sets`, `workout_heart_rates`):
  each is already served by a unique index leading with its first column. That
  index enforces something else and cannot be widened, so covering both
  columns would mean a second index that only costs writes. The routine key's
  index was a plain one and is widened instead.
- *Unused index* on the group tables: they cover foreign keys on tables still
  small enough to scan. The same holds for `food_scan_items_scan_idx` (the scan
  eval reads items by scan), `food_logs_scan_idx` (the estimate-backlog report)
  and `barcode_misses_code_idx` (triage of missing packets): each is read by a
  person or a script rather than by the app, and the advisor's counters only go
  back to the last restart. Indexes that only duplicated a primary key were
  dropped instead (October 2026): `blocked_authors (user_id)`, and descending
  copies of the keys of `daily_goals` and `weight_logs`, since a btree reads
  backwards as cheaply as forwards. So was the index on
  `food_scan_items.resolved_tier`, a column with five values.
- *Leaked password protection*: needs the Pro plan.

### Function secrets

Two belong to the catalogue, read by `functions/_shared/catalogue.ts`:
`CATALOGUE_URL` and `CATALOGUE_TOKEN`. The same token is set on the Worker with
`wrangler secret put CATALOGUE_TOKEN`, and the two must match or every catalogue
read from a function answers 401. The scan cascade turns that into a failed scan
rather than a wrong one: with tiers 1 to 3 unable to reach the catalogue, tier 4
estimates or nothing does, and the row on Today says it could not be read.

Only the server uses these. The app reads the catalogue directly with the
signed-in user's JWT.

Four belong to R2, read by `functions/_shared/r2.ts`: `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. The credentials are an
R2 API token scoped to the one bucket, not an account-wide key, and they never
leave the server.

```sh
supabase secrets set --workdir apps \
  CATALOGUE_URL=https://catalogue.ricecal.app CATALOGUE_TOKEN=... \
  R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=ricecal-assets
```

Locally they go in `apps/supabase/functions/.env`, which is gitignored. Without
them the `photos` function answers 503 in so many words rather than failing at
the tap. A local stack still starts, still resets and still scans, because mock
AI never reads the photo.

One reads the hosted model prompts: `POSTHOG_PROMPTS_API_KEY`, a PostHog
personal API key scoped to `llm_prompt:read` and nothing else, read by
`functions/_shared/prompts.ts` (see [Hosted prompts](#hosted-prompts)). Unset,
every call sends the copy of its prompt that is in the code, which is what the
local stack does. A copy for scripts lives in `.secrets/posthog-prompts.key`.

A fifth R2 value is optional and local only: `R2_ENDPOINT` overrides the
Cloudflare host, so you can point the same signing code at any S3, including the
one the local stack already runs. That is the difference between `ownsKey` being
testable and only being testable in production.

```sh
# apps/supabase/functions/.env
# The endpoint is 127.0.0.1 and not the container name, because the signature
# covers the host and the phone is what PUTs to it.
R2_ACCOUNT_ID=local
R2_ACCESS_KEY_ID=<S3_PROTOCOL_ACCESS_KEY_ID from `supabase start`>
R2_SECRET_ACCESS_KEY=<S3_PROTOCOL_ACCESS_KEY_SECRET>
R2_BUCKET=ricecal-local
R2_ENDPOINT=http://127.0.0.1:54421/storage/v1/s3
```

---

## The food catalogue

It is in Cloudflare D1, behind the Worker in
`apps/cloudflare/workers/catalogue`. `apps/cloudflare/d1/food-catalogue/schema.sql`
is the shape and `src/index.ts` is every query. Both deploy from CI on `main`,
schema first.

### Two tables, and their sizes are opposite on purpose

```
food          52,900   everything findable by typing
product    3,255,494   packaged goods, reachable by an exact barcode and nothing else
```

**Name search wants to be small.** Every row it holds is a competitor for rank.
The catalogue held 464,000 once, 450,000 of them USDA Branded (American
supermarket packaging, imported because it was free), and they made fuzzy
matching unaffordable: "milk" rechecked 60,934 rows and took 785 ms.

**Barcode lookup wants to be enormous.** A code is exact, so a row it will never
match costs nothing but disk, and the only real failure of a scanner is a packet
it has never heard of.

Two tables is what lets both be true. `product` is a barcode primary key with no
secondary index, so 3.25 million packets cost search no rank, no index memory
and no query time.

### What is in `food`

| source | rows | |
|---|---|---|
| Open Food Facts | 25,422 | Southeast Asian shelves and the world's most-scanned |
| USDA (Foundation, SR Legacy, FNDDS) | 13,276 | measured generic food |
| researched Asian dishes | 7,701 | 60-odd payload files under `apps/supabase/data/foods` |
| other national composition tables | 4,574 | Singapore, Vietnam, Indonesia, Taiwan, India, Thailand, Japan |
| MyFCD | 1,412 | the Malaysian composition table |
| hawker / chain / drinks | 451 | recipe-derived from measured rows |

Seven other countries publish a composition table, and reading one beats a
research round on every axis: the figures are measured rather than reasoned, the
round is a script rather than two days, and the rows can claim `verified`
honestly. What they cost is judgement at the door. A table is mostly
ingredients, and importing one whole is the USDA Branded mistake in a new
accent, so each is loaded as a slice.

### Three things ride along with a dish

- **Aliases are rows** (`food_alias`), not tokens in a search bag. An alias
  among fifty words scores like one word; an alias in a table of its own scores
  like a name.
- **Portions carry their weight** (`food_serving.grams`). The cascade reads the
  stated weight first and the label only as a fallback. Reading the label alone
  switched the weight path off for exactly the rows that had the number, since a
  curated Malaysian dish says "1 plate" and carries the 300 g in a column beside
  it.
- **A default portion is a helping, not the unit the source published in.**
  `food.kcal` is per whichever `food_serving` carries `is_default`, and on 414
  imported drink rows that flag sat on "1 fl oz". So the catalogue said a latte
  was 30 g and 8 kcal, the app showed that to anybody who searched for one, and
  the scan cascade divided the glass it had measured by 30 g and got eleven
  servings. `pnpm foods:servings` moves the flag to the portion the row already
  carried and rescales `kcal`, the macros and every `factor` around it. It is
  narrow on purpose: USDA states a cut of meat in "3.0 oz" and a snack in "1.0
  oz", which are real helpings, and the first draft repointed 2,004 rows and
  would have moved a roast beef to "1.0 roast (yield from 714 g raw meat)" at
  1,307 kcal. Re-runnable, and worth re-running after a bulk load, because the
  rows it fixes are imported from outside this repo.
- **Provenance travels as columns** (`source_id`, `source_name`,
  `source_attribution`), carrying the licence and the attribution the detail
  screen prints. Open Food Facts is ODbL, so attribution is required.

### How search works

`search()` fuses four arms with Reciprocal Rank Fusion: exact name, exact alias,
full text, trigram. Then it multiplies a bounded prior (locale, popularity,
verified; capped at 1.35) that can settle a near-tie and can never outrank
relevance.

The two FTS5 indexes are contentless. `food_trgm` is the one thing that had to
be rebuilt rather than ported: `pg_trgm` scored similarity, while FTS5's trigram
tokenizer only matches substrings, and a misspelling is by definition not a
substring of the right spelling. The Worker splits the query into trigrams and
lets bm25 rank by how many a row shares.

The two exact arms match a stored normalized column, `food.name_norm` and
`food_alias.alias_norm`, each indexed. Written as `lower(name) = ?` they were
two bugs in one expression: no index can serve that, so every search
full-scanned both tables, and `lower()` is not the folding the query went
through, so "Chicken Rice (Nasi Ayam)" could not be reached by typing its own
words.

### Loading it

```bash
pnpm foods:have kuih                 # what is already in there
pnpm foods:import --dry-run <file>   # shape, arithmetic and dedup, writing nothing
pnpm foods:gate --save before        # …import…   pnpm foods:gate --against before
pnpm foods:import <file.json> ...    # the write
pnpm foods:dupes --since research:x  # near-duplicates exact matching cannot see
pnpm foods:reindex                   # derived columns and the full-text index
```

The shape check is in `scripts/lib/food-shape.mjs` and needs no database, which
is what makes `--dry-run` useful. It makes the checks no database can: a name
with no ASCII in it has no slug, an icon naming a drawing nobody drew renders as
a blank square, calories that disagree with their own macros by more than a
quarter were transcribed twice, and 160 g of macronutrient does not fit in a
140 g packet. D1 has no constraints to speak of, so this is the only gate a row
passes through.

**A load is gated on search quality**, because it is the one change that can
silently make the app worse. Nothing errors; "nasi lemak" just starts returning
something else. `pnpm foods:gate --save before` records thirty queries and where
the dish a Malaysian means by each lands, and `--against before` prints only
what moved. Adding 300,000 packets moved nothing, and so did 709 Singaporean,
Indonesian, Thai and Filipino dishes.

Grade **after** a `foods:reindex --all`, not between it and the load. A full
reindex reassigns rowids, an FTS arm breaks bm25 ties by rowid, and two rows a
hair apart can swap with no data change at all.

### Payload files

One JSON file per research topic, under `apps/supabase/data/foods`. Each stays
there after import: the directory is the provenance record for every catalogue
row that did not come from USDA or MyFCD.

```jsonc
{
  "source": "research:kuih",          // inherited by every dish below
  "foods": [
    {
      "name": "Kuih Seri Muka",       // required, the local spelling
      "place": "hawker",              // mamak | kopitiam | hawker | home | packaged
      "serving": "1 piece",           // required, and max 40 characters
      "kcal": 178,                    // required, for that one serving
      "carbs_g": 24.6,
      "protein_g": 2.4,
      "fat_g": 8.1,
      "fibre_g": 0.9,                 // omit rather than guess
      "aliases": ["seri muka", "kuih salat"],
      "icon": "food/kuih-seri-muka",  // optional; must name a real drawing
      "verified": false,
      "extra_servings": [{ "label": "2 pieces", "factor": 2 }]
    }
  ]
}
```

**Macros are per one serving, not per 100 g.** `serving` says what that one is,
in the words a person would use. Nobody weighs a roti canai.

**The calories have to match the macros.** The loader recomputes
`4·carbs + 4·protein + 9·fat` and refuses any row more than 25% away from its
stated `kcal`. Most rejections are this, and most of those are a portion size
that changed between writing the calories and writing the macros.

Alias top-ups live in `data/foods/aliases/` and are for dishes the catalogue
already has under a name nobody types. They only add `food_alias` rows;
`name_norm` is left alone deliberately, because that is what dedup compares
against.

---

## Launching, and where a user lands

`app/index.tsx` is a redirect, not a screen, so there is never a back-stack entry
pointing at nothing. It asks three questions in order, and the order is the flow:

1. Is the keychain read still in flight?
2. Is there a session?
3. Does the profile have `onboarded_at`?

Deep links can bypass that index. The logging pages and paywalls therefore use
`SessionGate` before mounting their account queries, just as the settings,
activity, recipe, review and social layouts guard their children. Loading waits;
a signed-out link returns to Welcome. This also covers old widgets that link
straight to `/log?panel=barcode` or `/log?panel=recipes`. The guards add no
navigator, so the logging sheet keeps its modal presentation and food pages
keep their ordinary push.

The first is the **keychain read and nothing else**, which is narrower than it
used to be. `SessionProvider` asked Supabase, and Supabase answers that question
last: it reads the same key first, then refreshes a token within 90 seconds of
expiring, and only then says who is signed in. Offline that refresh is half a
minute of backoff, and the whole app was a spinner behind it.

So the provider races `whenStoredSession()`, which resolves the moment the
adapter has been asked for the key, against `getSession()`, and lets the real
answer land on top whenever it arrives. Storage cannot know about a session
revoked while the app was closed; that corrects itself twice over, from the call
and from the `SIGNED_OUT` that follows it.

The onboarding questions come **before** the account, so the local draft rather
than the session says how far somebody got. The draft is in MMKV and outlives
the account it was flushed for, which is why a signed-out relaunch starts at the
top rather than resuming.

### The flow

```
welcome                          the pitch, and the fork for a returning user
1 setup                          the language, and the units everything after it
                                 is typed in
2 about   3 activity  4 source   the questions, drafted locally
5 calculating                    a beat, then it replaces itself with…
6 target                         the budget, worked out on the phone and
                                 editable there
7 account       (auth)/sign-in, carrying the same bar through the params
                Apple, Google, or an address, which leads to (auth)/password
                and then (auth)/verify if a code is owed
  finish                         the one write: profile, first weigh-in, onboarded_at
8 health        connect the store, a permission that gives rather than asks
9 notifications turns the three meal reminders on, not just the OS permission
  paywall/intro                  the offer, with "Maybe later" leading to Today
```

Two screens have left this list. "How do you usually makan" wrote a
`profiles.food_styles` array that ranked nothing, since search is the Worker's
and its prior is locale, popularity and verification. And the **tour** is no
longer part of the flow: it was four cards of prose read by somebody who had
been answering questions for two minutes and had still not seen the app. It
lives at `/tutorial` now, offered once from Today as a toast a beat after the
diary appears, and permanently from a row in Me.

The paywall is the last thing rather than a step of its own. "Later" lands on
the real app, and the app it lands on works: three photographed plates a day,
the barcode scanner, the whole catalogue, three recipes, three workout
routines, the week's trends.

### No edge swipe anywhere in this flow

`(onboarding)`, `(auth)` and the two group entries in the root stack all carry
`gestureEnabled: false`. Going back is `StepHeader`'s chevron, which each screen
points where it belongs.

It was off from `finish` onwards already, because everything after the account
replaces its predecessor: the stack under "Connect Apple Health" is still a
question from before the account existed, so a gesture there walked a
minute-old account back into "Where did you hear about us?". The questions kept
the gesture until the same thing turned up one step earlier: the account screen
is in `(auth)`, so the flow crosses out of the group and back, and a swipe after
signing in unwound the root stack rather than the questions.

### `about` answers nothing for the user

Every control on it starts empty and Continue is dead until all five are
filled. `setup` in front of it is the exception and says why in its own section:
a language and a unit system both open on an answer, so there is no version of
that screen somebody can fail to fill in. It used to open on 164 cm, 65 kg, 29, female, and every one of those is
a real answer as far as `compute_targets()` is concerned, so tapping straight
through produced a calorie budget worked out for somebody else with nothing on
screen to say so.

### The two permissions come after the account

Both need one: a health connection is a row keyed by user, and enabling a meal
reminder is a write to `meal_times`. Neither can block. An unusable store, a
sheet that could not be presented or a failed write says so in a toast and
carries on, because there is a whole tab for trying again and no version of a
permission screen should stand between a new account and their diary. A refusal
says nothing at all: it is an answer rather than a failure, and the system has
already recorded it in its own words.

**Both steps have one button and it says "Continue".** App Review reads a screen
shown before a system permission sheet under guideline 5.1.1(iv), and the health
step was rejected twice over: the button said "Connect Apple Health", which reads
as the app doing the asking rather than Apple, and a "Not now" beside it let
somebody dismiss the explanation without ever reaching the sheet. A message shown
before a permission request has to lead to the request. Saying no is the sheet's
own "Don't Allow" now, which is where the decision always actually was.

The notifications step had the same pair — "Enable notifications" and "Maybe
later" — and now has neither. `ConnectPanel` in Settings, Health is the third,
whose button used to read "Apple Health". None of the three carries a label
naming the permission, and none of them offers a way past the sheet.

**Losing the skip means the step has to be impossible to get stuck on**, and the
two are stuck in different places. Notifications was already safe:
`ensureNotificationPermission` is entirely local and `enable` calls `next()` from
a `finally`, so every outcome leaves by the same door. Health was not, which is
the next paragraph.

The health step asks for the permission ITSELF rather than through
`useConnectHealth`, and that is why. Every write in the app is `networkMode: 'online'`, so
react-query holds the connect mutation paused with no connection and never runs
its body — no sheet, and with the skip gone, no way out of the step. The screen
calls `requestAccess` directly (it is local, and answers offline), fires the
backfill without waiting for it, and moves on. The toasts hang off
`mutateAsync` rather than off `mutate`'s callbacks for the same reason: this
component is gone a tick later, and those callbacks go with it.

The flow opens on `setup`, which asks for a language and a unit system before
anything is measured. See [Language](#language) for why both are on one screen
and why it is the first one.

Step numbers come from `ONBOARDING_STEPS` in `features/onboarding/steps.ts` and
nowhere else. Written per screen they lasted until a screen was inserted: the
questions said "of 4" while the permissions after them said "of 9", and nothing
about that failed to typecheck.

### Providers and routes

`app/_layout.tsx` stacks the providers, and the nesting matters:

- `ThemeProvider` above the navigator, so every screen and Modal inherits the
  palette. The CSS-variable scope follows the React tree, not the native view
  hierarchy.
- `SessionProvider` inside the query provider, because signing in and out clears
  the cache, and one account's diary must never appear under another's name even
  for a frame.
- `ToastProvider` outside the navigator, so a "saved" confirmation survives the
  screen that fired it popping.

Routes come in two shapes. **Full pages push** (settings, the reports, search,
the dish detail, one recipe, the reviews list and one review) and carry a
chevron in their own `AppBar`. **Modals present** (the quick selector, the
paywalls) and carry a cross. Every pushed page passes that bar through
`Screen`'s `header` slot, outside the scroll view, so its way out, title and
trailing control remain visible while the body moves. `AppBar` reserves the
wider control width on both sides, keeping its one or two-line title centred on
the screen even when a trailing action is wider than Back. The native header is
off everywhere. A tab carries a left-aligned `ScreenTitle` instead, because
there is nothing behind it to go back to and the larger root heading establishes
the page hierarchy. The two paywall routes share `PaywallOffer`, whose centred
wordmark and close control are likewise fixed outside its `Screen`.

The logged-food page is the full-bleed exception. `CollapsingAppBar` keeps one
set of controls fixed over the hero image, then fades in the canvas and the
divider as the image's lower edge reaches the bar. The food name stays in the
body because Back plus three actions leave no useful title width in that row.
Scrolling back reverses the same transition. There are never two sets of live
controls, and a caller does not rebuild the back/action row to get the image
treatment.

**The quick selector's inline search hands off to the search page.** A dish
picked there is opened by replacing the sheet with `log/search`, carrying the
query, and pushing the dish over it. Both queue in one flush, so the user still
sees the sheet go and the dish arrive; what changes is what is underneath.
Replacing straight to the dish, which is what the barcode scanner still does,
left it standing on Today, so backing out of a portion nobody had decided on
threw the search away and made the user type it again.

**My foods hands off the same way**, and carries `?source=mine` as well as the
query, because what has to survive that trip is the TAB. That applies both when
opening an existing food and when tapping "New food": backing out returns to the
same My foods results instead of Today or All foods. `openOwn` and `openCreate`
sit beside `openPicked`, and the page does not focus its field when any of them
sent it, since a keyboard would come up under the screen on top.

Five tabs (Today, Feed, Groups, Trends, Me) on the headless `expo-router/ui`
Tabs rather than a styled navigator, because `NavBar` and `NavItem` are the
design system's and a native tab bar cannot be made to look like them.

**The bar floats, the full width of the screen.** It is drawn over the bottom of
the screen with no background of its own, so content scrolls on under the pill.
`NavInsetProvider` in the tabs layout tells each screen how much of its bottom
the bar covers (its height plus the home indicator), and `Screen` pads the last
row and lifts its floating corners by that much. Zero on a pushed page. A list
that `Screen` does not scroll, the feed, reads `useNavInset` and pads itself.

**The log button floats over Today alone**, at the bottom right, as `Screen`'s
`floatingTrailing`. It has been raised in the middle of the bar, which capped
it at four tabs, and beside the pill on every tab, which took the width a fifth
tab needed. The first time it floated over Today it sat over the last row of
the day and over the Delete of any row swiped open beneath it. `Screen` now
pads its content by the button's height whenever a trailing control floats, so
the last row scrolls clear of it, and Today drops the button while any row is
swiped open (`EntryList`'s `onRowOpenChange`), so it never covers a Delete.

If an earlier day remains selected, the log sheet shows its date. This matters
when it is opened from somewhere the diary's date is not visible, such as a
notification or a widget.

The log sheet remembers its last nonempty option, Snap, Describe or Search, in
MMKV per account on this phone. A fresh account starts with Snap; reopening the
sheet or relaunching the app restores the choice without waiting for a request.
Closing an option leaves it remembered. An explicit `?panel=` link takes
precedence, including the legacy barcode, label and recipes handoffs, and its
opened option becomes the next default. No Supabase preference is added.

There is no Activity tab. A day's steps and workouts are read in Today's "Your
day" list, a workout opens `activity/workout/[id]`, and a health store is
connected in Settings, Health. The tab's steps, balance and history pages had no
other way in and are gone with it.

My foods is in Settings. The old `/recipes` URL redirects there, while
`/recipe/[id]` and `/recipe/edit` still open individual recipes. Those two have
a layout of their own that waits for the session,
because a shared recipe is a link and a link is opened cold, before the keychain
read has finished.

---

## Language

Thirteen languages, all of them left to right: English, 简体中文, 繁體中文,
Bahasa Melayu, Bahasa Indonesia, ไทย, Tiếng Việt, Filipino, 日本語, 한국어,
हिन्दी, தமிழ் and বাংলা. `src/i18n/languages.ts` is the list, and it is the only
place a language is declared.

**No right-to-left bundle, and it is not an oversight.** Nothing in `src/ui`
mirrors: padding, chevrons, the progress bar and the week strip all read one way.
An Arabic or Urdu bundle would render as correctly translated copy in an app laid
out backwards, which is worse than English. Adding one is a layout project.

**Food is never translated.** A dish goes on screen in the spelling it was
written in, whatever the interface is set to: the catalogue, the recipes people
type and everything a model writes back. Nothing in `src/i18n` names a food, and
the preferences card says so out loud, where somebody changing the setting can
act on it.

### English is the source, and the type system enforces the rest

`src/i18n/en/` is a directory, one file per feature, carrying the reasoning: why
a string is worded the way it is, which bug it came from, what must not be said.
Every other locale is a single file that owes only the words.

What holds them together is `src/i18n/bundle.ts`. `Resources` is `typeof en` on
an `as const` object, so its leaves are literal types and a bundle declared to
satisfy it directly would only accept the English words back. `Bundle` widens
every leaf to `string` and keeps the shape, and each locale ends
`satisfies Bundle`:

- a key nobody translated is a missing property
- a key renamed in `en/` breaks every locale still carrying the old name
- a typo in a nested block is an excess property

So a bundle goes wrong in `pnpm check`, not in the simulator, and there is no
such thing as a string that silently falls back to English at runtime.

Plurals are the one place the shape lies a little. Most of these languages have a
single plural category, so `_one` and `_other` carry the same words and i18next
only ever selects `_other`. The `_one` keys exist because the shape is shared.
Filipino, Hindi, Tamil and Bengali genuinely have two, and are written out
separately.

### Where the choice lives

`src/i18n/preference.ts`, in MMKV, for the reason the theme preference is there:
it is read on the very first frame, before the query client, the session or a
network request exist. i18next is initialised synchronously at import time or the
first render paints raw keys, and it cannot wait for a row. It is also the only
store that works during onboarding, where the language is chosen on screen one
and the account does not exist until the last.

`user_settings.language` is still written, by `LanguageSync`, **in one direction
only**. The row is a copy the server can read; it never decides what is on
screen. Reading it back would undo the setting: a phone switched to Thai would
flip to whatever the row said one frame after the user watched the screen change.

`setLanguage()` is the only way to switch, and it moves three things that have to
agree: what i18next hands to `t`, what date-fns formats a date in, and what the
next launch opens in. The date locale matters more than it looks — month and
weekday names come from date-fns, not from a bundle, so without it a Japanese
interface prints "Thursday 14 October" in the middle of itself. Setting a default
locale also sets `weekStartsOn`, which would ordinarily move what the app calls a
week; it does not here, because every `startOfWeek` passes `WEEK_STARTS_ON`
explicitly. date-fns ships no Filipino locale, so that one bundle formats its
dates in English.

### It is asked on the first question, beside the units

`(onboarding)/setup` is step one of the flow, and it asks two things: the
language the app is read in and whether it measures in metric or imperial. Both
are there because both are answered by the screen immediately after it. `about`
asks for a height and a weight, and the fields it draws are centimetres and
kilograms or feet and pounds depending on what `setup` chose; asking afterwards
would mean converting what somebody had already typed or asking them to type it
again.

It opens on the phone's own language and on metric, so for most people it is a
confirmation rather than a decision, and Continue is live on arrival — the only
step in the flow where that is true, because it is the only one that is a
preference rather than a fact about a body.

Choosing a language applies it immediately rather than on Continue. The screen is
its own preview, which is the only way somebody can tell they picked the right
one from a list of names they may not be able to read. Continue writes the
selection again, and that is not redundant: somebody who agrees with the
preselection never touches the control.

The units answer goes into the onboarding draft and reaches `user_settings.units`
with the rest of the flush. The database stores kilograms and centimetres in
every language and every unit system; `src/lib/units.ts` converts at the edges,
and `about` is where both directions are exercised.

### What the language does NOT change, said where it is chosen

Every word of the interface is translated. The model that reads a plate, reads a
typed meal and answers "what should I eat" is not: it works best in English, and
it answers against a catalogue whose dish names, ingredients and serving labels
are all stored in English.

That is a real limit rather than one to hide, so it is said next to the control
in both places the control appears — the setup step and the preferences card. In
two strengths: a line under it for anybody who has actually chosen something
other than English, and the full version behind an info button beside the card's
heading, always there. `LanguageAiNote` renders nothing at all in English,
because there is nothing to tell somebody already reading the language the model
speaks.

The third thing the sheet says is the other direction: a dish already written
down keeps the spelling it was written in, whatever the interface is set to. It
used to sit under the picker as its own line of small print, which put two
caveats under one control and left the sheet answering only half the question.

The picker's own label is not drawn. One card holding one picker was saying
"LANGUAGE" and then "App language" directly beneath it; `Select` takes
`hideLabel` so the string still names the control for a screen reader and still
titles the sheet listing the thirteen languages. `Card` takes `titleAction` for
the same reason the info button is not `action`: `action` is the far edge of the
header, and a question mark pushed over there reads as a control for the card's
contents rather than for the word it sits beside.

**Chinese is why the device language is resolved rather than looked up.**
`languageCode` is `zh` for both scripts and the two are not mutually readable, so
a Taiwanese phone answering `zh` and getting 简体中文 is the wrong app. The script
code decides it where the OS sets one, and the region is the fallback: TW, HK and
MO write traditional, everywhere else simplified. `zh-Hant` is not a script
conversion of `zh-Hans` either — 大卡 rather than 千卡, 資料 rather than 数据 —
so an edit to one is not an edit to the other.

The second way in is Me, Language and units, which is the same `setLanguage()`
behind a dropdown.

### Type has to be set differently in a different script

Two things went wrong on a Mandarin phone, both of them invisible to anybody
testing in English.

**The leading belongs to both the font and the script.** Baloo 2 has a deeper
native line box than Nunito, and React Native clips it when a caller asks for
tighter leading. At less than 1.36x, even Latin rounded letters were visibly
cut off in "A few basics". A CJK glyph fills the box in both directions, and
Thai, Devanagari, Tamil and Bengali stack marks above and below the base letter.
`TextScriptProvider` tells the design system which of three scripts it is
setting, a metric rather than a word. `Text` combines that script floor with a
1.36x Baloo floor, including for callers that supply their own size and leading
through classes or an inline style.
Roomy Nunito prose keeps the leading it was designed with.

**Let native text scale the leading once.** React Native scales `lineHeight`
alongside font size on both iOS and Android. Multiplying it by
`PixelRatio.getFontScale()` in `Text` too made large-text screens grow huge gaps
and clipped single-line headings. `Text` resolves the floor in unscaled points
and leaves scaling to the platform. Callers that set their own
`text-[34px] leading-[42px]` pair, sizing type against a ring or a stepper, are
parsed back out of the class string. Safe pairs stay unchanged, while a tight
pair is raised to the font and script floors.

`src/ui/__tests__/typography.test.tsx` pins the arithmetic, because the failure
is silent and only visible in a language the person changing the code probably
cannot read.

### A date is more than its words

date-fns localises every token it is given, and cannot localise the order they
are written in. `format(date, 'EEE d MMM')` produced "周一 17 8月": three correct
words in an order nobody writes, and long enough that the Today title ran out of
room and ellipsised.

`src/lib/dates.ts` holds one pattern table per language and `datePattern()` picks
from it, so Chinese, Japanese and Korean get largest-unit-first and their own
day and month markers. The patterns live in `lib` rather than in a bundle because
they are date-fns tokens with meanings rather than copy: editing one is
reordering, never translating, and a bundle full of strings that must not be
translated is a trap for the next person in it.

---

## Signing in

Four ways in and one screen that picks between them.

```
(auth)/sign-in        Apple, Google, or an address
(auth)/password       a password, or "email me a code instead"
(auth)/verify         the six digits, for a signup or a passwordless sign-in
(auth)/new-password   the six digits and the new password, for a reset
```

`data/auth.ts` is every call. `features/auth` is the pieces the screens share:
the provider buttons, the password box, the error-to-sentence hook, the
deep-link handler, and the Turnstile widget.

**The mail leads with a code, and the link is the second offer.** A Supabase
confirmation link is single use, and corporate mail security follows every link
in an incoming message to check it, so the mail arrives already spent and the
app says it expired ten seconds after it was sent. A link also only works on the
phone the app is on. `{{ .Token }}` is in the subject line as well as the body,
so a signup can be finished from a notification banner.

**A password is an option, never a wall.** An account made with a code has no
password until it sets one; one made with a password can still ask for a code.
Every screen in the flow offers the code.

### Three things that were actually broken

**`site_url` was `http://localhost:3000` and `uri_allow_list` was empty.**
Supabase drops an `emailRedirectTo` that is not allow-listed and substitutes the
site URL, so every login link opened localhost on somebody's phone. It read as a
bug in the app and was two fields in a settings page. `pnpm auth:config` owns
both now and prints a diff before it writes.

**A repeat signup looks like a success.** Supabase will not tell a signup form
that an address is taken, because that turns the form into an oracle for who
uses this app. With confirmations on it returns an ordinary user object with
`identities: []` and sends no mail. `signUpWithPassword` reads the empty array,
the screen switches to sign-in and offers a code, and neither says why.

**A wrong code and an expired one are one error.** Both come back 403
`otp_expired`, for the same non-disclosure reason, so there is one
`code_invalid` reason and its copy covers both. Copy that said "expired" would
tell somebody who mistyped to go and wait for another mail.

### Keeping auth mail deliverable

The address field applies a practical internet-mail check before the app can
reach an endpoint that sends. It rejects malformed domains and a short list of
mail-provider misspellings observed in delivery failures, while accepting
Apple's `privaterelay.appleid.com` addresses. This cannot prove that a mailbox
exists. Cloudflare owns that last mile and its suppression list stops known bad
recipients from consuming another delivery attempt.

The app never retries an auth email automatically. A failed HTTP response does
not prove that no message went out: GoTrue can hand a message to SMTP and then
time out. `data/auth.ts` holds the address for a minute after an ambiguous
timeout, preserves any exact wait Supabase returns, and the resend screens show
that countdown. Only an ambiguous result or the per-address email limit moves
on to code entry; an IP-wide request limit does not pretend a message exists. A
definite refusal, such as a failed captcha, stays immediately retryable.
`pnpm auth:config` owns the one-minute per-address interval and the project-wide
hourly ceiling.

Apple private relay addresses are real addresses, not disposable-mail abuse.
Delivery to them requires every outbound domain to be registered under **Sign
in with Apple, Email Communication** in the Apple developer account. Register
`ricecal.app` for the From address and DKIM signature, and
`cf-bounce.ricecal.app` for Cloudflare's envelope sender and SPF check. A 550
`unauthorized sender` from an Apple relay address means that registration is
missing or no longer verified; do not suppress the recipient or reject the
relay domain in the app.

### The reset is one screen, and that is a race not a taste

Verifying a recovery code creates the session, and that session is both the
licence to change the password and what `(auth)/_layout` watches to decide the
sign-in stack is finished. Split across two screens, the guard carries the user
to Today and the password they came to change is still the password. So the code
and the new password are on one screen, nothing is sent until Save, and the
layout leaves `new-password` alone while it is on top.

Somebody arriving through the link already has a session, so that screen drops
the code field. It tests for a session from the link, not for any session.
Testing only for a session was a hole: a phone already signed in could open
`ricecal://auth/reset` with no code, land here, and set a new password with no
proof, which made the current password the change form asks for a check anybody
holding the phone could walk around. That visitor now gets the code field, with
nothing mailed yet and the resend open.

**The proof is a mark in memory** (`data/recovery.ts`): `completeLoginFromUrl`
sets it for the account when a reset link's code is actually exchanged, which a
URL with no code never does, and `updatePassword` clears it the moment the new
password is saved. It lapses after fifteen minutes, and a relaunch forgets it,
which costs a code in a rare case. Two token-based versions came first and both
were wrong in a way worth knowing. Reading the `amr` claim against the phone's
clock sent every real link to Today on a phone set fast. Reading it against the
token's own issue time left the form open after a finished reset for the rest of
the token's hour, because a refresh moments later still looked recent.

`auth/[action]` applies the same test, and on a reset link waits for the mark
rather than acting on whatever session the phone already had: a signed-in phone
has its old one before the exchange lands, and redirecting on it sent the real
link to Today. Once `new-password` has seen the mark it remembers it for that
account, so the mark lapsing mid-screen does not spring a code field on somebody
the link already proved. A code typed on the screen is remembered the same way
once accepted: if the save after it fails (most often the old password chosen
again) the retry does not ask for the code it already spent.

### Signing out when the server already has

A session can end on the server while this phone still holds an access token
that looks perfect: signing out every device, an account deleted, a session
revoked in the dashboard, GoTrue timing one out. The token stays validly
**signed** until it expires, so for up to an hour the two halves of the project
disagree about it.

- PostgREST and the catalogue Worker check the signature and nothing else. The
  diary loads, search works, the app looks signed in.
- Every edge function calls `auth.getUser()`, which asks GoTrue, which answers
  `session_not_found`. The function returns 401.

So scanning, refining, recipes, suggestions, photos and barcodes all stop working
while the app insists there is an account, and the only sign of it is
`/user session not found` in the Supabase logs. Nothing noticed: `refusalFrom`
reads 402 and 429 and hands a 401 straight to the caller's generic "that did not
work".

**auth-js does not catch this either, on purpose.** `_callRefreshToken` keeps the
session when a refresh fails while the access token is still valid, reasoning
that "destroying it now would log out a user whose access token works". That is
right for a refresh the network ate and wrong for one the server refused: the
token here works for exactly the consumers that never ask GoTrue, which is not
the same as working.

`lib/supabase.ts` hands the client its own `fetch`, which is the one place that
sees PostgREST, storage and all eight functions. A 401 from any of them starts a
probe, and `lib/revocation.ts` holds the two judgement calls it needs:

- **A 401 from `/auth/v1/` is not evidence.** A wrong password is a 401. Acting
  on one would end the session of somebody in the middle of starting one.
- **A refused refresh is the proof, not the 401.** The 401 is a symptom a stale
  token produces too, so the probe asks `refreshSession()`: the server either
  mints a new pair, in which case this is already fixed, or refuses the refresh
  token, in which case there is nothing left to be signed in with. Only a refusal
  counts, which is a 400, 401, 403 or 404. A 429 is a rate limit and a 5xx is an
  outage, and auth-js reports an unreachable server as status 0.

Then `signOut({ scope: 'local' })`, because there is no session on the server to
revoke and a global sign-out would be asking to end other devices' sessions,
which is not what happened. `SIGNED_OUT` does the rest through `SessionProvider`,
which is the same path the account screen's button takes.

Two things that would break it. The probe is skipped when `storedSession()` is
empty: once signed out every request carries the anon key and every function
answers 401 to it, so without that guard the app would announce a fresh sign-out
forever. And it is single-flight, because a screen fires several requests at once
and a revoked session produces a handful of 401s within a frame.

`SessionEndedNotice` says what happened, and it sits under `ToastProvider` for
the reason that provider sits outside the navigator: the sign-out empties the
cache and the layout guards send the user out to sign-in a tick later, so a
message belonging to the screen they were on would go with it. Arriving there
unannounced is the other half of the complaint.

### Editing an account

The Edit profile footer in the account card on Me opens `app/settings/account.tsx`.
The name and membership month and year stay above the stats. Membership uses the
profile creation date, falling back to the signed-in account date while the profile loads.
The inner page has a small avatar with a camera badge, membership date, and one
card of rows: read-only email with Copy, editable name, Change password and a
quiet delete action. The legal links stay below the card.
The name uses the standard outlined input. Long emails truncate to one line;
Copy and the accessibility label always retain the full address.
Names save on blur through the existing profile mutation. Blank names are rejected;
failed saves keep the draft for another attempt when the field loses focus.
The Back button waits for that save, and photo picking saves the name first so
two profile writes cannot overwrite each other in the cache.
Tapping the avatar opens the system image picker and the existing avatar upload.
The same page has a Private profile switch. It hides the account from people
search, suggestions and Discover while leaving direct links and existing follows
available.
The switch's explanation sits behind its info button. Auto post foods sits below
it: on for an account made by a current build, and switched on by the 1.1.0
announcement for an older one (see "News announcements"). On, it shares each
new food for today or yesterday to the feed as the food is committed. A private profile shares those posts with followers only. Auto post
workouts sits below that, on by default; see "Workouts on the feed".
Clipboard support requires a native 1.0.5 build; the app-version runtime keeps this bundle off older binaries.

**Password setup and changes are different forms.** `has_account_password()`
returns only whether the calling account has a stored password, which is not
whether its owner knows one. Supabase gives an account made from an email code a
random password of its own, and the stored row cannot be told apart from a chosen
one, so the lookup answers yes for every email account. A Google or Apple
account answers no until its owner sets a password. Deploy this additive
migration before the app; old binaries do not call it and keep their existing
flow. The lookup is restricted to authenticated callers and takes no user id. A
failed lookup offers retry instead of guessing which form to show.

An account without a password gets New password and Confirm new password. An
account with one also gets Current password. `changeAccountPassword` rechecks
status before saving, then verifies the current password with a separate,
nonpersistent Supabase client and the existing captcha flow. The captcha provider
lives inside the password sheet so its challenge is visible above the native modal;
the sign-in screen provider does not reach account settings. A wrong password
never reaches the update call. The temporary verification session is signed out
with local scope, and the app checks that the active account has not changed
before updating. The app's own session is never replaced by verification.
Supabase's global current-password requirement stays off: enabling it would break
released binaries that do not send that field. Recovery continues through
`updatePassword`, because a recovery code is the proof in that flow.

**"Forgot your password?" sits on the Current password label**, the same link and
words as sign-in, because most people who cannot answer that field never chose a
password: they signed up with a code and were asked for the random one. It mails a
reset code to the account's own address (`sendAccountPasswordCode`, through the
sheet's captcha) and swaps the field for a code field with a resend countdown.
`resetAccountPassword` spends the code on an isolated client, checks that it
signed in this account, signs that session out, and then sets the password on
the app's own session. The order matters: a password change signs out every
session except the one making it, so the app's is the one that has to make it.
Nothing about the account is typed in, so the code can only go to the inbox that
already owns it. Until this existed the only way through was signing out and
using sign-in's reset.

The mail also carries a button, and on this phone it works: the app's client
stored the reset's PKCE verifier, so tapping it signs the app in for the reset,
spends the code and opens `new-password`. The sheet listens for that
(`onPasswordRecovery`) and closes, rather than staying on top, as a native modal
would, holding a dead code. A save that fails for any reason but a wrong code
clears the field, because most failures come after the code was checked and
checking it spent it. The sheet cannot be dismissed while a code is being sent,
since its captcha challenge lives inside it.

Closing the sheet clears all password fields. The server's minimum length and
matching confirmation are checked before submitting. Password and deletion forms
use full-height sheets: the keyboard overlays the surface while the form can
scroll to keep fields reachable. The info button beside the deletion confirmation
heading shows what is erased.

### Deleting an account

`app/settings/account.tsx`, reached from **Me, Edit**, and it exists because
App Review guideline 5.1.1(v) requires it: an app that lets somebody create an
account has to let them delete it from inside the app. Not by email, not by
asking somebody. This app was rejected for offering only the email route that
`ricecal.app/data-deletion` used to describe.

The delete action opens a sheet that says it cannot be undone. The user types
`delete` before the final button enables. Closing the sheet clears that text.
Nothing bargains or asks for a reason. A subscription that renews gets one extra
line,
because billing lives with Apple or Google and deleting the account here stops
none of it.

The server half is `functions/delete-account`, and it does two things in an
order that is the whole design:

1. **Every object under the user's two R2 prefixes**, by listing the folder
   rather than reading `photo_path` off the rows. A key is minted before the row
   that will hold it exists, so an upload whose insert failed is an object no
   row has ever named, and listing is the only thing that finds it.
2. **The `auth.users` row**, with the admin API. Every table in the schema
   hangs off it with `on delete cascade`, so nothing in that function
   enumerates tables — a list of tables there is a list a future migration
   silently makes wrong.

**Objects first.** The retention sweep runs the other way round (delete the
object, then forget the key) because there the row is the only record of the
key. Here the keys are *derived from the user id*, so the id is the thing that
has to outlive the sweep: delete the account first and a failed sweep strands
every photograph for good, with nothing left that knows the prefix. A failure
therefore leaves the account entirely intact and says so, and pressing the
button again is cheaper than the first attempt, because the objects that did go
are really gone.

The phone then signs out with `scope: 'local'`, for the reason
[the section above](#signing-out-when-the-server-already-has) gives: there is no
session left on the server, and the user the token names no longer exists.
`SIGNED_OUT` does the rest through `SessionProvider`: cache, pictures on disk,
pending snaps, RevenueCat and product analytics. The PostHog *person* is cleared
explicitly first (`forgetPerson` unsets its properties), because `email` lives on
it and is the one identifier in the whole analytics plan that names a person; it
has to happen before the reset, or it lands on the fresh anonymous person instead.
GA4 never receives the address. Its local user and installation identifiers are
cleared on reset, while its historical events remain pseudonymous.

What survives, and `ricecal.app/data-deletion` says the same in the user's own
words: a recipe somebody else saved into their own diary (`source_recipe_id` is
`on delete set null`, and the copy became theirs when they saved it), the
anonymous catalogue-widening rows, which carry a search term and no account,
and whatever Apple, Google or RevenueCat hold about a purchase, which is theirs.

### The eight auth emails

`apps/supabase/templates/`: one layout, eight bodies, and a script that puts
them on the project.

```
_layout.html    the shell: doctype, palette, card, footer
_partials.html  the code block, the button, the rule
logo.png        the app icon at 96px, inlined into every message
<message>.html  one body per email, with its subject in a metadata block
build/          what the three of them make. Committed. Do not edit.
```

```sh
pnpm email:build   # rewrite build/
pnpm email:check   # fail if build/ is stale (CI runs this)
pnpm email:push    # build, then send to the project named by .env.local
```

**Nothing pushes these for you, and that is the trap this folder sets.**
`build/` being committed and green in CI says nothing about what the hosted
project sends. `email:push` is hand-run, and the whole of the app's design
landed here once and sat unpushed, so every real signup got the previous design.
To see what production actually sends, ask it:

```sh
curl -s -H "Authorization: Bearer $(security find-generic-password -s 'Supabase CLI' -w)" \
  "https://api.supabase.com/v1/projects/<ref>/config/auth" | jq -r .mailer_templates_recovery_content
```

`email:check` also compares each **subject** against the copy in `config.toml`,
which the CLI wants separately from the body. Kept in step by hand those two
agree until somebody edits one, and the symptom is invisible.

One trap the CLI sets, and it costs a `supabase start` to find. A
`[auth.email.template.*]` `content_path` resolves from the workdir, which is
`apps`, so it reads `./supabase/templates/build/…`. A
`[auth.email.notification.*]` path resolves from the supabase directory, so it
reads `./templates/build/…`.

A body looks like this:

```html
<!--
key: recovery
subject: {{ .Token }} is your RiceCal password reset code
preheader: Use this code to choose a new password.
-->

<h1 ...>Reset your password</h1>
<!--PARTIAL:code-->
<!--PARTIAL:button|Choose a new password-->
```

`key` is the Supabase template name and everything else is derived from it: the
API fields, and for a key ending `_notification` the flag that decides whether
it is ever sent. `preheader` is the line a mail list shows under the subject;
left out, the client shows the wordmark and then the heading twice.

**One idea a message, and the shared lines live in the layout.** The footer
carries **support@ricecal.app**, and the sentence around it is deliberately not
"ignore this email": a password-changed notice is precisely the mail nobody
should ignore.

A tail line survives on a body only where it says something the reader cannot
work out from the rest:

| | |
|---|---|
| `recovery` | nothing has happened to the password yet |
| `email-change` | the change needs a code from both addresses |
| `reauthentication` | nobody from RiceCal will ever ask for the code |
| `email-changed`, `password-changed` | what to do, since these are notifications |

Four constraints shape the markup, and all four are about mail clients:

- **Tables, not flex or grid.** Outlook renders through Word's engine.
- **The palette is declared twice**, once inline and once in a
  `prefers-color-scheme` block. Declared only in the style block, Outlook
  renders black on black.
- **The fonts are an enhancement, never a dependency.** Gmail ignores Google
  Fonts, so every family declaration carries a full system fallback.
- **The one image is inline.** Most clients block a remote image, so the app
  icon is a `data:` URI spliced in at build time. It costs about 9KB against
  Gmail's 102KB clipping threshold.

Two of the eight are never sent by the app. `invite.html` is an admin call,
written and pushed anyway because the alternative is Supabase's unstyled default
going out the first time somebody invites a tester. `reauthentication.html`
carries no link, because the answer has to come back into the session the person
is already sitting in.

### Cloudflare Turnstile

`features/auth/turnstile.tsx`. With `security_captcha_enabled` on, Supabase
refuses any sign-in, sign-up, mailed code or password reset arriving without a
token it can verify.

Turnstile is a browser widget, so the app hosts one in a hidden `WebView` in
`execute` mode with `interaction-only` appearance. When Cloudflare wants a
human, the same WebView is restyled into a panel over the screen. Restyled,
never remounted: a reload throws away the challenge in progress.

**It fails open, on purpose.** No site key, no WebView in the binary, a script
that will not load: all of them send no token and Supabase decides. Failing
closed here adds no protection the gate is not already providing, and does add a
way for a broken WebView to lock somebody out of their own account.

#### Turning it on

The order matters, because a build already on a phone has no idea it is meant to
send a token.

1. **Create the widget** at Cloudflare → Turnstile → Add widget, mode
   **Managed**, with the hostname the WebView uses as its origin.

   **Managed, not Invisible.** The three modes differ in what happens to a
   visitor Cloudflare judges suspicious: Managed escalates to a checkbox, and
   the other two never do, so a real person who scores badly simply cannot sign
   in. A hidden WebView on a phone scores badly more often than a browser does.
   `appearance: 'interaction-only'` keeps a Managed widget invisible until that
   escalation happens.

   **List the apex.** `ricecal.app` covers the apex and every subdomain;
   `www.ricecal.app` covers that subdomain and explicitly not the parent. The
   app sends the apex, so a `www`-only list answers it with `110200` for ever.

   `npx wrangler turnstile widget list` prints the sitekey, mode and domains,
   and `widget get <sitekey>` adds the secret. That is the only way to see the
   secret at all, since Supabase will not give its copy back.

2. **Store the secret on Supabase**, gate still open:
   `pnpm auth:config --captcha-secret 0x4AAA... --push`
3. **Ship a build carrying the site key**: `EXPO_PUBLIC_TURNSTILE_SITE_KEY` and
   `EXPO_PUBLIC_TURNSTILE_ORIGIN`. `react-native-webview` is native, so this
   needs a real build.
4. **Close the gate** once that build is what people are running:
   `pnpm auth:config --captcha-on --push`. Reversible with `--captcha-off`.

#### `about:srcdoc`

Turnstile builds its challenge frame as an iframe with a `srcdoc` attribute,
which the WebView sees as a navigation to `about:srcdoc`. `originWhitelist`
governs iframe navigations too, so a list of `https://*` made
react-native-webview refuse to load it internally and hand the URL to the OS.
The only trace was one line in the Metro log, and the widget then loaded,
rendered, reported `ready`, and could never produce a token.

The symptom is on the server, so that is where the search starts, and everything
there is correct. Two days can go into confirming that a correct configuration
is correct. The fix is `'about:*'` in one array.

#### When it refuses a real person

Five things fail identically and four of them are not in this repo, so every
failure is reported: a `[captcha]` line to the console, and the same text to
PostHog error tracking as a warning-level exception (`reportMessage`). The code
is what separates them.

| what error tracking says | what it is | where the fix is |
|---|---|---|
| `absent: no site key in this build` | never reached the bundle | the EAS environment for that build profile |
| `absent: no WebView in this binary` | binary predates `react-native-webview` | a native rebuild; OTA cannot add it |
| `unusable: 110200` | origin is not on the widget's hostname list | add it under Hostname Management |
| `unusable: 110100` / `110110` / `400020` / `400070` | wrong or disabled site key | the key, or the widget |
| `gave up after N retryable errors` | scored a bot, twice | the widget's mode |
| `timed out with no answer` | executed, then twenty seconds of silence | usually the network |

**Nothing at all in error tracking, with sign-in still failing, is the sixth case: the
secret.** It has to belong to the same widget as the site key. A mismatched pair
produces a token the app is happy with that `siteverify` then rejects. Silence
is the evidence: the widget did its job.

---

## Logging a meal

Three ways in, and the FAB opens all of them in one sheet
(`app/log/index.tsx`): **Snap** a photo, **Describe** it in words, or **Search**
— for a dish in the catalogue, for food this account wrote itself, or for a meal
it has eaten before. Scanning a barcode is a tab inside the camera. Whatever the
route, the entry is written against `selectedDate`, the day the strip on Today
has selected.

**Every camera fills its sheet.** `InlineCamera` with `fill` takes the height a
full-height, non-scrolling sheet has left and runs out to its edges and under
the home indicator; what used to sit around the box (the meal / barcode switch,
the "turn the packet over" prompt, the scans left) floats on the feed instead.
The three tiles above it shrink to a bar once a panel is open. It was a 310pt
card with a third of the sheet empty below it, and a plate is only as legible as
the frame it was taken in. The log sheet, the picture picker and the recipe
reader all use it, so a fourth camera should too.

**Pinch, tap and the 1x lens.** A pinch on the feed zooms the camera itself, up
to `MAX_ZOOM` (8x), so the photo zooms with the preview; a chip shows the zoom
while it is above 1x and a tap on it goes back. A tap anywhere else on the feed
focuses and exposes there, and iOS goes back to continuous focus at the centre
once the scene changes. Both need `patches/expo-camera@58.0.12.patch`, which is
native code: a JS-only update does not reach a build without it.

**A patch to an Expo module's native code needs `buildFromSource`.** From SDK 58
the app links most Expo modules as precompiled binaries (`ExpoCamera.xcframework`
in `ios/Pods`, a 📦 beside the project in `gradlew projects`), so a patch to
their Swift or Kotlin compiles into nothing and the JS half calls a function the
binary does not have. `expo.autolinking.buildFromSource` in
`apps/mobile/package.json` lists the ones built from the patched source; a
module added there needs `pod install` and a fresh Gradle sync.

The patch also fixes the camera opening on the ultra-wide. On a phone with one,
expo-camera uses the virtual back camera so close-ups can switch to the macro
lens, and sets its zoom factor to where the 1x lens takes over. Committing the
session preset then changes the device format, which resets the factor to 1.0,
and on that device 1.0 is the 0.5x ultra-wide. Nothing set it back, because
`zoom` never changed. The patch watches the device's `activeFormat` and
re-applies zoom whenever it changes, whatever changed it, and clamps the factor
to the device's available range, since a factor outside it raises. Moving to a
new expo-camera means checking each of those against the new version before
dropping the patch. `zoom` is exponential on iOS and linear on Android, and
`zoomProp` is the one place that knows.

Search, scan and quick-add are ordinary writes. The other two run the cascade.

There was a fourth tile, **Recipes**, and it opened a shelf of the food the user
had written with a search field of its own. It is the middle tab of search now.
A tile that opened its own list with its own field made "search for a dish" two
different features depending on who had written the dish, and the one word
somebody types is the same word either way. The widget still asks for
`?panel=recipes` — it is native, and it is on home screens built against a
version of the app that had the tile — so `openingPanel` maps that name to
search opened on My foods rather than letting it fall through to the camera.

### Search has three tabs, and only the first is the catalogue

`FoodSearchPanel` puts one field over three lists. **All foods** is the
catalogue: 48,000 shared rows, ranked by the Worker, asked over the network on a
debounce. **My foods** is what this account wrote itself, newest first, which the
database calls a recipe. **Past foods** is what it has eaten before, newest
first, filtered on the phone as you type.

**One field above all three**, because the word somebody types is the same word
whichever list they meant it for — and a field per tab would lose it on exactly
the switch that wants it, since "not in the catalogue, was it something I have
eaten?" is the question the third tab answers.

**A tab is offered only where its host can act on a pick.** The ingredient
picker passes neither `onPickOwn` nor `onPickHistory` and gets no strip at all,
rather than a strip with one tab on it: a pot is not an ingredient, and a single
tab is a label pretending to be a control.

**`OwnFoodList` lives in `FoodSearchPanel.tsx` rather than in
`features/recipes`.** `IngredientSheet` imports this panel, so a panel that
imported the recipe feature back would be a cycle.

The Past foods list **is folded to one row per dish**, keeping the most recent
of each, and the key is name plus per-serving calories plus portion label. Unfolded it is the
diary again, and a diary is the screen the user just came from: three weeks of
the same breakfast, in order, is not a list of foods. Folded on the name alone,
a 108 kcal packet of soy milk would hide behind the 511 kcal hawker one it
shares a word with, offering one of them under the other's calories. Which row
survives matters too: the newest carries the portion and the photograph the user
last accepted.

**A pick from Past foods is WRITTEN, where a catalogue pick opens the portion
screen.** The catalogue knows a food and not how much of it; an entry is a meal
somebody already ate at a size they already accepted, so `snapshotFromEntry`
copies the figures verbatim — a repeat lands on the same calories to the digit —
and the quantity travels with it. There is no id to hand over instead: an
entry's `food_id` is null for everything the cascade estimated, and repricing
from the catalogue row it names is the bug `withCataloguePortions` exists to
stop.

The rows carry their own picture, which is most of the point. A meal somebody
photographed is recognisable from six weeks away in a way its name is not, and
the catalogue's side has a drawing at best.

**The drawing is copied and the photograph is not.** A repeat writes a new row,
and two rows naming one object in the bucket would leave the retention sweep
deleting a picture the other still points at — so `snapshotFromEntry` carries
`icon` and nothing else about the picture. Which is why a scan writes
`item_icon_*` in the first place: without it, every photographed meal repeated
out of this tab came back as the empty-plate placeholder. See "Every entry
carries the dish's own drawing".

**My foods writes on the plus and opens on the row**, which is the split the
shelf itself makes: how many servings is a question with an answer screen, and
"one, the way I always have it" should not need it. An empty My foods offers the
form, because somebody searching for food they have not written yet is exactly
who should be told it can be written.

### Scanning a barcode

The only exact way in. Everything else asks a model what something is or asks
the user to spell it; a barcode **is** the product, so there is no ranking, no
candidates and no confidence. One row or none.

```
camera reads a code → leave immediately for /log/food/packet:<code>
                    ↓
  functions/barcode   D1 by barcode          hit  → the product, priced
                      Open Food Facts, live  hit  → written back, returned
                                             miss → the meal camera, to photograph
                                                    the nutrition panel
```

**The viewfinder does not wait for the answer**, and that is the whole shape of
this flow. Waiting put a spinner over the camera and said which of four things
was happening underneath; three of those four were a person standing in a shop
watching a camera not move (the live fallback allows six seconds for Open Food
Facts) and the fourth replaced the sheet with a different screen anyway.

So the code is the answer as far as the scanner is concerned, and the page it
hands the code to owns every way the lookup can turn out: a skeleton while it
waits, the product when it lands, the camera when nothing knows the packet, and a
screen with Scan again on it when the lookup could not be made at all.

**A miss goes straight to the camera**, opened on the meal side with a line
saying to photograph the nutrition panel (`/log?panel=label`). It used to stop on
a screen whose primary button was "Describe it instead", which asks somebody
holding the packet to type out what is printed on the back of it. `scan-meal`
already reads a photographed panel and logs it exactly — `resolveByLabel`, tier
1, no cascade and no guessing — so the answer to a packet we do not have is to
turn the camera around. It costs a scan, which the sheet's own quota line says.

A lookup that could not be MADE is the other case and still stops: the packet may
be fine and the connection was not, so "Scan again" is the primary there, with
the label camera under it.

A packet reaches that page under an id of its own, `packet:<code>`. A packaged
product lives in D1's `product` table keyed by the barcode and has no `foods.id`
at all, so the scanner had nothing to put in the `[id]` segment and the app
answered a correctly identified packet with its own "page not found".
`packetFoodId` mints the placeholder, `useFood` resolves it through the
scanner's endpoint, and `snapshotFromFood` drops it before it can reach
`food_logs.food_id`, which is a uuid column.

"Scan again" goes to the day with the scanner already open (`/log?panel=`),
because where the user was is a viewfinder inside a sheet this screen replaced.
It drops the packet's cached answer on the way, or a rescan after a lookup that
could not reach the catalogue would be answered from the cached failure.

**Codes are stored as GTIN-14, zero-padded**, because one packet has four
spellings (UPC-E, EAN-8, UPC-A, EAN-13) and an American scanner drops the
leading zero an EAN-13 carries. `gtin14` exists in SQL and again in the edge
function, deliberately duplicated and separately tested, because the function
has to normalize before it can ask Open Food Facts anything.

The live fallback is what makes the stored slice an acceptable trade. D1 holds
3.2 million packaged products; Open Food Facts has 4.7 million, and the ones
anybody actually scans get written into the catalogue the first time.

**The check digit is deliberately not validated.** Real packets and OFF both
carry codes that fail it, and a lookup that refuses to try is worse than a miss.

**A product with no macro panel is never written.** `foods.carbs_g` and its
neighbours are `not null`, so the only way to store one is to fabricate zeros,
and "0 g protein" against a tin of tuna is worse than not having it.

**And Malaysia is the thin part of all of it.** Of those 3.2 million rows, 4,333
carry a GS1 Malaysia prefix, fewer than Thailand and 0.13% of the catalogue.
That is not a filter in this repo: the pipeline takes every OFF product with a
panel and a code, and 4,333 is 96.5% of every Malaysian-prefix row Open Food
Facts has that is usable at all. The source is the ceiling. See "Why the scanner
misses Malaysian packets" above.

### The scan cascade

**Client** (`src/data/snap.ts`):

1. The shutter puts a *pending snap* on the day immediately, in context and MMKV
   (`data/pending-snaps.tsx`), because there is no row to insert yet.
   `useDayLog` merges it into the day.
2. It also **schedules** the "your plate is counted" notice right there. iOS
   suspends a backgrounded app within seconds, so code that runs when the answer
   arrives may never run; a notification already scheduled still fires. It is
   cancelled if the app is awake when the scan lands.
3. Upload first, then invoke. The function reads the photo out of the bucket, so
   there is nothing to recognise until the object exists. A typed meal skips
   this and is one call shorter.
4. On success the pending row is dropped and the day refetches. A pending row
   whose entry arrived by another route is recognised by source and timestamp
   and dropped, or the meal appears twice for a second.
5. **A snap the app was suspended during is polled for.** This is the one people
   report as "the notification said my plate was counted, I tapped it, and the
   row was still spinning — it was fine after I restarted the app", and it is
   the whole reason `PendingSnap.suspended` exists.

   iOS takes the in-flight request down with the process, so nothing calls back;
   the edge function writes the entry anyway. Coming back to the app refetches
   the day ONCE, on focus, and a scan that lands a few seconds after that missed
   the only chance anything had to notice — the poll only ran for rows already
   in `waiting`. The row then span for two more minutes and called itself
   failed, over a meal sitting in the database. Force quitting fixed it because
   a restored row IS `waiting`, which is the shape of the fix: an `analysing`
   row that crossed a suspension is polled for on the same terms, without a
   restart and without taking the progress bar off a scan the user watched the
   whole time. The flag is set on `background` and not on `inactive`, because
   the second is what a permission dialog produces and the notification prompt
   fires at the shutter of the first scan an account ever takes.

**Server** (`functions/scan-meal/index.ts`, cascade in `_shared/cascade.ts`,
model calls in `_shared/llm.ts`). One vision call returns queries, per-component
sizing and a kcal *range*, never nutrients.

**Sizing is a weight before it is a calorie count**, and `_shared/portion.ts` is
what that buys. Grams are the one thing about a portion a picture actually
carries, and unlike a calorie figure they can be checked: against the macro
grams the model reports beside them, and against catalogue rows that state their
own serving weight, where 30 g of the thing is arithmetic rather than a second
opinion.

Anchored to the model's kcal instead, one bad guess became a bad entry: told a
satay stick was 180 kcal, the catalogue search accepted rows within a band
around that figure, so the catalogue's own 36 kcal a stick was excluded and four
skewers were logged at 720. Weights only ever bound a figure downwards.

Then, in order:

- **Nutrition panel** → read the figures off the label and stop. Somebody
  photographing a panel is saying the answer is printed here.
- **No food** → answer `{ok: true, food: false}`, write nothing. A blurred plate
  is still a meal; a photo of a cat is not.
- **Tier 2, components** → when the model *listed* two or more parts. Each
  resolves to its own catalogue row and the entry is their sum. Gated on the
  list, not on `scene`: a banana leaf of satay came back "single" with three
  components on it. Both ways this tier gets a plate wrong are about size rather
  than identity, and both are in [Rules you must not
  break](#rules-you-must-not-break): a count applied twice, and a whole article
  rescaled to a guessed weight.
- **Count** → several of one countable thing. Three durian are three, priced per
  unit.
- **Tier 1/3, dish** → the Worker's search (specific, generic, head noun), a
  verifier picks one, a wide ratio gate accepts it. Identity is what a vision
  model is good at; calories are what it is worst at.

  The verifier is told that a branded or restaurant version of a dish is still
  that dish, because the vendor is not the food. It is now also told that the
  FORM is: a bottled, canned, instant or powdered version is not a match for one
  made fresh. Without that sentence a photographed cafe latte was priced from a
  bottled ready-to-drink latte four runs in six, at 100 kcal and 3 g of protein
  against the 190 and 10 of the drink in the picture. Both rows are named
  "Latte", both match the query exactly, and the entry wears the model's own
  name for the meal either way, so nothing on the screen said which had answered.
  The serving labels ("1 bottle (250 g)" against "Regular (350 ml)") were in
  front of the verifier the whole time; it needed to be told they mattered.
- **Tier 4, estimate** → a second model call, Atwater-checked, kept as numbers
  on the entry. It used to write a shared catalogue row; a guess reused is still
  a guess.

**A catalogue that does not answer costs two waits, not one per part.** Each
search has four seconds (`_shared/catalogue.ts`), and the parts are searched in
turn, so a Worker that hung for 90 seconds on 2026-10-20 held one five-part plate
for 25 seconds while every part timed out and was priced from the model anyway.
Two failed searches in a row now pause searching for 30 seconds in that isolate;
any answer resets the count, so the occasional single slow search pauses
nothing. A read whose connection broke (`TypeError`, back in milliseconds) is
asked once more inside the same four seconds. A timeout is not, and a write is
never sent twice.

**There is no tier 5, and there was.** It classified the plate into one of sixty
seeded generic rows and, failing that, wrote a terminal "Mixed meal" of 600 kcal
at a hardcoded id that needed no model and no network. The argument for it was
that a diary refusing a meal is worse than one logging it roughly.

That argument is wrong in the direction that matters, and the database says so.
Nothing downstream can tell a rough answer from a real one: the row sat on the
day with the user's own photograph on it, counted in the ring, the week, the
trends and the review. Real diaries carried "Mixed meal" at 600 kcal wearing the
labels "Popcorn", "Coconut Latte", "Ice kachang" and "Chilli pan mee" — meals of
150 to 400 calories, every one of them, all logged in the two days after a model
setting made the vision call start failing silently. Nobody could have known:
the floor's whole purpose was to make a failure look like an answer.

So `resolveItem` returns null when every tier declines, the endpoint writes
nothing and answers `ok: false`, and the row on Today says it could not be read
and offers to be logged by hand. Once the caller is authenticated and the body
parses this endpoint still does not return an HTTP error — a failed scan is a
result, not a protocol problem — but the result can now be "no".

**A failed scan writes nothing at all, which is why every item is resolved
before any of them is written.** With a floor that could not fail, the loop
resolved and wrote one item at a time; without one, a plate whose second
component cannot be priced would otherwise leave the first on the diary as half
a meal.

### Typed and photographed are the same pipeline

A meal can be typed ("nasi lemak with fried chicken and a teh tarik") and that
is the same endpoint and the same cascade. Only the first model call differs:
`describeMeal` instead of `analysePhoto`, both answering in the same `Vision`
shape. `food_logs.source` (`text` vs `camera`) is the only place the two part
company.

**The difference is who the authority is.** A photo has one witness and it is
the model, so everything it says is inference the catalogue then checks. A
sentence was written by the person who ate the meal, so what it states is the
answer, and the model's job is only to name it searchably and price the portion
it was told about. The shared parts of both prompts are shared constants in
`llm.ts`; the size anchors were expensive to derive and a second prompt with its
own copy would have relearned them wrong.

**A stated portion is a `count` below one, and a dish the person named as one
thing stays one thing.** Both were prompt rules that did not hold. "Half a plate
of char kuey teow" put the half in the calorie bounds and in the words, neither
of which the app can act on, and logged a whole plate three times out of three;
a fraction of a serving now lives in `count`, and `grams` stays the weight of
one whole unit.

And "chicken rice" came back decomposed into coconut rice plus roast chicken no
matter how the prompt was worded, so on the typed path it is enforced instead:
`keepDishesWhole` drops a breakdown when the sentence contains nothing that
could join two foods. That check is possible here and only here, because this is
the one path where the app knows exactly what the person wrote.

The client mirrors that difference only where it has to: a typed row wears the
sentence until the dish lands, because a snapped row has its photograph and a
typed one would otherwise be a spinner over an empty line.

**A typed meal also picks its own drawing**, and only a typed one. It has no
photograph, so the row would be a name over an empty square, and the model that
just read "nasi lemak with fried chicken" knows which of our illustrations that
is. The prompt carries the list of icon names and the answer is validated
against it in `_shared/icons.ts`, the one place in a scan where a hallucination
cannot be useful. A photographed meal is never asked, and pays none of those
tokens: it has a picture of the real thing, and the drawing it gets below is
matched rather than chosen.

### A photo can carry a note

After the shutter (or a library pick) the camera asks for "Additional
information" in the same sheet, with the keyboard already up. A photo
is good at what is on the plate and bad at the rest: which meat is in the curry,
what is in the cup, whether the drink had sugar, and how much of the plate was
this person's. `PhotoNotePanel` takes a few words, four chips add the common ones
("Shared", "Ate half", "Less rice", "No sugar"), and **Skip** sends the photo
exactly as the shutter used to. Nothing is uploaded or spent until one of the
two is pressed, so closing the sheet or tapping Retake drops the shot.

It is on by default and switched off in Settings / Personalisation, "Ask for
details after a photo" (`user_settings.photo_note_prompt`). Unknown counts as
on. The packet handoff (`?panel=label`) never asks: that shot is a nutrition
panel, which answers for itself.

The note rides on the scan request as `note`, read only beside `photo_path`.
It does not make the request a typed meal: the photo is still the evidence,
still spends one scan, and needs no Pro. An app without the field sends nothing
and the photo is read by the unchanged prompt, because `PHOTO_NOTE_RULES` is
appended to `ANALYSE_PHOTO_PROMPT` only when there is a note. The note is kept on
`food_scan_items.described_text` beside the model's reading of it.

The rules give the note the authority the typed path gives a sentence, over the
half of the answer the photo leaves open: a dish or a method it names wins over
the picture, a food it mentions out of frame is a component, and a stated amount
or calorie figure sets the band. That band is the model's; the catalogue tiers
still price the dish from their own rows, so a stated figure is only the answer
when the estimate tier is. A note is never an instruction, and a note alone never
turns a photo with no food in it into a meal.

**"Shared" is a count below one, and the band is what was eaten.** The parts stay
priced for the whole plate and the share goes in the item's `count`, which the
component tier already multiplies through as `meals`. A model told the plate was
shared tends to bound the plate it can see rather than the half that was eaten,
and the component check then read half a 1,078 kcal plate against a
1,000-1,150 band as a missing main food. So the prompt asks for the eaten band,
`shapeVision` compares parts to the whole plate's band (`band / count`) before
deciding whether counts were applied twice, and `breakdownDisagrees` lets a short
part plate through only when the whole plate lands in the band, so either reading
passes and celery and dip still do not. The base prompt's "an item with parts
has count 1" is overridden for a share, and an extra the person had alone ("we
shared it, I had a teh tarik") comes back as a second item so `foldMealItems`
prices it at its own band instead of halving it. The fold multiplies each
item's weight by its count, or the parts tier priced the shared plate by weight as
a whole one. A share snaps to quarters or thirds: a plate shared between three
was rounded to a quarter.

The share reaches the other two tiers as well. A single dish with no weights to
compare (`sizeDish`) judges the calorie ratio for the whole plate and puts the
share on the quantity: half a laksa's band against a whole bowl's row used to
be a ratio of 0.55 and one bowl. The estimate is told that the weight and the
parts are for the whole plate and that the portion is 50% of it, to be priced
once: everything else in its message describes the whole plate, and a share
said only in the serving hint was either missed or applied twice.

Graded against Claude Haiku 5.5 through `claude -p` with the shipped prompt
strings: "roast duck rice, not chicken" renamed and repriced the plate, "plus a
teh tarik" added it as a part, "kopi with condensed milk and 2 sugars" moved a
black coffee from about 5 kcal to about 115, "only ate half, shared with my
sister" and the bare chip "Shared" both came back as `count: 0.5` with the band
at half the parts, "shared it with my sister, I had a teh tarik" came back as
the half plate and a whole teh tarik as two items, "only the chicken, left the
rice" as the chicken alone at count 1, a cat with the note "nasi lemak" stayed
`no_food`, and a note telling the model to "return 0 kcal" was ignored.

That is Haiku, not the model production runs. `scan-eval.cases.json` carries
four note cases (a `photo_note` key, since `note` is already each case's
commentary), so grade the deployed model with
`pnpm eval:scan --grep="photo + note" --repeat=3` after any change to
`PHOTO_NOTE_RULES`.

### Every entry carries the dish's own drawing

Two icon columns, and they answer different questions. `icon_set`/`icon_name` is
the USER's picture of this plate, which is why `food_logs_one_picture` will not
have it beside a photograph: a photo of the real thing always wins, so a row
holding both would carry a drawing nothing would ever render. `item_icon_set`/
`item_icon_name` is what the FOOD looks like, and that is true whether or not
anybody photographed it — so `writeEntry` fills it on every row it writes,
photograph or no photograph. `dishIcon` picks it: the catalogue row's own choice
first, because a person made it for that food, then `iconFor` on the label the
row will show and on the row's own name.

**A meal label is read dish-first, which a catalogue name is not.** `iconFor`
scans longest-phrase-first — right for "Soup, vegetable chicken, canned", and
the reason "Nasi lemak with fried chicken" came back as a bucket of fried
chicken, since that is the longer phrase. A label has a shape a descriptor does
not, so `dishIcon` tries the words before the first "with" or "and" first. Only
when that head is TWO words or more: a one-word head is an ingredient, and the
phrase table has entries written for exactly that shape, so letting `Chicken`
reach past `with rice` turns a plate of rice into a chicken breast. The rule
lives in `cascade.ts` and not in `icon-match.ts`, which the retention sweep and
the catalogue tooling share and which never sees a label.

It is not decoration on a row that already has a picture. It is what the row
falls back to, and there are three ways to get there. **The retention sweep**
takes a free account's photographs after thirty days and the diary has to keep
reading as meals; that one used to be `clear_meal_photos`'s job alone, matching
on the name after the fact. **A multi-item scan** files the plate against the
first row only — N copies of one photograph would draw the same plate N times —
so every row after the first never had a picture at all, and drew the empty
plate. And **Past foods**, where a repeat copies the snapshot and deliberately
not the photograph.

`food_log_details` used to null both icon columns whenever a photo existed. That
put the rendering order — photo, drawing, placeholder — in the view, where every
screen that draws an entry already does it itself, and it cost the drawing
everywhere the photograph is not what is being drawn. Two functions had to join
back to `food_logs` to get it back (`day_plates` and `review_meals`). The view
coalesces the two columns now and stops there, `ItemRow` decides, and both
functions read the view alone: the join was writing out by hand the expression
the view had been withholding.

A redescribe rewrites `item_icon_*` with `item_name`. The two move together or
an entry ends up with a picture of the dish that was corrected away.

Two things about that list were learnt immediately. Two hundred hyphenated slugs
is the largest block of example text in either prompt, and a model reads a long
list of names as the vocabulary it should answer in: asked for "Fried flat rice
noodles with prawns" it came back named `Char-kuey-teow`. So the block goes
last, after every field it could contaminate. And a rejected name is logged,
because it is the one failure on this path with no symptom.

The names come from `icons.generated.ts`, written by the same script that builds
the app's icon registry. Edge functions are Deno and cannot import it, and a
hand-kept second copy drifts the first time an icon is renamed.

---

## Correcting an entry

Two ways, separated because they cost different things.

### By hand, on `app/log/food/[id].tsx`

**One save per section, and there is no Save button on the page.** Each group
sits behind a pencil that opens a sheet, and each sheet is a form that saves
what it is about. The footer is reserved for the two actions about the whole
meal: handing it back to the model with **Fix it**, and publishing or editing
the post with **Share to feed** or **Edit post**.

Each `save*` function throws on failure so its sheet can stay open with the
draft still in it, and stages the value locally as well: the write invalidates
the day and the refetch is a round trip behind it.

**The portion is the exception**, and it saves on a short debounce. A plus and a
minus have nowhere to put a Save, and written per tap they are three round trips
to reach two and a half plates. A pending edit is flushed on unmount through a
ref.

**On a plate with ingredients the stepper counts the plate.** An entry with a
breakdown is counted from its parts and never from its own `quantity`, so there
the stepper writes `food_logs.plate_quantity` instead: how much of the plate was
eaten, 1 until somebody says otherwise. It scales every part at once, so a plate
photographed full and half eaten is one tap rather than a stepper per
ingredient, and the serving chips are not drawn, because a plate has no
catalogue portions to choose between. The parts stay the plate as it was served:
the ingredient card and the ingredients page print their total and, under it,
"× ½" and what that comes to. Which stepper to draw comes from
`food_log_details.ingredient_count` until the parts themselves arrive, so it is
right from the first frame.

The server moves that portion itself in two places, both on the ingredients page
while the entry waits behind it: emptying a plate folds the portion into the
entry's own `quantity`, so half a plate emptied still counts half, and a first
part starts a new plate whole. The steppers are seeded once so a refetch cannot
snap one back under the user's finger, and read both amounts again only when the
row gains or loses its parts.

A build older than the portion never writes it and never reads it. Its diary
still counts the half, because the view does that arithmetic, but its own detail
screen sums the parts itself and shows the whole plate. Only an account using
two builds at once can see both.

The add path is a staged form, because there is nothing to write until Add.

### The layout

**The plate is the top of the screen, full width, with the chrome floating on
it.** The `Screen` is `flush` and one wrapper puts the gutter back for
everything under it; back on the left, then share, the pencil and the bin on the
right, least to most destructive. Those controls stay fixed as the plate
scrolls. When the image leaves, the canvas and a one-line dish title fade into
the same bar; scrolling back reveals the plate behind it again. The full dish
name remains the page's two-line heading underneath, where it stopped
truncating: a bar between two 44pt buttons has room for about three words of
"Nasi Lemak with Fried Chicken with pineapple juice".

It runs behind the status bar rather than stopping under it. `flush` keeps the
top inset as padding, which is right for content and wrong for a picture meant
to *be* the top of the page, so a negative margin cancels that padding and the
height takes it back. The trade is the status bar, which draws in the theme's
colour over whatever is up there.

### Sharing a meal

**A meal is shared as a picture, and the picture is not a screenshot.**
`features/logging/MealShareCard.tsx` is a card built for it: the plate square
and full width, the app's mark watermarked in, and one caption carrying the
dish, the calorie total and the three macros.

It is drawn off to the left of the page at full opacity and photographed on
demand (Skia's `makeImageFromView`). The two other ways to hide a view break the
capture: it multiplies a view's own alpha into what it draws, so opacity comes
out blank, and mounting on the tap would mean waiting frames for a layout.

What is deliberately not on the card is the day, the time, and any comparison
against a budget. Those are the diary's business rather than the plate's.

### The sheets

Three pencils: the entry's own details (`DetailsSheet`), the figures
(`NutritionSheet`) and the plate (`PlateSheet`).

**The pencil is the whole control**, with no "Edit" beside it. Three sit one
under another, so the word was printed three times to say what the icon says.
The words moved to the `accessibilityLabel`, and they are specific ("Edit the
ingredients", never "Edit"), because three buttons announcing "Edit" tell a
screen reader nothing. The glyph is not tinted: it is a yellow pencil with a red
eraser whose whole meaning is the colour.

**The plate can gain a part, not only lose one.** Before it, the only ways to
answer "the scan missed the fried egg" were to retype the entry's four figures
or to spend a model call on a sentence, and both guess at a number the
catalogue already knows. The part lands at the food's own serving and at one of
it, and is resized like any other.

**It is behind the same pencil as the resizing**, and that is one decision the
layout turned on twice. A plus sat beside the pencil in the card header for a
while, which made the header ask two questions about one thing: putting a part
on a plate and changing how much of it there was are the same edit, and the card
is a reading of the plate rather than a place to change it. So `PlateEditor`
carries an "Add an ingredient" button under its list.

**That editor is a PAGE, and it is the only one of the dish's three editors that
is not a sheet.** The figures and the details are forms that answer themselves;
this one leads somewhere else, and a `Sheet` is a `Modal`, so it cannot host the
catalogue search without one of the two closing. It was a sheet swap for a
while: the plate dismissed itself, `AddPartSheet` came up, and the host brought
the plate back when a food was picked. That works for the one path where a food
IS picked and is wrong for every other way out of a search — dismissing it left
nothing holding the editor open, so the user landed two panels back on the food
detail. As a page the search is a sheet **on** it, and dismissing a sheet
reveals what it was covering.

Being a route took state off the screen rather than adding it. The staged edits
used to live on the food detail so the card could preview them under the open
sheet; the page owns them, writes them on Save, and the card behind simply
refetches — so `stagedParts` has one caller now instead of two. A route also
mounts fresh, which is the seeding a `Modal` that stays in the tree with
`visible={false}` had to do by hand.

The pencil is offered on an entry with **no** breakdown too, which is the only
way the seeding below is ever reached: there the page is one line and one
button, and Save is absent because there is nothing yet to write.

**Adding to an entry with NO breakdown seeds the entry as its own first part**,
and that is the interesting half of `add_ingredient`. `food_log_details` prefers
the sum of the parts over the row's own figures, so one added ingredient would
otherwise redefine a 780 kcal nasi lemak as the 90 kcal egg just put on it. The
seeded row carries the entry's own base figures, factor AND quantity, so the sum
the view now takes is the same arithmetic it was already doing, and the entry's
`plate_quantity` goes back to 1: a new plate starts whole. Two entries are
refused outright, both because the addition would not show: one whose calorie
total the user typed over — `override_kcal` sits above the parts — and one
logged at more than twenty servings, which is past what a part's portion may be
set to.

**A part is edited by weight and read as a count.** The card reads "1 × Fried
Rice (90 g)", and both halves earn their place: the grams are the only thing
about a part somebody can check against the plate in front of them, and the
count is the only thing they can check against themselves. `PartLine` renders
the pair in both places that show it, and the sheet puts the same line in its
row heading, which is the one spot with room for a long name.

Editing moves the weight. `quantityForGrams` is the seam:
`set_ingredient_quantity` takes a quantity, `food_log_ingredients.quantity` is
`numeric(8, 4)`, so a typed weight reads back at the gram that was asked for.
A part nobody weighed keeps its multiplier and cannot be typed into.

**The count is rounded to a quarter and the weight is not**, so the row can read
"1¼ × Fried Rice (110 g)". Rounding the stored amount instead would cost the
weight its resolution, since a 90 g part could then only ever weigh a multiple
of 22.5 g and every 10 g tap of `GRAM_STEP` would round straight back to where
it started. A scan lands on whole counts; resizing by weight can show a rounded
count beside the precise weight.

Each sheet holds a draft and its Save writes it; leaving any other way drops
what was typed. `stagedParts` in `features/logging/parts.ts` is shared between
the card and the plate sheet, so there are not two previews of one plate.

**One of them keeps its state above the body**, because its button is in the
sheet's `footer` rather than in the scrolling half, and that state outlives one
opening since a `Sheet` is a `Modal` that stays in the tree with
`visible={false}`. Both reset the draft *and* the saving flag when the sheet
opens: without the second half a successful save left the spinner running and
the next opening had a disabled button.

**The figure fields are pre-filled**, which puts a burden on the save. A field
holding the app's own answer comes back looking exactly like one somebody typed,
so `saveFigures` compares each against what the app worked out and writes null
for a match. Left uncompared it would pin all four as overrides, and since those
sit above the portion in `food_log_details` the next portion change would move
the serving and not the calories.

### Picking a day and a time

**On wheels**, in a panel the details sheet leads to. `src/ui/Wheel.tsx` is a
`ScrollView` with `snapToInterval`, because the platform's own picker is a
native module and this app wants the feature in builds already on phones. Three
things it cost:

- it needs an explicit frame, or it lays out at its content height inside a
  parent that clips it, which renders perfectly and cannot be scrolled;
- it needs more rows than it shows, so am/pm is two buttons rather than a
  two-row wheel whose whole range is one snap step;
- the sheet holding it is `scrollable={false}`, because a vertical scroller
  inside a vertical scroller loses every drag;
- the dismissing scrim sits behind the panel as a sibling, because wrapping the
  panel in its `Pressable` claimed the wheels' drags before they could scroll.

**When it was eaten is one question over two columns**, and
`features/logging/when.ts` is the seam. `log_date` is the day the entry counts
towards and `logged_at` is the instant, and `EntryPatch.when` writes them as a
pair. Sent alone, the timestamp would move the row inside a day it had not left,
and the date would move the row to a day whose ordering still read off the old
afternoon.

Two more consequences: change detection compares a day and a clock face rather
than two ISO strings, because `instantOn` writes whole seconds where Postgres
hands back microseconds; and moving the date invalidates both days and the
streak. Nothing ahead of today can be picked.

### By describing it to the model

Through the sparkle button beside Save, which opens `features/logging/FixSheet.tsx`.
It is a sheet rather than a card because the words go to the server, come back
as a different meal, and leave the screen behind.

Anything staged is written **before** the correction is sent: the server
interprets the words against the entry as it stands there, so "and half the
rice" against a plate changed only on screen would correct a meal neither of
them is looking at.

There is one behaviour, not one per source. `scan-refine` reads `scan_id` as
optional everywhere, so a hand-logged entry corrects exactly like a photographed
one, and the chips are instructions to the model rather than text the client
acts on.

**`scan-refine/index.ts`** turns free text into one of four things, and they are
a ladder ordered by how much of the entry survives. The model is told to stop at
the first rung that fits:

```
none        not a correction, or has no calories in it ("extra spicy")
quantity    only the amount changed: rescale the entry and every part under it,
            or a plate's portion when it was not eaten whole
adjust      one part added, removed, resized or swapped; re-price from the parts
redescribe  the food itself was wrong: re-run the whole cascade
```

**A plate not eaten whole is corrected in eaten terms.** The interpreter is shown
each part at `plate_quantity` of itself, because a correction speaks about what
was eaten: "only 3 skewers" on a plate half finished is three skewers, not six,
and "add a fried egg" is an egg rather than half of one. A `quantity` answer
rescales the portion itself, with the stepper's quarter as the floor, and leaves
the parts as served. An `adjust` folds the portion into the parts just before it
writes (`fold_plate_quantity`, the service role's alone, one transaction), so
the rows it changes are in the same terms as the words; one that is declined
leaves the portion where the user put it. A redescribe resets
it to 1, since the corrected dish was described from the meal as eaten. Folding
can leave a part below a quarter, so no arm that shrinks a part may raise one
back up to it, which `refineQuantity`'s floor would otherwise do.

Offered as a flat menu the model reached for `redescribe` whenever it was
unsure, which is the one answer that throws away everything the user has already
accepted: "this was more like 500 calories" re-guessed a dish nobody said was
wrong, and "it was rendang chicken not fried chicken" binned the rice, the
sambal and the egg to fix one side.

Three consequences:

- A part that turned out to be a different food is a **swap**, and it is priced
  by asking what the new food costs rather than how it differs from the old one.
  As a delta the model put rendang chicken 172 kcal below fried chicken.
- The interpreter is shown each part's **count and calories**, not just its
  name. "I left half the rice" cannot be answered from the word "rice".
- A stated calorie total **rescales** rather than overrides. `override_kcal`
  would hit the number exactly, but it sits above the parts in
  `food_log_details`, so an entry with a breakdown would show the typed figure
  over an ingredient list adding to something else. Rescaling pays for it in
  granularity, hence twentieths in `refineQuantity`.

**A correction that changes nothing says WHICH nothing**, and one apology for
all of them is what made this feature read as broken. `applied: false` carries a
code, and the client has a line for each:

| code | when | what it leaves the reader to do |
|---|---|---|
| `not_a_correction` | the words have no calories in them | nothing; "extra spicy" is a fine thing to type and the honest answer is that the entry does not change |
| `not_understood` | the interpreter could not be read, twice | say it another way |
| `no_match` | a redescribe whose corrected dish nothing could price | try again; the entry is untouched |
| `no_change` | an adjustment that named nothing on the plate | name a part that is on it |
| `failed` | something threw | try again |

Three things were behind "Could not apply that. Try rewording it", and only one
of them was ever the user's wording:

- **The interpreter had 600 tokens.** Its bottom rung asks for a whole
  `VisionItem` — the same object `analysePhoto` is given 2400 for — written
  after however much the model thought first. See "Edge functions own the
  model": with reasoning on, the ceiling was spent before any JSON was written.
- **A stated count with no calorie delta was thrown away.** "Only 3 skewers" is
  the clearest correction a user can type and the model reasonably answers 0 for
  a field it has been told is about calories, so `shapeInterpretation` rejected
  the whole thing. A `count` or a `total` now qualifies an adjustment on its own.
- **An adjustment that matched no part still reported success.** The chain of
  arms has holes in it, and falling through all of them ran `rebuildFromParts`
  on an untouched list: arithmetically a no-op, but it renamed the entry, cleared
  its `food_id` and answered `applied: true`. The user watched a row rework
  itself for ten seconds and got the same numbers under a new name.

**"Not pork chop, but chicken" is a replacement, not less pork.** The interpreter
reads both sides of a correction before choosing an action. Otherwise it renamed
the plate to chicken but reduced the pork ingredient to 0.8 servings. A swap whose
two names are identical is rejected and retried with the validation failure
explained to the model; a missing or ambiguous target
leaves the plate alone instead of falling through to an addition or reduction.
Partial ingredient names must match a whole word sequence and identify one row.
An ambiguous addition also leaves the plate alone; it must not create another row.
Fractional ingredient counts stay fractional: rounding a model answer of 0.5
servings to one silently undid "half the rice".

A replacement keeps the ingredient's id, position, exact quantity and measured
weight. Without a recorded weight, its portion label still informs the estimate.
A separate nutrition call prices one unit of the new food at that weight,
without the old calorie figure, and checks its energy against its macros before
writing. The previous fixed macro split made chicken mostly carbohydrate. The
other parts are untouched, and rebuilding the parent clears old figure overrides
so the corrected parts and the displayed totals agree.

An unreadable answer, including malformed JSON, is asked for **once more** before
any of this is reported.
A considered `not_a_correction` is not: the model read the words and said they
have no calories in them, and asking the same model the same question again is
not a plan.

---

## What to eat next (retired from the app)

The app used to answer "not sure what to eat?" from a row on Today: an ask sheet
(sitting, macros, cuisine, a calorie ceiling), seven picks from the model, and a
detail for one pick. The app no longer has any of it: no row, no sheets, no
`useSuggestMeals`, no `suggest` copy, and nothing about it on the paywall.

**The server half stays.** `suggest-meal` and `_shared/suggest.ts` are still
deployed because every store binary released before the removal still calls
them, and the backend can only be extended (see "The store holds copies of the
app you cannot recall"). They must keep answering in the old shape until no
supported binary carries the row. Removing them runs over a store release, not a
deploy. Until then, what the function still does:

- It is Pro, and it claims a scan exactly as `scan-refine` does.
- The day is assembled on the server, not sent by the client; a client-supplied
  budget would size the meal off a stale day.
- `cuisinePhrase` bounds the cuisine (trimmed, capped at 40 characters, line
  breaks stripped) because it was free text from the user's own list.
- `why` is required per pick and a pick without one is dropped; the reason's
  `kind` is a closed set of five.
- `PICK_COUNT` is seven. `keepToTheSitting` drops a breakfast-register reason
  from a meal that is not breakfast without ever emptying a pick.
- A failure is an empty list rather than an HTTP error.
- Nothing it returns is written anywhere (see the rule below).

The prompt's lessons from live runs still hold for anyone touching it: the
sitting and the cuisine are constraints rather than labels, a pick is a dish
somebody orders by name and never a bare ingredient, a dish's calories are never
shrunk to fit the ceiling, and the "lighter" toggle is a tie-break between dishes
that both fit rather than a filter.

---

## Food people write

A shared pot has no serving size, which is where logging breaks down. So a user
can write a food of their own: two answers, what went in and how many it feeds,
entered once, and every future log of it is one tap.

**The word on screen is "food"; everything in the code says "recipe".** The
tables, the view, the RPCs, the routes, the hooks and the i18n namespace are all
`recipe`, and they stay that way — a released app is talking to those tables and
renaming one is deleting it (see "The store holds copies of the app you cannot
recall"). What changed is the copy, because half of what people write down is a
sandwich they make the same way every morning, and nobody calls that a recipe.
`Food` is already the catalogue's row type, which is why the client did not
follow the copy: two things called `Food` would be worse than one honest
mismatch, written down here.

**A recipe was a `foods` row, and is not any more.** It had to be, once:
`food_logs.food_id` was not null and referenced the catalogue, and everything
downstream read a logged entry as a catalogue row times a portion times a
quantity. So each recipe mirrored into one, rebuilt by triggers on every write.

The mirror existed for the foreign key, and the foreign key is gone. Logging a
pot now writes the same snapshot every other entry writes, built from
`recipe_details`'s per-serving figures by `snapshotFromRecipe`, and
`food_logs.recipe_id` records where it came from.

What that costs is the property people expect: correcting a recipe no longer
moves last week's diary. It is the same trade the diary makes with the catalogue
at large.

**Ingredients are stored per unit.** `kcal_per_unit` is what one gram, one
millilitre or one of the thing costs, and `amount` is how many went in. That is
what survives the amount being corrected: 400 ml of santan changed to 250
reprices with no lookup and no second opinion, because the density was the part
that was true. `ingredientBasis` in `features/recipes/basis.ts` turns a catalogue
serving into one: it reads a weight out of the serving label and falls back to
counting when there is none.

**Two shelves, one grid.** Mine and the community. Which one a tile is on is a
property of the row: community is somebody else's that is both public and
approved. Each shelf is three columns of image-led tiles: the serving calories sit
over the artwork and the food name sits below it. The rest belongs on the detail
screen.

There was a third, the RiceCal kitchen: `owner_id is null`, so "official and
owned by Farah" could not be spelled. Nothing was ever put on it, and a
permanently empty shelf is a tab that teaches people the app has nothing. The
client no longer asks for it and no longer reads `is_official`. **The view still
computes that column**, because a released app selects `*` from
`recipe_details`, and dropping it would be a deploy that ran backwards over a
store release.

**Somebody else's food can be logged, and can also be kept.** Logging it used to
be impossible, and the reason was real at the time: a logged entry referenced the
recipe's mirror catalogue row, so their future corrections would land in your
past diary. The mirror went with the catalogue. An entry is a snapshot now, and
`recipe_id` is provenance nothing reads back through, so a community dish costs
the reader exactly what it said it cost on the day they ate it. `save_recipe_copy`
is still there and still the way to get an editable copy of your own, with
`source_recipe_id` for provenance — it is the second button on that screen rather
than the only one.

### Sharing a food by link

**A link is private sharing, not publication.** The app sends
`ricecal.app/r/<share_slug>`, whose website page hands the slug to
`ricecal:///recipe/<share_slug>`. It names no recipe in its HTML and is not
indexed: the slug is the bearer credential, so somebody without the app sees a
way to open or install it rather than the cook's private food on the web.

An ordinary recipe query still goes through RLS and cannot enumerate private
rows. `get_shared_recipe` and `get_shared_recipe_ingredients` widen that read to
the one row named by the slug, for a signed-in account only. Reports and blocked
cooks still win. `save_shared_recipe_copy` is the matching copy path, and a
shared photograph carries the slug into the photo signer so the image follows
the same rule as the words.

Share tokens are opaque UUIDs with 122 random bits. This migration rotates the
old short, name-bearing values once: those links used the wrong domain and had
no working read path, so preserving them would keep a weak credential without
preserving any working behaviour.

### The publishing gate

Making a recipe public is two writes, and they are deliberately not one.

```
set_recipe_public(id, true)          flips is_public, parks review_status at pending
functions/recipes {action:review}    the model reads it, writes approved/rejected
```

`is_public` and `review_status` are **not** in the client's column grant. With a
table-wide update grant the same client that asks to publish could approve
itself, and the review would be a formality the app performs on itself.
`set_recipe_public` can only ever move a row to `pending`; only `service_role`
approves one.

**An edit sends a published recipe back**, and without that the gate is
decoration: publish something bland, collect an approval, then rewrite the name
and the steps into an advert, or replace the approved photograph. A trigger
resets `review_status` when the name, the steps, the servings, the photograph or
the ingredient list change on a public recipe. In the database, because a rule
the client is trusted to follow is a rule an attacker declines to. Private
recipes are left alone: there is nothing to re-review about something nobody
else can see.

**Everything fails shut.** The community tab reads `approved` only, so a review
that errors, times out or was never deployed leaves the recipe public, pending
and invisible, and the client says "we are still looking at this one" rather than
claiming either verdict. There is no branch in `functions/recipes` that approves
a recipe because something went wrong.

**The reviewer asks one question and it is "is this a recipe".** Two grounds
follow: the text is not a recipe at all (placeholder text, a note to nobody,
things that are not food), or it is not fit to read (vulgarity, hate, spam, an
advert, a link). A moderator with a wider brief starts rejecting food it finds
unhealthy, and the app has a calorie budget for that.

Accuracy is explicitly none of its business, and that is a correction rather than
an omission. There used to be a second ground about nutrition being credible, and
it read as an invitation to audit: a model handed a licence to check arithmetic
finds something wrong with almost every real pot, and ordinary home cooking was
rejected often enough that publishing felt broken. The author could do nothing
with it either, because the figures are the cascade's and not theirs. So the
reviewer is not shown a single calorie figure, and is told outright that the
numbers are the app's work.

The review has a ceiling of its own, and it is not the user's. Reading a recipe
somebody asked to publish is the app's own moderation, so spending their daily
scans on it would be the app billing them for its own check.
`claim_recipe_review` is ten an hour, per account, atomic, with no client write
grant. Refused, the recipe stays `pending`.

### Reporting a recipe, and blocking its cook

App Review guideline 1.2 asks four things of an app whose users read each other's
writing, and the community shelf is exactly that. Three of them the publishing
gate above already covered: a filter before anything is posted, the ability to
take something down, and published contact. The two halves a READER controls are
`schemas/24_moderation.sql`.

- **Report** writes a `recipe_reports` row, one per person per recipe, and the
  recipe disappears for the reporter immediately.
- **Block** writes a `blocked_authors` row, and everything by that cook
  disappears at once. Not your own saved copy of theirs: that has your
  `owner_id`, and it became yours when you saved it.

**Both are enforced in a RESTRICTIVE read policy on `recipes`**, which is the one
place in this schema that word appears. A permissive policy is ORed with the
others, so a second `for select` policy would WIDEN what is visible; a
restrictive one is ANDed, which is the shape of "and also not from somebody they
blocked". Enforced in a query instead, it would be a filter the next call site
forgets — and the failure mode is showing somebody exactly what they asked never
to see again. The shelf, the detail screen, `recipe_details` and the ingredient
policy that defers to this one all go through it.

**Three separate people take a recipe off the shelf for everybody.** One would
make the report button a weapon; ten would leave something genuinely offensive up
until ten people had seen it, and the guideline asks for a timely response rather
than a popular one. `report_threshold()` is the number, and the trigger parks the
row at `pending` rather than `rejected`: both are invisible, and only one of them
is a claim, so re-running the review is all it takes to put back a recipe three
people were wrong about.

**Neither table is readable by anyone but the person who wrote the row, and the
author is never told.** A report is an accusation and a block is a judgement
about a person; either one visible to its subject turns a moderation tool into a
way to start an argument.

`tests/16_moderation.test.sql` runs all of it as `authenticated` with a forged
claim, for the reason `02_rls.test.sql` does: run as the owner, every query
returns the rows it is meant to hide and every assertion passes.

### Filling the form in, from a photo or a sentence

Two offers on a new recipe, answering different situations rather than different
preferences: the pot is on the stove, or it is not. Both land in the same `read`
action and come back as the same draft, so only the first model call differs.

**The choice comes before the form.** A new food opens with one manual action and
the two AI inputs, Photo and Describe. Picking manual reveals only the ordinary
form; picking either AI input reads first and then reveals that same form with a
draft in it. Editing an existing food skips the choice because it already has an
answer in every field. A new food's form has a chevron back to the choice and
keeps anything already entered; the choice itself keeps the cross that leaves the
screen and confirms before discarding staged work.

**Who the authority is** is the whole difference, exactly as in the scan cascade.
A photograph has one witness and it is the model, so everything it says is
inference. A sentence was written by the person who cooked the dish, so the
amounts and the serving count they gave *are* the answer.

A photo uploads first and then invokes, because the reader on the server fetches
the object out of the bucket. Neither path goes near the catalogue: what comes
back lands in a form the user is about to check line by line, and a lookup per
ingredient would be six searches to populate fields that are about to be edited.
A failed read is a form they fill in themselves, and the endpoint says so.

**The ingredient list edits like a diary plate.** The amount is typed or nudged
in the row, and a swipe reveals Replace and Delete. Adding and replacing both use
the catalogue picker, while all changes remain staged until the food is saved.
An empty list says nothing beyond the Add an ingredient action. Cooking
instructions follow the same rule: an empty method is one Add cooking
instructions action. Its writing sheet gives each instruction a numbered row,
with Add step and Remove actions, then joins the non-empty rows with newlines for
the existing `recipes.steps` column.

**A draft is applied only over empty fields.** Somebody who typed a name and then
reached for the camera meant it to fill in the parts they had not done.

Two things about that prompt were learnt the expensive way, and both are about
saying **less**. It described the app as Malaysian, and the model read that as an
instruction about the food rather than about the audience: beef tacos came back
named "Nasi goreng kampung" and a Thai green curry as "Kari hijau ayam", while
every Malaysian case passed throughout. And its "nothing cookable in it" escape
was written loosely enough that a dish named with no amounts ("Coq au vin, feeds
6") looked to the model like describing no food, which is the ordinary way this
feature is used. The home cuisine is a tie-break rather than the framing now, and
the escape is fenced to text that names no food at all.

**The steps are one instruction a line**, and that shape is settled rather than
hoped for: the prompt asks for newlines, `shapeSteps` breaks a paragraph into its
sentences when it did not get them, and `RecipeSteps` draws the numerals.
Numbering in the data would double up against the numerals beside it, survive
into the field the cook edits by hand, and renumber nothing when a step was taken
out of the middle.

---

## The social food feed

### Product contract and implementation plan

Posting is automatic for new accounts and for any account that has seen the feed
announcement, and either can turn it off. With Auto post foods off, logging a meal never
publishes it. The saved entry offers **Share to feed**, which opens a preview of the food name,
photograph or drawing, calories and macros, an optional caption (280 characters), and an audience:
Everyone or Followers. With automatic posting off, only pressing Post creates a post. A failed publication
does not undo the meal. The source is one committed entry owned by the caller;
the server records that reference and accepts no client-supplied author or food.

Feed takes the second bottom tab. **My foods** moves into the Settings card on
Me, retaining both the personal and community recipe shelves. Existing recipe
routes and database contracts survive; the old recipes tab route redirects to
Settings. Feed and recipes are separate concepts: a post says what somebody ate,
while a recipe describes food somebody can make and log.

The first implementation includes:

- Following, newest first, containing the viewer and accounts they follow;
  Discover, containing public posts from other accounts they do not follow.
- Public identity fields in the existing Settings profile: a unique
  handle, display name, optional short bio and avatar. Accounts appear in
  discovery by default and can choose a private profile to leave search,
  suggestions and Discover. No health-profile fields are exposed.
- Profile posts, follower and following lists, follow/unfollow, follower removal,
  handle search and suggested people. Suggestions exclude self, existing follows,
  unavailable profiles and blocks in either direction.
- Post editing/deletion, likes, short comments (500 characters), comment editing and deletion
  by its author or the post author, and an in-app activity list for follows,
  likes and comments. The feed bell shows up to 99 missed activities, then 99+.
  Activity does not send push notifications.
- Reports for posts, comments and public profiles, symmetric blocking, and an
  unblock screen. Blocking removes follow edges in both directions. Unblocking
  does not recreate them.
- Posts and profile edits publish immediately. Comments still use moderation;
  rejected comments can be corrected. Reports can quarantine social content.

Private profile hides an account from public discovery while existing followers
and shared profile links continue to work. Followers-only is a post audience:
follows are accepted immediately, and the composer states who will see the post.
Direct messages, video, stories, contact-book uploads and push delivery
are separate products, not prerequisites for a food following system.

### The privacy boundary is a public-only view

`profiles` contains birth date, sex, height and weight goals and remains
owner-only. Handle and bio live on that row beside the account name and avatar.
The `social_profiles` view returns social identity and review state fields and applies
report and block visibility. Every profile gets a handle from its name, with spaces
changed to dots and a numeric suffix if the name is taken. An account that signs
up with an email and no name from its provider is different: `handle_new_user`
makes a name from the address's local part (`nelson.gan@…` becomes "Nelson Gan",
anything after a `+` dropped) and gives the handle four random letters or digits
after it (`nelson.gan.k3x9`), because a handle that was exactly the local part
published the address to everyone who could see the profile. Existing profiles
without a handle are backfilled. A name without usable Latin letters gets a
short account ID instead. Accounts are discoverable unless the owner turns on
Private profile in Edit profile. The `social_joined_at` field still records a
social action, but it does not govern discovery.
Posting, following, liking and commenting need no manual handle setup or bio.
Reading another person's identity has to bypass the owner-only `profiles`
policy, so the filtered select is `private.social_profiles`, a view with its
owner's rights in a schema the API does not expose. It is not a
`security_barrier`: a barrier keeps joins on `user_id` off the primary key, and
checking visibility for every profile took 720 ms on production. A barrier
guards against a caller's own predicate raising an error on a hidden row; the
only predicates a client can send are PostgREST's fixed filters, whose errors
depend on the value sent and never on a row. So an RPC must not filter this
view with an expression that can fail on a row's value, such as a cast. `public.social_profiles`
reads it with `security_invoker`, as every view in `public` does. It stays a
view rather than a set-returning function so the planner inlines it: a join on
`user_id` stays an index lookup instead of checking visibility for every
profile on every feed read. Its selected columns exclude email, body
measurements, goals and diary fields. `social_can_view_profile` enforces the
viewer's block and report rules. The social RLS tests exercise those boundaries
as client roles.
Handles are normalized lowercase ASCII, 3 to 24 characters, unique
under a database constraint. Names and bios accept the app's languages.

`social_posts` links one source diary entry and holds the caption and audience.
The feed reads the current food name, drawing, calories and macros from
`food_log_details` through a narrow visibility-checked server function. Editing
the entry, its portion or its ingredients therefore updates the post as well.
The old copied columns remain in the table for schema compatibility, but feed reads
do not use them. A replacement photo is not shown automatically, because it has
not passed photo review; removing a photo removes it from the post.
A post never contains diary notes, meal dates/times, goals, weight, location or
account email. Publication time is new, not the time the meal was logged. The
source-entry reference drives reads and deletion through the post visibility
check. Read RPCs return explicit public fields. Diary and recipe RLS are never
widened to implement the feed.

Auto post foods is a private profile preference. The column defaults to false,
so an account made by an older build starts with it off; onboarding in a current
build writes it on, and the 1.1.0 announcement (see
[News announcements](#news-announcements)) switches it on once for each account
that existed before. Either way it stays the owner's switch on Edit profile. A deferred insert trigger publishes each new food after its transaction
finishes, so a scan's components and any same-transaction correction are ready
when it posts. Only a food logged for today or yesterday in the account's
timezone posts: a day filled in after the fact is not news, and would top
everyone's feed as if just eaten, the rule workouts already had. It uses the same diary totals and ownership rules as manual sharing.
Public profiles post to Everyone; private profiles post to Followers. Existing
posts stay as they were when the preference is switched off. A manual share of
an automatically posted entry opens its existing post instead of making another.
Automatic posts join the account to the social feed and use the same hourly post
limit as Share. A quarantined profile does not publish; neither condition blocks
the private diary entry.

### Workouts on the feed

A post shares a meal or a workout (`social_posts.kind`). A workout post points at
its workout (`source_workout_id`, keyed with the author so it can only be the
author's own) and reads it live through `private.social_post_workout`: name,
start, duration, sets, volume and the exercise list, never the notes. Records are
counted once, when it is posted (`workout_records`), because scoring them per
reader would rescore the author's whole history; the count is taken inside
`save_workout` or `create_social_workout_post`, which run as the user, since the
owner-run posting function would score every account's sets. Likes, comments,
reports, counters and notifications are the same rows for both kinds.

**Every read that returns posts is food-only unless asked.** `social_feed`,
`social_profile_posts`, `social_post` and the candidate helper take `p_kinds`,
defaulting to `{food}`. The apps released before workout posts can only draw a
meal, and a workout post reaching one would draw an empty food card; this app
asks for both. A new kind of post must follow the same rule.

**Sharing workouts is on by default, but only for someone already on the
feed.** `profiles.auto_post_workouts` defaults to true, and `save_workout` posts
a newly inserted workout (never an edit or a retried save) when the account has
`social_joined_at` set, the workout ended in the last 24 hours, and the document
does not say `"post": false`, which an import always does: years of history at
once is not news, and an old workout logged today would top everyone's feed.
It never joins anyone to the feed itself. Auto post foods does, and is now on
by default (see "News announcements"), so for most accounts the first logged
meal joins them and their workouts follow; the announcement's feed page says so. A
failed automatic post (budget spent, profile under review) never fails the save.
An account with no name is skipped rather than joined: Sign in with Apple that
shares neither a name nor an email leaves `display_name` empty, the feed refuses
such a profile (`social_profiles_name_present`), and joining it from the
`food_logs` trigger refused every meal it tried to save. A workout can also be shared by hand from its page, which opens the composer
with the workout's preview, or edited there once posted.

A profile is one grid, meals and workouts together and newest first. A whole
workout card does not fit a half-width tile, so a workout there is the first
exercise's drawing with its name and length (`WorkoutTile`), and opens its post
for the full card. The header's post count adds the workouts the viewer can see
(`social_workout_count`) to the meal count the server keeps. That count restates
`social_can_view_post` so it can ask about the author once rather than once a
post (0.4 ms rather than 70 at 400 posts), and a test holds the two together.

There is at most one post per source entry, so a retried publish returns that
post; the entry is the retry key and a post carries no request token. A client
request UUID makes a retry of an interrupted comment submission the same
operation. Follow and like writes set the desired state instead of toggling it,
so repeated requests converge.
Caption edits keep the original publication position and appear immediately.
Changing the diary updates the published food details without moving the post.
Deleting the diary entry removes its post and dependent comments, likes and
activity. The entry screen's delete confirmation says so when the meal has a
post. A diary swipe asks the server at that moment: a meal with no post is
deleted at once, as it always was, and one with a post, or one it cannot check
within two seconds or offline, asks first. Deleting a post keeps the diary entry.

The existing `blocked_authors` rows remain private to their writers. Social read
policies use a narrowly scoped private helper to check both directions without
revealing who blocked whom. Existing recipe behavior is preserved. A social
block governs profiles, graph lists, posts, comments, likes, suggestions, activity
and photo authorization, including direct-id reads. No client-side filter is a
substitute for the database rule. Reports are visible only to the reporter and
moderators; the subject is never told who reported them.

### Graph, feed and count storage

The graph is one row per `(follower_id, followed_id)`, with the reverse index for
followers and creation-time/id indexes for list pagination. It is not arrays on
profiles and not one document per celebrity. There is no follower-count cap.
An account may follow up to 5,000 accounts; a lock scoped to that follower makes
the limit hold under concurrent requests. This bounds read fan-in and abuse
without making a high-follower account expensive to publish to. Blocking and
following the same pair must serialize, including blocks from older clients.

Posts have an author/time/id index and a partial public approved/time/id index.
Following reads bounded slices from followed authors, then merges to one page.
Discover reads the public index and applies visibility and follow exclusions.
Neither path writes an inbox row to every follower, scans old pages with OFFSET,
nor downloads the graph to the phone. Discovery is chronological in this version;
there is no claim that a heuristic is personalized machine learning.

Post, comment, connection and activity lists have an immutable, total ordering. Posts and comments use
`(created_at, id)`; connections use `(created_at, other_user_id)`; search uses
handle. Both cursor components are required together and page size is capped at
50. The client requests a sentinel row to distinguish a full final page from
another page. Refresh starts at the head. Post and comment edits never move rows between pages;
concurrent inserts appear on refresh. Deleting the cursor row does not invalidate
the cursor because its values travel with the request.
Handle search is ordered by the current handle. A renamed account may move
across the search cursor; refresh to see its new position. The client deduplicates
by account id while paging. The app changes spaces to dots and searches only
handle characters in what was typed, since the server refuses anything else:
a name in another script finds nobody rather than failing. Handles are `collate "C"`, so their unique index
turns a prefix into a range and serves every page. Under the database's ICU
collation the prefix could not bound the scan, and the page after the last match
walked every later handle in the table.

Popular posts and people must not run `count(*)` over their entire history for
each card. Counts are maintained in fixed shards selected by the acting account,
and summed over that bounded shard set. This avoids one counter-row lock for all
of a celebrity's followers or likes. Counter changes, edge changes and any
notification are one transaction. Duplicate writes produce no extra count or
activity. Counters are derived data; reconciliation queries against canonical
edges/posts are part of verification. Counts do not determine authorization.

Activity is one recipient per interaction, not one recipient per follower of a
publisher. It stores references, not copied captions or comments that survive
deletion. Its read path rechecks the referenced content. Recipient/time/id and
recipient/unread indexes keep history paging and the unread indicator bounded.
Every social foreign key leads an index that its cascade can use, which pgTAP
asserts. Activity once indexed posts and comments only under a `kind` predicate,
so each post, comment or account deletion scanned the whole activity table: 42 ms
per post against a million rows, growing with the table, where it now takes about
1 ms. Like activity has no unique key of its own: only the like's insert writes
it, and the like's key already allows one per pair. Comment activity keeps one,
because an edited comment's re-approval writes it again.

### Growth strategy and its limits

This is indexed fan-out on read, appropriate for the current Postgres deployment.
It removes follower count from the publishing cost, but it does not make storage,
high-following reads or discovery filtering free. The launch budget is 20 visible
cards per request, at most 50 through the API, and bounded client page retention.
Benchmark sparse and dense following graphs, a viewer following 5,000 people,
an author with many followers, deep cursors, and heavily filtered discovery.
Record `EXPLAIN (ANALYZE, BUFFERS)` against generated local data rather than
claiming scale from an index existing in a file.

Measure p50/p95 feed latency, examined rows/buffers, database CPU, lock waits,
disk growth and moderation throughput. A sustained p95 above 300 ms for the
database feed read, or feed work consuming 25% of database CPU, is the trigger to
profile and change candidate retrieval. These are operating targets, not a
promise that the free plan meets them. Capacity alerts must precede the hosted
500 MB limit; synthetic scale fixtures run locally and roll back.

The next stage is a durable transactional outbox and asynchronously materialized
candidate inbox for active ordinary accounts, with celebrity posts merged on
read. The inbox contains post ids only and never grants visibility. Workers
deduplicate `(recipient, post)` writes, checkpoint bounded batches, retry, and
backfill recent history on follow. Reads still apply current audience, blocks,
reports and moderation, so a delayed deletion or unfollow cannot leak a post.
The normalized graph and cursor contract remain the source of truth. Only after
measured need should graph partitions, read replicas or separate candidate
storage be introduced. No silent truncation of a follow list is a scaling plan.

Suggestions use a bounded indexed candidate pool rather than sorting the full
user table by a live aggregate or traversing an unbounded friends-of-friends
graph. Discovery and suggestions remain available on a brand-new account with
no follows; if there are no eligible people or posts, the screen says so.

### Publication, moderation and media

Authenticated RPCs publish posts and profile edits immediately and increment
their revision. Comments still enter review. The `social` edge function checks
the caller, claims an atomic per-account review budget, loads exactly that
caller's pending comment and reviews it. Approval compares the revision it read;
a concurrent edit, deletion or report cannot be approved by a stale response.
Errors and missing production credentials leave comments pending. Local
deterministic review is restricted to the local stack. Comment moderation is
available to free accounts and never consumes their scan allowance.

The report button hides the target from its reporter immediately. Three distinct
reports quarantine content for everyone pending moderator action. A normal
client retry cannot remove this quarantine. The service role has the inspection
and resolution path; public roles cannot read reports, review budgets or mutate
review status, counters or another account's identity. Database functions pin
their search path, authenticate the caller, and explicitly revoke default PUBLIC
execution. RLS applies to every exposed social table.

Posts reference the source meal's existing owned object; they do not create a
second untracked photograph. If diary photo replacement or the existing retention
job removes that key, a trigger removes it from the post and the drawing remains.
This preserves the free/Pro retention policy. Account deletion still sweeps the
same two existing R2 prefixes before cascading all social rows.

The photo endpoint gains an explicit social scope. It signs only keys attached to
content the caller can currently see, verifies that the key belongs to its
author, and uses a 60-second URL lifetime. A refused key is left out of the
answer rather than refusing the batch: one batch is a whole screen, and edits,
reports, blocks and retention revoke single posts routinely. The old diary and
recipe requests keep their existing response contract and lifetime. Social images
never use the diary's disk-first resolver. They are cached in memory and on disk
under their key and ETag, so a fresh signature does not download them again. The
disk copy is only drawn behind a signature this account was granted within the
last half hour, which a refusal withdraws, so a photo key is never permanent
authorization, and signing out clears it with the rest of the image cache. A previously delivered signed URL can work until its short expiry;
downloaded bytes cannot be recalled. Blocking/deletion
invalidates visible content immediately in the acting client and on the next
authorized read elsewhere.

An upload URL can be reused until it expires, so a unique object key alone does
not prove that a photograph stayed unchanged. For an immediate post, the signer
reads the current ETag from R2; previously reviewed images keep their recorded
ETag. Once a post (or an avatar) is ten minutes old its upload URL has lapsed
and the bytes cannot change, so the signer hands what it read to the
service-only `record_social_photo_etags` and later signatures skip the HEAD. It
only fills a missing tag and never overwrites one, and runs after the answer is
sent. Deploy that migration before the `photos` function that calls it. Social
GET signatures require a signed `If-Match` header with that ETag;
an overwrite fails with 412 until the next authorized signature. The signer
never accepts a client-supplied ETag.
[R2 supports conditional GETs](https://developers.cloudflare.com/r2/api/s3/api/).
This adds no copied objects or new cleanup domain.

### App boundaries, rollout and verification gates

Screens use `data/social.ts`; all viewer-scoped keys live in `data/keys.ts`.
Social queries have finite garbage collection and bounded infinite pages and are
excluded from MMKV persistence. Mutations remove stale social content before
refetching after block, report, delete or audience restriction. Requests cancelled
during account changes cannot refill another viewer's cache. Offline social
writes are disabled with visible feedback; private diary offline behavior stays
as it is. Reusable social cards, people rows, photo rendering, lists and report
controls live under `features/social` rather than being copied into routes.
A newly followed author stays in the loaded Discover results until a deliberate
refresh, while the card updates immediately and the Following feed is refreshed.
A like is drawn at once on every cached copy of its post and put back if the
server refuses it; it never refetches a feed, since it is the most frequent write
and a refetch reloads every loaded page. A comment refreshes only its post. The
unread badge polls once a minute only while Feed is on screen. Pull-to-refresh
keeps the first loaded page visible while the newest one loads.
The feed image itself stays in place on a tap. A double tap likes it and briefly
shows a heart, and a pinch zooms the photograph while held. Only the comment
button opens the post's comment screen. People search waits 350 ms after typing
stops; its loading rows match the avatar, identity and follow control layout.

Implementation order is deliberate:

1. Document and review this contract, research and failure cases.
2. Add declarative social schema, ownership/visibility policies, transactional
   writes, bounded read RPCs and database tests. Generate the migration with
   `pnpm db:diff`; inspect function revokes the diff cannot preserve.
3. Add revision-safe moderation and scoped media reads, with standalone Deno
   typechecks and tests, then regenerate the app's database types.
4. Build navigation, feed, profiles, relationships, composer, comments, activity,
   moderation controls and all thirteen language bundles.
5. Reset and test local Supabase; run multi-user REST, concurrency, adversarial
   authorization and scale tests; drive the iOS simulator against that stack.
6. Review the full diff, fix findings, run `pnpm check`, capture final simulator
   screenshots and publish a PR with reviewer-accessible image URLs.

Deploy the additive schema before the edge functions and then the app. There is
no D1 change in this feature. Released binaries retain every old table, column,
RPC, recipe share and photo response they already use. Do not deploy a new app
against a database without the social migration.

Required database cases include cross-user diary snapshot attempts, self-follow,
duplicate and concurrent follow/like/comment requests, the following cap,
both-direction block races, blocked direct reads and media, report isolation and
quarantine, stale review approvals, invalid and partial cursors, tied timestamps,
cursor deletion, new inserts while paging, followers-only access on unfollow and
follower removal, source entry deletion, photo replacement/retention, account
cascades, counter reconciliation and anonymous grants. Run assertions as actual
authenticated roles, not just as the database owner.

Required app cases include empty/error/loading/offline states, handle setup and
handle collisions, caption/comment boundaries, retries without duplicates, draft
retention after errors, both feed modes, suggestions/search, profile and graph
pagination, following and follower removal, likes/comments/activity, reports,
blocks/unblocks, edit/delete, fresh and historical logged food, recipe navigation,
keyboard and long-text layout, non-Latin copy, and private-cache behavior across
account changes. Local UI fixtures contain fictional public identities only.
The PR distinguishes local mocked moderation from any live model verification;
neither substitutes for the other.

The local verification entrypoints are:

```sh
pnpm exec supabase test db --workdir apps
node apps/supabase/scripts/social-concurrency.mjs
node apps/supabase/scripts/social-live.mjs
node apps/supabase/scripts/social-reference-live.mjs
node apps/supabase/scripts/social-scale.mjs --repeat=21 --save=/tmp/social-scale.json
```

The concurrency suite uses separate authenticated database sessions and removes
its exact fixture accounts in `finally`. Scale fixtures contain 110,000 posts,
15,050 profiles, dense and sparse 5,000-follow graphs, 15,000 followers,
14,999 likes on one post and 15,000 activity rows. They are local-only and roll
back. Use `--plans=/tmp/social-plans.log` in a separate benchmark run for nested
`EXPLAIN (ANALYZE, BUFFERS)` output; profiling affects timings. The HTTP suite
uses real local Auth, PostgREST and edge functions, and `--keep` leaves fictional
accounts in gitignored `.secrets/social-ui.json` for simulator testing.
The focused reference check exercises edits and deletion through local Auth and
PostgREST. Its `--keep` option leaves fictional accounts in gitignored
`.secrets/social-reference-ui.json` for simulator testing.

Media verification needs an S3 server that enforces `If-Match`. Supabase's local
S3 endpoint verifies that the header is signed but, in the tested version,
returns overwritten bytes instead of 412. Do not weaken the overwrite assertion.
The verified local alternative is MinIO image
`quay.io/minio/minio@sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f`,
with `MINIO_SITE_REGION=auto`, a private `meals` bucket, and random local
credentials kept in `.secrets/`. Point `R2_ENDPOINT` at its reachable LAN port
and set the matching R2 credentials in the gitignored function `.env`, then
fully stop/start Supabase so the edge container picks up the values. This is
local test infrastructure only; production continues to use R2.

On 23 September 2026, after unifying account and public profiles, all 25 scale
scenarios returned their expected page sizes. Each case ran once before warmup
and 20 times warm against local Postgres. The following
are warm database p95 measurements, not network latency or production throughput:

| Read | Warm p95 |
| --- | ---: |
| Following, 5,000 active followed authors | 60.0 ms |
| Following, 5,000 sparse followed authors | 17.6 ms |
| Following, deep cursor | 47.8 ms |
| Discover, skipping 100,000 followed posts | 20.0 ms |
| Suggestions, 64 by 64 graph paths | 5.5 ms |
| Followers page, 15,000 followers | 4.5 ms |
| Unread badge, 15,000 activity rows | 15.2 ms |
| Handle search, 15,050 profiles | 2.1 ms |

Candidate selectors read directly from the unified profiles table, then public
views apply visibility checks to the final page. One author index for posts, carrying review state as
included columns, was measured against the full and approved pair: Following at
1,000 and 5,000 authors was up to 40% slower, so the pair stays. Writes are not in
that fixture. Deleting one post against a million unrelated activity rows took
41.9 ms while its cascade scanned the table and 1.3 ms once the keys led indexes.

The original policy-per-candidate plan took 14.5 seconds for dense Following
and 18.4 seconds for filtered Discover. Private candidate selectors now apply
the same viewer-specific conditions using indexed joins, then public invoker
functions hydrate only the resulting page through RLS. Relationship flags use
single indexed lookups, so a card cannot make PostgreSQL read the entire graph.
The same approach keeps suggestion traversal bounded before loading profile
details and counts. Final local verification passed 511 SQL assertions,
22 concurrent-session behavior assertions followed by cleanup verification, and
32 HTTP checks against real local Auth, PostgREST, edge functions and MinIO.
Re-run the benchmark when visibility predicates or candidate queries change;
these figures describe this fixture and machine, not an unlimited capacity
guarantee.

### Research behind the decisions

Meta's [description of Instagram suggested
content](https://engineering.fb.com/2020/12/10/web/how-instagram-suggests-new-content/)
separates sources chosen by following from discovery candidates. Its
[Explore architecture](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/)
uses staged retrieval instead of ranking the entire corpus on every request.
Those ideas inform our separate feeds and bounded suggestion pool; this app does
not reproduce Instagram's models or claim comparable recommendation quality.
The [TAO graph design](https://engineering.fb.com/2013/06/25/core-infra/tao-the-power-of-the-graph/)
also motivates indexed forward/inverse edges and range operations rather than
arbitrary request-time traversal. Sharded SQL counters are our own design to
reduce [row-lock contention](https://www.postgresql.org/docs/current/explicit-locking.html),
not a claim about how Instagram implements its counts.

PostgreSQL documents the cost of skipped rows in [LIMIT and
OFFSET](https://www.postgresql.org/docs/current/queries-limit.html), and
[multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
explain why the equality key precedes chronological range keys. Supabase's
[RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
covers indexed policy predicates, auth helpers and explicit privileges. These
support the query and access-control choices; they do not establish this app's
capacity without measurements.

---

## Groups

Up to twenty friends see each other's day of food on one board, so the Groups tab
is an accountability tool rather than a second feed. It took the tab that
Workouts had (see [Workouts](#workouts)), and the tab's icon carries the count
of pending invites.

### The board reads the diary; it copies nothing

A group stores membership, invites, reactions, nudges and chat. It never stores a
meal. `group_board` (in `schemas/97_groups.sql`) reads each member's entries for the
day from `food_log_details` by owner and date, so an edited portion, a deleted
entry or a new photo shows on every board at once, and leaving a group takes
nothing with it. The function is a definer function that checks membership
itself: `food_logs` RLS stays owner-only, because widening it for groups would
widen it for everything. What it returns is the board's narrow set of fields,
never a note, a goal or a body measurement.

Every group table is closed to clients (`revoke all`, RLS on). Reads and writes
are RPCs: `my_groups`, `my_group_invites`, `group_invite_count`,
`public_groups`, `group_board`, `group_messages`, `group_details`, and the write
functions beside them in `51_groups.sql`. Each answers jsonb shaped for one
screen; `src/data/groups.ts` types it by hand. The board answers for the last
sixty days and no further, so joining a public group does not open a stranger's
whole diary history.

A block holds inside a group. The two people are left off each other's board,
food and all, and neither can react to, nudge or push the other. Their messages
are hidden from each other. Joining a group the other is in stays allowed, so a
refusal cannot reveal the block.

Only the list of groups and the invite count are written to the persisted query
cache (`lib/query.ts`). Boards, chats and settings are other people's meals and
words, which leaving a group or a block must take away, so they stay in memory
and are dropped a few minutes after leaving the screen.

### Breakfast, lunch and dinner come from the person's own clock

The diary has no meal column (it was removed, see `30_food_logs.sql`), so the
board places an entry by when it was eaten, against that member's own
`meal_times`: the midpoints between their breakfast, lunch and dinner times split
the day, so someone who lunches at 14:30 is not told their 11:00 plate was
breakfast. Anything before 04:00, or logged back onto the day before, is dinner.
Snacks join the nearest meal. When the time is wrong for what the food was, the
owner moves it from the meal sheet; that sets `food_logs.board_meal`, which is on
the entry, so the move holds in every group they are in. Several foods in one
meal share a tile and swipe sideways inside it.

### Reactions, nudges and chat

- **Likes and dislikes** belong to an entry and a person (`group_reactions`), not
  to a group: a friend in two groups has one opinion of a plate. A board counts
  only its own members' reactions. Deleting the entry deletes them. Nobody
  reacts to their own food.
- **A nudge** is for an empty meal of a member whose own time for that meal
  passed half an hour ago, on their today. The first nudge closes that meal for
  everyone in the group for an hour (`group_nudges`), and the tile says who
  nudged. Past days cannot be nudged.
- **Chat** is one thread per group, as in any group chat, opened from the chat
  bar under every day of the board. It opens on the newest 50 messages and
  reads the 50 before as the member scrolls up (`group_messages` takes a
  `created_at, id` cursor), with a chip where each day starts. A
  message can be deleted by its author, reported (hidden from the reporter at
  once, from everyone at three reports) or its author blocked, which follows the
  rule that anything one user writes for another needs a report and a block.
  The chat bar shows the unread count since the member last read the chat and
  the latest message (`group_chat_summary`, read on its own rather than with
  the board). The count stops at 100, so a member who never opens the chat
  does not have the whole history read on every poll.
- **Replies.** A message is answered by swiping it toward the middle of the
  screen, as on WhatsApp: someone else's to the right, your own to the left (a
  short bubble of yours against the right edge left no room to drag right). The
  whole row slides, face and name included, and the arrow comes in beside it,
  never over the face; let go and it glides back rather than springing. The
  composer quotes the message until sent or cancelled. Sending, with the
  keyboard up, scrolls to minus the keyboard's inset rather than to 0: on iOS
  the keyboard is the inverted list's top inset, and 0 dropped the newest
  messages behind it.
  `group_messages.reply_to_id` points at the answered message in the same thread
  (`send_group_message` refuses one from another group) and is set null if it
  is deleted, so the reply stands on its own. The thread hands each reply a
  `reply_to` quote, left out under the same rules as the thread itself (deleted,
  quarantined, blocked either way, or reported by the viewer).
- **Reactions**: one per person per message from six emoji
  (`group_message_reactions`). A double tap gives a heart, as on Instagram, and
  the reaction pill under the bubble pops as it lands. A long press dims the
  whole screen but that message, WhatsApp's way, with the six in a bar above it
  (under its row when there is no room) and a ⋯ for the sheet that holds reply,
  delete, report and block (moderation still needs both of those for anything
  one person writes to another). It is a modal of its own with the message drawn
  again in place on top, since the list cannot lift one row above a layer laid
  over it; the ⋯ sheet opens once that modal has gone, as iOS will not present
  two at once. Counted by emoji in `group_messages`, leaving out anyone blocked either
  way. Setting, changing or taking one back broadcasts `reacted` on the chat's
  topic with the message ids; an open chat rereads only the ones it holds, by
  id, a hundred a request, wherever they are (`group_messages`' `p_ids`), each
  laid over its held copy unless the viewer's own reaction or thumb on it is
  still on its way. An app from before reactions does not listen for the event
  at all.
- **Food in the chat.** A food message shares one of its author's own food posts
  (`group_messages.post_id`) and draws as a card: the photo across it, the name,
  calories and macros. The card reads the post's meal live through
  `private.group_post_food`, as the board reads the diary, so a corrected portion
  shows there too; deleting the post or the meal under it deletes the message.
  A friend's card carries the board's like and dislike on its photo's corner, the same
  `group_reactions` row, so a thumb given in the chat shows on the board and
  back; your own card shows what friends said, once they have. A thumb given
  on a card rereads the cards of that food by id once it lands, since a
  catch-up taken while it was on its way may have drawn the old one.
  `private.group_food_reactions` appends the entry id and that group's counts
  to the card, which an app that does not know them ignores.
  The + beside the field lists the viewer's last five food posts to send by hand,
  and that is pushed like any message. **Posting a food to the feed shares it
  into every group chat its author is in, silently** (`98_group_chat_shares.sql`):
  the trigger writes the row with `pushed_at` already set, which
  `group_message_push_targets` refuses, so nobody's phone rings for it. It still
  counts as unread on the chat bar. A post's photo stays signable for members of
  a group it was shared into however old the meal is (`group_photo_claims`).
- **Workouts in the chat.** A message can share a workout instead
  (`group_messages.workout_id` for the app's logger, `activity_id` for one a
  health store recorded: a run, a swim, a game of badminton), drawn as a card
  with its kind's drawing and up to three figures, read live
  (`private.group_workout`, `private.group_activity`). Workouts do not ride on
  feed posts, so they reach a group whether or not their owner uses the feed.
  Both are shared silently on their own as they are first written (`save_workout`'s
  insert, a health sync's), but only while `auto_post_workouts` is on and only
  if the workout ended in the last day, so a sync backfilling months of runs
  shares none of them; demo data never is, nor the Apple Health copy of a logger
  workout. The + has a Workouts tab beside Food with the last five of both,
  listed once. A tap on a workout card opens it straight away, dimming under the
  finger like a button; a workout card has no double-tap heart, so the tap need
  not wait to rule one out, and its reactions are in the long-press bar. A
  thumb on a food card is a gesture-handler tap rather than a Pressable, so it
  takes the touch from the bubble's double tap instead of hearting it too.
- **Release 1.0 still reads every message.** `body` stays required and a food
  message's body is its name and calories ("Nasi lemak (640 kcal)"), which is
  also what its push says, so an app that knows nothing of food cards draws a
  line of text. Replies, food and reactions are extra fields beside the old
  ones, and `send_group_message` takes the reply and the post as trailing
  arguments with defaults, so the three-argument call of 1.0 still resolves.
- **A public group's name** is read by strangers, so it can be reported too, by a
  long press in the public list: it leaves the reporter's list at once and
  everyone's at three reports. Renaming the group clears the reports; saving
  the same name again does not.

### Membership

**A free account leads two groups at most.** `create_group` refuses a third
with `group_limit_reached` while the account leads two (`free_group_limit()`),
counting the groups it leads now, so one handed on by leaving frees its place.
Joining is never limited. The new-group button checks the list on screen first
and opens the paywall (`new_group`) before the sheet; the refusal opens it too,
for a group started on another phone. Release 1.0 has neither, so a free
account there sees its generic "something went wrong" toast at Create.

Twenty members, at most twenty groups a person, enforced by a trigger that
locks the group row so two people cannot take the last seat together. The cap
was ten, and the apps in the stores take ten as full, so the two lists where
they offer Join (`my_group_invites`, `public_groups`) report a group of ten to
nineteen as nine (`private.group_size_for_join`) and their Join stays live. The
true size travels beside it as `member_total`, which the current app reads.
What an older app cannot be helped with: a leader of ten or more has no
Invite in its settings, and its board shows the real count.
`groups.member_count` is kept by the same triggers, so the cap, the lists and the
public ranking read one column instead of counting rows. A full group
withdraws its pending invites. Private groups are invite only; public groups are
listed (fullest first) and anyone can join. An invite takes a handle, with or
without its `@`, or an email address, which only finds an account that already
exists. The invite sheet opens short, on the keyboard with the field focused, and
lists up to five people to invite with one tap (`group_invite_suggestions`):
whoever the viewer follows or is followed by, mutual follows first, leaving out
members, anyone already invited and anyone blocked either way. It reads only the
viewer's own follow graph, which their profile already shows them. A full public
group is listed with "Full" beside its count and its Join greyed out, so the row
keeps its shape. A handle that finds nobody says so, since handles are public; an email
answers the same whatever is behind it, down to the id it returns (a made-up
one when nobody was found), so the field cannot be used to learn whether an
address has an account. That includes asking twice: an address that finds an
invite already there changes nothing and answers with a made-up id too, since
the stored id coming back a second time is exactly what a made-up one never
does. It also includes an address followed by a handle: a handle takes over an
invite sent to an address (its own id, on the sender's list, pushed), so the
pair looks exactly like the handle alone and cannot tie the address to it. A
handle invite is renewed at most hourly, and a renewal takes a new id. The push for an invite is sent after the answer, which carries no
count, so neither how many phones it reached nor how long it took gives the
account away. Someone blocked in either direction reads as nobody.
Members see only the pending invites they sent themselves, and of those only
the ones sent by handle (`group_invites.by_email`): an email invite listed would
name whoever owns the address. The leader renames
the group, switches it public or private, and removes members. Each member puts
the others in their own board order by dragging a row's handle in the settings'
member list; the order saves as the finger lifts (`board_order`), and the
viewer's own row stays first. A face anywhere in a group, on the board, in the
chat or in settings, opens that person's feed profile. The board draws every
member: twenty at most is a scroll, and a fold hid the friends whose food was
the reason to open it.

**A friend's workout opens like your own.** The board's workout tile, and a
workout card in the chat, open `app/group/workout.tsx`: the logger's figures,
muscles worked and every set (`SessionFigures` and `SessionExercises`, shared
with the owner's own page), or a health store's session as the Activity page
draws it. Workouts are owner-only, so it reads through `group_workout_detail`, a
definer function that checks the owner is in the group with the viewer, neither
has blocked the other, and the workout is within the board's sixty days or was
shared into that group's chat. It never returns the owner's notes, nor records:
scoring those reads the owner's whole history. The tile opens the day's one
workout, or lists them when there are several (`workout.all` on the board,
appended so release 1.0 reads the rest unchanged). A leader with
company must name a successor to leave; the last member out deletes the group,
and a deleted account hands its groups on through the same trigger.

### The tab reopens on the last board

Most people are in one group, so the tab goes straight back to the board it was
on after a relaunch (`features/groups/store.ts`, kept per account in MMKV) until
they tap back to the list. A group left elsewhere falls back to the list once
`my_groups` has loaded. Days change by swiping the board or with the week strip
under the header, the same strip Today uses, limited to the board's sixty days;
each follows the other. Only the day on screen refreshes, every 30 seconds; the
days either side are fetched once so a swipe lands on a drawn board. Each
answer carries a `version` (an md5 of the rest of it), and the poll hands back
the one it holds as `p_known`: a board nobody touched answers
`{"unchanged": true}` in about 70 bytes instead of every member's day of food
again, which was a third of the project's egress once groups shipped. A board
patched on the phone (a like, a move) drops its version, so the next poll
reads it whole and draws what the server has, whether the write took or its
rollback missed. An app from before it sends no `p_known` and reads the full
board, with one extra field it ignores. The chat
is live while open (below), and the invite count refreshes every five minutes
and whenever the tab is shown, since an invite also arrives as a push. The
pager follows the selected date rather than a position, so midnight passing
under an open board does not move it a day.

### Live chat

A group's chat has one private Realtime channel, `group-chat:<group>`, joined
while its chat or its board is on screen and the app is in front. The two share
it (`lib/realtime.ts` holds one channel per topic), so opening the chat from the
board does not leave and rejoin. Everything else still polls.

- **The chat** catches up when a broadcast names a message it does not have
  (see "Catching up" below).
- **The board's chat bar** rereads `group_chat_summary` on every broadcast: one
  small read instead of the board with every member's day of food, one in
  flight at a time with a burst ending in one more. Measured on a simulator
  against the local stack, it redraws within a second of the message being
  written. While the channel is not joined, a chat push reaching the open app
  rereads it instead (`lib/groupChatPushes.ts`), and failing that it polls every
  half minute. The board stops listening while the chat covers it, since the
  count is being read away there and a reread would draw it back.

- **Broadcast from the database, not Postgres Changes.** Triggers on
  `group_messages` call `realtime.send` when a message is written, deleted
  (once per statement and group, so a deleted account's months of messages are
  a handful of broadcasts) or quarantined by its third report. Changes would
  need `group_messages` opened to clients through RLS, which every groups table
  deliberately is not, and would check that policy per listener per row; a
  broadcast is authorised once, when the channel is joined.
- **A broadcast carries message ids and nothing else.** The phone refetches
  `group_messages`, which is where blocks, reports and quarantine are applied,
  so a body never reaches a device that must not read it, and a member removed
  while the chat is open hears ids it can no longer turn into anything. A
  removed id is taken out of the thread in place, with no request.
- **Who may listen** is one policy on `realtime.messages`:
  `private.group_chat_listener(realtime.topic())`, true only for a member of the
  topic's group, and false rather than an error for anything malformed. There is
  no insert policy, so a client cannot broadcast on the topic. `db diff` does not
  see policies on `realtime.messages`, so the migration restates it by hand.
- **One channel and as little socket as possible** (`lib/realtime.ts`). Screens
  share a channel per topic; the last one out leaves it, and a topic asked for
  again while its leave is in flight waits for it, since supabase-js would hand
  back the leaving channel. A leave the server answers with an error leaves its
  channel listed for good, so that topic polls instead of joining it again.
  Backgrounding (not `inactive`, which is only the notification shade passing
  over) leaves every channel and then closes the socket, including one still
  lingering after the last chat closed; coming back rejoins. supabase-js
  otherwise keeps an empty socket for 50 seconds, which `lib/supabase.ts` cuts
  to 5.
- **Each join reads the thread once**, first or after a drop, since nothing
  sent while the channel was down will be heard. That is a second read on
  opening a chat, kept on purpose: the first one may have been taken before
  the join, and when that first read was whole it is only a catch-up. A fetch
  already on its way lands first rather than being restarted, which would hold
  back the first paint. Refetch on focus is off,
  since coming back rejoins and the join reads. A join the policy refuses (a
  member removed mid-chat) is not retried, and a channel the server closes is
  rejoined after three seconds.
- **Polling is the net, not the mechanism.** Joined, the thread is still asked
  once a minute, for a socket that died without saying so. Not joined, it is
  asked every 5 seconds.
- **Catching up, not rereading.** A read between whole ones asks only for
  what was written since the newest message held (`group_messages`'
  `p_after_at`), from ten seconds before it, since a message's time is when its
  write began and a slow one can commit behind a later one already read. Once a
  read has reached back that far ten seconds after the newest message was first
  seen, the thread has settled and catch-ups start at that message exactly (its
  time, and its id for one written in the same microsecond, `p_after_id`), so
  an idle chat's poll answers `[]`. Each message comes back in place of its
  held copy (`mergeNewer`), so the viewer's own message drawn with the phone's
  clock gets the server's. That is a few hundred bytes per new message where
  rereading the newest page was 25 KB, and the page was read for every message
  an active chat heard (October 2026: a third of the project's egress, with
  groups' boards). The page is still read whole as the chat opens, however
  fresh the copy held from a visit before, on every rejoin and on a first join
  to a thread held from before the chat opened, and about once
  a minute joined or every 30 seconds polled, for what no catch-up sees: thumbs
  on a food card and a corrected portion (neither is announced on the topic),
  another member blocking the viewer, a renamed author. A change in place
  restarts react-query's poll timer, so a removal or reaction rereads the
  thread whole itself when that minute is up. A whole read is laid over what
  has been scrolled through (`mergeNewest`), so a long scroll back costs
  nothing on the next read; a newest page that does not reach anything held
  means a gap, and the thread starts again from that page, as does a catch-up
  that comes back a full page.
- **A read that crossed a change is read again.** Every change made to a
  thread in place (a removal, a message reread by id, a thumb on a card, the
  viewer's own send or reaction) counts as an edit, and a read that was on its
  way across one is run again, up to three times: the change was announced
  after it was written, so a read started after it sees it. A read crossed all
  three times stands, and the next read is whole. That is what keeps a deleted message from coming
  back with a page fetched just before the delete, including one heard before
  the opening page has landed. Two gaps are left on purpose: a removal in the
  moment between the opening read and the join is heard by nobody until the
  next whole read, and a polled chat (no channel) shows a quarantine or block
  up to 30 seconds late rather than 5.
- **An older server.** One from before `p_after_at` or `p_ids` answers
  `PGRST202`; the app reads whole for ten minutes before asking again, and
  rereads a reacted message with a whole read. A board poll that sends
  `p_known` to one asks again without it.
- **The sender's own message** joins the cached thread the moment
  `send_group_message` answers, so "Sending" clears without waiting for a
  refetch. Its broadcast can beat that answer, so a broadcast is ignored while
  one of the viewer's own sends to the thread is still on its way: the send
  refetches the thread when it lands, which picks up anything else too. One
  read per message sent, either way. Deleting or reporting takes the message out
  in place and rereads only the chat bar, whose preview it may have been.
- **pgTAP cannot watch `realtime.messages`.** It is partitioned by day, the
  Realtime server makes the partitions, and CI runs Postgres alone, where
  `realtime.send` would swallow the failure as a warning. `36_groups` replaces
  `private.group_chat_broadcast` inside its transaction to record what would
  have been sent. Locally, a stale Realtime container has stale partitions too:
  `docker restart supabase_realtime_ricecal` makes today's.

### Push: the app's first

Nudges, invites and chat messages are the only notifications a server sends. The phone hands
its Expo push token to `register_push_token` on each launch where notifications
are already allowed, and asks for permission when someone creates or joins a
group, never at launch. The nudge or invite RPC writes first and returns an id;
the app then calls the `groups` edge function with it, which asks Postgres for
the recipient's devices (`group_push_targets`, service role only), marks the row
sent so a retried call sends nothing, and posts to Expo in the recipient's
language. A failed push costs the push and nothing else. Tokens Expo reports as
`DeviceNotRegistered` are forgotten. A tap opens the Groups tab, on the group's
board for a nudge and on the list for an invite.

A chat message goes the same way: `send_group_message` returns its id and the
app sends it as kind `message`. `group_message_push_targets` marks the message
`pushed_at`, refuses one that is quarantined or older than ten minutes, and
answers every other member's devices, leaving out anyone blocked either way.
The push carries the body, so this is where blocks are applied to it, as
`group_messages` does for the thread. It needs no translated copy: the group is
the title and "Name: message" the body, as messengers write it. Its `data.chat`
makes the tap open the group's thread with the keyboard up (`reply=1`; a chat
opened by hand leaves it down), and no banner shows while that group's chat or
board is on screen (`showingGroupChat`). The thread is pushed once over whatever
is showing, and only after it has slid in does it switch the tab underneath to
Groups (`showTabUnder`, a jump aimed at the tab navigator, since navigating to
the tab would pop the chat) and raise the keyboard, so back still lands on the
board. Navigating to Groups first and then pushing popped anything open, drew
the board and then the chat, with the keyboard rising mid-push: three
transitions for one tap. The thread already open is left alone, and another
group's is replaced rather than stacked.

**Nobody is pushed a message they watched arrive.** The groups function answers
a chat message at once and sends its push three seconds later, in the
background (`EdgeRuntime.waitUntil`), and `group_message_push_targets` leaves
out any member whose `chat_read_at` is at or after the message. An open chat,
on top and with the app in front, marks the chat read as each message from
someone else lands (`useReadAsItArrives`), which measured under 100 ms after the
write against the local stack, so a member reading along, or one who leaves the
app right after, is not buzzed; one who was away is, three seconds late. Opening
a group's chat also clears that group's chat notifications from Notification
Center (`dismissGroupChatNotifications`), as a messenger does. The delay costs a
few seconds of an idle edge worker per message and no CPU.

Muting is per group, one switch (`group_members.notify`) for nudges and chat
together, in the group's settings and as the bell at the top right of the chat.
Invites always arrive, since the invitee is not a member yet.

A simulator debug build gets a sandbox APNs token, which Expo's production
credentials reject (`BadDeviceToken` in the receipt). Delivery is tested on a
device build; on a simulator, `xcrun simctl push` with a payload whose `body`
carries `{"kind":"group","groupId":…}` exercises the banner and the tap.

### Photos

A member's meal photo is signed for a fellow member through the social read
path: `social_photo_claims` also returns diary photos of anyone the caller shares
a group with, from the last sixty days (the pager's reach), unless either has
blocked the other. The owner is read from the key (`meals/<owner>/…`, which the
photos function checks again), so the lookup goes through the diary's owner index
instead of scanning `food_logs` for the key on every feed photo. Those photos have no recorded ETag, so each signature costs
the signer a HEAD on R2. The viewer's own photos are signed as their own.

---

## The diary screen

A week strip above the ring, Monday to Sunday, paged back a year, one page per
calendar week, each fetching only its own seven days. Picking a day moves
`selectedDate` (`data/selected-date.tsx`, the one piece of genuinely
client-owned state) and everything below follows it: the ring, the water, the
entry list, and anything logged while it is selected.

**The calorie card is one compact reading.** A 112pt ring beside the three
macros, each on one line as label, bar and "eaten/goal g", inside less padding
than a standard card. Nothing sits under the ring: "+360 from moving" and "A bit
over" both made the card taller to repeat what the ring and the list below
already say. Movement still extends the budget exactly as before.

On narrow phones and with large text, the ring sits above the macro rows, whose
labels and amounts also stack. Ring figures stay on one line. The seven date
cells and the four navigation captions limit text scaling to fit their fixed
widths; their full translated labels remain available to screen readers.

**The list under the water is "Your day"**: the meals and the health store's
workouts in one list, newest first, with the day's steps beside the heading when
a store reported the day. With large text, the steps sit below the complete
heading. The heading is a word rather than an overline, and
hairlines sit under it and between rows. Rows are `ItemRow` at its `compact`
size (a 56pt tile, one line of title, the figure stacked over its unit). A
workout is a row like a meal, its calories in hibiscus because they were burned,
and it opens the workout's own page.
`EntryList` takes those rows as `extras`, already drawn, so the shared list does
not import the activity feature.

**A way back to today sits in the bottom-left corner, only while there is one.**
`Screen`'s `floatingLeading` slot holds it, above the floating nav bar and
riding up with the keyboard. Absent on today rather than disabled.

**The dot under each number is that day's verdict**, and there are three plus
silence: under goal, over goal, a hollow ring for a past day with nothing on it,
and nothing at all for today-before-breakfast or a day still ahead. A day nobody
has had yet has not been missed.

`day_marks(from, to)` returns the three facts a dot needs and no verdict.
`features/logging/week.ts` turns them into a dot and is unit-tested, because the
order is the whole thing: ahead-of-today and not-yet-loaded both mean "say
nothing", and only then does an empty past day mean "missed".

### Or the whole month, as pictures

The toggle beside the heading swaps the week strip for a month grid, and it
**replaces** the screen under it. The two views answer different questions
("what did I eat" and "what have I been eating") and the month can only answer
its one by being mostly pictures, which leaves no room for the ring, the water
and the list. Nothing is under the grid and no day on it is selected: a tap
leaves the calendar and opens that day in the diary, as picking it on the week
strip would. It used to select the day in place and list its meals and water
under the grid, a second, smaller copy of the diary on one screen.

**Every cell carries the day's biggest plate**, from `day_plates(from, to)`: the
photograph where there is one and the drawing where there is not. Biggest rather
than newest, because a 44pt cell has room for one dish and "what did I eat that
day" is answered by the nasi lemak rather than by the teh tarik after it.

It is a separate function from `day_marks` rather than two more columns on it.
The strip asks that one for a week on every swipe and has no use for a picture;
joining the diary twice more per day, fifty-two weeks back, would be a cost paid
by the screen that does not want it.

Arrows rather than a pager: twelve taps reaches a year where the strip needs
fifty-two swipes, and a paging grid a screen tall would fight the vertical
scroll of the screen. The month title wraps between the arrows and the legend
wraps onto extra rows with large text. Fixed date cells limit scaling like the
week strip; their buttons announce full translated dates and verdicts.

The view mode is not persisted. The diary is the screen this app opens on, and a
launch landing on a month grid because of a tap three days ago would be the app
having changed its mind about what it is.

---

## Water

**Millilitres, not glasses.** `daily_logs.water_ml` and `daily_goals.water_ml`
are the columns, and the unit change is the whole feature. A glass was one tap
whether it was a 200 ml kopitiam tumbler, a 350 ml mug or a 500 ml bottle, so a
day of "six glasses" was anything between 1.2 and 3 litres, and a goal expressed
in them could not be met deliberately.

The default goal is 2,000 ml, which is what eight glasses used to come to, so the
migration converted every stored figure at 250 ml a glass and nobody's goal moved
by being converted.

**A drink is added, and that is why there is an RPC.** `add_water(ml, date)` does
the read and the write in one statement and returns the day's new total. Glasses
were *set*, because the tracker knew it wanted four; a quick-add row is a thing
people drum on, and a read here plus a write here loses one of two taps that
overlap. A negative amount is the undo, which is also why the total is clamped at
both ends rather than checked: somebody pressing undo has already made their only
mistake.

**Millilitres where a figure is chosen, litres where one is summarised.** The card
on Today, the quick-add sheet and the goal stepper are all ml; a trend tile, a
range total and a review's daily average are "1.8 L". The rule is per *surface*
rather than per figure, which is the part worth keeping: mixing them inside one
card produced "0 ml / 2 L", a fraction whose two halves are in different units.
`volume()` and `millilitres()` in `lib/water.ts` are the two forms.

**The card is the tank.** `ui/WaterTank.tsx` fills the whole rectangle, carries
two waves at different speeds so it reads as liquid rather than as a moving
graph, and tips its surface left and right when the card first appears and on
every drink. Everything else is drawn on it, in the top-right corner: the figure,
small, and an Add button beside it. On Today it is 60pt tall, enough for that
readout and a band of water; Trends draws it at `TANK_HEIGHT`. A short bar inside
the card with the button beside it was tried and reverted: the tank as the card
is the design.

**A full tank is still.** Once the goal is met it is drawn solid, with no waves,
no slosh and no brim. A surface still moving at the top read as a day not yet
done, and it was a frame of work every 16 ms for a picture with nothing left to
say.

There is no heading. The word "Water" over a tank of water is a label the picture
already carries, and the drop beside the figure is what identifies it on a day
the tank is empty. It went through two shapes to get here: a tall glass beside a
column of quick-add buttons, which took a third of the screen, and then a band
with the figure above it, which was three boxes saying one thing. The choosing
happens in a sheet, and the undo is a toast, because a button that appears after
every drink is a control that exists to be ignored.

**The sheet takes water off as well as on.** The toast's undo is gone the moment
it times out, a drink logged on the wrong day is only found later, and a bottle
nobody finished is an ordinary Tuesday. Both are one call, since a removal is an
addition of a negative amount. The only thing that has to know the difference is
the toast, because read off the same figure a removal announces itself as a
drink.

**The figure over the tank is drawn twice**, once on the dry ground and once
inside the water, the second clipped to the level. One copy cannot do it: in the
dark palette `water` and `water-ink` are the same value, so a figure that reads
on an empty tank vanishes exactly as the day goes well. The wet copy is not
`on-water` either, which is white and lands at about 1.9:1 on that blue. It is
`ink` in the light palette and `on-water` in the dark, the one pairing that holds
in all four combinations of theme and level.

---

## Home screen widgets

Six of them, one job each. Small widgets show a single number; medium and large
add context. The catalogue, in the design system's own order:

```
SMALL  · KCAL       what is left, one bar, and two ways into logging
SMALL  · WATER      the day's millilitres, and +250 / +500 that log in place
SMALL  · WEIGHT     the weekly average, and the eight weeks behind it
MEDIUM · DAY        the ring, the macros, snap or search
MEDIUM · QUICK LOG  snap, scan, search, recipe
LARGE  · TODAY      the ring, the macros with grams, and the day's meals
```

The design is `RiceCal Widgets.dc.html` in the design system.

### A widget is not the app

It is a different process. It has no session, no react-query cache, no network
worth relying on and a few milliseconds to draw in. So everything it shows has
to be sitting in shared storage before it wakes up, and the whole feature is
built around one document that gets put there.

```
modules/ricecal-widgets/     the shared store, and the JS seam over it
  src/types.ts               THE CONTRACT. Read this first.
  ios/                       the App Group, and the Expo module
  android/                   the same, plus the widgets themselves
widgets/ios/                 the WidgetKit extension (SwiftUI)
plugins/withWidgets.js       what puts that extension into the Xcode project
src/features/widgets/        what the app publishes, and what it reports
app/widget/[action].tsx      where every widget tap lands
```

**The widget does no arithmetic and no formatting.** Every bar arrives as a
`fraction` already clamped to 0..1 and every figure as the string to print.
`buildWidgetSnapshot` decides all of it, in one pure function with a test beside
it. A ring that divided for itself would be a second implementation of the sum
on Today, in two other languages, and the three would disagree the first time
movement extended the budget.

The one number the native side reads rather than prints is `water.ml`, because
the preset buttons add to it in place.

**And no verdicts.** Whether a day reads as on track or a bit over, and whether
a weight change is a gain or a loss, are decided beside the arithmetic that
produced them and travel as `kcal.over` and `weight.up`. A widget cannot work
either out for itself — what reaches it is a formatted string — and one that
guessed would be a second opinion about a figure the screen one tap away has
already ruled on. Trends paints a gain kaya and a loss pandan; so do both
widgets, from that flag.

### The two platforms are not symmetrical, and it is not laziness

**iOS needs a config plugin; Android does not.** An Android widget is a
broadcast receiver and some layouts — ordinary library code, which lives inside
the local Expo module and is merged into the app by Gradle. A WidgetKit widget
is a separate BINARY with its own bundle, entitlements and Info.plist, and
`ios/` is build output regenerated by every prebuild. So `plugins/withWidgets.js`
creates the target, copies the sources, the four icons and the two typefaces,
and writes both plists on every prebuild.

**The App Group is derived, never written down.** `group.<bundleId>`, so it
follows the build variant — a development client's bundle id carries a `.dev`
suffix and an App Group has to be a real entitlement on whichever app is
running. The plugin writes it into both targets' entitlements AND both
Info.plists, which is how `RiceCalWidgetStore` finds it without a constant.

**EAS has to be TOLD the extension exists.** It resolves credentials from the
app config before it builds, and under CNG the Xcode project does not exist yet
— the target is created by the prebuild that runs on the build server minutes
later. Without the `extra.eas.build.experimental.ios.appExtensions` block that
`app.config.ts` derives, EAS registers a bundle id and a profile for the app
alone and the build fails at signing on a target it has never heard of. The
names come from `plugins/withWidgets.js` so the two cannot disagree, and so a
development build declares `.dev.widgets` and `group.…dev` without a second
copy of the arithmetic.

**The extension's version pair has to match the app's.** Apple rejects an upload
whose extension disagrees with its container about `CFBundleShortVersionString`
or `CFBundleVersion` (ITMS-90473), and `autoIncrement` in `eas.json` moves the
build number on every production build. So the plugin writes the resolved
`ios.buildNumber` into the extension's Info.plist rather than a constant. It is
the worst shape a bug can have: everything compiles, installs and runs, and the
failure arrives at the App Store Connect gate on the second release.

**Editing a widget means running the prebuild.** The extension's sources are
COPIED into `ios/` by the plugin, so `expo run:ios` on its own rebuilds the copy
that is already there — the edit compiles cleanly and changes nothing on screen,
which is the worst way for this to fail. `pnpm ios` does both, in order, and is
the command to use.

**Adding a Swift FILE needs `prebuild --clean` on top of that.** The plugin
re-copies sources every time but only creates the Xcode target once, and the
guard that makes it idempotent is what stops a second run adding a second target
with the same name.

**The app's light/dark choice reaches the iOS widgets and not the Android
ones.** A WidgetKit view resolves its colours in Swift and can be handed the
other palette; a `RemoteViews` tree is inflated by the launcher from `values/`
and `values-night/`, chosen before any of our code runs. Overriding that would
mean a second copy of every drawable. An Android widget following the launcher's
theme is what every other Android widget does.

**Two tiles on the small calorie widget are one tap target on iOS.** A
`systemSmall` WidgetKit widget has exactly one, which is `widgetURL`; `Link` is
ignored there. So the whole card opens the camera, which is what the log button
does and what somebody reaching for that widget almost always means. Android has
never had the limitation, so there the two really are two.

**A medium or large widget needs both.** A `Link` claims its own region and
nothing claims what is between them, so a widget built out of `Link`s alone has
dead space wherever it draws something that is not a tile — the ring, the
macros, the meal list, the heading. Day, Quick log and Today carry a card-wide
`widgetURL` underneath their links for that, which is the same root target
`WidgetRenderer` sets on every Android card.

**The Android cards are drawn a size larger than the design.** A design frame is
170 x 170; a two-cell Android widget is about 0.72 of that in aspect, because a
launcher cell is taller than it is wide. The same layout on that card leaves a
third of its height over — spent as one gap it reads as a card that failed to
load, so it goes on the figure and on the touch targets instead. iOS keeps the
design's metrics, because there the frame is the one the design was drawn for.

### Three things that cost an afternoon each

**`ACTION_APPWIDGET_UPDATE` is a protected broadcast.** Only the system may send
it, so the obvious `sendBroadcast` at each provider throws a `SecurityException`
inside the activity manager and the widgets simply never move — which reads as
"the snapshot is not being written". `WidgetStore.reloadAll` pushes
`updateAppWidget(ComponentName, RemoteViews)` instead, which needs no broadcast
and no permission. The cost is that it has to know how to draw, which is why it
goes through `WidgetRenderer`.

**An Android widget's cell arithmetic is `70n - 30`, not `70n`.** A launcher
falls back to `minWidth`/`minHeight` whenever `targetCellWidth`/`Height` do not
fit its own grid, so the two have to agree. At `70n` every widget asks for one
row more than it looks like: the 2x2 cards were placed 2x3, with a band of empty
card down the middle that looked like a layout bug.

**WidgetKit applies content margins of its own from iOS 17**, about 11pt on a
small widget. A `.padding(16)` on top of them measures 27pt against a design
that asks for 16, on all six widgets at once. `widgetInset()` defers to the
system from 17 and pads only below it. The other way round —
`contentMarginsDisabled()` — cannot be written behind one opaque return type,
because it is iOS 17 only and returns a different `WidgetConfiguration`.

### The day ending is the one redraw the app cannot push

Every other redraw is pushed: the app writes the snapshot and asks for a redraw
the moment the diary moves, which is why `updatePeriodMillis` is zero on all six
Android providers and the iOS timeline has no refresh policy worth the name.

Midnight is different, because nothing about the diary changes and yet every
figure on the card becomes wrong. Both stores already refuse a document
describing a day that has ended — but a refusal nobody consults is not a
refusal, and neither platform re-reads anything on its own.

iOS answers with a second timeline entry, dated midnight and carrying no
snapshot, so WidgetKit swaps in the placeholder by itself. Android has no
timeline, so `WidgetStore.scheduleRollover` books an inexact alarm and
`MidnightReceiver` redraws and rebooks. Inexact deliberately: an exact alarm is
for something somebody is waiting on at a particular second, and this is a card
nobody is looking at. Without either, a phone left on a bedside table presents
last night's calories, water and meals as this morning's.

### Water is the only widget that writes

Everything else is "take me to the thing", which a URL does. A drink is a write,
and a write that first launched the app, waited for a session and made a request
would be a button that does nothing for two seconds and might fail.

So the tap queues the drink in shared storage and moves the figure on the card in
the same call, and `WidgetSync` sends it the next time the app is in front of
somebody. The day is taken AT THE TAP: a bottle finished at half past eleven
belongs to that night, and the app might not be opened until the morning.

`takePendingWidgetActions` empties the queue as it reads it, so a failed sync
loses the drink. That is the accepted trade: the alternative is an acknowledged
queue, and every version of that ends with a drink logged twice on a phone killed
mid-sync. Losing one is better than doubling one.

On iOS the buttons are iOS 17 and up (`Button(intent:)` did not exist before it);
16.4 gets the same card with the whole of it opening Today. Android has them on
every version this app supports.

### Every tap crosses one route

`ricecal://widget/<target>?w=<widget>` → `app/widget/[action].tsx`, which counts
it and redirects. A widget could link straight at `/log?panel=camera` and the
right screen would open — and nothing downstream could tell that tap from the log
button being pressed, which is the only question the widgets have to answer to
justify themselves.

### What analytics is told

Four events and one person property, and the awkward one is adoption.

```
Widget Added        a diff, on foreground, against the set last seen here
Widget Removed      the same diff in the other direction
Widget Opened       a tap that reached the app, with which widget and where to
Widget Water Added  a drink logged on the widget, counted when it syncs
widgets_installed   how many are on this handset
```

**Neither platform announces an install.** Both will say what is there now and
nothing about when it changed, so `reportWidgets` polls on foreground and
compares against MMKV. Two consequences before building a chart on it: it is
late, and it is per handset rather than per account. The first poll of an
install emits no add/remove events. Deleting the app leaves the widgets on the home
screen, so a reinstall would otherwise report three installs that happened
months ago. The current count still reaches each signed-in account on its first
valid poll, even if the handset's widget set did not change. Pending results from
an account that left are discarded; returning to it does not revive the old poll.

`Widget Water Added` is fired when the queue drains, not when the button was
pressed, because the button runs in a process with no analytics client in it. A drink
whose sync failed is never counted, which is the honest direction to be wrong in.
An action completing after its account leaves is also excluded from tracking so
it cannot be filed against the account that follows.

---

## History behind the charts

Trends says what a range came to; History says what it was made of. A card under
every Trends tab lists the newest few entries for that metric, and "View full"
opens `/history`, every entry newest first, read like a statement. Both read
`useHistory` in `data/history.ts` through one key, so the screen opens on rows
the card already fetched.

**Each metric keeps the grain it is stored at.** A meal is a row, from
`food_log_details`. Water is one row per day, from `daily_logs`, because
`add_water` adds to a day's total and there are no separate drinks to list. A
weigh-in is one row per day, from `weight_logs`, with its change from the reading
before and the health store's name when a store wrote it. No new server function
was needed and none should be: these are tables the app already reads under RLS.

**Pages end on whole groups.** Each card carries a figure for all of it: a day's
calories, a month's average water, a month's weight change. A page that ended
partway through one would print that figure short until the next page landed,
and for good if it failed. So meals page by whole days and water and weight by
whole months: `wholeGroups` drops the oldest group of a full page and the next
page starts on it. A weight page asks for one reading more than it shows, so its
last row still has a change beside it rather than looking like the first
reading ever. Water days are judged against the goal in force that day, since
`daily_goals` is effective-dated.

**The key sits under `trends`**, so every write that invalidates the charts
(`trendsAll`) refreshes the list too, with no extra line in any mutation.
Closing `/history` trims the query back to its first page: an infinite query
refetches every page it holds, and a year scrolled once would otherwise be
re-read behind the Trends card after every meal. A fetch still in flight is
cancelled before the trim (it would land on top of it) and asked for again
afterwards, since a cancel puts back the answer from before the write.

**A row opens the thing it lists.** A meal opens its detail page with its day in
the link (`date`), and the page reads the entry from that day rather than the
diary's selected one. Moving the selected day to reach an old meal was tried
and left the diary there, so the next meal logged from the nav bar's "+" was
filed on that old day. A water row opens its day on Today, through `dismissTo`:
from `/history`, `navigate` pushed a second copy of the tabs. A weigh-in opens
the weigh-in sheet on its day, which is why the weight tab's old "Recent weigh
ins" card is gone: the History card is the same list, editable the same way,
with the Add pill on its heading.

**It is not behind the paywall.** The free tier's seven days limit the charts, but
every row here is a diary entry the free diary already shows on its own day.

---

## Weekly and monthly reviews

A finished week or month, read as one column of cards. A compact row directly
below Trends' Calories, Water and Weight tiles leads to `/reviews`, which lists
the periods worth opening, and one of
them opens `/reviews/[id]` (`week-2026-08-03` or `month-2026-07-01`, the kind and
the first day, from which the server works out the rest).

**It scrolls, and it used to page.** Four screens of cards, tapped or swiped
through under a progress bar, borrowed the shape of an Instagram story without
borrowing the thing that makes one work: a story page is a photograph read in a
second, and these are charts and figures somebody wants to compare. Paged, the
answer to "what did that say" was a tap backwards and a hunt, and seeing the food
beside the calories meant remembering one of them.

What went with the pager is everything that existed to serve it: the step
counter, the segmented progress bar, the two edge strips that took a tap, and the
`fullScreenModal` presentation those strips needed. The cards themselves are
unchanged.

**Only finished periods, and every one of them.** Weeks reach three months back
and months reach six, because a weekly review is about something somebody still
remembers eating and a monthly one is about a shape only visible from a distance.

Nothing is hidden for being thin. There was a sufficiency rule (four logged days
of a week, twelve of a month) and it hid the weeks whose shape was most worth
seeing, while making the route into the feature invisible to exactly the person
who had not found it yet.

**How many sections a review has is data.** `reviewSteps` reads the summary: the
card, the food and the calories always hold, and the body section exists only if
there was a weigh-in or a watch. A month before the health store was connected is
three sections rather than four, of which the last would be dashes.

**A tap on a card shares it.** Every card draws itself into a picture through
Skia's `makeImageFromView` and offers it in a sheet with a Share button. The
preview is that captured file rather than a second rendering, so what is on
screen is exactly what leaves the phone. iOS gets the picture, Android the
sentence beside it: React Native's `Share` takes `url` on iOS alone, and sharing
a file on Android needs a content:// provider, a dependency and a rebuild.

That press is now the only one on the page, which is what makes a scrolling
review simpler than a paged one rather than merely different. The pager had to
share the screen with it, and the arrangement that worked was the second attempt:
strips down either edge, laid *over* the cards. Under them they did nothing,
because React Native offers an unclaimed touch to the hit view's ancestors and
never to a sibling that overlaps it.

**The biggest plates carry the plate.** Each dish on the food card leads with the
newest photograph logged under that name and falls back to its drawing, so a
camera user's week is their own five plates rather than five copies of one
outline. `review_meals` returns the key beside the icon and the client prefers it
exactly as the diary does; the five signatures it needs are batched into one
request by `data/photos.ts`.

**Two reminders open a review**, and they are the only notifications in the app
that go anywhere. The weekly one fires on Monday morning and the monthly on the
first, both looking back at something that has just finished. A weekly report
sent on Sunday evening would link to the week before last, since `review_periods`
will not offer a week until it is over. Both link to `week-latest` /
`month-latest` rather than to a date, because a reminder is scheduled weeks
before it fires and cannot name the period it will be about.

---

## Activity and health

Apple Health on iOS, Health Connect on Android. Both are on-device stores, so the
phone is the reader and Postgres is the record. A figure that only exists on one
handset cannot take part in a budget computed in the database, a chart computed
in the database, or a report job with no client to ask.

### The landscape

There are **two** health stores and everything else feeds one of them.

| | Apple Health | Health Connect |
|---|---|---|
| Platform | iOS, iPadOS, watchOS | Android 8+ |
| Kind | first-party store on device | first-party *aggregator* on device |
| Written by | iPhone, Apple Watch, any allowed app | Samsung Health, Fitbit, Garmin, Strava, Mi Fitness, Zepp, Google Fit |
| Server access | none, device only | none, device only |

**Google Fit is gone.** Google stopped accepting new developers for the Fit REST
and Android APIs in May 2024 and switched them off through late 2026, with no
automatic data migration. Anything written today about "reading Google Fit" is
describing a dead API.

**The wearable vendors are not separate integrations.** Fitbit, Garmin, Whoop,
Oura and Strava all publish cloud APIs, and every one is a server-side OAuth
integration with its own developer agreement, rate limits and review process. All
of them also write into Apple Health or Health Connect on the phone the user
already has. Reading the store gets their data with one permission sheet, no
keys, no backend, and no per-vendor outage. That is why `src/lib/health` has two
real providers rather than seven.

### What we read

| What | Apple Health | Health Connect | Used for |
|---|---|---|---|
| Active energy | `activeEnergyBurned` | `ActiveCaloriesBurned` | **the budget**, the Move tile |
| Resting energy | `basalEnergyBurned` | `BasalMetabolicRate` | the burn split only, never the budget |
| Steps | `stepCount` | `Steps` | the steps screen |
| Distance | `distanceWalkingRunning` | `Distance` | beside steps, and on a workout row |
| Exercise minutes | `appleExerciseTime` | `ExerciseSession` durations | the Exercise tile |
| Stand hours | `appleStandTime` | **nothing** | the Stand tile, Apple only |
| Workouts | `HKWorkout` | `ExerciseSession` | the session list and detail |
| Heart rate | `heartRate` samples, three ways | `HeartRate` samples in the window | zones and averages |
| Body weight | `bodyMass` | `Weight` | **the calorie budget**, the weight chart |
| Body fat | `bodyFatPercentage` | `BodyFat` | stored beside a weigh-in |

Both stores expose far more (sleep, cycle tracking, blood glucose, ECG,
medications, GPS routes) and the request lists are deliberately short. A calorie
diary that hoovers a user's medical history because the sheet was open anyway is
a different app.

Everything above the line is read through an **aggregate** API rather than by
summing raw samples. That is not a performance choice: summing samples on a phone
that has an iPhone *and* a Watch writing step counts produces double the steps,
the classic "12,000 in the app, 6,000 in Health" bug.

**On iOS that is the end of it**, because a statistics collection merges across
sources itself.

**On Android the aggregate is only where the question starts.** Health Connect
dedupes by a priority list the *user* controls, which means it can be switched
off without anybody being told, and then the aggregate hands back the sum of
every app that wrote. So the Android provider reads which origins contributed and
re-reads filtered to one of them.

**The two body measurements are read as samples instead**, and the reason the
aggregate is mandatory elsewhere is exactly why it is wrong here. Weight is a
discrete quantity: nobody adds up three weigh-ins, so two apps reporting the same
one is a value repeated rather than doubled. What the aggregate would cost is the
answer itself: `cumulativeSum` over a Saturday's three weigh-ins is 217 kg. A
day's weight is its last reading, so both providers read ascending and keep the
last sample per local day.

**A workout's heart rate is asked for three ways on iOS, and the first is not
enough.** `predicateForObjects(from:)` matches the samples the recorder
*attached* to the workout, so an app that saves a session it imported from
somewhere else attaches none and the session reads as pulseless. `apple.ts`
falls back to the session's own start and end, strictly on both sides — on a
watch worn all day the readings inside a workout's window are that workout's
heart rate — and then to `HKWorkout.statistics(for:)`, the average and maximum
the Fitness app shows, which have no samples behind them and so cannot be
banded. Android needs none of this: Health Connect has no notion of attachment
and the window is the only question there is.

**What sends it down to the second rung is a thin answer, not an empty one.** It
was emptiness, and the screen showed the cost: an average and a maximum over a
zone card with nothing in it. Bands need ten readings (`MIN_ZONE_SAMPLES`), so a
recorder that attaches a handful satisfies "did we get anything" while leaving
nothing to draw, and stopping there hides the window read that would have found
the watch's own minute-by-minute samples. The window is asked whenever the
attached set is too thin to band, and the fuller of the two answers wins.

**An average with no zone chart under it usually means heart-rate samples are
not readable at all.** `HKWorkout.statistics(for:)` reads figures carried on the
workout object the workout query already returned, so it answers whether or not
the *Heart Rate* type was granted — while both sample queries return an empty
list rather than an error, because HealthKit will not tell an app it was denied.
Deleting and reinstalling the app clears its Health authorisations, so a dev
build reinstalled mid-week can lose zones on every session while every other
figure on the screen stays correct. The check is Health → Sharing → Apps →
RiceCal, not the code.

**A percentage means different things on the two platforms.** HealthKit's `%`
unit is a fraction (22% body fat reads as `0.22`) while Health Connect's
`BodyFat.percentage` is already `22`. Converting on both sides gives 2,200 on one
of them, and `body_fat_pct` is checked `between 1 and 75`, so the figure would be
dropped and body fat would silently never appear. `asPercent` in `apple.ts`
normalises it, branching on 1 rather than on the platform, because 1% body fat is
not a body.

### A workout's own page

Every one of the 19 normalized sports opens `activity/workout/[id]`. Its hero
uses the sport's illustration and a soft colour setting, with distance leading
for travelling sports and time leading for everything else. Time and active
energy stay together; supporting measurements sit below rather than becoming
a fixed grid of mostly empty tiles.

Running, walking and hiking read pace per kilometre, cycling reads km/h,
swimming reads pace per 100 m, and rowing reads a split per 500 m. These are
averages over the recorded duration, not moving-time pace or laps. A court
sport's shuffling distance is still suppressed, along with anything derived
from it. A travelling workout without a distance falls back to time. Elevation
appears only when reported, including a measured zero.

Heart rate is one card: average and maximum when reported, followed by four
bars showing the recorded seconds in each zone. Summaries without samples keep
their average and maximum; zones without summaries still draw their bars. No
heart data means no heart card, and zero total zone time means no zone chart.
There are no stored pulse traces, routes, laps, repetitions or personal records,
so the page cannot draw them. (A gym workout recorded on the Apple Watch does keep
its trace; see "The Apple Watch app".) `features/activity/WorkoutDetails.tsx` owns the
layout and `workoutMetrics.ts` owns the sport-specific measurement choices.
With large text, supporting measurements stack and the decorative illustration
gives its space to the figures. Zone names can wrap instead of truncating.

For local UI verification, `pnpm workouts:seed --user <local-account-uuid>`
inserts all 19 sports plus 11 data variants into that account across six days.
Use `--date yyyy-MM-dd` to choose the last day. The script connects only to
`supabase_db_ricecal`, marks the rows as demo previews, and upserts its own
external IDs, so repeating it does not duplicate or overwrite real workouts.
It leaves health connections and day totals alone. The variants cover missing
distance, missing heart readings, summaries without zones, zones without
summaries, zero values, indoor cycling and an unknown sport with a long label.

### Syncing

`src/data/health-sync.ts`. A **week-deep backfill** on connect, then the last
**seven days** re-read on every foreground.

**The automatic pass is mounted in the tabs layout**, beside the reminder sync,
so it runs whichever tab a launch lands on and hears every return to the
foreground. It used to live on the Activity tab, which is gone. The manual pass
is **Settings, Health, Sync now**.

Settings keeps the connection progress visible until the first read finishes.
An empty read keeps its retry guidance and the development demo option visible,
even though the connection row has already been written. Device availability
is checked again when returning from Settings or the Play Store.

It was a year, then a month, then a week, and each cut was the same argument
carried further: the backfill exists so the day list is not empty on the day
health sync is turned on, and a week answers that. What it costs is the 30-day range,
which starts three-quarters empty and fills in over the following weeks. That is
the accepted trade against a permission screen somebody waits through inside
onboarding.

**Not a cursor**, and that is the decision the file is shaped around. Health data
arrives late and arrives edited: a watch out of range writes Tuesday on
Wednesday, Strava back-dates an upload, Apple recomputes a day when a second
source appears. "Everything since the last sync" misses all three permanently.
Every key in the schema exists to make that repetition free.

Providers: `apple.ts`, `androidHealth.ts`, and `demo.ts`, which is generated,
deterministic, dev-only, and a `health_provider` enum value rather than a flag,
so every query and delete treats it like a real one. Both native libraries are
`require`d lazily; a top-level import of a Nitro module throws on a dev client
built before the dependency landed, and the symptom is a white screen rather than
a broken tab.

Hourly detail stays for older store binaries, whose Steps screen reads today's
hours. Year charts, Trends, Reviews and calorie budgets use `activity_days` and
`activity_sessions`, so hourly history does not drive their totals. Providers
already omit empty step buckets, and Android drops flat buckets apportioned
from a whole-day reading. Pulse samples are reduced on the phone to workout
averages, maxima and four zone durations. Routes and raw pulse traces are not
stored, except a gym workout's from the Apple Watch app. Daily readings, workouts and weigh-ins keep their history.

`replace_activity_hours` replaces a read window atomically: it deletes hours
that disappeared when a duplicate source was removed, inserts new hours and
updates changed measurements. Identical rows are left alone, avoiding the dead
tuples caused by deleting and rewriting a week on every foreground. A failed
replacement rolls back its deletes too. A read with no measured days or hours
keeps the last good hourly data, since an unavailable store or revoked access
is not a measurement of zero. A measured day with no hours still removes
disappeared source buckets. The captured account must still match
the session, including for an empty replacement. Older binaries keep their
direct table grants and RLS policies. Long backfills split at local today minus
30, so a chunk straddling that boundary cannot write extra historical hours.

`activity-hours-retention` in the jobs Worker runs hourly at `:37` UTC. Its
service-only `prune_activity_hours` RPC deletes dates **before UTC today minus
31**, keeping the boundary day. The extra day preserves local today minus 30
even in UTC-12. It uses the original scheduled time, capped at the database's
current time, so retries and a future timestamp cannot prune recent hours.
Each transaction deletes at most 1,000 rows through a date index and skips
locked rows. A run stops after 20 batches or a locked backlog; `job_runs.detail`
records `pruned`, `before`, `batches` and `drained`, and the next hour continues.
Expired hours written again by an old backfill are removed on a later sweep.

Deploy the generated migration before the jobs Worker and before the app that
calls the replacement RPC. The migration extends the backend; existing tables,
columns, inputs and read shapes stay available to old binaries. The database
tests cover the retention boundary, old writes, account isolation, unchanged
physical tuples, failed replacement, and unchanged activity and review totals.

After rollout, check `job_runs` for `activity-hours-retention` and count hours
older than `(now() at time zone 'UTC')::date - 31`. A persistent backlog or
`drained: false` needs investigation. Compare `pg_total_relation_size` and
`pg_stat_user_tables.n_dead_tup` before and after the catch-up. Deletes make
space reusable after vacuum; they need not immediately reduce the allocated
file size. Autovacuum handles normal cleanup. A one-off `VACUUM FULL` is a
separate maintenance decision because it locks and rewrites the table.

---

## Workouts

Gym sessions logged set by set, the way Hevy and Strong do it, plus the
routines they start from and the records they set. Today is what went in;
Workouts is what was done. It was the second tab until Groups needed the room;
now it is a page, opened from a small tile beside the water card on Today and
from the first row of Settings on Me. Its URL stays `/workouts`, so the Live
Activity, the watch and old notification links still land on it. The minimised
bar of a running workout floats over the tabs only; the page has its own Resume
button.

```
app/workouts.tsx              streak, start button, routines, history, and a
                              month calendar view
app/workout/active.tsx        the logger
app/workout/finish.tsx        name, notes, start and end times, save
app/workout/[id].tsx          a saved workout, with its records and muscles
app/workout/edit/[id].tsx     edit a saved one
app/workout/exercises.tsx     the library, as a browser and as a picker
app/workout/exercise/[id].tsx an exercise's history, charts, records and split
app/workout/routine/[id].tsx  edit a routine
app/workout/templates.tsx     the built-in templates; template/[id] is one
app/workout/stats.tsx         this week, totals over 3 months to all time,
                              30 days of muscles, records
app/workout/settings.tsx      rest timer, units, Apple Health, reminders, CSV export;
                              a row on the tab's list and in Me, Settings
app/workout/import.tsx        import a Strong or Hevy CSV
app/workout/custom.tsx        a custom exercise
src/features/workouts         the document, catalogue, templates, logger parts
src/data/workouts.ts          every read and write, and the outbox
src/data/workout-import.ts    saving an import
apps/supabase/schemas/42_workouts.sql  the tables and save_workout
apps/supabase/schemas/96_workouts.sql  every number: volume, 1RM, records, streak
```

What a user can do: start an empty workout, a routine, a template or a repeat of
an old one. The logger shows each exercise's last numbers in a PREVIOUS column, takes warm-up,
drop and failure sets, an RPE per set, supersets, notes, replacing and
reordering, a rest timer per exercise and generated warm-up sets, and marks a
record the moment a set beats one. A saved workout can be
opened, edited, deleted, repeated, shared as text or saved as a routine. Every
exercise has a page with its history, charts, bests, rep records and muscle
split. This week's totals, bars over three months (free) or a year and all
time (Pro), a 30-day muscle split, a calendar and the personal-records list are
on the progress screen; the week streak sits beside the tab's title, as the day
streak does on Today. The toggle on the title's other side is Today's too: it
swaps the tab for the month (`WorkoutCalendar`, the progress page's calendar
with days that can be picked), every trained day filled, and under it the
workouts of the day tapped, today until another is. That list is History's
cards for one day, PR badges included (it asks for the record counts History
has, for one day's workouts), and it holds the day's workouts still waiting to
sync, as History does. Settings exports every set as CSV and imports
a history from Strong or Hevy.

### The catalogue is code, and every entry has a drawing

`features/workouts/catalogue.ts` holds 278 exercises (gym lifts, bodyweight,
cardio and mobility), each with an equipment, a body part, a level, a MET value
and a muscle split that sums to 1. **There are no sports.** The tab is a
training log, and a badminton game or a football match is not one: it has no
sets to log, and on iPhone the health store already records it from a watch.
The 22 sports it once carried, and the "Log a sport" button, were taken out
before release, so no saved workout names one.
It is code rather than a table for the reason the food icons are: every entry
has an illustration made for it, and a row the server could add would arrive
with no picture. Anything missing is a **custom exercise** (`custom_exercises`),
which the user names, gives a tracking and muscles, and which then behaves like
any other.

- **Ids are permanent.** A saved workout stores the id. Renaming is changing
  `name`; removing an entry strands its history (the saved name still reads,
  the picture and the muscles go). Never reuse an id for another movement.
- **Names are Strong's.** Every exercise Strong ships has a catalogue entry,
  under Strong's own name where that name says what the movement is ("Push
  Up", "Seated Row (Cable)", "Pec Deck (Machine)"), and Hevy uses the same
  names for most of them, so someone arriving from either app finds the
  movement they know. A few Strong names are a second name for an entry
  ("Chest Fly" is the pec deck, "Strict Military Press (Barbell)" the overhead
  press) or too vague to be one ("Cable Kickback" is drawn and named as the
  triceps kickback it is). The name an entry had before is kept as an alias,
  so a search for "push-up" still finds it. Strong's four sports (climbing,
  skating, skiing, snowboarding) and its plain "Triceps Extension" import as
  custom exercises.
- **Names stay English in every language**, the way a dish name does. "Lat
  Pulldown" is what the machine is called in every gym the app is used in. The
  words around the names (muscles, equipment, categories) are translated.
- **The tracking decides the columns**: weight and reps, reps, added weight,
  assistance, time, distance and time, weight and distance. Volume counts the
  three where something is lifted, at what was lifted (the set's load, below):
  an assisted pull-up's figure is the machine helping, and multiplying that by
  reps would make the easiest set the biggest.

**The drawings** are 320 px WebPs in `apps/mobile/assets/exercises/`, one per
id, registered in the generated `exerciseArt.generated.ts`. A test fails when an
exercise has none, so a new catalogue entry needs its drawing in the same
change. To add or redraw one:

```sh
node scripts/exercise-art/generate.mjs --only <id>[,<id>] [--force]
uv run scripts/exercise-art/process.py --only <id>
```

`generate.mjs` sends each pose brief in `poses.mjs` to Codex image generation
with `style-reference.png` attached, because a set drawn without one shared
reference drifts into five styles by the fortieth image. It writes 1254 px PNGs
to `~/.cache/ricecal/exercise-art`, outside the app folder because Metro watches
that folder and reloads on every file that lands in it. `process.py` trims each
to its outline, re-centres it with the same margin, and writes the WebP and the
registry. **Look at every image before committing it**: a model can swap a grip
or draw the wrong machine, and an exercise library with a wrong picture is worse
than one with none.

The brief pins the outfit as well as the style. With only the reference to go
on, Zumba came back in team colours, which read as a different person in a
library that is otherwise one figure; it was redrawn once the brief said brown
tank top and charcoal shorts in words.

Lying and hanging poses are where the anatomy goes wrong: a bench press came
back with one leg and an arm growing out of the chest, a skullcrusher with a
third dumbbell. Their briefs now spell out both legs visible, each arm rising
from its own shoulder, exactly two dumbbells. Some poses also need the camera
named. A reverse plank seen from the side has the same outline as a push-up,
so the brief asks for a high three-quarter view that shows the chest facing
up.

**Templates** (`templates.ts`) are 19 standard programs in seven groups: two
beginner full-body days, push/pull/legs, upper/lower, 5×5, one muscle a day,
no-gym, and short focused sessions. They give reps and times, never weights: a
weight in a template is somebody else's, and the PREVIOUS column already shows
the user's own. Adding one to "My routines" copies it into `workout_routines`
with `template_id` set, so the template page can say it is already there.

**The routine editor is the plan and nothing else.** Its page is the exercise
editor; the name and the note are asked for on Save, in a card over it, so a
routine is built first and named once it is something to name. It has no Start
button: the routine's row on the tab has one, on the right beside its name (one
line, a size under a card title) and the date it was last done as a badge, with
its exercises named under them in up to two lines. A second Start a tap further
in was the same button twice.

**A free account keeps three routines.** `workout_routines_enforce_free_limit`
refuses a fourth insert with `routine_limit_reached`, as the recipe ceiling does
(see "What each tier gets"), so a template added to "My routines" and a workout
saved as one count too. The three ways to make one ("New routine", the first
row of the tab's list under the routines, "Add to my routines" and "Save as
routine") check the list on screen first (`useRoutineGate`) and open the paywall before anything is built;
the trigger is the last word for a routine added on another phone. Only a
known free account is stopped at the button: while the subscription is still
being checked, or cannot be, the editor opens and the trigger decides at Save,
so a Pro account is never told "checking" by New routine at launch. Editing,
starting and deleting are never gated, and an account that lapses with more
than three keeps them all.

### A workout lives on the phone until it is finished

The running workout is a document in MMKV (`features/workouts/store.ts`), keyed
by account, and every tick is a synchronous write to it. Nothing reaches the
server until Finish. A gym is where the signal is worst, and a set that waited on
a request would be a set lost to a basement; the timer is a start time rather
than a counter, so killing the app mid-workout loses nothing.

Finishing sends the whole document to `save_workout(jsonb)`, which writes the
workout, its exercises and its sets in one transaction, replacing anything saved
under the same id. **The id is minted on the phone when the workout starts**, so
a save retried after a lost reply converges on one workout. **Every save goes
into the outbox (`data/workout-outbox.ts`) before it is sent**, and leaves only
when the server has it or refuses it, so a token refresh that hangs or the app
killed mid-request loses nothing. `useWorkoutOutbox` in the tabs layout sends
what is left on launch, on reconnect and on every return to the foreground, once
there is a session to send it with.

**Only a refusal about the data is final**: SQLSTATE classes 22 (a value out of
range) and 23 (a constraint). An expired token, a refresh that failed on a weak
signal so the request went out as anon (`42501`), a timeout or the database
gone read only all pass on a later try, and treating any coded error as final
used to delete the workout. Even a refused workout stays in the outbox, tried
again on the next launch, and `toPayload` holds every value to the column's
limits so a typo (2250 lb for 225) is a wrong set rather than a lost session. A
reply only clears the copy that was sent: an edit queued while it was in
flight stays. A queued workout's row in the history opens a sheet to send it
again now (`retryQueuedWorkout`, which also lifts a refusal from this launch)
or to discard it, with its Health copy only if the server has no copy of its
own (a queued edit of a saved workout shows as waiting too); it used to read
"Waiting to sync" with nothing to do about it. A save answers "queued" after 15
seconds, measured over the whole request including the token refresh, which has
no timeout of its own; a reply that lands later still clears the copy it sent.
Every send of a workout, from a save, the outbox or a delete, is registered
while in flight, each waits for the one before it and the outbox skips one in
flight, so a late copy cannot bring back a deleted workout or overwrite a newer
one. A delete takes the queued copy out before it is sent, for the same reason.

Children are owned by `(workout_id, user_id)` composite foreign keys rather than
the id alone: a foreign key check bypasses row security, so with the id alone a
user could attach sets to somebody else's workout by knowing its id.

### Every number is Postgres's

`96_workouts.sql` is the arithmetic: a set's volume and estimated one-rep max,
whether it was a record, a workout's totals, an exercise's bests and history,
the weekly and monthly bars, the streak, and sets per exercise for the muscle
split. The
phone adds nothing up except the live totals of the workout on screen.

**Two views, and the split is for speed.** `workout_set_values` is every set
with its volume and 1RM and nothing that needs the sets around it, so a filter
on one workout reaches the indexes. `workout_set_details` adds the record flags
with window functions over the user's whole history, and a window cannot be
filtered before it is computed: when the history list asked it for each
workout's totals, Postgres scored every set the user owned once per row, which
at a couple of years of training reaches the statement timeout. Totals read
the values view; records are scored once and grouped.

**The running best runs over workouts, not sets.** `workout_set_details` takes
each workout's best per exercise first, then a running max over the earlier
ones. The first version ran it over the sets with `exclude group` to leave out
the set's own workout, and a frame with an exclusion cannot carry its result
from one row to the next, so Postgres recomputed every prior best from scratch
for every set. That made the work quadratic: three years at four sessions a week
(15,000 sets) took 3 s to open one workout and 3 s for the first page of
history. Grouped first, they take 15 ms and 80 ms, with the same flags on every
set. `exercise_bests` is grouped the same way for the same reason.

**The earlier bests are joined to the sets before the ranking windows, not
after.** Row security leaves the planner guessing that every user owns the
average number of sets, so for a heavy user among many light ones it chose a
nested loop and recomputed every window once per workout: 100 workouts took
3 s and about 150 passed the statement timeout, which emptied the history list
and Today's workouts without an error. Joined first, the windows run once; with
nested loops forced on 200 workouts the history page takes about 130 ms, with
the same flag on every one of 5,000 sets as before.

- **Estimated 1RM** is Epley, written `weight × (30 + reps) / 30`, over 1 to 15
  reps of a weight-and-reps set. Past fifteen the formula means nothing. Written
  that way because `reps / 30.0` is cut to twenty places, which made 56.25 × 4
  63.7 here and 63.8 on the phone, and a trophy the saved workout did not have.
  The phone does the same sum in cents (`estimatedOneRepMax`, `setVolume`), so
  95 lb × 5 is 215.45 on both sides rather than 215.45000000000002 on one.
- **A save refuses a set with no number in it**, an exercise with no sets, and
  a `log_date` more than a day from the start, all as class 22 or 23 so the
  outbox drops them as final. The phone never sends the first two: a ticked set
  whose figures were cleared afterwards is left out of the document.
- **A set is a record** when it beats the best of every earlier workout *and* is
  the best of its kind in its own workout. The second half is what stops a
  heavy day lighting up three trophies for three successively heavier sets.
  The first workout of an exercise sets the baseline and wins nothing.
  Warm-ups count toward volume and never toward a record. "Earlier" is by
  start time and then id, so two workouts logged at the same minute cannot
  both take the same record.
- **The heaviest weight has to be lifted** (`weight_counts`): at least one rep,
  or some distance for a carry. A missed 150 kg single is not a record.
- The logger's live record badge (`records.ts`) applies the same rule against
  `exercise_bests`, so the trophy during the set and the one on the saved
  workout agree. Typed weights are rounded to the database's two places as
  they are typed, or matching last week's 135 lb (saved as 61.23 kg) beat it
  by the rounding. Badges show only while training: an edited workout would be
  compared with bests that already include it.
- **Rep records** (`exercise_rep_bests`) are the heaviest weight lifted for
  each rep count up to 30, keeping only the counts that nothing as heavy at
  more reps has matched. With 100 kg × 5 on the books a 3-rep best of 95 kg (or
  100 kg) is not a 3-rep max, and listing it would say it was, so the weights
  fall as the reps rise. The cap is there because one weight typed into the
  reps field (60 kg × 60) swept every lighter count away. The page also drops a
  row that reads the same as the one below it once rounded, which a history
  logged partly in pounds can produce, and shows the table only from two rows;
  one row is the heaviest weight again.
- **The streak is in weeks**, ending this week or last. A daily streak punishes
  exactly the rest days a program prescribes.
- **The progress bars** are `workout_weeks(13)` for three months,
  `workout_months(12)` for a year, and `workout_months()` for all time: every
  month from the first workout's (or eleven months back, if that is earlier) to
  this one, empty ones included. A year passes its length so only that year's
  sets are added up; all time reads the whole history once. A year of weeks would be 52
  bars too thin to tap, and `workout_weeks` stops at 104. All time past two
  years of months is summed into years on the phone (`periodsFor`). The ranges
  past three months are Pro, gated in the client alone like the Trends ranges:
  they are reads of the user's own data.
- **A body weight movement lifts the body.** A set's load (`load_kg` in
  `workout_set_values`) is its weight for `weight_reps`, the body weight plus
  what was added for `weighted_reps`, and the body weight less the help for
  `assisted_reps`; volume is load times reps. An assisted pull-up used to count
  nothing, and a weighted one only the plate on the belt, so a 70 kg lifter's
  pull-ups weighed less than a 20 kg curl. The body weight is the weigh-in on or
  before the workout's day, or the first after it for a workout logged before
  any (an import), looked up only for those two trackings. Without one a
  weighted set counts what was added and an assisted one has no load. The
  typed figure (`weight_kg`) is unchanged, and so is the weight record, which
  stays the plate on the belt: the body is in the volume, not in the heaviest.
  The phone does the same sum with the latest weigh-in (`setLoad` in `model.ts`)
  for the live total and the live volume record. Being a lookup rather than a
  stored figure, it reprices the whole history the same way, so the first
  workout after the change is not a volume record over every one before it;
  the volume records already standing on these movements are scored again with
  the body in them, and where the body weight moved, a few can land on another
  workout. On a
  synthetic three-year history (15,000 sets, three fifths of them pull-ups and
  dips) the history page went from about 120 to 145 ms. A weigh-in, typed or
  deleted, refetches the workout figures, since it can reprice a past day. A
  workout post's volume on the feed now carries the author's body weight in
  it; the feed shows no reps or sets' figures beside it, so the weight cannot
  be worked back out of it.
- **The muscle split** spreads working sets over muscles by each exercise's
  split. The counting is in the database (`workout_exercise_totals`); the split
  is in the app, with the catalogue it belongs to. It is shown as each body
  part's share of the whole: a set of a compound lift counts towards several
  groups, so counted in sets it came out in tenths ("1.8 sets").

### Finishing late

The commonest bad workout is one somebody forgot to finish. Three hours after a
start, a notification asks "Still training?", and the logger asks the same
thing in a dialog, only while it is the screen on top. Its first answer is the useful one: **finish at the last
ticked set**, because the hours since then are the drive home. It can also open
the finish screen on the end-time picker, carry on, or discard (after a
confirm: it is hours of sets). Finishing from it goes through the logger's own
checks, so sets typed but never ticked are asked about rather than dropped.

With the app open the notice's banner steps aside only while a logger is
mounted to ask the question (`loggerOpen.ts`); on Today at the three-hour mark
it shows, and tapping it opens the logger, which asks.

Both times on the finish screen can be moved, because the other common mistake
is starting in the car park. A workout can be at most 24 hours, which the table
checks and the screen explains before it lets the save go. Anything else is
fixed afterwards on the edit screen, which rewrites the whole workout under its
id, as every save does.

### Workouts and the budget

A saved workout carries a `kcal` estimate: each movement's MET from the
Compendium of Physical Activities times body weight times time, **less the
person's own resting energy** over the same time. Timed sets are priced at their
own MET; the rest of the session at the average MET of the lifting, capped at
6 (vigorous resistance training, Compendium 02050). The rest comes off because
Apple Health's active energy excludes what the body would have burned sitting
still, and a figure that included it would be counted twice the moment it met
the day's resting energy. It is the Mifflin-St Jeor rate the budget is built on,
not one MET, because one MET overstates most adults' resting rate by about a
third (Byrne et al. 2005) and took too much away; with no sex, height or birth
date on the profile, one MET (1 kcal per kg per hour) stands in. The cap is
there because the lifting is priced over the whole session, rests included,
while a rep movement's own MET can be a continuous one: pull-ups and burpees
are vigorous calisthenics at 7.5 to 8, and a pull-up day was priced as an hour
of burpees. The cardio entries follow the 2024 Adult Compendium (Herrmann et al.)
where it has a matching code. No weight on file means no estimate rather than a
guessed one.

**One figure, from one place** (`workoutBurn` in `features/workouts/burn.ts`).
The logger shows the burn so far along the foot of its figures card, beside a
watch's heart rate, under a hairline in the same white card (a tinted band read
as a second card): one quiet line by default, since the sets are what the
screen is for, and opened in full with a tap (the choice is kept per phone in
`bodyFiguresOpen`). The history cards on the Workouts page show the saved burn
as a chip beside the duration, whether or not Health counted it, since that
list is a record of training rather than the budget, the finish screen shows what
will be saved, and the save records the same number. While the Apple Watch app
records the workout that figure is the watch's, streamed with the heart rate;
otherwise it is the estimate. Never both, and never the estimate while the
watch records: the watch's copy is the one Health keeps, so an estimate on
screen would change at the finish. Until the watch's first figure arrives the
logger shows a dash and the finish screen leaves the burn out. A figure
streamed from the watch also stops the phone writing a Health copy of its own,
even before the watch's `recording` command has landed. An ⓘ beside the label
says where it came from ("Estimated from your weight and sets, as there is no
heart rate", or "Measured by your Apple Watch"), in a bubble that opens only
when the ⓘ itself is tapped (`InfoTip` in `src/ui`). It floats in a transparent
modal, so it moves nothing and no card clips it, and closes on any tap or after
six seconds. The figure around it is not a button: opened by any touch, it was
opened by thumbs on their way to the sets.

**A save asks the budget to look again.** The automatic health sync runs on
foreground, at most once a minute, so a workout saved to Health used to show its
burn on Today beside a ring that had not moved until the app was next opened.
`requestHealthSync` runs a pass straight away (bypassing the throttle, and once
more after a pass already reading) whenever this phone writes or removes a
workout's Health copy, and once when the watch's trace arrives, which it sends
after saving its own copy. The watch's samples reach the phone's Health by
Apple's own sync, separate from the trace, and most arrive during the session;
any that lag are picked up by the next foreground pass.

**Nothing in the budget reads that column.** The budget hears movement only
from the health store (see "Activity and health"), so a workout reaches the day
by being saved to Apple Health, where its energy is a sample over the workout's
own window, and coming back through the sync like any other active energy. A
watch that recorded the same minutes wins over it in Health's own
deduplication, which prefers the watch to any app. That is the point: two
estimates of one hour must not both reach the budget.

So on Android, and on an iPhone where saving to Health is off, a workout is a
record of training and changes no budget. That is deliberate rather than
missing, and Today's row says so: it shows a workout's burn, in the colour of
burned energy, only when the workout went to Health *and* Health is read back,
and its length otherwise. Saving to Health works with reading switched off,
and then the energy never returns to the budget. A burn figure beside a ring
that did not move reads as a bug. The workout's totals in Health also carry
only what the user let us write, so a refused Active Energy no longer shows
the estimate on the workout there.

### Saving to Apple Health

On by default, and a switch in workout settings, **per phone** (MMKV, in
`features/workouts/prefs.ts`), because it is a permission this handset granted
and a second phone on the same account has granted nothing. It asks for its own
permissions (workouts, active energy, and the three distance types) at the
first save, or when the switch is turned back on. A "no" on that first sheet
turns the switch off rather than toasting a failure the user just chose; a
permission withdrawn later in Health's settings is still reported as a failed
save. An interrupted or failed permission request keeps saving enabled for a
later retry and reports a Health failure without blocking the workout save.
Connecting health for the budget still asks to write nothing.

- Each finished workout is saved as an `HKWorkout` of the activity type its
  exercises add up to (a run is a run, lifting is strength training), with
  active energy and, for a run, ride or swim, distance as samples over the same
  window. Everything carries `RiceCalWorkoutId` in its metadata.
- **The sync skips workouts carrying that key** (`isOwnWorkout` in
  `lib/health/apple.ts`). Reading them back would list each one twice on Today,
  once as the workout and once as a bare session with no idea what was lifted.
  Its energy is still read, which is the point of saving it. A build from
  before workouts has no such skip, and on a second iPhone or an iPad sharing
  the same Health data it reads them back anyway, so Today also drops a session
  whose uuid one of the day's workouts holds in `health_workout_id`.
- An edit deletes the old copy and its samples (by uuid and by that metadata
  key) and saves a new one; deleting a workout deletes its copy.
- Each type on Health's sheet is its own switch, and a sample of a refused type
  fails the whole save, so refused types are left out rather than taking the
  workout down with them.
- **Health is a copy and Postgres is the record.** A Health failure never stops
  the save; the toast says so. If the server refuses a save after the copy went
  in, the copy is taken back out, or pressing Save again would leave two.

`NSHealthUpdateUsageDescription` in `app.json` says this. It used to promise
that the app never writes, which became untrue with this feature; the connect
screen's "Read only" line was reworded in all thirteen languages for the same
reason.

### The Live Activity

While a workout runs, the lock screen and the Dynamic Island show its clock,
its name, sets done, the next set, and the rest countdown with a bar. Tapping it
opens the logger (by way of the Workouts page, below), not through
`ricecal://widget/...`, which is how a home-screen widget tap is counted.

- **A tap opens `ricecal://workout/resume`**, which `app/+native-intent.tsx`
  rewrites: with the app running, to the logger; on a cold launch, to
  `/workouts?resume=1`, and the Workouts page pushes the logger once it has
  mounted (once per launch). iOS often kills the app while the phone is locked
  between sets, and a cold launch straight at `/workout/active` built a stack
  with the logger and nothing under it: minimise went nowhere, and the tabs
  layout, which runs the rest timer, "still training?" and the activity
  itself, never mounted. Two cheaper fixes failed on the device: a landing
  route that navigated to the tab and pushed the logger in one go (the two
  navigations did not compose on a cold launch), and clearing a `resume` param
  after use (`setParams` writes to the focused route, and `undefined` does not
  remove a param).
- It lives in the existing widget extension
  (`widgets/ios/WorkoutLiveActivity.swift`). `WorkoutActivityAttributes.swift`
  is compiled into both the module pod and the extension, because ActivityKit
  matches an activity to its view by the attributes type.
  `NSSupportsLiveActivities` is set by `plugins/withWidgets.js`.
- **It shows the exercise being done, in its own drawing**, on a light tile at
  the card's leading edge and in the island, rather than the app's dumbbell, which
  read as an emoji standing in for the workout. The extension cannot read the
  app's WebPs, so `withWidgets.js` makes 96 px PNGs of them into
  `Exercises.xcassets` at prebuild (`plugins/exerciseArt.js`, which the watch's
  80 px ones come from too), and adds the catalog to the target by name, so a
  project made before it gets it without `--clean`. The content state names the
  exercise (`exerciseId`); a custom exercise has no drawing and keeps the
  dumbbell. A lock screen activity is cut at 160 points, so the card is one
  row of drawing, name and clock, a hairline, the next set with its tick, and
  the rest band only while one runs. The expanded island stops growing sooner,
  so its lower row is the next set or, during a rest, the rest alone: both
  stacked pushed the rest off its foot. Its regions sit 10 points in from the
  edges, where at 4 the curve clipped them.
- JS calls `startWorkoutActivity`, which updates the activity when one is
  already up, and `endWorkoutActivity` from `useWorkoutEffects`, mounted in the
  tabs layout and driven by the stored document, so it is right after the app
  is killed and reopened. A start for another workout ends any activity left
  behind.
- **The clocks are dates, not text the app updates.** The elapsed time and the
  rest are `Text(timerInterval:)` and `ProgressView(timerInterval:)` over dates
  in the content state, so the system counts them and the app never has to wake.
- **On a dimmed lock screen iOS shows the seconds as dashes** ("19:--", and the
  rest as "1:--") because it redraws there once a minute. It is the system, not
  the view; the clocks read in full as soon as the screen wakes.
- **A rest that ends while the phone is locked** would leave its bar at 0:00
  until the next update, which a suspended app cannot send. The rest's end is
  the content's `staleDate`, so the system redraws the activity at that moment
  and the rest line drops.
- iOS ends an activity after eight hours; `update` restarts a lost one rather
  than going quiet. Whether to start or update is decided synchronously, on
  the calling thread; decided inside a `Task`, an update that ran before its
  start requested a second activity for the same workout.
- Signing out ends it, and an activity with no workout behind it (a crash, the
  last launch) is ended whenever the effects run with none.

**Its buttons work without opening the app** (iOS 17 and up): −15, +15 and
skip on the rest, and a tick for the next set when that set has numbers to
tick, its own or the ones it offers. Each is `WorkoutActionIntent`, a
`LiveActivityIntent`, which iOS runs in the app's process, launching it in the
background if it has to.

- **The file is in both targets.** The extension needs the type to draw
  `Button(intent:)`; the app needs it because iOS finds the intent through the
  App Intents metadata Xcode extracts from the app target's own sources, and a
  pod's are not extracted. `withWidgets.js` copies
  `widgets/ios/WorkoutActionIntent.swift` beside `AppDelegate` and adds it to
  the app target once, so adding an intent needs a `--clean` prebuild.
- **The press is queued and the activity moved at once.** `perform` puts the
  action on `RiceCalWidgetStore`'s workout queue in the App Group and updates
  the activity itself: the rest shortened, lengthened or gone, or the tick
  counted and its rest started (`restAfterS`, sent ahead in the content state).
  The workout itself is the app's JS's to change: it drains the queue on
  launch, on returning to the foreground, and when the intent's notification
  reaches the module while JS is running, and applies a tick and the rest it
  starts at the time it was pressed. It waits until last time's sets and the
  settings have loaded (or cannot, offline), and makes the same test as the
  logger's own tick: drained on a cold launch before them, a tick on an empty
  set found nothing to fill it with and saved a set of no numbers. Its next
  write to the activity replaces the guess.
- **The "rest is over" notification moves with the rest.** The intent rebooks
  it (same identifier as the app's) with words the app left in the App Group,
  because with the app not running a skipped rest still fired its notice and a
  tick started a rest with none. The queue is locked: the press wakes JS to
  drain it on another thread, and a quick double tap could otherwise apply one
  press twice.
- **"Next set" follows superset rounds**: after A1 comes B1, not A2, and the
  tick between two members of a round starts no rest. A round ends early where
  the partners after this one have no set that far down, so A's third set
  under a two-set B rests. A superset is only ever a run of neighbouring cards
  (`tidySupersets`): a reorder or an unlink that split one used to leave the
  rest timer and the lock screen each reading a different group.
- **The notice the intent books carries its kind at the top of `userInfo`.**
  expo-notifications hands JS a local notification's whole `userInfo` as its
  `data` (only a remote push nests it under `body`). Nested, JS saw no kind:
  the reminder sync cancelled it as a stray, and tapping it opened nothing.
- **Presses queued while the app was closed are applied before the app writes
  anything.** On a launch the effects used to rebook the rest notice and draw
  the activity from the document as it was before the presses, putting back a
  skipped rest and its notice. And ActivityKit's calls run in order through one
  queue (`WorkoutActivityController.serially`): two updates a few milliseconds
  apart could land either way round and leave the older state showing.
- The tick names its set by key (`exerciseKey`, `setId`) as the activity drew
  it, so a press that arrives after the workout moved on ticks the set it was
  for, or nothing if that set is gone or already done.

### The Apple Watch app

A watch app in the shape of Hevy's and Strong's: start a routine from the wrist,
see the set to do with its figures already in it, change them with the Digital
Crown, complete it with the tick between two arrows that step through the sets,
rest with a countdown that taps the wrist when it
ends, and finish or throw the workout away. All the while the watch records the
heart rate, which the phone shows live in the logger and keeps with the saved
workout, drawn as a line and four zones on its page.

```
watch/ios/                            the watch app (SwiftUI, watchOS 10)
plugins/withWatch.js                  puts it in the Xcode project, and the Health
                                      handoff into AppDelegate
modules/ricecal-watch/                the phone's end of WatchConnectivity
src/features/workouts/watch.ts        what the watch is sent, what its presses do
src/features/workouts/WatchSync.tsx   the effects, mounted in the tabs layout
src/data/workout-heart.ts             the trace's outbox, and reading it back
apps/supabase/schemas/43_workout_heart_rates.sql
```

On the watch a running workout is three pages side by side, as in the Workout
app: the controls (end, and the session's figures) on the left, the set to do in
the middle, where it opens, and every exercise on the right, where any set can be
picked out of order or one added. With no workout running it lists the routines
by name alone, and one tap shows a routine's exercises before starting it; an
empty workout is started on the phone, where the exercise library is.

- **Each exercise is drawn, as on the phone.** The routine's exercises and the
  running workout's list show the exercise's drawing on a white disc, a dumbbell
  for a custom exercise. The phone's 320 px WebPs are 4.9 MB, too much for a
  watch, so `withWatch.js` makes 80 px PNGs of them with `sips` into the watch's
  asset catalog at prebuild (about 2 MB), as `exercise-<id>`, and skips any whose
  source has not changed (`plugins/exerciseArt.js`).
- **The crown turns a figure a step at a time, and shows the steps.** The box
  being turned is a small wheel: the figure, with the step before it faded above
  and the step after faded below, cut by the box's edge. The crown reports every
  fraction of a turn and not only its detents, so the figure used to run through
  41.37 and 41.62 on its way to 42; each value is now snapped to its step (half
  a kilogram or a pound, a rep, five seconds, fifty metres). An assisted or
  weighted set's unit reads `−kg` or `+kg`, as the phone's column does, and the
  exercise's list writes its sets the same way.
- **A rest that runs out says so** for a moment over the set page ("Rest
  complete", a tick and the next exercise), beside the tap on the wrist, and
  goes by itself.
- **The set page's last row is ‹ ✓ ›.** The arrows step to the previous and next
  set in the order the workout is done (a superset's rounds included), and the
  tick completes the set on screen; on a completed set it is an outline that
  takes it back. A row of three keeps every button big enough for a wet thumb.
- **A workout started on the watch announces itself on the phone**: the phone
  posts "Workout started on your watch" when the start reaches it, and a tap opens
  the logger. With the app in front the bar over every tab says the same, so the
  banner is not shown there. iOS refuses to start a Live Activity from the
  background, where a watch start lands, so the phone asks again each time the
  app comes forward (`effects.ts`).

**The phone is the record, and the watch is a remote for it.** The running
workout stays the MMKV document the logger edits (see "A workout lives on the
phone until it is finished"), as it does for the Live Activity's buttons. The
phone sends the watch a copy of it (`WatchState`: each set's figures as the
logger would offer them, the rest, the routines, the words), and the watch sends
back commands (`WatchCommand`: start, complete, undo, add a set, move or skip the
rest, finish, discard), which `applyWatchCommand` turns into the logger's own
actions. So a set completed on the wrist is saved exactly as one completed on
the phone, PREVIOUS column, records and all. A second copy of the workout living
on the watch would have needed merging, and every rule in "The set pad" written
twice in two languages.

- **Commands are numbered, and sent as one list.** Each press gets a `seq` that
  rises with every press and across relaunches (it starts from the clock), and
  the watch always sends every command the phone has not confirmed, in order,
  never one at a time. The phone applies a list in that order from where the
  workout got to (`watch.appliedSeq`) and says so in its next state, and the
  watch drops what that covers. Sent singly over two paths of different speed,
  a finish overtook the three sets before it and the phone discarded a workout
  it thought was empty; a command the phone took from its inbox and lost before
  applying was never sent again. Now anything not confirmed goes again with the
  next list. Meanwhile the watch draws the phone's copy with its unconfirmed
  presses laid over it (`WatchStore.project`), so a tap shows at once and holds
  while the phone is out of reach. A command for a workout that has ended is
  dropped, so a late one cannot bring it back.
- **A workout started on the watch is named by the watch**: its id, its
  exercises' keys and its sets' ids, which `ExercisePlan.key` and `SetPlan.id`
  carry into the document. The commands that follow name those same sets before
  the phone has ever heard of them. A start that arrives while another workout
  runs on the phone is dropped, and the watch follows the phone's workout.
- **Two paths each way, and the same one for both directions.** The application
  context, which the system keeps, newest replacing the last, and hands over
  whenever the other app next runs; and a message beside it while the other side
  is reachable, which arrives at once and wakes the phone app in the background
  if it has to. The phone sends its state that way and the watch its list of
  commands. The phone keeps whatever arrives in an inbox in its own defaults
  (the newest command list only, since it holds everything an older one did),
  and JS drains it on launch, on returning to the foreground and on the module's
  event. The session is activated by an app delegate subscriber, not by the
  module, so a list that launched the app before any JS ran is kept.
- **Traces are sent until the phone says it has them** (`heard` in the state):
  by message when the phone is reachable, by `transferUserInfo` otherwise. That
  queue runs at background priority: on a simulator a trace sent only that way
  had not arrived two minutes after the save.
- **`isWatchAppInstalled` lags.** It stays false for a while after the Watch app
  installs the watch app, and for good on a simulator where the watch app was
  installed directly, and the phone published nothing to a watch that was
  plainly running. The phone counts the app installed once it has heard from it.
- **The phone tells the watch how each workout ended** (`recordEndedWorkout`,
  the last ten, in MMKV), and when: the end it was saved with, which the finish
  screen can have moved back hours, not the moment of saving. A workout gone
  from the phone could have been saved or thrown away, and the watch saves or
  discards its session accordingly, unless the phone already has a trace for
  it: then another watch recorded the workout (the wearer changed watches part
  way), and saving here too made a second Health copy and sent an empty trace
  that replaced the real one. The finish screen and `discardWorkout` are
  the only two ways a workout leaves the phone, and both record it. Signing out
  tells the watch too (`WatchSignOut`, at the root): it stops showing the
  account's routines and throws away a recording in progress.

**Finishing on the watch saves on the phone**, without the finish screen: the
sets that were completed, the name the workout has, no question about the
routine (it is kept as it was, which is the screen's own default). A watch has no
room for "complete unfinished sets?", and a set that was not completed on the
wrist was not lifted. With nothing done the only answer offered is to discard.
The phone saves through the same `useWorkoutSave` as the screen, outbox included,
and if the logger is open it closes.

**The watch records the workout, and the phone writes no Health copy of its
own.** The watch runs an `HKWorkoutSession` (traditional strength training,
indoor) for every workout it is part of, which keeps the app on the wrist between
sets, reads the heart rate at workout rate, measures the energy rather than
estimating it, and saves an `HKWorkout` at the end that closes the rings. The
first time it records a workout it says so (the `recording` command, which sets
`watch.recorded`), and `syncWorkoutToHealth` then leaves Health alone: two copies
of one hour would put its energy in the budget twice. The session carries
`RiceCalWorkoutId` in its metadata from the moment the workout's id is known,
not only at the end, because a session the system ends by itself is saved with
whatever it carries, and one saved without the key was read back on Today as a
second, unnamed "Strength". An edit of a watch-recorded workout keeps the energy
the watch measured (`watch.kcal`) instead of replacing it with an estimate.

- A workout started on the phone asks HealthKit to launch the watch app for it
  (`startWatchApp`), once, within two minutes of the start, and the watch
  receives it in `handle(_ workoutConfiguration:)`. Opening the watch app on a
  workout already running starts recording too.
- **A session HealthKit kept** (the app killed or relaunched mid-workout) comes
  back through `recoverActiveWorkoutSession` and is adopted only if it belongs.
  One whose workout the phone says ended is saved or discarded as it says; one
  with no workout running and nothing on its way to the phone is discarded,
  rather than left draining the battery; and one that began well before the
  running workout is discarded rather than taken over. Adopted, a session left
  from earlier put half an hour of another workout's pulse at the head of a
  two-minute one. Nothing starts a new session while recovery is still being
  asked about, since HealthKit allows one and the second start lost the first.
- **A recovered session is given its data source again.** HealthKit hands back
  the session and its builder but not the builder's live data source, and
  Apple's own recovery code sets it again. Without it no reading arrived for
  the rest of the workout: the heart rate vanished halfway through whenever
  watchOS relaunched the app mid-session, from the wrist and from the phone's
  logger, and the energy stopped counting. The simulator never showed it,
  since its made-up pulse does not come through the builder.
- **A session HealthKit ends under the app is saved as far as it got.**
  Another workout app taking the sensor ends the session without this app's
  say; held on to as if nothing had happened, it read as recording and
  measured nothing. Now the watch finishes it there and then, as a finish
  would: its Health copy up to that moment, and the trace to the phone. It is
  not started again for that workout (`closedEarly`): a second session would
  be a second Health workout over the same hour, and its trace would replace
  the first. Thrown away instead, nobody saved the workout to Health at all,
  since the phone, told the watch was recording, writes no copy of its own. A
  `didFailWithError` alone is only logged; it is the `.ended` state that says
  the session is over.
- **The reading on the wrist goes once it is fifteen seconds old**, as the
  phone's does, on a clock of its own (`liveHeartRate`), so a sensor that
  falls silent does not leave its last figure looking live.
- **Health access is asked for through the phone.** A watch app that is not
  independent of its iPhone app can have its request shown on the iPhone, and
  iOS then asks the phone app's delegate to hand it on
  (`applicationShouldRequestHealthAuthorization`, answered with
  `handleAuthorizationForExtension`). Expo's delegate does not forward that call,
  so `withWatch.js` writes it into the generated `AppDelegate`. Without it the
  request came back refused with no sheet shown. A refusal is not an error: the
  workout is logged as ever, with no heart rate.

**Heart rate, end to end.**

- Live: while the phone is reachable the watch sends its latest reading every
  five seconds, and the logger shows it beside the clock (`useWatchPulse`), for
  as long as readings keep coming. The same message carries the active energy
  the session has measured so far (`kcal`, a running total), which the logger
  shows as the workout's burn (`useWatchEnergy`). Either can be missing: energy
  is measured with heart rate refused, and a heart rate is only resent while it
  is under fifteen seconds old, so a loose strap does not keep looking live.
  It is a glance and is not kept. Its heart (`LiveHeart`) beats at the figure
  beside it, a double thump with a ring spreading behind, so the number reads
  as live rather than typed in. A phase advanced each frame on the UI thread
  drives it rather than a repeating timing, so a new reading changes the tempo
  without restarting a beat midway.
  It holds still under Reduce Motion and pauses while another screen covers the
  logger.
- At the end the watch sends a trace (`HeartTrace`): one figure every five
  seconds from the start, the mean of the readings inside each step, null where
  there were none (off the wrist, the sensor between readings). It reads Health's
  own record of the window, which survives the app being relaunched, and falls
  back to what it saw live. It is sent even with no reading in it at all (heart
  rate not allowed, a loose strap): the row is how the phone knows the watch
  recorded the workout, and carries its Health copy and its energy.
- `workout_heart_rates` keeps one row per workout, beside it rather than inside
  `save_workout`, because the trace usually reaches the phone after the save and
  an edit rewrites the workout whole. `save_workout_heart_rate` works out the
  average, maximum and minimum itself (null with no readings), sets the
  workout's `health_workout_id` to the watch's copy when it had none, and its
  `kcal` to the energy the watch measured, which is what Health holds and so what
  reaches the budget. Clients can read the table and write it only through the
  function. Once a workout has a trace, `save_workout` keeps those two as they
  are: a save retried after the trace landed, or an older build editing the
  workout, would otherwise put the phone's estimate and no Health copy back.
- **A trace waits for its workout** (`useHeartRateOutbox`). The function answers
  `missing` rather than failing while the workout has not been saved, which is
  common: a workout finished on the watch sends the finish and the trace
  together, and a phone with no signal holds the workout in its outbox. The trace
  is asked about again every half minute while it waits, and on reconnecting and
  every foreground, for up to a week.
- The workout page draws it with the activity page's heart card
  (`features/activity/HeartRateCard.tsx`): average and maximum, the line
  (`PulseLine`, broken where the watch read nothing), and the four zones, worked
  out on the phone from the trace with the same bands and the same age as a
  health-store session's (`hrZonesFromSamples`).

**The watch has no words of its own** beyond English. The phone sends its
labels in the user's language with every state, as it sends the Live Activity
its button names (`watchLabels` in `WatchSync.tsx`, the strings under
`workouts.watch` and existing ones), and the watch falls back to its own English
(`Labels.swift`) for any it has not been sent.

**Left out, for now:** starting an empty workout or adding an exercise on the
watch (picking from a library of 278 is a phone job), changing a set's kind or RPE,
complications, and a watch app that works with no iPhone app at all
(`WKRunsIndependentlyOfCompanionApp` is false: it needs the phone's account and
routines). Once a workout has started, the phone can be in a locker: presses
queue and arrive when it is back.

**The simulator.** The watchOS simulator measures no heart rate at all, and the
active energy it records for a strength session is always 0 (no motion; only
resting energy comes through), so a simulator build feeds the session a made-up
pulse and a steady burn of about 5 kcal a minute (`simulatePulse` in
`WorkoutRecorder.swift`, compiled out of device builds). Everything after the
sensor (the reading on the wrist, the logger and its burn, the trace, the
chart) can then be tried there. "Driving the Apple Watch app" in `AGENTS.md`
has the rest.

**Releasing it.** Additive: one migration (`20261016130531_workout_heart_rates.sql`)
adds the table and the function, and `save_workout` now keeps a watch-recorded
workout's energy and Health copy, which no older binary has a way to make. An
older binary never sends a trace. One thing it can still do: edited on a second
phone running 1.0, a watch-recorded workout gets a phone Health copy of its own
beside the watch's, because that build knows nothing of the watch. The watch app is
embedded in the phone app's binary, so the two always arrive together, and both
sides read every field of the other's messages as optional. Before the first EAS
build with it, the watch app's bundle id (`<app id>.watchkitapp`) needs creating
in the developer portal with the HealthKit capability: `app.config.ts` declares
the target to EAS beside the widget extension, but the identifier itself is a
portal step. A workout started from the watch is counted as `Workout Started`
with source `routine`, which is what it is; nothing else new is sent to
analytics.

### The rest timer and reminders

The rest is an end time in the document. `useWorkoutEffects` books a local
notification for that moment, because a suspended app cannot post one when the
time comes, and with the app open fires a haptic and clears the rest instead.
Adjusting or skipping rebooks or cancels it.

**With the logger in front, a rest that runs out shows "Rest complete"** for a
moment (`RestComplete.tsx`): a tick, the words and the exercise next, over the
sets, closing by itself after a second and a half with a hairline that runs
down to say so. It takes no touches, so a thumb already on its way to the next
tick lands on the set. `useWorkoutEffects` announces it at the haptic, so it
appears exactly when the buzz does: not for a rest that ended in the background,
and not with another screen over the logger.

**On Android the rest notice needs two things iOS does by itself.** The sound
belongs to the channel rather than to the notification, so "Rest is over" has a
channel of its own (`workout-rest`, high importance, the default sound); on the
reminders channel, silent by design, it came with no sound and no banner. And
an alarm is inexact unless the app may set exact ones, which lets Android
deliver it up to three quarters of the wait late: 68 seconds after a 90 second
rest, measured. `SCHEDULE_EXACT_ALARM` is declared so expo-notifications books
it exactly wherever that is allowed. Android 12 and 13 allow it by default;
from 14 a new install is refused until the user turns on "Alarms & reminders"
for the app, and nothing in the app asks for that yet.

**Both workout notices have fixed identifiers** (`WORKOUT_NOTICE`), so booking
one replaces it. With random ids held in a ref, every relaunch mid-workout
booked another "still training?" that finishing never cancelled, and it fired
hours later for a workout already saved. Cancelling also clears a delivered
one from Notification Center, and a tapped notice opens the logger only if a
workout is still running. It goes back to a logger that is already open
anywhere in the stack (`dismissTo`) rather than pushing a second one over the
library or an exercise's page, and pushes one only when none is mounted:
`dismissTo` replaces the current screen when its route is not in the stack.

A booking waits on the permission check before it is made, so each kind keeps
a generation number: a cancel that lands in that wait (a rest skipped the
moment it started) wins, where it used to be overtaken by the booking. Reminder
rewrites run one at a time, because two that overlapped each read the booked
list before the other had booked and left Monday booked twice; and the tabs'
unmount, which is signing out, cancels them, since they came from that
account's settings.

Workout reminders are days of the week and a time, in `user_settings`
(`workout_reminder_days`, `workout_reminder_at`), because they follow the
account; `useReminderSync` books them with the meal reminders, as weekly
repeats. Rebooking the reminders cancels only the reminder kinds, never a rest
or "still training?" notice: it used to cancel everything, so turning on the
water reminder mid-workout took the rest timer's notice with it. The default
rest is `workout_rest_s`. Keeping the screen awake while training is per phone,
with Health.

Both rests, the default and an exercise's own, are picked on two wheels
(`RestSheet`): minutes up to ten, the most `workout_rest_s` accepts, and seconds
in fives; at ten minutes the seconds wheel offers only 00. 0:00 is no timer. An
exercise on the default has `restS` null, and Done without moving the wheels
keeps it null, so a later change to the default still reaches it. "Use default"
appears only once it has a rest of its own.

### The logger is a card, not a modal

`app/workout/active` is a stack card that slides up (`slide_from_bottom`), not a
`fullScreenModal`. As a modal, every screen it pushed (the library, an
exercise's page, the finish screen) opened *under* it, so the logger had to be
dismissed to see what had been opened. Its chevron goes back like any card.

`ActionSheet` runs the chosen action in the sheet's `onDismiss`, not on the tap:
most actions open another sheet or push a screen, and starting either while the
native sheet is still leaving is how iOS ends up presenting nothing.

**A question is a dialog; a menu is a sheet.** The questions the workout flow
asks (unfinished sets, update the routine, "Still training?", nothing to save,
discard, start over a running workout) are `Dialog`s (`ui/Dialog.tsx`): centred,
answers stacked as full-width buttons in reach of either thumb, Cancel last. At
the foot of a bottom sheet the answers sat at the far edge and read as a menu.
Deleting a workout, a routine or an exercise, removing an exercise from the
logger, discarding a queued workout and "Leave without saving?" are dialogs too.
Lists of things to do to an item (an exercise's menu, a set's type) are
`ActionSheet`s, and like every other modal the workout screens open (the rest
timer, reordering, the start and end times, the library's filters, the reminder
time, a routine's name) they float in the middle of the screen as a card:
`Sheet` with `placement="center"`, which keeps a sheet's keyboard, number pad,
toast and Android back handling and drops the drag handle for a tap on the
scrim.
A `Dialog` answer runs once the modal has gone, for the same reason as
`ActionSheet`'s, except one marked `waits`: a delete runs while the dialog stays
open with a spinner, and a failure keeps it open, since closing would say the
thing happened.

### The set pad

A set's fields use the app's own number pad with two big keys beside the
digits, each two rows tall: **✓ Set**, which ticks the set the field belongs to
with what its empty fields offer and moves to the next set, and **Next**, which
walks the workout as a set is written on paper: weight, then reps, then the next
set's weight, then the next exercise (`fieldOrder.tsx`). The order comes from
the document rather than from what is mounted, so a set added mid-edit slots in.
A superset is walked a round at a time, A1, B1, A2, B2, as it is lifted and as
the lock screen's tick already went; walked card by card, ✓ Set after A1 went
to A2.
On the last field Next reads Done. The header names the exercise over the set
and unit, because the field is often under the pad, with ⌄ to put the pad away.
Every other numeric field keeps the plain pad.

**It had more keys, and they were cut.** A row of quick-add keys (−2.5 to +20 kg,
+0:15 to +5:00), Clear, and up and down arrows made a pad of twenty keys that
was slower to read than typing the number. A field opens with its whole value
selected instead, so the first digit replaces it and backspace clears it.

**An empty field offers a figure, and ticking it takes that figure**
(`setHints`). Per column, the figure is the first of these that exists:
- one changed today in a set above it (typing 105 into the first set offers 105
  to every set under it);
- last time's figure for this set;
- whatever the row above shows, so a third set is not blank under two that read
  60 × 10.

A figure that only repeats last time's, typed or taken by a tick, is not a
change: otherwise ticking a 100 × 10 first set offered 10 reps to a second set
that last time was 100 × 5. A set put back to last time's figure ends the
change above it. Warm-ups only hand down to warm-ups, and "last time's set" is
paired by kind (`matchPrevious`), warm-ups with warm-ups and working sets with
working sets: by position, last week's two warm-ups fed this week's first two
working sets 40 × 10 on a 100 kg day. The PREVIOUS column reads the same
pairing. A set added with Add set is empty and offered a figure like any other,
rather than copying the row above as typed values, which hid last time's
100 × 5 under a third set of 100 × 10. Finishing
counts these too: a set that shows numbers and was never ticked is asked about
("Complete unfinished sets" ticks it with what it shows, "Discard unfinished
sets" saves without it) rather than left out, which is what happened while only
typed numbers counted. The copy says "complete", as Strong and Hevy do; "tick" read oddly.

**A workout that left its routine asks about the routine on Save**, as Strong
asks about templates and Hevy about routines (`routineUpdate.ts`). Two kinds of
change are told apart. The layout is exercises added, removed, swapped or
moved, sets added or removed, and a set's kind, a rest or a superset; a set left
unfinished is still in the logger, so running out of steam on the last set is
not removing it. The numbers are a finished set that differs from a number the
routine itself holds; a field the routine leaves blank means "last time", so
filling it in is not a change, or a routine kept blank on purpose would ask
after every workout. Exercise notes are not compared, since a note typed
mid-workout is usually about that day. Only the answers that change something
are offered: with both kinds, Strong's four ("Update routine and values",
"Update routine", "Update values only", "Keep original routine"), otherwise
one update and Keep. "Update routine" keeps the routine's numbers on the sets
it already had and leaves new sets blank, which the logger then fills from
last time, which is today. An update that deletes something is drawn red. The
routine is saved after the workout, without holding it up, and a failure is a
toast. Cancel on the dialog is "not yet". Built-in templates started directly are
not linked to a routine, so they are not asked about; "Save as routine" on the
saved workout is the way to keep one changed.

**Exercises reorder by dragging** in a card of short rows, opened from an
exercise's menu or by long-pressing its name. Cards are too tall to drag past
one another without the drag turning into a scroll, which is why Hevy and
Strong collapse them too. The rows are a fixed height so the arithmetic of
where each lands runs on the UI thread, and the order is applied once, on
Done. **A set swipes left to delete.** `SwipeRow`'s tap recogniser only runs
while a row is open or has its own tap, because over a row of fields and
buttons it took their touches. A short swipe uncovers Delete as before; one
carried past 55% of the row, and never less than the button and 64 points more
(`fullSwipe`), deletes without the second tap, with a
tick under the thumb where it commits. The red follows the finger across, the
row slides out and then folds its height away before the set leaves the
document, so the rows under it close up rather than jump. There is no Undo:
a set is a few figures typed again in seconds. Today's meals keep the two
steps, since a meal deleted by accident is not.

**RPE is in the set's menu, not a column.** Most sets are never rated, and a
column would take width from the weight and reps on every one. Tapping the set
number offers 6 to 10, each named by the reps left in the tank ("8, 2 reps
left"), which is the question people actually answer; a rated set shows `@8`
under its number, and the saved workout, the share text and the export carry it.
It is offered only for sets counted in reps (a run has no reps left) and never
in the routine editor: a routine is a plan, and a plan carries no RPE, so
starting a routine or repeating a workout never arrives already rated. Editing
a saved workout puts each set's RPE back by position (`edit/[id].tsx`).

Cards and rows are memoised, and their handlers are one stable object keyed by
exercise, so ticking a set re-renders that exercise's card and nothing else.
The live workout, the outbox and the workout preferences all sit on
`createJsonStore` (`lib/jsonStore.ts`). It hands back the same object until the
key is written again, which is what lets a memoised card see that nothing
changed: parsing the stored string on every read gave React a new tree each
time. Every write goes through it, so a cached key is never read back from
MMKV, which React asks for several times a render.

### Saving, and the charts

**The save screen is the session's summary before it is a form**: "Workout
complete" with the running total, the duration, volume and sets, one line per
exercise that set a record (judged by `records.ts` against the bests from
before the workout, so it is the same trophy the logger showed), then the name,
note and times, and each exercise with its best set. No explanatory captions:
anything a screen needed a sentence to explain has been made to explain
itself or cut.

**The charts can be read off, not only looked at.** `TrendLine` takes a
`formatValue`, which adds a few rules at round values with their figures in a
gutter of their own, and a tap or a sideways drag that names the reading under
the finger (a tap on it again puts it away; new data resets it). The rules are
rounded in the unit the chart is read in (`unitFactor`: 80 and 85 kg are not
round pounds), never closer than a label is tall, and never two that read the
same once formatted, which a flat week of 80.0 and 80.1 kg otherwise drew as
three "80 kg" stacked on each other. A point can carry a `title` for the
readout where its axis label is short or blank, as every other month is on the
year's weight chart. Dates are thinned to as many as fit, because twenty
sessions side by side were twenty clipped stubs: `spreadLabels` in
`features/shared/axis.ts` picks an even step from the newest back, prefers one
that lands on the oldest too, and checks the gaps where the end labels land
after being pulled inside the axis, since a step judged at the centres let the
dates at either end sit on their neighbours. `AxisLabels` draws the row for
`TrendLine` and for a `BarChart` whose bars carry a `tick`, which the workout
progress page uses instead of its old first-and-last pair. The shareable review card
passes no `formatValue` and stays a picture. `BarChart` takes `selected` and
`onSelect`, and the workout progress page puts the tapped period's figure in its
headline; each selectable bar carries its own VoiceOver name. It also takes an
`axis`: about three round steps (`axisTicks`) counted in a unit the reader uses
(minutes or hours, kilograms or pounds, whole workouts), drawn as faint rules
behind the bars with their figures in a gutter on the right, and no figure on
zero, where it would sit on the dates under the chart.

### Against Hevy and Strong

The feature list was taken from both apps and checked off against them before
release. In: empty, routine, template and repeat starts; the PREVIOUS column;
warm-up, drop and failure sets; RPE; supersets; per-exercise rest with ±15 s and
skip; warm-up sets; live records; rep records and charts
per exercise; muscle split; weekly bars, calendar and week streak; the Live
Activity with its buttons; Apple Health; late finishes;
reminders; custom exercises; kg and lb; keeping the screen on; sharing a workout;
CSV export; importing a Strong or Hevy history; and an Apple Watch app that logs
sets, runs the rest and records the heart rate.

Left out on purpose:
- **Logging a past workout from nothing.** It was built and taken out: a
  forgotten session is a workout started and finished with its times moved on
  the finish screen, or a saved one edited, and a second blank form for it was
  one more button on the tab.
- **Routine folders.** The built-in templates are already grouped, and a user's
  own routines are a handful; folders are a screen of management for a list
  that fits on one.
- **Body measurements.** Weight is already logged on Today; tape measurements
  belong there, not in a training log.
- **A plate calculator.** It was built and taken out: loading a bar is
  arithmetic people do at the rack without opening a sheet, and it put a key on
  the number pad of every barbell's weight that nobody pressed.
- **Sports.** A game has no sets, reps or weights, so logging one here was a
  timer with a picture; the health store already has it from a watch, and it
  reaches the budget from there.

**Sharing is text, exporting is a file.** A workout shares as plain lines
(`shareText.ts`), name, then date, duration and volume, then each set with its
badge and RPE, because every app it can be pasted into reads text. The export
(`exportCsv.ts`) has one row a set in columns modelled on Strong's, with
exercise and workout notes, weight always in kilograms and the date in the
phone's wall time: an ISO stamp in UTC is not a date Sheets or Numbers
recognises, and it files a workout near midnight on the wrong day.
`fetchWorkoutExport` pages until a page comes back empty, never until a short
one, because the server's row cap can sit below the page size, and it adds the
workouts still in the outbox, which the history already shows. The file starts
with a byte order mark so Excel reads Thai or Chinese names as text rather than
in the system code page. iOS hands the file to the share sheet. React Native's
`Share` carries only text on Android, and a year of sets as text outgrew the
intent's size limit, so Android asks for a folder (`Directory.pickDirectoryAsync`)
and writes the file there.

### Importing from Strong and Hevy

Settings has a row for each app, Import from Strong and Import from Hevy, each
with that app's own icon (from Brandfetch, committed under
`assets/brands/apps/`, `features/workouts/import/apps.ts`). Tapping one opens
the file picker straight away (`import/pick.ts`), and the import screen opens
on the file already read, at its preview: a screen whose only content was a
button to open the picker was one tap too many. A file that cannot be read says
why in a toast and stays on settings. The file decides the format, so the other
app's export picked by mistake imports all the same. See what is in it,
import. Imported workouts are never posted to the
feed. `features/workouts/import/` is pure and tested from
strings; `data/workout-import.ts` does the saving.

```
csv.ts     a real CSV reader: quotes, commas and line breaks in notes, BOM, ';'
parse.ts   both formats into workouts, numbers still in the file's units
names.ts   every built-in Strong and Hevy name, and the catalogue entry it is
match.ts   a name to a catalogue entry, or null for a custom exercise
build.ts   the documents save_workout takes, plus the custom exercises to make
```

**The two formats.** Strong writes `Date, Workout Name, Duration, Exercise Name,
Set Order, Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE`, one row
a set. Set Order is the set's number, `W`, `D` or `F` for a warm-up, drop or
failure set, or `Rest Timer` for the rest Strong timed after it; those rows are
not sets, and the rest most used becomes the exercise's own rest. Duration is
the whole workout's ("1h 5m") on every row. Hevy writes `title, start_time,
end_time, description, exercise_title, superset_id, exercise_notes, set_index,
set_type, weight_kg, reps, distance_km, duration_seconds, rpe`, with
`weight_lbs` and `distance_miles` for an account in pounds, a date like
"14 Oct 2026, 17:14" in whatever language the app is set to, and supersets
numbered. Hevy's date follows its language, so day-first, month-first with AM
or PM, and year-first ("2026年10月14日") are all read, with month names in the
Latin-script languages, Russian, Polish and Turkish; a file whose dates cannot
be read says so rather than importing nothing in silence.

- **Strong does not say its units.** Its Weight and Distance are in whatever the
  app was set to, so the preview asks, defaulting to the account's own. Hevy
  names the unit in the column.
- **Both write wall-clock time with no zone**, so a workout is filed at the time
  and on the day the file says, in the phone's zone. Hevy's own import of a
  Strong file reads Strong's times as UTC: a Hevy export of a history that came
  from Strong is shifted by the phone's offset, and is imported as Hevy wrote it.
- **Importing twice adds nothing.** An imported workout's id is a hash of the
  account and the workout's start and name in the file. The account is in it
  because `workouts.id` is unique across all accounts: from the file alone,
  two people's Hevy "Morning Workout" started in the same minute shared an id,
  and the second save was refused as another account's on every retry. A
  workout already in the history is skipped rather than written over, so an
  edit made since survives a second import. Already there means that id
  (looked up exactly, wherever the workout now sits), any workout starting
  within a minute of it, or one with the same name and set count starting a
  whole time-zone offset away, up to 14 hours. The last is for someone who
  moved from Strong to Hevy and imports both files: Hevy's copies of the
  Strong workouts are shifted by their offset (above), and without it every
  one came in twice. Each logged workout stands for one file workout at most,
  nearest first, so a run already logged cannot hide a second run that day.
- **A lost connection stops it; trying again resumes.** Each save has the
  app's 15-second timeout. A failure a retry can fix (no signal, a timeout,
  the app sent to the background) stops the run instead of marking every
  remaining workout failed, the screen keeps what landed, and Try again
  carries on, since what was saved is skipped. Only a workout the server
  refuses for what it holds counts as not saved. The screen cannot be left
  while saving (`usePreventRemove`, which also holds Android's back button).
- **Each block stays an exercise.** Rows of one exercise are consecutive, so
  bench, squat, then bench again imports as three exercises in that order;
  within a superset the alternating rows are grouped by name.
- **Not written to Apple Health.** The app that logged them already did.

**Names are looked up, never guessed.** `names.ts` lists all 253 names Strong
ships (published in Fitnotes2Hevy's `strong_exercises.txt`) and all 430 Hevy
titles (the Hevy block of LiftShift's exercise dataset), each with the
catalogue id it is, or null. Every mapping was checked against openGym's
importer, which wins where the sources disagree: Strong's plain "Cable
Kickback" is the triceps movement. The tables are per app because the apps
disagree: Strong's plain "Hack Squat" and "Chest Fly" are the machines (Hevy's
own Strong importer files them so), Hevy's plain "Hack Squat" is the barbell
lift; Hevy's plain "Walking Lunge" is bodyweight, beside its own dumbbell one.
A name mapped to null is a movement the catalogue does not have (a suspension,
single-leg, assisted or kettlebell variant) or one that does not say which
lift it is (Strong's plain "Triceps Extension", beside its own dumbbell one),
listed so nothing looser can file it under another lift. A name in neither
table matches only a catalogue name or alias with its words reordered
("Barbell Bench Press"), and only an alias that belongs to one entry and is a
name rather than a search tag ("olympic" and "recovery" find exercises in the
library but name none); anything else becomes the person's own custom
exercise, with equipment read from its brackets and its tracking from all of
its sets across the file. openGym and LiftShift are AGPL, so they
were read for facts about the formats and names; none of their code is in here.

**A saved exercise carries its own tracking**, so the file's numbers decide it
where the catalogue's would lose one: a sit-up done holding a plate imports as
a weighted sit-up, and a plank logged as reps keeps its reps. A number past the
database's limits (a 2,000 kg set) is a broken cell and is dropped and counted,
not kept as a record nobody can beat.

To map a new name, add it to the app's table in `names.ts`; `import.test.ts`
fails if it points at an id that does not exist.

### Releasing it

Codex's image allowance, which draws the exercises, is its own daily cap,
apart from the general usage the Codex app shows; when it runs out the drawing
fails with `usage_limit_reached` and a `resets_at` in
`$TMPDIR/codex-image.*/run.jsonl.err`.

**Imports make big histories.** A five-year Strong export is around 20,000 to
25,000 sets, a few megabytes in `workout_sets` with its indexes, so a hundred
such imports is a real share of the free plan's 500 MB, past which the whole
database goes read-only (see the workbench notes in `AGENTS.md`). Watch
`pg_database_size` after launch. Speed holds up: against a synthetic 1,500
workouts and 36,000 sets (about 9 MB with indexes), a page of the history list
takes 70 ms locally (160 ms 1,400 workouts in), the import's overlap read 17 ms,
and opening a workout about 60 ms, all of it the sets' record flags.

Records are what cost, because a filter on one workout cannot reach inside the
running best, so every read that asks for them scores the whole history. Each
read asks only where it must. `workout_history(offset, limit)` picks its page
without them and counts records for that page's workouts alone; paged straight
off `workout_summaries`, every page scored everything, 300 to 450 ms, and a
save refetched every loaded page. A workout's header leaves the count out
(selected by `id = any(…)`, since on `id = x` the planner kept the scoring for a
column nobody asked for) and counts the flagged sets it already has. Today's
rows leave it out too and take under a millisecond, and a save scores records
only when it is about to post. If pages slow down past that, store each
workout's record count at save rather than narrowing the view, and rescore the
later workouts of the same exercises whenever an earlier one is saved, which an
import always is.

**The body weight load** (`20261019113048_workout_body_weight_load.sql`)
replaces `workout_set_values` and `workout_set_details` in place, appending
`load_kg`, so nothing that reads them is dropped and no column an older app
reads moves. An older app reads the new volume like the new one does; its own
live total, before the save, still counts an assisted set as nothing and a
weighted one as the plate alone, and the saved workout then shows the bigger
figure. `db diff` wanted to drop and recreate both views, `workout_summaries`
and `workout_history`, whose grants it does not restate; the migration was cut
back to the two replaces, and diffing again reports nothing.

Additive end to end. One migration (`20261016025548_workouts.sql`) adds the
workout enums, tables, views and functions, three `user_settings` columns with
defaults, and workout posts: a `social_post_kind` enum, two nullable
`social_posts` columns plus `workout_records`, `profiles.auto_post_workouts`,
and a `p_kinds` argument on the post reads that defaults to food. An older
binary is never handed a workout post, and the profile's `post_count` still
counts meals only, since 1.0 draws it over a grid of meals; this app adds the
workouts its viewer can see. One thing it cannot hide: a like or comment on a
workout post notifies its author, and on 1.0 that row opens "unavailable".
Existing feed members get `auto_post_workouts` on with everyone else.
`db diff` left out the revokes that keep new functions from `PUBLIC` and
`anon`, and the client-table revokes, so the migration restates both at its
foot. The `social` function now reviews a workout post's name, not just its
caption, reading it from `social_post_details` because the author is not granted
`source_workout_id`; it ships with the merge like every function. Deploy the migrations
before the app, as always. The five analytics events are in the
canonical table under Analytics; sharing and exporting send none.

---

## Photos

**Images live in Cloudflare R2, behind the `photos` function.** Postgres used to
own this too: Supabase Storage let the client talk to the bucket and let eight
RLS policies over `storage.objects` decide whether it was allowed to. R2 has no
notion of a user, so that check is now `ownsKey` in `functions/_shared/r2.ts`:
one line of TypeScript where there were eight policies, and the only thing
standing between two users' diaries. Reads have one extension: a photo attached
to a recipe the caller can see may be signed for them. That lookup runs under the
caller's recipe RLS, and the owner encoded in the key has to be the recipe owner,
so private, pending, reported and blocked cooking grants nothing.

The client holds no credential. It asks for a signed URL and gets one that
expires. Uploads still go phone → R2 directly, so only the signature is a round
trip, and `data/photos.ts` batches the read signatures a screenful at a time
because a list of plates would otherwise be a list of cold starts.

The signature is also the only part of a photograph that is ever fetched twice.
The bytes are cached on the device under the key rather than under the URL, so
`resolveStoredImage` asks expo-image where a picture already is before it asks
the server to name it. A launch into a familiar diary draws off the disk and
invokes the function not at all. An upload seeds that cache with what it just
sent, so the phone never downloads back a plate it photographed.

Social lists authorize photos for two nearby rows in each direction, counting
all columns as one row on a profile grid. Only that window asks for signatures,
and leaving the screen stops signing, but a picture that has drawn stays drawn:
unmounting it when its row left the window made every fling flash skeletons
over pictures already in memory. The feed and the profile grid fetch their next
page two viewports from the end so the rows after it can fill the same window.

Social bytes are cached in memory and on disk under the object's key and ETag,
so a profile seen yesterday costs one signing call and no downloads. The cache
is only a copy: a picture is drawn only behind a signature granted within the
last half hour, a refusal hides it, and nothing polls. Within that half hour a
revisit draws at once while a fresh signature re-checks access behind it.

A profile grid tile must not be `flex-1`. Inside a list cell of no fixed height
its flex basis of zero made Yoga settle some cells at 3 points tall, the list
averaged those into its spacer estimates, and a fling collapsed the content to
a third of its height: the screen went blank or jumped back to the header.

Diary and recipe images keep both disk bytes and decoded memory copies. Meal
photos appear without a fade, including cache hits whose query still holds a
signed URL. Keep `enforceEarlyResizing` off for cropped photos:
iOS fits that early thumbnail inside the box, then `cover` enlarges it again.
A 1024 × 256 photo decoded to 367 × 92 pixels before filling a square recipe
tile, blurring it. The native view's normal downscaling preserves enough pixels
for the crop instead.
Avatars upload with a 256-pixel longest edge, enough for the largest 64-point
avatar at four pixels per point. Meal uploads stay at 1024 pixels for the model
and the detail view.

**The cap is applied while decoding, never after.** `uploadImage` passes it as
`maxWidth` and `maxHeight` to `ImageManipulator.manipulate`, which downsamples
as it decodes on both platforms. The deprecated `manipulateAsync` cannot: it
decodes at full size and resizes the bitmap afterwards, and on Android Glide
then holds every pixel. Measured on the Pixel 10 emulator with a 200 megapixel
album photo, a meal upload went from 0.79 GB to 1.59 GB of memory the old way
and grew by 30 MB this way. A phone with less to spare kills the app at that
size, and a crash Android picks has nothing for the `catch` to see.

The profile photo still peaks near that figure on Android, and not because of
this code: `allowsEditing` runs expo-image-picker's crop screen inside the app,
and it builds the crop at the photo's full size before handing it over.

On 30 September 2026, the iPhone 18 Pro simulator was tested with 64 distinct
1024-pixel JPEGs (42 KB on average), local Supabase and MinIO. A local media proxy
added 200 ms before each response and delivered about 400 KB/s. Three runs of
14 controlled swipes measured each newly visible photo against its native display
event. Before these changes, 29 photos waited a median 669 ms and p95 734 ms.
After the first screen loaded, all 30 newly revealed photos in three verification
runs were ready before entering view, including the next-page boundary. This
measures scrolling on the simulator, not production latency. A first visit to
an unseen photo still needs authorization and a download.

Deleting an account is the one operation that goes at the folder rather than at
a key: `deleteUserObjects` lists `meals/<id>/` and `avatars/<id>/` and empties
both. See [Deleting an account](#deleting-an-account) for why it lists rather
than reading the rows, and why it runs before anything is deleted in Postgres.

Two things the Supabase buckets used to enforce for free are worth knowing about.
The mime allowlist survives as a **signed header**, so an upload sending a
different content type fails R2's own signature check. The size limit does not: a
presigned PUT has no length condition, so the ceiling is checked against what the
client declares when it asks for the URL. That stops the oversized photo that
skipped the resize, and would not stop a client that lied.

---

## Money: free and Pro

**Entitlement is the store's to decide and RevenueCat's to report.**
`subscriptions` is a read-only mirror with no client write grant at all, filled
by the `revenuecat` edge function. `data/purchases.ts` buys and restores but can
never grant. Every SDK in `lib/startup.ts` is gated on its key being real.

Three products on both stores and in RevenueCat: monthly, yearly, and a one-off
lifetime. The subscription products can carry free trials and lifetime does
not. Both full paywalls use the same select-then-purchase offer: the three plans
come first, one is selected, and one footer button buys that plan. The comparison
follows as supporting detail under its own title. The subscription assurance sits
under the plan heading in muted text. A compact RiceCal Pro wordmark, with Pro in
an inverse rounded-rectangle badge, replaces the logo-and-tagline hero on both.
The selected plan's price and terms sit in the sticky footer immediately above
the purchase button. Both finish with the same purchase button and Maybe later
action; the route only decides whether Maybe later enters the app or returns to
the previous screen. A sticky wordmark and close control remain at the top while
the comparison scrolls;
close performs the same route-specific action as Maybe later.

Trial copy follows the current store account's eligibility and the selected
product's free period: iOS uses RevenueCat's introductory offer and eligibility
result, and Android uses the free phase on the default subscription option Google
returned. Each plan is checked independently. Until the store returns a price
the card shows a dash and the footer shows no terms. An unreadable period does
not become a seven-day promise. The store's purchase sheet remains the final
authority on what that account will receive. The purchase receipt keeps the
period shown at checkout even if eligibility changes afterward. The trial
progress bar follows the purchased period's start and end dates rather than
today's offer duration.

**A screen that can charge somebody says what it charges, and links the two
documents.** Guideline 3.1.2: title, length, price, and functional links to the
terms of use and the privacy policy. `PurchaseTerms` renders Terms and Privacy in
one compact row, with Restore Purchase at the front on both paywalls.
There are two screens that can charge somebody: `paywall/intro` and
`paywall/index`. A third, the trial-ended screen at `paywall/ended`, once sold a
year with one tap and had no price, period or renewal anywhere on it at all. It
and the `paywall/reminder` sheet were never linked from anywhere and have been
deleted. `lib/legal.ts` holds the two addresses, and the same pair
is on **Me, Edit** for everybody who never reaches a paywall.

### What each tier gets

| | Free | Pro |
|---|---|---|
| photographed plate | 3 a day | 50 a day, sold as unlimited |
| barcode, search, quick add, logging a saved recipe | yes | yes |
| a meal typed in words | no | yes |
| a meal corrected in words | no | yes |
| a recipe read out of a photograph | no | yes |
| recipes kept | 3 | unlimited |
| workout routines kept | 3 | unlimited |
| groups led at once (joining is never limited) | 2 | unlimited |
| trends | 7 days | 7d / 30d / a year |
| workout progress bars | 3 months | a year, all time |
| reviews | the newest week | every week and month |
| meal photographs kept | 30 days, or 60 past a lapsed subscription | for good |
| budget, health sync, reminders, the whole catalogue | yes | yes |

Five of those numbers live in `packages/shared` for the copy to interpolate,
and all five are enforced in Postgres: `free_daily_scans()`,
`free_recipe_limit()`, `free_routine_limit()`, `free_group_limit()`,
`free_photo_retention_days()`.
A fifth,
`lapsed_photo_grace_days()`, is Postgres-only, because the grace period is not
advertised and a promise about it would be one more thing that cannot be
narrowed later.

The client's copy makes the buttons read honestly; the database's is what
refuses. The trend ranges, the workout progress ranges and the older reviews
are gated in the **client alone** and deliberately: they are reads of the user's own data, so the worst a
modified client buys is somebody seeing their own year.

### The scan meter

**The unit is a scan, not a request to OpenRouter.** `scan_usage` is one row per
account per local day, and `claim_scan` does the check and the increment in one
statement, because a hard limit two concurrent scans can both walk through is
not one. It reads `is_entitled(user)` itself, so the ceiling is a property of
the tier rather than of the table.

The old unit is why the old ceiling could never be sold: one photographed plate
is a vision call, often a verifier call, sometimes an estimate, and a retried
429 is another. "3,000 model requests a month" is not a number anybody can hold
against their own week.

One scan is one user-initiated pass at the model, claimed **once**, at the top
of the endpoint, before the photo is read and before the first model call.
`Meter` is still threaded down to `chatJSON` and still required, but it only
counts: what it records is what a scan cost us.

### The webhook

**It is the load-bearing part, and it depends on the client.** `app_user_id` is
the only thing tying a purchase to a row, and it is whatever the app told
RevenueCat, so `identifyPurchaser` has to run on sign-in or every purchase
arrives as `$RCAnonymousID:...` with no account to credit.

**`CANCELLATION` is deliberately not an ending.** In RevenueCat it means
auto-renew was turned off and the user keeps what they paid for until
`EXPIRATION` follows.

**Out-of-order delivery is ordered by when the event happened**
(`subscriptions.last_event_at`). Comparing the event's expiry against the stored
`current_period_end` is the same test only while every ending is the natural
one, and it is not: a refund, a support cancellation and a revoked promotional
grant all end a subscription inside the period it had already paid for, so every
one of them looked stale and was dropped. Two promotional grants revoked in the
dashboard went exactly that way, and the log line saying why was the only trace.

**That bug is also a lesson about where to look.** It presented as RevenueCat
having said nothing: the customer-events API showed no events at all for either
revoked account. That endpoint reflects the transactions a customer *currently*
has rather than what was delivered, so a revoked grant leaves nothing in it. The
edge function's own logs had both events, received on time.

**Nothing pulls from RevenueCat on a schedule**, and that is a decision. The
expiry rule bounds a lost delivery to the period somebody paid for rather than
for ever, which is a small enough exposure not to be worth a second source of
truth and a schedule to forget about. If it ever comes back, the one thing it
must keep is downgrading **only on a positive answer**: a job reading "RevenueCat
did not answer" as "they have nothing" would cancel every paying customer the
first time the API had a bad night.

An event for an account that has already been deleted is acknowledged and
ignored. The webhook matches both SQLSTATE `23503` and the
`subscriptions_user_id_fkey` constraint: answering 500 only makes RevenueCat
retry an account that can never exist again, while any other foreign-key failure
still asks for a retry rather than silently dropping a purchase.

### Identity

**The id is the Supabase uuid and must never become the email.** An address is
wrong on three counts: it changes, and a changed one logs the SDK in as a
different customer whose `app_user_id` matches no row, so a paying user silently
stops being entitled; not every way in supplies one; and it is guessable, which
with a public SDK key is enough to ask about somebody else's purchases. The
address travels as an **attribute** instead, set right after the log in, never
before, or it is filed against the anonymous customer.

**Two platforms are told who this is, and they have to agree.** RevenueCat
forwards its purchase events into PostHog under `$posthogUserId`, falling back
to `app_user_id` when nothing set it, and PostHog knows the person by whatever
`identifyUser` registered. Both are the user's uuid, so the fallback
lands correctly by coincidence rather than by design. That is why `identifyUser`
**returns** its distinct id and `SessionProvider` hands that same string to
`identifyPurchaser`.

Wrong, it is invisible from both dashboards: the subscription attaches to a
profile with no behaviour and the behaviour to a profile that never paid, and
the paywall funnel reads as zero conversions.

### Prices

**Prices come from the store, never from this repo.** `usePlanPrices` reads the
current offering and uses RevenueCat's localised `priceString`, so a Malaysian
user sees ringgit because that is what they will be charged.

As strings in the copy bundle they were wrong three ways at once: dollars shown
to somebody billed in ringgit, Apple and Play disagreeing on lifetime because
Apple has no 119.90 price point for a one-time purchase, and every repricing
needing an app release before the paywall stopped lying.

Until the store answers, a price is a dash. A plausible wrong number is worse
than an obviously absent one. The saving on the yearly badge is computed from
those two prices for the same reason: it is the one figure on that screen a user
can check.

### The mirror is a cache, not the record

`subscriptions` is written by one thing, the `revenuecat` webhook, so anything
that stops a single delivery used to leave an account that had paid being
refused for ever, with nothing that would ever notice.

So `isEntitled` no longer believes a "no". On a miss it calls
`reconcileEntitlement`, which asks RevenueCat's v1 `/subscribers` endpoint and
writes the row if the answer is yes. Three things make that safe:

- **Only on the miss.** An entitled account never pays for the extra call.
- **It heals upward only.** RevenueCat saying active writes the row; RevenueCat
  saying nothing writes nothing. A reconcile that could downgrade would make
  every timeout a cancellation.
- **`last_event_at` is not stamped.** A reconcile is a statement about *now*
  rather than an event with a place in the sequence, so leaving the column alone
  keeps the ordering guard able to judge the delivery that arrives a moment
  later.

The key it uses is the **public SDK key**. `GET /v1/subscribers/{id}` is the
same call the app's own SDK makes and accepts it by design; it can grant
nothing, and the id comes from a verified JWT.

**`functions/entitlement` is the same repair, reachable by the app.** The server
heals inside a Pro-gated request, which is the wrong moment for the two things
the client reads straight out of Postgres: the scans-left line under the
viewfinder and the plan on Me. `useEntitlementSync` calls that endpoint the
moment it sees the store and the mirror disagree.

### The purchase gap

**A purchase confirms before our mirror knows about it, so the client reads two
sources.** The store answers, then RevenueCat, then the webhook writes
`subscriptions`. Read as the only source, that gap is a user shown the paywall
again one tap after paying, and in a sandbox it never arrives at all.

So `useEntitlement` also reads what the store told this device, through
RevenueCat's own SDK. That is not the client granting itself anything: it is the
receipt the SDK has already validated, cached on the handset, and it unlocks
*buttons* while the server goes on deciding what it serves.

**Either source saying yes is enough.** Three states, not two: `null` from the
SDK means "no store to ask" and must not read as a no.

`useAwaitEntitlement` asks the store first and returns the moment it says yes,
so a purchase leaves the paywall in the same frame.

The corollary is a state that can exist on screen: the store says paid and the
server has not heard. `announceRefusal` handles it by name. A `not_entitled` or
a free-tier `scan_limit` arriving while the store says paid is answered with
"your purchase is going through", never with a paywall.

### Refusals

**A refusal names what it refused.** `proFeatureTitle` in `data/refusals.ts`
holds one sentence per `ProFeature` and both gates read it, so the same button
refused in the app or by an edge function reads identically. One line for all of
them holds for the *screen* and fails for the toast, which is the only thing on
screen that can say which of the buttons under a thumb declined to work.

**A free account's refusal opens the paywall; a Pro account's does not.**
`claim_scan` returns `entitled` alongside the numbers, and `announceRefusal` is
the one place that decides. Showing a paywall to somebody who has already paid
is the worst thing this app can do with a refusal.

**Pro is also offered without being asked for, once every two days.**
`useProNudge` on Today, a beat after the diary appears, because an account that
never presses a gated button would otherwise never learn there is a paid tier.
Every paywall resets that clock, so the rule the user experiences is "at most
one paywall every two days".

### Photo retention

**Free photographs are swept after thirty days, and only the photographs.** The
entry stays for ever: its name, its macros and its place in the diary are the
history somebody came for.

The sweep is a job rather than a statement in Postgres, because Postgres cannot
reach R2 and the **order** is the whole problem. Delete the object, then clear
the column. A crash between the two is picked up by the next run, since deleting
a key that is already gone is a no-op; the other order strands the bytes for
ever, the key being their only name. The clear also matches the key it deleted,
so a photo replaced while R2 is answering is left alone. Only a bounded,
well-formed meal key inside that row owner's folder can reach the bucket
credential. The row keeps a drawing where the plate was, or a swept month would
be a column of grey tiles.

Most rows now reach the sweep already carrying one, in `item_icon_*`, which the
scan writes (see "Every entry carries the dish's own drawing"). The match
`clear_meal_photos` makes on the entry's name is the fallback for everything
logged before that, and it writes only where the row would otherwise draw
nothing.

**A former subscriber gets sixty days before any of it starts.** A subscription
ends for reasons that are not a decision (a card expires, a renewal webhook is
lost, a support cancellation lands early) and the account reads as free the same
day whichever it was, so the first thing that happens to a former subscriber
must not be the deletion of their photographs.

It stacks with the paid-era rule rather than replacing it: what they logged
*while paying* is kept for ever regardless. The cliff at expiry plus sixty is
real and bounded, at most a month of post-expiry plates in one batch.

### Share and Earn

**There is a second way to get Pro, and no code behind it.**
`app/settings/share.tsx` offers a month for a post that reaches 30 likes, a year
at 100 and lifetime at 500, claimed by bringing the link to the Discord server
that already carries support.

The whole of it is manual: no referral code, no attribution, no table, no deep
link. A referral system buys automatic credit and costs a claimed-by column, a
fraud story and a support thread for every code that did not register. It is
also why the threshold is *likes* rather than installs: installs need
attribution to count at all, while likes are on the post itself, where both
sides can see them.

### Reminders

**All local.** (Group nudges, invites and chat messages are pushed by a server; see
[Groups](#groups).) A meal reminder is "every day at 08:00 in the user's own
timezone", using Expo's `DAILY` trigger on both platforms. `CALENDAR` is
iOS-only: Android rejects it and stops scheduling the remaining reminders. No
server, no push token, nothing to deliver if the phone is offline at breakfast.

---

## Asking for a rating

A star rating is the single cheapest thing that moves an app up a store listing,
and the app has exactly one lever on it: `StoreReview.requestReview()`. Fired
carelessly it is worse than not firing at all, so the whole feature is a gate in
front of one call.

**The OS allows about three a year per device**, counts them itself, and tells
the app nothing. Over the limit `requestReview` draws nothing and resolves
successfully, so there is no way to find out from inside the app that an ask was
wasted. Everything below exists because that budget cannot be replenished or
inspected.

**So the app asks its own question first.** A sheet says "Enjoying RiceCal?" with
two answers. "I like it" stamps the cooldown and hands over to the OS. "Not
really" stamps the same cooldown and offers the Discord instead, which is where
support already lives. The store therefore only ever hears from people who have
just said they like the app, and the people who do not get a conversation rather
than a five-star field they were going to answer with one star.

**The browser is never opened for somebody who is unhappy.** The second screen
asks; a tap is what opens Discord. Throwing an annoyed user into another app is
the same mistake as the review dialog, one step further along.

**Every way out stamps the cooldown**, including the scrim, the back gesture and
"Maybe later". They mean the same thing as "not really" as far as the next sixty
days are concerned: the question has been put.

### The gate

`src/lib/rating/state.ts` is pure arithmetic over a stored object with the clock
passed in, and `state.test.ts` is where it is actually checked. The thresholds,
and what each is for:

| Gate | Value | What it excludes |
| --- | --- | --- |
| Days since the account was first seen | 5 | Somebody still deciding whether to keep the app |
| Days since the app version changed | 2 | A release whose first days are its worst, rated by somebody who has not used it |
| Meals logged | a multiple of 15 | An account the app has not yet done anything for |
| Distinct days with activity | 3 | The person who logged a fortnight in one sitting to see what it did |
| Days since the last ask | 60 | Everything the OS budget cannot afford |
| Asked on this version | never twice | A second ask on a build that has not changed |

The active-days floor is **three rather than two**, and the reason is worth
knowing before anybody lowers it. The stored state is created by the first
counted action, so `installedAt` is that day; a fifteenth meal that clears the
five-day gate has by definition been logged on a second day already. At two the
gate could never turn anything down.

### What sets it off

Two automatic triggers and one row.

**A meal that crosses a multiple of fifteen.** A crossing rather than
`meals % 15 === 0`, so a counter that ever moves by more than one cannot step
over a checkpoint and wait silently for the next.

The counter moves in two places, and the *scan* path is the interesting one. It
is recorded when the cascade comes back, not at the commit where `Meal Logged`
fires: the commit is the moment a scan STARTS, with the banner up and a
placeholder row spinning, and a question about the app over the top of that is
the app interrupting itself. A photograph with nothing edible in it never
counts, because it never became a meal.

**A weekly or monthly review that was actually read.** The second one, then every
fifth. `Review Opened` fires as soon as the period resolves, which is *before*
the entitlement check has decided whether to send a free account to the paywall,
so the rating counter waits for every answer the lock waits for. A sheet asking
whether somebody is enjoying the app, over a page telling them to pay for it, is
the worst pairing available.

**A settled purchase is deliberately not a trigger.** It is the strongest signal
of goodwill in the app and still the wrong moment: `paywall/welcome` is already a
celebration, and a favour asked in the same breath as taking somebody's money
reads as exactly that. Their next meal is a few hours away.

**And a row in Me**, which skips every threshold because the user went looking
for it, and stamps the cooldown anyway because what follows is the same
once-a-year dialog.

**An automatic ask waits 1.2 seconds; the row does not.** The same reasoning as
`useProNudge`'s 1.4: a trigger fires when a write lands, and the dish screen
navigates away in the same breath as it calls `mutate`, so the sheet would
otherwise present a native modal window into the middle of a dismissal. Only one
ask is ever booked at a time, since two sheets racing for one answer would stamp
the cooldown twice. The row answers a tap and so answers at once.

### Where the pieces live

`src/lib/rating/` holds the state, the gate and the store call. It is in `lib`
rather than in `features` because `src/data` calls the counters where a meal is
written, and the data layer does not import a feature.

`src/features/rating/RatePromptSheet.tsx` is the only screen, mounted once at the
root beside the renderless syncs. The moment it appears belongs to whichever
screen the user was already on, three pushes deep or on the diary, so it cannot
belong to any of them. A module-level bridge carries the request, and it reports
how many listeners took it: **nothing is stamped or tracked unless a sheet
actually received it**, or a trigger firing before the root had mounted would
spend the account's ask on a dialog nobody saw.

The state is MMKV, keyed by user, for the reason `features/paywall/nudge.ts`
gives about the standing offer: it is a question about this handset answered
before anything can be shown, and a phone two people sign into in turn must not
ask the second person a question the first one answered.

**No store URL is configured, and that is a decision to revisit at launch.**
`expo-store-review` falls back to opening `ios.appStoreUrl` / `android.playStoreUrl`
when the native module is missing, and neither is set in `app.json`: the iOS one
needs an App Store id this repo does not have yet. The fallback only runs on a
build without the module linked, which ours always have, so today it costs
nothing. Fill both in once the listings exist.

**Nothing counts what the store did.** There is no "Rating Submitted" event
anywhere, because `requestReview` reports neither whether it drew anything nor
what the user did with it. The four events in the plan stop at the app's own
question. `Rating Prompt Skipped` carries the first gate that refused, and it is
the only way to see a silent gate from outside: without it a threshold that is
too tight looks exactly like a feature nobody uses.

---

## News announcements

A card over Today announces a change to the app, once per account, and a
**News** row under Me lists every announcement since, newest first. The
catalogue is code (`src/features/news/announcements.ts`): each entry has an id, a
release date, a title for the list and one or more pages. A page has a picture
drawn from the app's own components, a title, a body and an optional button,
with the copy under the `news` namespace in all thirteen languages. Adding one
is an entry there, its copy, and a picture for each new page in
`AnnouncementCard`'s `PICTURES`.

A card with several pages is swiped, or stepped with **Next**; a page's own
button, where it has one, sits beside Next, and the last page's Next is
**Got it**. Most pages need no button: give one only where there is a switch or
a screen worth going to. Each showing
starts on the first page. A release with several changes is one card of pages
rather than several cards, since only the newest is ever put up (below). A page
can have a different body on iOS (`IOS_BODIES`), which is how the workouts page
names the Apple Watch there and nowhere else: the watch app is iOS only.

### The rules

- **Once per account, not per phone.** `profiles.seen_announcements` holds the
  ids an account has been shown. It is on the account because showing a card can
  change a setting, and a per-install flag would show it again after a
  reinstall or on a second phone and switch the setting back on.
- **Seen when it is on screen, and not before.** The card records itself from
  the native modal's `onShow`, through `see_announcements`
  (`98_announcements.sql`), which appends the id and applies what the
  announcement enables in one statement and returns nothing when the id was
  already there. iOS refuses to present a modal over another one and says
  nothing; anything written before `onShow` would switch a setting on behind a
  card nobody saw. A write that fails leaves the card due, so it comes back.
- **The client cannot write the list.** There is no column grant, only the
  function, so two phones on builds that know different announcements append
  rather than overwrite each other, and the ids are checked on the server.
- **The first showing anywhere claims.** From the launch or from the list under
  Me, whichever comes first. Every later showing finds it seen and changes
  nothing, or reading old news would undo a choice made since.
- **Only the newest.** Somebody who missed several releases sees one card. The
  older ones are in the list; once the newest is seen, nothing older appears on
  its own. So an announcement that switches something on must not be followed
  by a newer one while it is still reaching people: a slow updater would get
  the newer card and never the change. Fold the message into the newer card.
- **Not for new accounts.** Onboarding marks every id this build knows as seen,
  before `onboarded_at`, so somebody who has just joined is not told about
  changes to an app they never used. Onboarding also sets the new default
  itself. An account made by an older build has none of the ids, and sees the
  newest the first time it opens a build that has it.
- **Not on a launch the tour is offered on.** Whether the tour had been offered
  is read once per run of the app, not live: the tour's toast marks itself
  offered a second in, and a live read let the card cover it a tab switch
  later. A fresh sign-in on a new phone is such a launch.
- **Never on top of the Pro nudge.** The nudge stands aside on any launch where
  an announcement is due or up (`announcementHasTheFloor`): an announcement is
  once per account and the nudge has a two-day clock.
- **Only while Today is on top, online, after a fresh read.** Leaving Today
  cancels the wait and focus is asked again after the read; the read is the
  profile within 30 seconds, so a card another phone has shown is not shown
  again from a persisted cache.

### 1.1.0, the first announcement

`feed_auto_share_2026_10` is three pages: workouts (no button; on iOS the body
adds the Apple Watch), meals posting to the feed,
and the full-size camera with its question after a photo (its button opens
Personalisation, where that question's switch is). It is named for its first
draft, the feed page alone, which reached TestFlight builds of 1.0.15 but no
store release before the other pages joined it, so it kept the id. A TestFlight
account that saw the draft does not see the pages.

### Auto post foods

The announcement switches `auto_post_foods` on when it is first on screen,
telling an existing account that meals now post to the feed. The feed page's
button opens Edit profile, where the switch is. New accounts get the same default
from onboarding instead (`autoPostFoods: true` in the profile write) and no
card. Neither path touches the column default, which stays false: a binary
already in the stores that onboards somebody has no announcement to tell them,
so it keeps the old opt-in behaviour.

The first automatic meal joins the account to the feed, and workouts post for
anyone on the feed (see "Workouts on the feed"), so the card says workouts post
too. It cannot tell an account that never touched the switch from one that
turned it off in an earlier build: both are false, and both are switched on.

It grows the database. Over the 30 days to 2026-10-16 the hosted project logged
about 27,400 meals and held 361 posts in 400 kB, so a post for every meal is
roughly 15 to 30 MB a month on a 115 MB database with a 500 MB ceiling (see
"Running SQL against the hosted database" in `AGENTS.md`). Check
`pg_database_size` after the release reaches most accounts.

## Periodic jobs

`apps/cloudflare/workers/jobs` is the whole scheduler. One Worker, one job per
file, woken by Cloudflare Cron Triggers.

```
src/
  index.ts        the dispatcher: scheduled() → the jobs whose cron just fired
  job.ts          what a job is, and the claim → run → record wrapper
  postgres.ts     the only way a job talks to Postgres
  env.ts          bindings, vars and the one secret
  jobs/
    index.ts      the registry
    retention.ts  the photograph sweep
    activity-hours.ts the hourly health-data sweep
scripts/
  check-crons.mjs the registry and wrangler.jsonc must agree
```

### Why this is not a Supabase edge function

Because an edge function is a public URL and a scheduled job does not need one.

The retention sweep has been three things, and each move fixed what killed the
last one.

It was a **GitHub Action** first, and died of a rule nobody would think to look
for: a scheduled workflow is disabled after sixty days of repository inactivity.
The sweep would simply stop, free accounts would keep their photographs for ever,
and the first sign of it would be a storage bill.

Then **`pg_cron` calling an edge function over `pg_net`**, which fixed that and
cost a public endpoint. The sweep runs across every account and so has no user to
authenticate, which meant `verify_jwt = false` and a shared secret as the only
gate. Everything else about that arrangement was scaffolding for it: the secret
lived in `vault.decrypted_secrets` because `cron.job.command` is plain text
readable by anything holding `service_role`; `retention_runs` existed because
`pg_net` is fire and forget, so a run could not know its own outcome and the
*next* run had to write down what the last one came back as; and the drain loop
was abandoned for the same reason.

A `scheduled()` handler has no route. With `workers_dev` and `preview_urls` both
off and no `routes`, that Worker has no hostname at all, so the endpoint, the
token, its vault copy and the whole question go together. R2 is a **binding**
rather than four credentials, which also makes a batch of deletes one call
instead of five hundred signed round trips. And a job knows its own outcome, so
`job_runs` is written by the run it describes.

**What it costs** is that the Worker holds a Supabase service-role key, which is
broader than the token it replaced and now lives in a second place.
`src/postgres.ts` is what narrows it: a job gets `rpc()` and no table access, so
a job's SQL has to be a `service_role` function in `schemas/` where it is granted
deliberately and tested by pgTAP.

### Adding a job

Three things, and the tooling shouts if you forget the third.

**1. A file in `src/jobs/`.**

```ts
import type { Job } from '../job.ts'

export const digest: Job = {
  name: 'weekly-digest',      // stable: it is the key in job_runs.job
  cron: '0 2 * * MON',        // UTC
  async run({ rpc, log, scheduledAt }) {
    const sent = await rpc<number>('send_weekly_digests', { p_asof: scheduledAt })
    log('sent', { sent })
    return { sent }           // lands in job_runs.detail
  },
}
```

**2. A line in `src/jobs/index.ts`:** `export const JOBS: Job[] = [retention, activityHours, digest]`

**3. The cron in `wrangler.jsonc`:** `"triggers": { "crons": ["17 * * * *", "37 * * * *", "0 2 * * MON"] }`

No new package, no new secret, no workflow edit. `cloudflare.yml` discovers
Workers by globbing `apps/cloudflare/workers/*`.

### The three rules

**A job reaches Postgres through `service_role` RPCs, and nothing else.** It also
keeps the division the project already draws: Postgres owns the numbers and the
rules, and a job is the part that has to reach something Postgres cannot.

**A job must be idempotent.** Cron delivery is at-least-once, and Cloudflare
retries an invocation that threw. `claim_job_run` is a guard in front of that,
not a replacement for it: a lease can expire while a run is genuinely still
going. Ask "what happens if this runs twice" before writing anything down.

**A job's cron must be in `wrangler.jsonc`.** The silent failure of this whole
design is a job that is never delivered to: no error, no log, no run, for ever.
`check-crons.mjs` runs inside `pnpm typecheck` and compares the registry against
the config in both directions.

### What the runtime does for you

`runJob` in `job.ts` wraps every job:

1. `claim_job_run(name, leaseSeconds)`, which returns null if a run is already in
   flight, in which case this delivery does nothing and says so.
2. the job runs, with `{ env, rpc, log, scheduledAt }`.
3. `finish_job_run(id, ok, detail, error)`.

A failure is recorded **and rethrown**. Thrown, it also marks the invocation
failed in Cloudflare's Cron Events, so a broken job shows up in two independent
places rather than only in a table it may have been unable to write to.

Prefer `scheduledAt` over `Date.now()`. A retried invocation carries the original
scheduled time, so a job reading the clock will disagree with itself about which
run it is.

### Limits worth knowing

| | |
|---|---|
| CPU, cron interval ≥ 1 hour | 15 min |
| CPU, cron interval < 1 hour | 30 s |
| Wall clock | 15 min |
| Subrequests per invocation (paid) | 10,000. **Binding calls count**, so each `R2.delete()` and D1 query is one |
| Cron triggers | 250 per account on paid, 5 on free |
| Propagation after a deploy | up to 15 min |

Two traps in there. Moving a job from hourly to half-hourly cuts its CPU ceiling
by thirty times. And `R2.delete()` takes an **array**: one subrequest for up to
1,000 keys, against one per key if you loop.

`placement: { mode: "smart" }` means something different on a cron Worker than on
the catalogue's. It enables Green Compute, which may delay a run by up to 24
hours. Do not copy that block across.

### Running one locally

```sh
cd apps/cloudflare/workers/jobs
pnpm exec wrangler dev
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=17+*+*+*+*"
```

Spaces in the cron are `+`. `wrangler dev` binds a **simulated** R2 bucket, so a
local run cannot touch real objects. Point it at the local Supabase stack with a
gitignored `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<the local service role key from `supabase status`>
```

### Monitoring

One query, and it is the whole of it:

```sql
select job, started_at, finished_at, ok, error, detail
  from public.job_runs
 order by started_at desc
 limit 24;
```

Worth looking at: `ok = false`; a null `finished_at` on anything but the newest
row, which is a run that died without closing its own record; or a gap wider than
the job's own interval. Workers Logs and the Cron Events tab are the second
signal, and they are independent of Postgres being reachable at all.

The one secret is set by hand, once per environment:
`pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. `SUPABASE_URL` is a
`var` in `wrangler.jsonc`, because it is public.

---

## Analytics

PostHog and GA4. The canonical tables below are the source of truth for RiceCal's
tracking, including provider settings and revenue ownership. The typed plan in
`src/lib/analytics/events.ts` enforces app event names and their properties, and
`track` accepts nothing else. Both providers receive that same plan. PostHog
replaced Mixpanel (product analytics) and Sentry (error tracking) on 2026-10-12;
see [Retired: Mixpanel and Sentry](#retired-mixpanel-and-sentry).

PostHog is one project, **RiceCal** (id `659954`, US Cloud) in the RiceCal
organization, shared by the app, the website and the edge functions' AI
observability. It does five jobs: product analytics, error tracking, session
replay, feature flags and AI observability. GA4 also records the Firebase SDK's
own lifecycle events, such as first open, session start and app update. Those
are kept separate from RiceCal's namespaced custom events.

```
client.ts      the seam. No native imports, so anything may track.
events.ts      the plan, as a type. A typo does not compile.
engagement.ts  First App Open and Daily App Open, the two handset facts.
ga4.ts         GA4 names, value conversion, limits and PII exclusions.
providers.ts   the ordered fan-out to PostHog and Firebase Analytics.
props.ts       the two derived properties more than one call site needs.
../posthog.ts         the PostHog client, its adapter, replay sampling. Native.
../posthog-config.ts  the public project token and the replay rates.
../errors.ts          the error-reporting seam (`reportError`, `reportMessage`).
../feature-flags.ts   the feature-flag seam (`useFeatureFlag`).
```

`startup.ts` builds the PostHog client and the Firebase bridge, then hands one
combined client to `registerAnalytics`. Nothing else touches either SDK, for the
same reason the RevenueCat lifecycle is in its own file: a native import in a
module that tracking is fired from would drag an untransformable dependency into
most of the test suite. Errors and flags have their own seams for the same
reason. PostHog itself is created at the root layout's module scope
(`initErrorTracking`), before anything renders, so error autocapture covers
startup. Firebase Analytics is loaded lazily, so an OTA bundle stays safe on a
native binary built before the module existed.

Events fired before the SDKs finish starting are queued and drained on
registration. Each provider has its own serial queue. Identification finishes before profiles
and events; failed identity writes retry before later work. Work is dropped if
identity still cannot be confirmed, so it cannot use the preceding account.
Switching directly between accounts resets PostHog's identity and super
properties before identifying the new account and clears every app-owned
Firebase user property before its next event. Re-identifying the same account,
including an email update, preserves its state. Profile and reminder
deduplication includes the account UUID, so identical answers on two accounts
still reach both profiles.
[PostHog identify](https://posthog.com/docs/product-analytics/identify),
[Firebase persisted user properties](https://firebase.google.com/docs/reference/android/com/google/firebase/analytics/FirebaseAnalytics#setUserProperty(java.lang.String,%20java.lang.String)).

No product analytics is sent to PostHog or GA4 in development or from an
internal `preview` build. The preview profile keeps the release identifiers so
store prices work, then sets `EXPO_PUBLIC_ANALYTICS_ENABLED=false` and
`EXPO_PUBLIC_GA4_ENABLED=false`. A preview build, and a per-PR EAS update,
still reports its crashes to PostHog error tracking, as it did to Sentry,
tagged `app_variant: preview` (any release build with analytics switched off)
so the test-account filter keeps them out of production reports; it sends no
events and records no replays.
A development build sends to PostHog only with `EXPO_PUBLIC_POSTHOG_DEV=1`, for
verifying a change end to end; those events carry `app_variant: development`,
which the project's test-account filter hides. Firebase remembers runtime
collection settings across launches, so JavaScript writes both the disabled and
enabled states at startup. Collection is disabled before clearing the user ID
and native revenue marker, then enabled for production. If cleanup fails,
collection stays disabled and the failure is reported to error tracking.
Production omits the flag and enables collection. The pull-request workflow
also writes false into the environment file used by EAS Update because
build-profile variables are not available to an update export.

The Firebase project is the existing `ricecal` Google Cloud project. It is linked
to GA4 property **RiceCal** (`553863111`) in Analytics account
`350740029`. Firebase holds four app registrations: release and `.dev` variants
for both Android and iOS. The Android config contains both packages; dynamic Expo
config selects the matching iOS plist. These client config files contain public
project identifiers, not service-account credentials.

Native collection starts disabled. Shipping JavaScript enables it after startup;
development leaves it disabled. Automatic screen reporting is off because a
React Native route is not a native activity or view controller, and this plan does
not count renders as decisions. The app instance id and Supabase user id are
enough for these reports. IDFA, IDFV, Android Advertising ID, SSAID, SKAdNetwork
registration, ad storage, ad user data and ad personalisation signals are
disabled. iOS builds the Analytics pod without AdSupport. PostHog collects no
advertising identifier.

The live GA4 property keeps event and user data for 14 months, reports in MYR,
has Google Signals off, and disallows ads personalisation in every region. Its 45
custom dimensions and 11 custom metrics include app and website parameters.
`Onboarding Completed` and `Meal Logged` are key events, and saved funnel
explorations cover onboarding, meal logging and purchase conversion. The
independent Google Play revenue import was removed on 2026-10-02 so it cannot
count a second copy of RevenueCat purchases or renewals. The unused
internal-traffic filter is inactive because preview builds never send to this
property.

The public privacy policy (ricecal-web) names PostHog and Google Analytics,
session replay and the AI request records, and states the 14-month retention
period (30 days for recordings). The App Store privacy label and Google Play's
Data safety form must cover the same linked identifiers, product interactions,
diagnostics and crash data; session replay adds screen content to diagnostics.

GA4 custom events are the PostHog display name converted to lowercase snake case
under the `ricecal_` namespace. Booleans become 1 or 0, unsupported values are
dropped, `Entry Updated`'s field-name array becomes one comma-separated value,
and names, values and counts are capped at GA4's documented limits. Person and
super properties become GA4 user properties. A null clears the old value instead
of leaving stale state behind.

### PostHog project and event budget

| Setting | Value |
| --- | --- |
| Organization / plan | RiceCal, free plan with no payment method: every product's billing limit is its free allowance, so spend is fixed at $0 and ingestion stops for the rest of the month if an allowance runs out. Adding a card removes those limits; set every product's limit to $0 first if that ever happens |
| Project | RiceCal `659954`, US Cloud, timezone `Asia/Kuala_Lumpur`, week starts Monday |
| Ingestion | Public project token `phc_oTQVxP…` checked into `src/lib/posthog-config.ts`, ricecal-web and `functions/_shared/posthog.ts`; host `https://us.i.posthog.com` |
| Privacy | IPs discarded after GeoIP (`anonymize_ips`); web autocapture, heatmaps, console-log and performance capture off; exception autocapture on |
| Replay | Recording on; web sample 100%, minimum 5 s, inputs masked, no network headers or bodies. The app samples itself (below) |
| Authorized URLs | `https://ricecal.app`, `https://www.ricecal.app` |
| Test-account filter (default on) | Internal / Test users cohort (person `$internal_or_test_user`, or an `@ricecal.app` email), `app_variant` not `development`/`preview`, `$host` not localhost |

The free tier is **1,000,000 product-analytics events a month**, with separate
allowances for exceptions, recordings, AI events and flag requests. Estimates
use the last Mixpanel week before the switch (2026-10-05 to 2026-10-11: 61,347
events, 815 weekly users, 338 installs) ×4.3.

| Source | Estimated events / month | Basis |
| --- | --- | --- |
| The 48 decision events | 230,000 | Mixpanel's week minus its SDK events, ×4.3. `Log Sheet Opened`, `Food Searched`, `Meal Logged` and `Food Picked` are three quarters of it |
| Workout events (`Workout Started`, `Finished`, `Discarded`, `Routine Saved`, `Workouts Imported`) | 4,000 | New with the Workouts tab, so no history: about 60 workouts a day at launch, each a start and an end, plus routine saves. An import is one event however many workouts it brings |
| Groups (`Group Created`, `Joined`, `Invite Sent`, `Nudge Sent`, `Reaction Set`, `Message Sent`, and `Notification Opened` for a group push) | 15,000 | New with the Groups tab, so no history: assumes 300 people in groups, each reacting or chatting about once a day, plus rare creates, joins, invites and nudges (a nudge is capped by its hourly cooldown per meal). Chat messages push every other member with notifications on, so allow about one tapped chat push per member per day on top |
| News (`Announcement Shown`, `CTA Tapped`, `Dismissed`, `Auto Post Toggled`) | 3,000 | One launch card per account per announcement (~1,500 monthly accounts, a shown and a close each), plus the News list and the rare switch on Edit profile |
| `Daily App Open` | 12,000 | One per active install per day (~400 daily installs) |
| `First App Open` | 1,500 | ~340 installs a week |
| Prompt fetches (`$llm_prompt_fetched`) | 25,000 at most | Logged by PostHog for each read of a hosted prompt. The functions fetch a prompt at most once per isolate per 30 minutes, and Supabase isolates are short-lived, so the ceiling is one per model call: the `$ai_generation` count below, less its retries |
| `$identify` and `$set` | 4,000 | One identify per sign-in; person properties only when a value changes (persisted diff in `posthog.ts`) |
| RevenueCat server events | 300 | ~60 lifecycle events a week |
| Website (`$pageview` and five decisions) | 1,000 | ~120 events a week |
| **Total** | **~297,000 (30%)** | Room for three times today's audience |

| Other PostHog product | Free allowance / month | Expected use |
| --- | --- | --- |
| Error tracking (`$exception`) | 100,000 exceptions | Autocaptured crashes and errors, plus the app's caught `reportError` calls |
| Session replay | 2,500 mobile + 5,000 web recordings | App ~2,200 (20% of first-day launches, 4% of later ones); website all sessions while it gets a few hundred visits a week |
| AI observability (`$ai_generation`) | 100,000 events | One per OpenRouter request: a scan makes 1 to 4, a correction 1, a recipe 1 to 2, and a call Haiku fails adds one for the Qwen fallback. Roughly 15,000 to 25,000 |
| Feature flags | 1,000,000 requests | Zero while no flag is active; then about one request per launch |

Rules that keep it there: no `$screen` events, lifecycle events, autocapture or
rage taps; a `before_send` backstop drops any `$` event other than `$identify`,
`$set`, `$exception` and `$feature_flag_called`; person properties are written
only when they change. A new PostHog event needs an estimate here before it
ships. Never sample custom events; a frequent per-use event that answers nothing
belongs in GA4 only, and RiceCal has none yet.

### Product analytics coverage

Audited 2026-10-16 against the mobile tracking plan and call sites. This is the
full mobile product tracking reference. The website section records the separate
acquisition surface and links its own repository contract. A defined event is
eligible for delivery; its presence here is not proof of ingestion or billing.

| Surface / operation | Definitions | Destinations / counting rule |
| --- | --- | --- |
| Native app custom events | 65 | All 65 go to PostHog and GA4 in production; no GA4-only app group and no sampling |
| Website decisions | 6 | Same PostHog project (page views as `$pageview`); five namespaced GA4 events plus manually managed `page_view` in the shared property |
| Native screen views | 0 | No `$screen` or `screen_view` emitter; Firebase automatic screen reporting is disabled. Session replay shows navigation |
| SDK lifecycle and server subscription events | Separate inventory below | Additional event volume; excluded from the 65 custom app definitions |
| Profile and super-property updates | State operations | Not app custom events; never add profile lifetime spend to charge events |
| Per-install engagement events | 2 | `First App Open` once per install and `Daily App Open` once per local day; every other event is repeatable product use |

### Canonical app event table

This table is the source of truth for the tracking contract. Update it in the same change as the typed plan, call sites, provider mapping, or dashboard setup. `events.ts` enforces the names and property types in code; this table records the names that reports use and where each is sent. All rows go to both providers in production. GA4 changes boolean values to 1/0, drops null event values, and joins `changed` into a comma-separated string. Union aliases are defined beside `Events` in the typed plan.

<!-- analytics-app-events:start -->

| PostHog event | GA4 event | Allowed app properties | Source (relative to apps/mobile) | Trigger and frequency |
| --- | --- | --- | --- | --- |
| First App Open | ricecal_first_app_open | none | `src/lib/analytics/engagement.ts`<br>`src/lib/startup.ts` | First launch of a fresh install, decided at process start from empty local stores; once per install, never for an existing install updating. |
| Daily App Open | ricecal_daily_app_open | active_days: number; days_since_last_open: number &#124; null | `src/lib/analytics/engagement.ts`<br>`src/lib/startup.ts` | Launch or return to the foreground on a local calendar day with no earlier one; at most once per install per day. |
| Onboarding Started | ricecal_onboarding_started | none | `app/(onboarding)/welcome.tsx` | Get started on welcome; each tap that starts the flow, not a welcome-screen render. |
| Onboarding Step Completed | ricecal_onboarding_step_completed | step: string; step_number: number | `src/features/onboarding/OnboardingStep.tsx`<br>`app/(onboarding)/target.tsx` | Primary advance on a named step, plus target submission; each advance. Secondary skips and the timed calculating step are not counted. |
| Onboarding Completed | ricecal_onboarding_completed | plan_direction: PlanDirection; referral_source: string | `app/(onboarding)/finish.tsx` | Onboarding profile save succeeds; each successful completion, before health/notification permission steps. |
| Login Link Requested | ricecal_login_link_requested | none | `src/data/auth.ts` | Email login-code/link request is accepted; each successful request, before the user returns to sign in. |
| Password Reset Requested | ricecal_password_reset_requested | none | `src/data/auth.ts` | Password-reset request returns, from sign-in's "Forgot your password?" or the same link in Settings' change-password sheet; each request, without revealing whether an account exists. |
| Signed In | ricecal_signed_in | method: SignInMethod; is_new_account: boolean | `src/data/auth.ts` | An explicit Apple, Google, email-link/code or password sign-in succeeds; each success. Restored sessions/token refreshes are not acquisitions. |
| Sign In Failed | ricecal_sign_in_failed | method: SignInMethod; reason: 'cancelled' &#124; 'unavailable' &#124; 'error' | `src/data/auth.ts` | Instrumented Apple/Google sign-in rejection or cancellation; each reported result. Email/password failures are not covered by this event. |
| Signed Out | ricecal_signed_out | none | `src/data/auth.ts`<br>`src/lib/analytics/client.ts` | Explicit sign-out completes; each completion, before resetting analytics identity. |
| Account Deleted | ricecal_account_deleted | none | `src/data/auth.ts` | Server confirms account deletion; each success, before clearing the PostHog person and signing out. |
| Log Sheet Opened | ricecal_log_sheet_opened | panel: string; date_offset: number | `app/log/index.tsx` | Log sheet opens; once per presentation using its actual initial panel (explicit link, remembered choice, then camera) and selected date, not on panel changes. |
| Meal Logged | ricecal_meal_logged | method: LogMethod; date_offset: number; with_note?: boolean | `src/data/entries.ts`<br>`src/data/snap.ts` | Local insert succeeds, or camera/describe starts its optimistic row; once per logging action, not per decomposed food component. `with_note` only on camera. |
| Meal Scan Completed | ricecal_meal_scan_completed | method: 'camera' &#124; 'describe'; outcome: ScanOutcome; duration_ms: number; tier: number &#124; null; components: number | `src/data/snap.ts` | Camera/describe request reaches a reported outcome; once per attempt, including refusals, empty food, failure and detached requests. |
| Barcode Scanned | ricecal_barcode_scanned | outcome: 'found' &#124; 'not_found' &#124; 'error' | `app/log/food/[id].tsx` | Barcode lookup settles; once per barcode value on the mounted food route. Reopening the route can count again. |
| Entry Updated | ricecal_entry_updated | changed: string[] | `src/data/entries.ts` | Entry update succeeds; each successful save, with names of changed fields. |
| Entry Deleted | ricecal_entry_deleted | source: string | `src/data/entries.ts` | Entry deletion succeeds; each successful deletion, with the calling source or unknown. |
| Entry Refined | ricecal_entry_refined | outcome: 'applied' &#124; 'not_applied' &#124; 'failed' &#124; 'limit_reached' &#124; 'not_entitled'; from_chip: boolean; duration_ms: number | `src/data/scan.ts` | Refinement attempt reaches its outcome; each attempt, including refusal/failure and no applied change. |
| Food Searched | ricecal_food_searched | results: number; query_length: number | `src/features/logging/FoodSearchPanel.tsx` | Catalogue query has a settled results/empty answer for 1,200 ms after the 140 ms input debounce; changed nonempty queries only. History/own-food filtering is excluded. |
| Food Picked | ricecal_food_picked | position: number; results: number; source?: 'history' &#124; 'recipe' | `src/features/logging/FoodSearchPanel.tsx` | Catalogue, own recipe or history result is opened; each selection. Opening a result does not prove it was logged. |
| Paywall Shown | ricecal_paywall_shown | screen: PaywallScreen; trigger: ProFeature &#124; PaywallScreen | `src/data/refusals.ts`<br>`src/features/paywall/tracking.ts`<br>`src/features/paywall/useProNudge.ts`<br>`app/reviews/[id].tsx` | A Pro refusal/review redirect or eligible nudge requests navigation, or the intro paywall mounts; repeated visits count. Nudge has a two-day per-account clock; account/entitlement changes cancel its pending timer and the clock is checked again before sending. |
| Plan Selected | ricecal_plan_selected | screen: PaywallScreen; plan: Plan | `src/features/paywall/PaywallOffer.tsx` | Paywall plan changes; each change. The default selected plan emits nothing until changed. |
| Purchase Started | ricecal_purchase_started | screen: PaywallScreen; plan: Plan | `src/features/paywall/tracking.ts` | An available checkout is requested; once per accepted attempt, before offering lookup/store call. A missing configuration warning emits nothing. |
| Purchase Abandoned | ricecal_purchase_abandoned | screen: PaywallScreen; plan: Plan; reason: 'cancelled' &#124; 'unavailable' &#124; 'error' | `src/features/paywall/tracking.ts` | Checkout/entitlement-wait path throws; once per caught attempt. A post-purchase entitlement-wait error can also reach this event. |
| Restore Requested | ricecal_restore_requested | outcome: 'restored' &#124; 'nothing' &#124; 'unavailable' | `src/features/paywall/PaywallOffer.tsx` | Restore returns restored/nothing, or configuration is unavailable; once per reported result. A thrown restore is shown as an error without this event. |
| Manage Subscription Opened | ricecal_manage_subscription_opened | intent: 'cancel' &#124; 'switch' &#124; 'manage'; source: 'subscription' &#124; 'account' | `src/data/purchases.ts` | Store subscription-management navigation is requested; each request, before the external page is opened. It does not confirm a cancellation or switch. |
| Share Platform Opened | ricecal_share_platform_opened | platform: string | `app/settings/share.tsx` | Share-and-earn platform shortcut is tapped; each tap, before the external handoff. |
| Share Claim Opened | ricecal_share_claim_opened | none | `app/settings/share.tsx` | Discord claim link is requested; each tap. It does not prove the claim or promotional grant was accepted. |
| Health Connected | ricecal_health_connected | provider: string; granted: boolean; days: number | `src/data/health-sync.ts` | Connection/permission flow returns; each successful flow result, including granted false. Background health sync is excluded. |
| Health Disconnected | ricecal_health_disconnected | provider: string | `src/data/activity.ts` | Health disconnect mutation succeeds; each success. |
| Reminder Toggled | ricecal_reminder_toggled | meal: string; enabled: boolean | `src/data/settings.ts` | Meal reminder setting mutation succeeds; each successful write. |
| Notification Opened | ricecal_notification_opened | kind: 'weekly' &#124; 'monthly' &#124; 'group_nudge' &#124; 'group_invite' &#124; 'group_message' | `src/features/settings/useReportLinks.ts` | Recognized weekly/monthly report or group push response is handled; each tap. A chat push (`data.chat`) is `group_message`. Cold-launch response is cleared after reading; meal reminders are excluded. |
| Weight Logged | ricecal_weight_logged | none | `src/data/weight.ts` | Manual weight-log write succeeds; each success, without its value. Health-imported readings are excluded. |
| Recipe Saved | ricecal_recipe_saved | is_new: boolean; ingredients: number; servings: number | `src/data/recipes.ts` | Recipe save succeeds; each new/edit save, with ingredient/serving counts only. |
| Recipe Drafted | ricecal_recipe_drafted | source: 'photo' &#124; 'text'; outcome: 'drafted' &#124; 'empty' &#124; 'failed' &#124; 'limit_reached' &#124; 'not_entitled' | `src/data/recipes.ts` | Photo/text drafting reaches its outcome; each attempt, including refusals, empty and failure. It does not prove a recipe was saved. |
| Recipe Published | ricecal_recipe_published | outcome: 'approved' &#124; 'rejected' &#124; 'pending' | `src/data/recipes.ts` | A public save or publish operation returns moderation status; each result. Unpublishing emits nothing. |
| Recipe Copied | ricecal_recipe_copied | none | `src/data/recipes.ts` | Copying a community recipe succeeds; each successful copy. |
| Recipe Reported | ricecal_recipe_reported | reason: ReportReason | `src/data/moderation.ts` | Moderation report write succeeds; each successful report, with its controlled reason only. |
| Author Blocked | ricecal_author_blocked | none | `src/data/moderation.ts` | Blocking an author succeeds; each success, without the author identity. |
| Review Opened | ricecal_review_opened | kind: 'week' &#124; 'month' | `app/reviews/[id].tsx` | Review period resolves; once per resolved period in a mounted route. Locked reviews count before redirecting; this is not a read-completion event. |
| Review Card Shared | ricecal_review_card_shared | kind: 'week' &#124; 'month' | `app/reviews/[id].tsx` | Card share helper reports sent; each card send. Android share intent cannot confirm completion. |
| Group Created | ricecal_group_created | visibility: 'private' &#124; 'public' | `src/features/groups/Home.tsx` | `create_group` returned a group id; each group made. |
| Group Joined | ricecal_group_joined | via: 'invite' &#124; 'public' | `src/features/groups/Home.tsx` | `respond_to_group_invite` with accept, or `join_group` from the public list, returned; each join. Declines send nothing. |
| Group Invite Sent | ricecal_group_invite_sent | by: 'handle' &#124; 'email' | `src/features/groups/InviteSheet.tsx` | `invite_to_group` answered; each invite, typed or tapped from Suggested (always `handle`). An email counts whether or not it found an account, since the app cannot tell; a handle that finds nobody sends nothing; the push is separate and best effort. |
| Group Nudge Sent | ricecal_group_nudge_sent | meal: 'breakfast' &#124; 'lunch' &#124; 'dinner' | `src/features/groups/Board.tsx` | `nudge_group_member` accepted the nudge; each nudge. A nudge refused for the hourly cooldown sends nothing. |
| Group Reaction Set | ricecal_group_reaction_set | reaction: 'like' &#124; 'dislike' | `src/features/groups/MealSheet.tsx` | A like or dislike tapped on a member's food, in the meal sheet or on a food card in the chat (`Thumbs`); each set, before the write settles. Clearing a reaction sends nothing. |
| Group Message Sent | ricecal_group_message_sent | none | `src/features/groups/Chat.tsx` | `send_group_message` returned; each message. Never carries the text. |
| Meal Shared | ricecal_meal_shared | picture: 'photo' &#124; 'drawing' | `app/log/food/[id].tsx` | Meal picture share helper reports sent; each send. Android share intent cannot confirm completion. |
| Workout Started | ricecal_workout_started | source: WorkoutSource; exercises: number | `src/features/workouts/start.tsx` | A workout is opened on the logger from empty, a routine, a template, or a past workout repeated; once per start, including one that is later discarded. `source: past` appears only in data from builds that still had "Log a past workout". |
| Workout Finished | ricecal_workout_finished | exercises: number; sets: number; duration_min: number; from_routine: boolean; saved_to_health: boolean; queued: boolean | `src/features/workouts/WorkoutForm.tsx`<br>`app/workout/finish.tsx` | Save of a finished workout returns, either from the server or into the phone's outbox (`queued: true`); once per save. Editing a saved workout later emits nothing, and a queued save landing later is not a second event. |
| Workout Discarded | ricecal_workout_discarded | sets: number; minutes: number | `src/features/workouts/start.tsx` | A running workout is thrown away from the logger, the "still training?" prompt, or by starting another over it; once per discard, with its ticked sets and minutes. |
| Routine Saved | ricecal_routine_saved | is_new: boolean; exercises: number; from_template: boolean | `src/data/workouts.ts` | A routine insert or update succeeds, including a template added to the user's routines, a workout saved as one, or a finished workout updating the routine it started from; each success, with counts only. |
| Workouts Imported | ricecal_workouts_imported | source: 'strong' &#124; 'hevy'; workouts: number; existing: number; failed: number; custom_exercises: number | `app/workout/import.tsx` | A Strong or Hevy CSV import finishes, whether every workout saved or some were refused; once per finished run, with counts only. `custom_exercises` is how many the run created. A run stopped by a lost connection sends nothing; a retry that finishes sends its own. |
| Widget Added | ricecal_widget_added | widget: WidgetKind | `src/features/widgets/adoption.ts` | Foreground poll detects a widget kind absent from the previous stored set; one per newly observed kind. The first poll is a silent baseline. |
| Widget Removed | ricecal_widget_removed | widget: WidgetKind | `src/features/widgets/adoption.ts` | Foreground poll detects a previously stored widget kind absent now; one per removed kind. Intermediate add/remove changes between polls can be missed. |
| Widget Opened | ricecal_widget_opened | widget: WidgetKind; target: WidgetTarget | `app/widget/[action].tsx` | Supported widget deep link is handled; once per handled widget route. Legacy recipes target remains a valid reported value. |
| Widget Water Added | ricecal_widget_water_added | preset: number | `src/features/widgets/WidgetSync.tsx` | Queued home-screen water action successfully syncs on app foreground; one per successful queued action, recorded at sync time. Completion after the owning account leaves is not attributed to its successor. |
| Rating Prompt Shown | ricecal_rating_prompt_shown | trigger: RatingTrigger | `src/lib/rating/prompt.ts` | App rating question is delivered to a listener; each delivery, including manual requests. It does not prove the store review dialog appeared. |
| Rating Prompt Skipped | ricecal_rating_prompt_skipped | trigger: RatingTrigger; reason: RatingSkipReason | `src/lib/rating/prompt.ts` | Automatic meal/review checkpoint fails a gate; once per tested checkpoint, with the first failing reason. Not every logged meal. |
| Rating Prompt Answered | ricecal_rating_prompt_answered | trigger: RatingTrigger; answer: 'liked' &#124; 'disliked' &#124; 'dismissed' | `src/lib/rating/prompt.ts` | App rating question receives liked/disliked/dismissed; each answer. It does not report a store rating. |
| Rating Feedback Opened | ricecal_rating_feedback_opened | trigger: RatingTrigger | `src/lib/rating/prompt.ts` | Feedback link after disliking is requested; each request, without claiming a message was sent. |
| Announcement Shown | ricecal_announcement_shown | announcement: string; source: AnnouncementSource | `src/features/news/AnnouncementCard.tsx` | The native modal reports the card on screen (`onShow`): `launch` at most once per account per run of the app, `settings` each time one is opened from the News list. A card iOS refuses to present is not counted. |
| Announcement CTA Tapped | ricecal_announcement_cta_tapped | announcement: string; source: AnnouncementSource; cta: AnnouncementCta; page: number | `src/features/news/AnnouncementCard.tsx` | A page's button is tapped; each tap, before the destination screen opens, with the page it was on. It does not prove anything was changed there. |
| Announcement Dismissed | ricecal_announcement_dismissed | announcement: string; source: AnnouncementSource; via: 'done' &#124; 'close'; page: number | `src/features/news/AnnouncementCard.tsx` | The card closes without a page's button: "Got it" on the last page (`done`), or the cross, scrim or back gesture on any (`close`); once per close, with the page it closed on. Next and swiping between pages send nothing. |
| Auto Post Toggled | ricecal_auto_post_toggled | kind: 'foods' &#124; 'workouts'; enabled: boolean | `app/settings/account.tsx` | An Auto post foods or workouts switch on Edit profile is saved; each successful write. Onboarding's default and an announcement switching it on send nothing. |
<!-- analytics-app-events:end -->

### Common context and provider conversion

The app event table lists custom payload keys. PostHog also adds its SDK-managed
platform, device, app version, `$session_id` and identity, and the app registers
`app_variant` (`production`, `preview`, `simulator` or `development`) on every
event, re-registered after every identity reset. Those
SDK fields are not extra permitted diary fields. Firebase adds its own
app/device/session context. `entitled` is a PostHog super property and a GA4
user property after a known entitlement answer; early events can lack it. It is
the last reported state, not proof that the customer had a settled charge at
that instant.

| Contract | PostHog | GA4 |
| --- | --- | --- |
| Event name | Exact Title Case name in the app table | `ricecal_` + snake_case, maximum 40 characters; all 65 mappings are tested for uniqueness |
| Event keys | Typed keys as written | Normalized snake_case, maximum 40 characters; reserved/invalid prefixes handled in `ga4.ts` |
| String values | Typed payload as supplied | Maximum 100 characters |
| Booleans | `true` / `false` | Numeric `1` / `0`; website booleans use separate `yes` / `no` mappings |
| `changed` array | Array of changed field names | Comma-separated string, maximum 100 characters |
| Null, undefined or unsupported event values | SDK behavior applies to typed payload | Omitted; non-finite numbers are also dropped. A null scan `tier` is absent in GA4 |
| Custom event parameter limit | No extra app-side sampling or parameter cap | First 25 accepted parameters per call, before Firebase's own context |
| User property keys/values | Person properties preserve typed values, written only when changed | Keys maximum 24 characters; values stringified and limited to 36 characters; first 25 per call |
| Clearing user properties | Explicit null where supplied; account deletion unsets every app property | Null clears; undefined is omitted. Both `email` and `$email` are excluded |
| `date_offset` | Calendar-day offset computed on the phone | Same numeric value: 0 today, positive for past dates, negative for future dates; invalid date inputs fall back to 0 |
| Event timing | Client time at capture; PostHog batches every 30 s or 20 events and keeps its queue on disk | Client/SDK timing. Widget water events are recorded when queued actions sync, not at the original home-screen tap |

The converter is `apps/mobile/src/lib/analytics/ga4.ts`; shared derivations are
in `props.ts`. GA4 dimensions and metrics are report configuration, not additional
producers. Registration does not backfill historical custom definitions.

### Property vocabulary and interpretation

Inline unions are shown in the app table. These shared aliases and derived fields
complete that contract; a field typed `string` is not permission to send arbitrary
user text. Extend the source type and these tables together when its domain changes.

| Property / alias | Current values or meaning | Source / reporting limit |
| --- | --- | --- |
| `method` / `LogMethod` | `camera`, `describe`, `search`, `barcode`, `recipe`, `quick_add`, `history` | `events.ts`; compare logging actions, not individual food components |
| `method` / `SignInMethod` | `apple`, `google`, `email`, `password` | `email` means code/link. Failure coverage currently covers Apple/Google only |
| `screen` / `PaywallScreen` | `hard`, `intro` | Paywall surfaces below; no generic screen-view event. `reminder` and `ended` appear only in data from app versions released before those two screens were deleted; no build ever navigated to them |
| `trigger` / `ProFeature` | `camera`, `describe`, `refine`, `read_recipe`, `new_recipe`, `new_routine`, `new_group`, `trend_range`, `workout_range`, `review`, `nudge` | Refused capability or standing offer; trial expiration is a paywall screen value, not a feature. `suggest` appears only in data from app versions released before "what to eat next" was removed |
| `plan` / `Plan` | `monthly`, `yearly`, `lifetime` | Offered choice, not a price or proof of purchase |
| `outcome` / `ScanOutcome` | `logged`, `no_food`, `failed`, `detached`, `limit_reached`, `not_entitled` | `detached` stops client observation while the backend can still complete; do not classify it as definite failure |
| `meal` / `Meal` | `breakfast`, `lunch`, `dinner`, `snack` | `data/types.ts` / database enum; reminder category only |
| `plan_direction` | `lose`, `gain`, `maintain` | Locally derived; a missing target or absolute target/current weight difference below 0.5 kg means maintain. Body values never leave the app through analytics |
| `activity_level` | `sedentary`, `light`, `onFeet`, `veryActive` | Client vocabulary; normalized from database spellings |
| `step`, `step_number` | `setup` 1, `about` 2, `activity` 3, `source` 4, `calculating` 5, `target` 6, `account` 7, `health` 8, `notifications` 9 | `features/onboarding/steps.ts`; calculating has no completion event, and secondary skips do not emit one |
| `referral_source` | `xiaohongshu`, `instagram`, `tiktok`, `youtube`, `threads`, `facebook`, `reddit`, `friend`, `other`, `appStore`, `googlePlay` | `app/(onboarding)/source.tsx`; selected answer, not verified acquisition attribution |
| Log-sheet `panel` | `camera`, `describe`, `search` | `app/log/index.tsx`; legacy `barcode`/`label` map to camera and `recipes` maps to search. Initial panel only |
| Camera `with_note` | `true` when words were added after the shutter; `false` for Skip, an empty note, the setting switched off, the packet-label handoff, or a device with no camera (no photo, so no note is sent) | `data/snap.ts`; camera `Meal Logged` only, absent on every other method. The note's text is diary content and is never sent |
| Entry `changed` | Any supplied patch fields among `when`, `quantity`, `plate`, `serving`, `name`, `note`, `icon`, `photo`, `overrides` | `data/entries.ts`; field names only, never edited values |
| Share `platform` | `instagram`, `tiktok`, `xiaohongshu`, `facebook`, `threads`, `x` | `features/settings/social.ts`; requested external shortcut, not verified sharing |
| Entry deletion `source` | Calling source string, or `unknown` when absent | `data/entries.ts`; not an unrestricted note or an automatic screen name |
| Health `provider` | Production providers `apple_health`, `health_connect`; database also declares `demo` for demo data | `lib/health/index.ts`, `database.types.ts`; count connection decisions separately from imported readings |
| `widget` / `WidgetKind` | `kcal`, `water`, `weight`, `day`, `quick_log`, `today` | Native widget module; installed count measures kinds, not the number of widget instances |
| Widget `target` | `open`, `camera`, `search`, `barcode`, `recipes`, `water`, `weight` | Legacy recipes deep links still report recipes while opening My foods |
| Moderation `reason` / `ReportReason` | `inappropriate`, `spam`, `dangerous`, `stolen` | Controlled report category; no recipe, author or report text |
| Rating `trigger` / `RatingTrigger` | `meal_milestone`, `review_opened`, `manual` | App rating question, not a store review result |
| Rating skip `reason` / `RatingSkipReason` | `too_soon_after_install`, `too_soon_after_update`, `too_few_meals`, `too_few_active_days`, `asked_recently`, `asked_on_this_version` | `lib/rating/state.ts`; first failing gate at a checkpoint |
| Counts and durations | `results`, `position`, `ingredients`, `servings`, `components`, `count`, `days`, `duration_ms`, `tier` | Shape/operation diagnostics. Search result counts/positions describe the answer or selected result, not diary nutrition |
| Widget water `preset` | Home-screen action preset volume | Widget action choice; no daily water total or diary history |
| `announcement` | An id from `features/news/announcements.ts`, lowercase letters, digits and underscores (checked by `see_announcements`); currently `feed_auto_share_2026_10` | Never free text; a renamed id is a new announcement |
| `source` / `AnnouncementSource` | `launch`, `settings` | `launch` is the card the app puts over Today; `settings` is one opened from the News list under Me |
| `cta` / `AnnouncementCta` | `edit_profile`, `personalisation` | Where a page's button leads, named for analytics; a tap, not a changed setting |
| Announcement `via` | `done` ("Got it" on the last page), `close` (cross, scrim or back gesture) | Closing without a page's button |
| Announcement `page` | The page, from 1, that the button was tapped or the card closed on | How far people read is `Dismissed` broken down by `page`; `done` is always the last page |
| Group `visibility`, `via`, `by`, `meal`, `reaction` | `private`/`public`; `invite`/`public`; `handle`/`email` (an email address typed into the invite field); `breakfast`/`lunch`/`dinner` (the board column, not the diary's `Meal`); `like`/`dislike` | `src/lib/analytics/events.ts`; never a group name, a handle, an address, a food or a message |
| Auto post `kind`, `enabled` | `foods` or `workouts`; the new switch value | Edit profile switches only; onboarding's default and the announcement's switch-on send nothing |

### Instrumented surfaces, paywalls and frequency gates

| Surface / source | Instrumented decision | Gate / implication |
| --- | --- | --- |
| Installs and active days | `First App Open` once per install, `Daily App Open` once per local day | Handset facts, not account facts: an install shared by two accounts sends one a day. An existing install updating never sends `First App Open` |
| Welcome and onboarding | Start, primary step advance, successful profile completion | Repeated starts/advances count. Completion precedes permission steps, so requiring every step as a conversion prerequisite excludes valid users |
| Account and sign-in | Explicit login requests/results, sign-out and deletion | Restored sessions are not Signed In. No complete email/password failure funnel exists |
| Log sheet, food route and data mutations | Sheet entry, catalogue answer/selection, logging, scan/refinement outcome, entry edits/deletes | Search debounces; mutations distinguish intent/optimistic inserts from confirmed success as listed above |
| Recipes | Draft/save/publish/copy/report/block | Public moderation outcomes count separately; a draft is not a meal or a saved recipe. `Suggestions Shown` appears only in data from app versions released before "what to eat next" was removed |
| Activity, reminders and reports | Health connection/disconnection, reminder writes, report notification taps and review opens/shares | No background health-import events. Locked review opens count before the paywall redirect |
| Workouts | Workout started (by source), finished, discarded; routine saved | Started counts discarded workouts too, so finished over started is the completion rate. Finished fires on the save returning, queued saves included (`queued: true`); a queued save that lands later and edits to a saved workout send nothing. Rest timers, sets and records are not tracked |
| Home-screen widgets | Observed kind additions/removals, supported deep links and queued water actions | First observation is a silent baseline; later foreground diffs can miss intermediate changes. Stored baseline belongs to the handset, not reset on account switches. Each account gets the current count without fabricated add/remove events; results from a cancelled account's poll are discarded even if it returns |
| Share and subscription management | External handoff request or share helper result | A browser/store/share-sheet handoff does not prove a message, claim, cancellation or store review was completed |
| Hard paywall `/paywall` | `Paywall Shown` with `screen: hard` and refused `ProFeature` | `data/refusals.ts` records before navigation; review redirects also record. Free camera allowance is three scans/day; a further refusal can reach camera trigger |
| Intro paywall | `Paywall Shown` with `intro` as screen and trigger | `useTrackPaywallShown` records once per mounted presentation; revisits count again |
| Standing Pro nudge | `Paywall Shown`, `screen: hard`, `trigger: nudge` | At timer scheduling: known free entitlement, tutorial already offered, profile loaded with no announcement due or claimed this launch, due per-account clock and not offered in this mounted launch. Account/entitlement changes cancel the timer; a newly eligible account schedules its own. Any recorded paywall restarts the two-day clock, which is rechecked when the timer fires |
| Checkout | Optional plan change, checkout attempt and caught cancellation/error | Default selection sends no Plan Selected. Purchase Started precedes offering lookup. Purchase Abandoned can include a post-purchase entitlement-wait error |
| Restore | Returned restored/nothing or unavailable result | Restore Requested is a result event; thrown restores have no row. Restoration never adds settled revenue |
| Automatic rating checkpoints | Crossing each 15-meal boundary; second unlocked review read, then each fifth read | Gates require five days since install, two since version change, at least 15 meals, three active days, 60 days since last ask and no ask on this version |
| Manual rating request | App rating question requested manually | Bypasses automatic gates. Answers still update the cooldown; shown/answered is not a published store rating |
| News announcements | `Announcement Shown`, then `CTA Tapped` or `Dismissed`, by `source` | Counted from `onShow`. `launch` is the newest card, once per account unless its seen write fails (then it is shown again on a later launch); `settings` repeats per open. The launch card skips the launch the tour is offered on, and the Pro nudge skips any launch with one due |
| Groups | Created, joined, invite sent, nudge sent, reaction set, message sent | Each fires after the server accepted the write, except Reaction Set, which fires on the tap. Board views, day swipes and chat reads are not tracked |
| Auto post switches | `Auto Post Toggled` by `kind` and `enabled` | Only the Edit profile switches. The onboarding default and the announcement's switch-on are writes, not events |

### Product reports and funnel definitions

| Product question | Events / segmentation | Interpretation |
| --- | --- | --- |
| How many people use the app, and do they come back? | `Daily App Open` unique users (DAU/WAU/MAU, stickiness); retention from `First App Open` or `Onboarding Completed` to `Daily App Open`; `days_since_last_open` for resurrection | One event per install per local day, so counts are users, not sessions. Starts at 1.0.14; older versions send nothing until updated |
| Do new users finish setup? | First App Open → Onboarding Started → Onboarding Completed; inspect step/step_number and referral_source | Count unique users as well as total starts. Permission steps happen after completion; skips/calculating make a nine-event mandatory funnel invalid |
| Do they keep logging? | Retention from `Onboarding Completed` to `Meal Logged`; `Meal Logged` by method | The logging habit is the core retention metric for a diary |
| Which logging method is used? | Meal Logged by method, date_offset and last known entitled | One logging action can yield several component rows. Camera/describe includes optimistic work; use scan outcomes and database completion to measure successful persisted meals |
| Is catalogue search useful? | Food Searched → Food Picked, then Meal Logged with matching method | Catalogue only; counts describe settled answers. Picked is not saved. Keep mobile/web streams separate before comparing result positions or query behavior |
| Are scans/refinements reliable? | Meal Scan Completed or Entry Refined by outcome, duration_ms and entitled; `$ai_generation` latency, errors and cost by span | Refusals are product limits, not service failures; detached scans can complete later. The AI trace and the app event share the session when the app sent its header |
| Which feature creates purchase intent? | Paywall Shown → Purchase Started; break down trigger, screen and plan | Plan Selected is optional, so a funnel through it measures the plan-changing cohort, not all checkout conversion |
| Which attempts become paid charges? | App intent alongside positive RevenueCat initial/trial-converted/renewal/non-subscription events | Use RevenueCat for settled charges. Trial starts, restore, ordinary cancellation and Purchase Abandoned are not definitive paid/unpaid evidence |
| Do people adopt widgets? | Widget Added/Removed and Widget Opened; `widgets_installed` person property | Widget baseline is not lifetime first-use; kinds are not instances |
| Are reports/reminders useful? | Notification Opened, Review Opened and Review Card Shared by kind | Notification taps exclude meal reminders; locked review opens count. Open/share does not prove the full report was read |
| Why did they drop off or crash? | Session replays linked from a funnel step or an exception; `$exception` by issue | Replays are sampled; absence of a replay is not absence of the problem |
| Does the public site drive demand? | Website `$pageview` → App Download Clicked, by placement/target/live and region | Clicks are acquisition intent; no browser-to-account installation or purchase join is implemented |
| Do announcements land? | Announcement Shown (`source: launch`) → Announcement CTA Tapped or Dismissed, by announcement and `page`; Auto Post Toggled with `enabled: false` afterwards | A tap is intent, not a change. For the 1.1.0 announcement, opting out of auto post after it is the toggle event; auto post was already on when the card appeared |
| Are rating prompts timely? | Rating Prompt Skipped/Shown/Answered, by trigger/reason | Skips are checkpoint results. Liked/disliked/dismissed is the app question; no star rating or store review completion is collected |

Use unique users for adoption/conversion and event totals for operation volume.
Order funnels with the product's actual optional steps. Use `Daily App Open` for
retention and RevenueCat for finance; neither is the count of custom app events.

### Website product analytics

The public acquisition site is maintained in
[NelsonGan/ricecal-web](https://github.com/NelsonGan/ricecal-web). Its
README Analytics contract and typed emitter (`src/lib/analytics.ts`) remain the
authority for its implementation. Recheck that repository when its tracking
changes and update this section; the mobile inventory test cannot inspect
another repository in CI.

The website reports to the same PostHog project (`659954`) as the app. GA4
shares RiceCal property `553863111` through web stream `15786444693`, public
measurement ID `G-5Q45RV0KMX`, and Firebase web app
`1:829952813471:web:3af4db99307026f954b5aa`. Website code does not identify a
Supabase account or send RevenueCat attributes/charges, so its events are
anonymous and create no PostHog person. Shared names (`Food Searched`) and GA4
names require a platform or `$lib` filter in mobile reports.

| Website decision / frequency | PostHog name and custom properties | GA4 name and custom mapping | Source in ricecal-web |
| --- | --- | --- | --- |
| Public page entry/client path change; explicitly managed page view | `$pageview`: query-free `$current_url`, `path`, `page_type` | `page_view`: `content_group`, query-free `page_location`, `page_title`, safe `page_referrer` | `src/components/analytics.tsx` |
| Region selection changes | `Region Changed`: `from`, `to`, `fromLocalisedPage` | `ricecal_region_changed`: `region_from`, `region_to`, `from_localised_page` (`yes`/`no`) | `src/components/region-picker.tsx` |
| Search answer/error settles, not each keystroke or aborted request | `Food Searched`: `query`, `results`, `failed`, `source` | `ricecal_food_searched`: `query_length` (Unicode code points), `results`, `search_failed` (`yes`/`no`), `source`; no query text | `src/components/home/food-search.tsx` |
| Search/seeded result is chosen | `Search Result Clicked`: `query`, `rank`, `results`, `seeded`, `slug`, `source` | `ricecal_food_picked`: public `content_id`, `content_type: food`, `position`, `results`, `source`; no query text or separate seeded boolean | `src/components/home/food-search.tsx` |
| Download/store call to action is pressed, before navigation | `App Download Clicked`: `placement`, `target`, `live`, optional `plan` | `ricecal_app_download_clicked`: `placement`, `target`, `link_live` (`yes`/`no`), optional `plan`; configured website key event | `src/components/download-link.tsx`, `src/components/store-buttons.tsx` |
| Valid contact form requests a mail handoff | `Contact Submitted`: `topic` only | `ricecal_contact_submitted`: `topic` only; no name, address or message | `src/app/contact/contact-form.tsx` |

| Website context / domain | Contract |
| --- | --- |
| `pageType` | `contact`, `country-dishes`, `country-home`, `dish`, `home`, `legal`, `other`; grouped page shape rather than tens of thousands of food paths |
| Download `placement` | `country-dishes`, `dish`, `final-cta`, `header`, `hero`, `pricing` |
| Download `target`, `plan` | `app_store`, `play_store`, `none`; optional `free` / `pro`. `live: false` means no live store handoff, including unresolved desktop/iPad detection; clicks are not installs |
| Contact `topic` | `Something is broken`, `Trouble logging a meal`, `A calorie figure looks wrong`, `Billing or subscription`, `Delete my account`, `Something else`; selected form category only |
| Search `source` | `chip` / `typed`; result clicks additionally use `seeded` |
| Search text | PostHog-only, normalized/capped at 80 characters; separate from mobile's no-search-text policy. GA4 receives length and counts only |
| Region / RegionSlug | `asia`, `china`, `hong-kong`, `india`, `indonesia`, `japan`, `malaysia`, `myanmar`, `pakistan`, `philippines`, `singapore`, `south-korea`, `sri-lanka`, `taiwan`, `thailand`, `vietnam`; PostHog `region` super property and GA4 `site_region` event parameter, not account identity |
| Campaign attribution | Six explicitly allowed `utm_campaign`, `utm_content`, `utm_id`, `utm_medium`, `utm_source`, `utm_term` values mapped to GA4 campaign fields, capped at 100 characters; PostHog records its own campaign/referrer context, with URLs cut to origin + path |
| URLs/referrers | GA4 location/referrer omit query strings; external referrer reduced to origin, internal referrer retains public path. Arbitrary URL parameters are not forwarded as page dimensions |
| Private recipe links | `/r/<token>` excluded before provider loading and checked again when tracking; never send the bearer token as a page URL |
| Production/preview gates | Both providers only on `ricecal.app` / `www.ricecal.app`; previews and localhost never report |
| Browser opt-out | Do Not Track `1` or `yes` prevents starting either provider |
| Automatic capture | PostHog autocapture, automatic page views, heatmaps and flags off; uncaught errors captured; replay at the project's sample rate with inputs masked, stopped on private recipe links. GA4 automatic pageview and Enhanced Measurement off; SDK session lifecycle remains separate |
| Delivery | Dynamic PostHog load queues at most 20 calls while starting. Leaving-page calls use immediate sendBeacon; GA4 manages its own transport. Neither guarantees delivery or delays navigation |
| Handoff success | Contact submission proves validation and a requested mail handoff, not delivered email; store click proves intent, not an installation |

### Delivery limits and uninstrumented behavior

The mobile startup queue holds **50 operations**, not 50 guaranteed events: an
identify plus email profile write consumes two slots. It exists in memory and
is not a durable offline ledger. Disabled development/preview builds do not queue
production tracking. Once registered, each provider serializes its own work.
An identity failure retries before later work, which is dropped if the account
cannot be confirmed. SDK completion is not a destination ingestion receipt.
PostHog keeps its own queue on disk and retries on the next flush or launch.

| Not in the custom product inventory | Current owner / limit |
| --- | --- |
| Generic app screen views, tab/render/scroll/keystroke events | No active emitter; important surfaces have explicit decisions and session replay shows navigation. Automatic Firebase screen reporting is off |
| Errors and stack traces | PostHog error tracking; only controlled product outcomes are sent as analytics events |
| Raw mobile food names, search/describe text, calorie totals, weight values, photos or private recipe/report text | Database/domain flows, never custom product analytics or AI events. Session replay can show them on screen; that is its purpose, and the privacy policy says so. Email is the explicit exception above |
| Scan pipeline quality and catalogue misses | Database scan-item/miss records and the model eval; distinct from user behavior tracking |
| Session restoration and background health imports | Session/health state, not acquisitions or manual logging |
| Proof of an external share, email, claim, installation or published rating | No completion confirmation in the listed handoff events |
| Settled app-side purchase/refund revenue | RevenueCat server feed below; no manual price/revenue logger |

### Error tracking

PostHog error tracking replaced Sentry on 2026-10-12. Every exception is a
`$exception` event (its own 100,000-a-month allowance, not the product budget),
attributed to the identified account and linked to the session replay when one
is recording.

| Source | Captured by | Notes |
| --- | --- | --- |
| Uncaught JavaScript errors and unhandled rejections | `errorTracking.autocapture` in `posthog.ts` | Fatal errors are handed to the native SDK, which persists them before the process dies |
| Native crashes | `nativeCrashes` (iOS signals and Mach exceptions; Android Java/Kotlin), `androidNdkCrashes` | Through `@posthog/react-native-plugin`, reported on the next launch. These reports carry no `app_variant` (the native layer sends them before JavaScript registers it), so tell an internal build's native crash apart by `$app_version` and `$app_build` |
| Caught errors | `reportError(error, context)` from `src/lib/errors.ts` | Analytics provider failures (`analytics_provider`, `analytics_operation`); context is short scalars only |
| Warnings | `reportMessage(text)` | The captcha diagnostics in `features/auth/turnstile.tsx`, sent with `$exception_level: warning` |
| A host that stays silent while the phone says it is online | `reportNetworkFailure` in `src/lib/network.ts`, called from the Supabase client's `guardedFetch` | Warning `[network] could not reach <host>`, filed when a request sent after a lost one is lost too, with no answer from that host in between (`noteResponse`) and within five minutes. Once per host per launch, never while offline. Context: `network_path` (first three segments, no query string), `network_reason` (the platform's own text from the error Expo's `fetch` threw, native frame removed), `network_type`, `network_reachable`, `network_down_ms` (since the first lost request) |
| Edge functions | Their own logs | The functions are not instrumented for errors; their model calls are, as AI events |

A `before_send` hook sends an identical exception once per five minutes and no
more than 25 distinct ones in that window, so a render loop cannot spend the
month's allowance. Preview builds report exceptions too (tagged
`app_variant: preview`). Console output and request URLs are never captured: the catalogue query string
carries the typed search and the photos URLs carry R2 signatures, which is why
Sentry's breadcrumb filter existed. PostHog captures no network breadcrumbs at all.
The network warning above sends a host and a path cut to three segments
(`/rest/v1/<table>`), never a full URL.

**Why the network warning exists.** On 2026-10-13 a user on mobile data could
reach PostHog but not Supabase for a whole morning. Nothing arrived in the
Supabase logs, not even the token refresh supabase-js sends on every launch, and
nothing on the phone recorded why. Expo's `fetch` puts the platform's reason in
the error it throws (`fetch failed: UnexpectedException: Could not connect to the
server.` on iOS for a refused connection), so the phone knew whether it was DNS,
TLS, a refused connection or a timeout; the warning keeps that answer.

**Why one lost request is not enough.** Filed on the first lost request, the
warning reached about one phone in six a day on 1.1.0, and in the sessions
checked the app went on talking to Supabase straight after. iOS keeps
connections open between requests, and after the app has sat idle or spent a
while in the background it can send the next one down a connection the other
end has dropped (`The network connection was lost.`); a request the app was
suspended in the middle of fails the same way when it wakes. Requests that
shared the dead connection fail together and confirm nothing, so the confirming
request has to be one sent after the first failure.

**Readable stacks need uploaded symbols.** `metro.config.js` uses
`getPostHogExpoConfig`, which injects debug IDs into every bundle. The
`posthog-react-native/expo` config plugin (Hermes source maps, iOS dSYMs, Android
R8 mappings and NDK symbols) is applied by `app.config.ts` **only when
`POSTHOG_CLI_API_KEY` is set** at build time, and `eas-build-post-install`
installs `@posthog/cli` under the same condition. The key is in the EAS
`production` environment with **sensitive** visibility (a PostHog personal API
key, "RiceCal EAS symbol upload", scoped to error tracking: write and
organization: read), beside `POSTHOG_CLI_PROJECT_ID=659954`. Sensitive rather
than secret because production builds run `eas build --local` on GitHub
Actions, where secret variables are not readable during config resolution.
Development, simulator and preview builds have no key and skip the upload; a
local `pnpm ios` is unchanged. Check a release build's log for `Upload summary`
and `dSYM upload complete`. Store builds have OTA updates on the `production`
channel; an `eas update` there would need `posthog-cli hermes upload` run on its
export for readable stacks.

### Session replay

Recordings come from `@posthog/react-native-plugin` (native screenshots, not a
DOM), so they need a native build. The app decides once per launch, after the
engagement check, whether to record: **20%** of launches on an install's first
day (the local day `First App Open` was sent, kept in the engagement store) (onboarding and the first scans, where replays teach the most) and **4%** of
later launches, about 2,200 recordings a month against the free tier's 2,500
mobile recordings (`posthog-config.ts`). Recordings under 5 seconds are dropped.

Replays are not masked: the diary and food photos are what a replay is for.
`maskAllTextInputs` is off because on iOS it masks every label as well as every
field, which blacked out the whole app in the first test recording. Password
fields are secure text entries, which both native SDKs always mask; an email
typed at sign-in is visible, and is already the account's PostHog `email`.
System pickers are masked, network telemetry and logcat are off, and taps are
recorded. Replays answer "what did the
user see and do" next to an exception or a funnel drop-off; they link through
`$session_id`. The website records at the project's rate with inputs masked.

### Feature flags

`src/lib/feature-flags.ts` wraps PostHog flags for future rollouts and
experiments: create the flag in PostHog, register its key in `FEATURE_FLAGS`
with a comment saying what it gates and when it can go, read it with
`useFeatureFlag(key)` in components or `getFeatureFlag(key)` elsewhere, and
treat `undefined` (not loaded, development, a build that does not send) as off.
Flags load at launch and on identify; person-property writes never trigger a
reload. Each read sends `$feature_flag_called` once per flag per session for
experiment exposure; add those to the budget when a flag ships, and archive a
flag once its rollout is complete. Flag requests are billed only while a flag is
active. The website never evaluates flags.

### AI observability

Every OpenRouter request the edge functions make becomes one `$ai_generation`
event in the same PostHog project (100,000 free a month). `chatJSON` in
`functions/_shared/llm.ts` is the one place a model is called, and it takes the
invocation's `Meter`, which now also reports: `createMeter(aiContext)` names the
account, the function and the app's session, and every request (retries
included) is sent in the background through `EdgeRuntime.waitUntil`
(`_shared/posthog.ts`). Requests from one invocation share `$ai_trace_id`, so a
scan's vision call, catalogue pick and nutrition estimate read as one trace.

| Property | Value |
| --- | --- |
| `$ai_span_name` | What the call is for: `analyse_photo`, `describe_meal`, `pick_candidate`, `estimate_nutrition`, `interpret_instruction`, `read_recipe_photo`, `describe_recipe`, `review_recipe`, `suggest_meals`, `moderate_submission` |
| `$ai_model`, `$ai_provider`, `$ai_base_url` | The OpenRouter model the request named: `anthropic/claude-haiku-5.5` (`OPENROUTER_BYOK_MODEL`) or the Qwen fallback (`OPENROUTER_MODEL`), `openrouter` |
| `$ai_input_tokens`, `$ai_output_tokens`, `$ai_cache_read_input_tokens`, `$ai_cache_creation_input_tokens` | From OpenRouter's `usage`: the cache pair is the system prompt read from or written to Anthropic's prompt cache (`prompt_tokens_details.cached_tokens` / `cache_write_tokens`) |
| `$ai_total_cost_usd`, `$ai_cost_passthrough` | What the call cost us, not re-priced: OpenRouter's charge (`usage.cost`), plus, when our own key paid, what Anthropic bills directly (`usage.cost_details.upstream_inference_cost`), since under BYOK `cost` is only OpenRouter's fee |
| `byok` | `usage.is_byok`: `true` when our Anthropic key paid. An `anthropic/` event with `false` means OpenRouter credits were spent on it, which the routing forbids |
| `$ai_latency`, `$ai_http_status`, `$ai_is_error`, `$ai_error`, `finish_reason` | Seconds, status and a short error; a JSON parse failure is recorded as `model answer was not valid JSON` so the answer is never quoted |
| `feature`, `attempt`, `is_backup_model`, `$ai_max_tokens`, `$ai_temperature` | The edge function, which request this was (0 is the first, Haiku unless it is switched off, then the fallback and its one retry), whether Qwen is answering because Haiku failed in the same call (`false` when Haiku was never asked), and the call's settings. Haiku takes no temperature, so its events carry none |
| `$ai_prompt_name`, `$ai_prompt_version`, `prompt_source`, `prompt_parts` | Which hosted prompt the system message was and which PostHog version (see [Hosted prompts](#hosted-prompts)). `prompt_source` is `posthog`, `bundled` (the code's copy: no key, or PostHog did not answer; no version is sent) or `mixed`. A photo with a note is two prompts, so it also carries `prompt_parts`, e.g. `analyse-photo@2+analyse-photo-note@1` |
| `$geoip_disable` | Always `true`: the request comes from Supabase's servers, whose location would otherwise overwrite the person's |
| `distinct_id`, `$session_id`, `$ai_session_id` | The Supabase uuid the app identifies PostHog with, and the app's session from the `X-POSTHOG-SESSION-ID` header the SDK adds to Supabase requests (`addTracingHeaders`). Moderation runs as `ricecal-moderation` and creates no person |

`$ai_input` and `$ai_output_choices` carry fixed placeholders. A prompt holds the
person's meal description, photo or recipe and the answer is their diary entry;
the privacy policy promises that analytics holds no diary content and that
deleting an account deletes its diary, which a copy in PostHog would break. Scan
quality is judged from `food_scan_items` and the model eval, as before. Capture
is off on a local stack (`SUPABASE_URL` is not an https production URL). The
functions bundle `_shared`, so a change there needs every function that imports
it redeployed.

### Hosted prompts

Every model call's system prompt lives in PostHog prompt management (RiceCal
project → AI observability → Prompts), one prompt per call, and the functions
send whichever version the `production` label points at. A prompt can be
changed, compared against its own `$ai_generation` events and rolled back
without a deploy.

| Prompt | Call (`$ai_span_name`) | Code copy |
| --- | --- | --- |
| `analyse-photo` | `analyse_photo` | `ANALYSE_PHOTO_PROMPT`, `_shared/llm.ts` |
| `analyse-photo-note` | `analyse_photo`, appended when the person typed a note | `PHOTO_NOTE_RULES`, `_shared/llm.ts` |
| `describe-meal` | `describe_meal` | `DESCRIBE_MEAL_PROMPT`, `_shared/llm.ts` |
| `pick-candidate` | `pick_candidate` | `PICK_CANDIDATE_PROMPT`, `_shared/llm.ts` |
| `estimate-nutrition` | `estimate_nutrition` | `ESTIMATE_NUTRITION_PROMPT`, `_shared/llm.ts` |
| `interpret-instruction` | `interpret_instruction` | `INTERPRET_INSTRUCTION_PROMPT`, `_shared/llm.ts` |
| `read-recipe-photo` | `read_recipe_photo` | `READ_RECIPE_PROMPT`, `_shared/recipe.ts` |
| `describe-recipe` | `describe_recipe` | `DESCRIBE_RECIPE_PROMPT`, `_shared/recipe.ts` |
| `review-recipe` | `review_recipe` | `REVIEW_RECIPE_PROMPT`, `_shared/recipe.ts` |
| `suggest-meals` | `suggest_meals` | `SUGGEST_MEAL_PROMPT`, `_shared/suggest.ts` |
| `moderate-submission` | `moderate_submission` | `REVIEW_PROMPT`, `social/review.ts` |

- `_shared/prompts.ts` fetches each prompt with `POSTHOG_PROMPTS_API_KEY`
  ([Function secrets](#function-secrets)) and caches it in the isolate for 30
  minutes, so a label move reaches every call within that. With no key, no
  answer within 3 seconds, an error, an empty prompt or an answer without a
  version, the call sends the cached version if there is one and the code's
  copy if not, and PostHog is not asked about that prompt again for a minute.
  PostHog being down costs one wait a minute per prompt and degrades a scan to
  the prompt this deploy shipped with, never to a failure. Calls that start
  together share one fetch.
- The one variable is `{{icon_instruction}}`, the list of icon ids from
  `icons.ts`. It is generated from the icon files, so it is filled in by the
  code rather than kept as text in PostHog, where it would go stale the day an
  icon is added. `suggest-meals` says "exactly 7 picks" in its text, which is
  `PICK_COUNT` in `suggest.ts`: change both together.
- The route's own line (Haiku's "JSON only" instruction) is added after the
  hosted text by `requestBody`, as before, and stays in the code.
- Each call names its prompt where it is made (`hostedSystem(...)`), so a
  prompt is never matched by its text.

**Changing a prompt.** Make the change in the code copy first, since that is
what the eval (`pnpm eval:prompts`, `pnpm eval:scan`), the tests and an outage
use. Then `pnpm prompts:export <name>` prints the template exactly as PostHog
should hold it. Publish it as a new version: paste it into the prompt in
PostHog, or use the PostHog MCP's `llma-prompt-update` (its `edits` mode takes
exact find-and-replace pairs against a `base_version`, which suits a one-line
change). Run `pnpm prompts:check --label=latest <name>` to prove the new
version matches the code, then move the `production` label to it
(`llma-prompt-label-set`, or the prompt's page). Roll back by moving the label back. A change made in
PostHog first is fine for a quick experiment, but copy it into the code before
calling it done: `pnpm prompts:check` (production label against the code) is
non-zero while the two differ. To see which version production is using, filter
`$ai_generation` by `$ai_prompt_name` and `prompt_source`.

### Canonical revenue and automatic event table

RevenueCat owns settled purchase revenue. App events describe purchase intent only
and never contain a price, currency or revenue value. Both integrations use gross
USD revenue; GA4 converts to the property's MYR reporting currency. Compare
matching dates, time zones, currency, store, production environment and
gross/net definitions. GA4 is not a financial ledger: RevenueCat's GA4
integration does not send negative refund revenue.
[RevenueCat GA4 setup](https://www.revenuecat.com/docs/integrations/third-party-integrations/firebase-integration),
[RevenueCat PostHog setup](https://www.revenuecat.com/docs/integrations/third-party-integrations/posthog).

| Producer / trigger | PostHog event | GA4 event | Revenue treatment |
| --- | --- | --- | --- |
| RevenueCat initial paid subscription | `rc_initial_purchase_event` | `purchase` | Settled gross charge |
| RevenueCat trial start | `rc_trial_started_event` | `rc_trial_start` | No sale yet |
| RevenueCat trial conversion | `rc_trial_converted_event` | `purchase` | First settled charge |
| RevenueCat renewal | `rc_renewal_event` | `purchase` | Settled recurring charge |
| RevenueCat lifetime / non-renewing purchase | `rc_non_subscription_purchase_event` | `purchase` | Settled one-time charge |
| RevenueCat trial cancellation | `rc_trial_cancelled_event` | `rc_cancellation` | No new sale |
| RevenueCat paid cancellation | `rc_cancellation_event` | `rc_cancellation` | No new sale |
| RevenueCat auto-renew enabled again | `rc_uncancellation_event` | `rc_uncancellation` | No new sale |
| RevenueCat pause | `rc_subscription_paused_event` | `rc_subscription_paused` | No new sale |
| RevenueCat expiration | `rc_expiration_event` | `rc_expiration` | No new sale |
| RevenueCat billing issue | `rc_billing_issue_event` | `rc_billing_issue` | No new sale |
| RevenueCat product change | `rc_product_change_event` | `rc_product_change` | Intent; charge belongs to purchase/renewal |
| RevenueCat entitlement transfer | Not sent | `rc_transfer_event` | Two identity events; no sale |
| Firebase native lifecycle | Not forwarded | `first_open`, `session_start`, `app_update`, `user_engagement` and SDK lifecycle | Automatic production-only usage; screen reporting disabled |
| Firebase native purchase / App Store lifecycle | Not forwarded | `in_app_purchase`, `app_store_*` | Legacy fallback only; conditional rules rename linked native revenue to `ricecal_store_revenue_observed` |
| Separate GA4 Google Play import | Not forwarded | Disabled | Removed 2026-10-02 to avoid a second purchase/renewal feed |
| RevenueCat paywall UI and web funnel events | Disabled | No separate app custom producer | Custom RiceCal paywalls already own intent; additional funnel purchase events would overlap |

Each RevenueCat event also updates the `rc_subscription_status` person property
(`active`, `trial`, `cancelled`, `grace_period`, `expired`, `paused`); events
with revenue carry `revenue` (USD) and `currency`. PostHog revenue analytics
reads the four charge events above (`revenue`, USD, `product_id`). GA4 app
streams do not promise transaction-ID deduplication across producers; use one
revenue owner.
[GA4 transaction IDs](https://support.google.com/analytics/answer/12313109?hl=en).

### Canonical identity and profile table

| Property / identifier | PostHog | GA4 / RevenueCat | Source and send condition |
| --- | --- | --- | --- |
| Supabase account UUID | `distinct_id` | GA4 `user_id`; RevenueCat App User ID | `data/session.tsx`; identify before profiles/events and before checkout or restore. Direct account switches reset PostHog and clear app-owned Firebase user properties before identifying the successor |
| Account email | Person `email` | RevenueCat `$email`; excluded from GA4 | `identifyUser` / `identifyPurchaser`; support lookup only. Unset on account deletion |
| Firebase installation ID | Not used | RevenueCat `$firebaseAppInstanceId` | Native Firebase `getAppInstanceId`; never a UUID, email, fabricated value or Firebase app ID |
| PostHog account ID | Same Supabase UUID | RevenueCat `$posthogUserId` | Identified production account, uploaded with the other analytics attributes through RevenueCat's attributes endpoint (the SDK has no setter) |
| `onboarded` | Person boolean | GA4 user-property string | Onboarding success, then profile sync; whether an onboarding timestamp exists. Profile deduplication includes account UUID |
| `onboarded_at` | Person timestamp string | GA4 user-property string | Onboarding success/profile sync; undefined values are omitted, not cleared within the same account. Firebase clears the previous account's value at a switch |
| `plan_direction` | Person `lose`, `gain`, `maintain` | GA4 user-property string | Onboarding success only; inferred locally from weights with a 0.5 kg neutral band. Not refreshed when goals/weight change later |
| `activity_level` | Person `sedentary`, `light`, `onFeet`, `veryActive` | GA4 user-property string | Onboarding success/profile sync; database spellings normalized to the client vocabulary |
| `referral_source` | Person controlled source | GA4 user-property string | Onboarding success/profile sync; also present on Onboarding Completed |
| `health_provider` | Person provider or null | GA4 string or null | Successful granted connection; null clears it on disconnect. Background imports are not connection decisions |
| `meal_reminders` | Person count | GA4 user-property string | Number of enabled meal reminders; hook writes on mount, account change or changed count, not every refetch |
| `widgets_installed` | Person count | GA4 user-property string | Current handset widget-kind count; first valid poll for each signed-in account and detected changes, including zero |
| `entitled` | Super property on every custom event | GA4 user property | After a real entitlement answer for the current account; account switches clear the preceding answer. No false value while offline with unknown status |
| `app_variant` | Super property | Not sent | Registered at client start and after every reset, from the build (`production`, `preview`, `simulator`, `development`) |
| `revenuecat_revenue_enabled` | Not sent | Firebase default event parameter, 0 or 1 | Starts at 0; set to 1 only after HTTP 200 acknowledges this account's current installation attribute |
| `rc_subscription_status` | RevenueCat-managed person property | Integration-owned parameters | Updated by every RevenueCat server event; never written by the app |

Person properties are written only when their value changes, compared against
the last write stored on the handset per account (`ricecal-posthog-person`);
each write is a billable `$set`. Identity changes invalidate pending revenue
acknowledgement. Attribute delivery retries on startup, app foreground and
checkout. A five-second budget keeps analytics from holding checkout
indefinitely; RevenueCat login must still finish successfully before a purchase.
Failed uploads leave native fallback enabled. A new account or logout clears the
native revenue marker. Firebase starts with a cleared user ID before collection
is enabled. No raw foods, search terms, calorie totals, weights, photos or error
messages are allowed in mobile product analytics. The website has a separate,
explicitly documented PostHog-only search-text policy.

### Canonical live integration settings

Verified 2026-10-12; credentials remain in the dashboards and local ignored files.

| Setting | Live value |
| --- | --- |
| RevenueCat project | RiceCal `projeb2883d3`, dashboard `eb2883d3` |
| Store apps | iOS `app14d94549cb`; Android `app8b52836439`; Test Store `app36022b58af` |
| PostHog destination | RiceCal project `659954`, US Cloud, timezone `Asia/Kuala_Lumpur`; app and website share it |
| RevenueCat → PostHog | RevenueCat's PostHog integration: US region, gross USD, default `rc_*` event names, subscriber attributes not sent as person properties (each would be a billable `$set`), paywall and web-funnel events off, no sandbox key. Its API key is the public project token. The Mixpanel integration was deleted |
| GA4 destination | RiceCal property `553863111`, account `350740029`, Firebase project `ricecal`; property reports MYR |
| GA4 reporting controls | 14-month event and user retention; Google Signals off; ads personalization allowed in 0 of 307 regions; 45 custom dimensions and 11 custom metrics, including website definitions |
| iOS production stream | `15763208820`; Firebase app ID `1:829952813471:ios:c27979f69fbc022a54b5aa` |
| Android production stream | `15763216343`; Firebase app ID `1:829952813471:android:f6d8a81a4b134ff254b5aa` |
| GA4 credentials | Separate `RevenueCat iOS production` and `RevenueCat Android production` Measurement Protocol secrets |
| RevenueCat GA4 reporting | Gross USD; sandbox off; hashed email off; web fields empty; Firebase Extension unused (Supabase owns accounts/entitlements) |
| iOS native revenue rules | `in_app_purchase` and prefix `app_store_`, each AND `revenuecat_revenue_enabled = 1`; preserve original name in `legacy_event_name`, rename to `ricecal_store_revenue_observed` |
| Android native revenue rule | `in_app_purchase` AND `revenuecat_revenue_enabled = 1`; same preserve/rename action; separate Google Play import removed |
| EAS environment | `production`: `POSTHOG_CLI_API_KEY` (sensitive) and `POSTHOG_CLI_PROJECT_ID`. `EXPO_PUBLIC_MIXPANEL_TOKEN`, `EXPO_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` are deleted from every environment once this migration is on `main` (code before it requires them) |
| Dev / preview / PR updates | Product analytics disabled by `EXPO_PUBLIC_ANALYTICS_ENABLED=false`; GA4 additionally disabled by its existing flag. Preview builds keep PostHog error tracking, tagged `app_variant: preview` |
| Backend entitlement webhook | Existing Supabase `revenuecat` function preserved; sandbox entitlements follow `REVENUECAT_SANDBOX_SUBSCRIBERS` policy independently of analytics sandbox exclusion |

The native rename rules affect incoming client events, not RevenueCat's Measurement
Protocol `purchase` events. Historical revenue is not backfilled by enabling an
integration. Keep RevenueCat as the financial source, and reconcile GA4
`purchase` events by store and transaction against RevenueCat. Changes to event
rules may need an hour to propagate.
[Google's event modification behavior](https://support.google.com/analytics/answer/10085872?hl=en),
[Play import behavior](https://support.google.com/analytics/answer/11548051?hl=en).

### Live PostHog dashboards

DASHBOARDS_PLACEHOLDER

### Monitoring usage and verification

Check the Quality dashboard's event-volume insight against the budget table in
the first week after a release, and whenever a new event ships. Events fire on
user decisions, not renders or every keystroke. `Food Searched` fires after
typing settles; `Rating Prompt Skipped` is bounded by meal checkpoint crossings.
Widget changes and offline sync may arrive when the app next opens. `Meal Logged`
includes the optimistic camera/describe insert; it is not a persisted-meal total.
Investigate a new name, a sharp volume change, unexpected free-text properties,
missing identity, or purchase events from a second producer.

Automated checks: the inventory test (`inventory.test.ts`) checks all 65 names,
exact GA4 mappings, typed payloads, source-file existence and a nonempty
trigger column, and forbids app-side settled revenue fields; `engagement.test.ts`
covers install detection and the once-a-day claim; `posthog.test.ts` covers the
person-property diff, the event backstop and replay sampling; `providers.test.ts`
and `analytics.test.ts` cover identity ordering, account switches and the queue;
`functions/_shared/posthog.test.ts` covers the AI event shape and that no content
leaves. `pnpm check` runs them; the edge functions run under `deno test`.

On a device, set `EXPO_PUBLIC_POSTHOG_DEV=1`, restart Metro with `--clear`, and
check PostHog's Activity view (filter `app_variant = development`) for
`$identify`, `Daily App Open` and the events exercised. Force a replay from the
debugger with the client's `startSessionRecording()`; the launch's sampling
decision is made once.

### Retired: Mixpanel and Sentry

Retired 2026-10-12. The app, the website and RevenueCat moved from Mixpanel to
PostHog, and crash reporting from Sentry to PostHog error tracking. Nothing was
migrated: history stays in Mixpanel projects `4054270` (app) and `4054271`
(website) and Sentry project `nelsons-project/ricecal-mobile` until it ages out.
Releases up to 1.0.13 keep sending to Mixpanel and Sentry until users update;
deleting the EAS variables does not change a shipped binary. Mixpanel's automatic
`$ae_first_open` / `$ae_session` / `$ae_updated` are replaced by `First App Open`
and `Daily App Open`; `$ae_iap` (an SDK purchase diagnostic) has no successor.
The last Mixpanel revenue reconciliation (closed 2026-09-26 to 2026-10-01 UTC:
RevenueCat gross USD 200.71 against Mixpanel's USD 200.70) is the baseline for
comparing PostHog's revenue analytics. RevenueCat's Mixpanel delayed-event
secret is no longer needed. Earlier report names: `Suggestions Shown` and the
`suggest` trigger come from versions before "what to eat next" was removed;
paywall screens `reminder` and `ended` never shipped a navigation.

### The rules this plan was written against

**One event per decision, not per render.** A screen appearing is not a fact
about anybody; a button being pressed is.

**Every event answers a question somebody would actually ask.** If the answer
would not change what gets built next, the event is not here.

**No raw mobile diary values.** No calorie totals, no weights, no dish names, no
search text. They are health data, they answer none of the questions, and
Postgres already holds every one of them next to the arithmetic that produced it.
Where a number is genuinely wanted, its *shape* is sent instead: which way a
calorie plan runs rather than the two weights, how many days back an entry was
logged rather than which day.

**Errors belong to error tracking.** A failure that is also a product fact (a
scan that found no food, a barcode nothing knows, a request refused for want of
budget) travels as an `outcome` property on the event it belongs to; an
exception goes to PostHog error tracking (`lib/errors.ts`).

**Scan quality belongs to Postgres.** `food_scan_items` records what the model
claimed and where it landed, and `food_scan_misses` is the catalogue-widening
backlog. Product analytics measures behaviour; those two measure the pipeline.

### The one identifier that names a person

`email`, on the PostHog person only, and it is an exception made on purpose
rather than a hole in the rule. The address is what a support conversation starts
from, and a profile that cannot be found by it is a profile nobody can act on. It
is set from `identifyUser` alone, from the address on the session, and it is the
same address RevenueCat is given, so both support dashboards answer the same
search. GA4 gets the Supabase uuid as its pseudonymous user id and its property
mapper rejects both `$email` and `email`. Account deletion unsets it
(`forgetPerson`) before the identity reset.

Nothing else about the person follows it: no name, no body figures, and the diary
half of the rule is unchanged.

It is sent **after** the identify. A person property is filed against whichever
distinct id the SDK is holding at the time, so an email sent first lands on the
anonymous device and the real account stays blank.

`Signed In` is deliberately **not** fired from `SessionProvider`. Supabase
announces `SIGNED_IN` on every launch that finds a usable token in the keychain,
so counting it as a sign-in would report a returning user's every cold start as
an acquisition. The three call sites in `data/auth.ts` are the moments a person
signed in.

**One super property**, `entitled`, stamped on every PostHog event and mirrored
as a GA4 user property (beside `app_variant`, which describes the build). It is
the cut every other report wants. It waits for a real answer: offline with
nothing cached, registering `false` would mark a paying user's whole session as
free.

### Adding an event

1. Declare it in `events.ts`, with its properties and a comment saying what
   question it answers. If that comment is hard to write, the event is probably
   not worth having.
2. Track it at the point of **decision**, not the point of render.
3. Prefer a property on an existing event to a new event. `Meal Logged` with a
   `method` is one thing to reason about; separate method events multiply the inventory.
4. If the property is a number off somebody's diary, send its shape instead.
5. Add its expected monthly volume to the PostHog event budget.
6. Update every affected canonical table in the same change, including properties,
   vocabulary, sources, triggers/frequency, funnel interpretation, provider settings,
   dashboards and verification evidence. Apply the `maintain-analytics-tracking`
   skill and run the inventory consistency test. Update the website reference when
   that separate repository changes. A change without analytics impact needs no
   artificial table edit.

Keep both copies of the analytics maintenance skill synchronized. Documentation
and live verification dates must describe observed evidence, never a planned
release or HTTP response as proven report ingestion.

---

## The design system

`src/ui` is the design system and knows nothing about RiceCal. `src/features/*`
knows about meals, foods and targets. `app/*` is routes. A `FoodRow` could not go
in the design system without dragging the domain in with it.

```
src/theme/tokens.ts        colour roles, spacing, radius, slab depth, motion
src/theme/ThemeProvider    publishes the active palette as CSS variables
tailwind.config.js         maps roles to utilities (bg-surface, text-muted, …)
src/ui/cn.ts               class composition where later utilities win
src/ui/Squish.tsx          the press mechanic every raised control shares
src/ui/*.tsx               the components
```

`app/gallery.tsx` renders every component in every state, in both modes, on a
real device. Nothing links to it: open `/gallery` directly.

### Conventions

**Import from `@/ui`**, never from a file inside it. The barrel is what lets a
component be split or renamed without touching every screen.

**`className` targets the outer box** (layout, flex, margins) because that is
what the parent measures. `contentClassName` targets the inner surface and is
rarely needed: appearance belongs to `variant` and `tone`.

**Everything that does something is felt.** Every press goes through
`Tappable`, which gives a light impact on press-in, and a long press a medium
one when it lands, even on a row that keeps its press-in quiet so a scroll over
it stays silent. That covers cards with an `onPress` and segmented controls,
which both used to opt out and left the groups list, the workout cards, the
Workouts tile on Today and every segmented choice dead in the hand. A `Wheel`
ticks once per row while it is being turned, as the platform's own do, and not
when it parks itself on a value. `haptics={false}` is for a scrim or a surface
that only swallows a press, and for a row that answers nothing but a long press.

**Everything interactive is controlled.** No component owns the value it
displays. That is what lets an optimistic update be rolled back when the server
rejects it.

**Every word is a required prop.** `src/ui` owns no copy, and the way that is
enforced is the type: a label a component draws is required rather than
defaulted. Nine of them used to have English defaults — `cancelLabel = 'Keep'`,
`centerCaption = 'kcal left'`, `placeholder = 'Select'` — and twelve call sites
relied on one, which shipped an English "Keep" under a Chinese question. A
default is a word the design system has no business having; a missing label is
now a compile error. `ConfirmSheet` passes its own `cancelLabel` down as the
sheet's `closeLabel` rather than asking for a third, because the drag handle
does what the neutral button does.

**Never write a colour literal.** Use a role (`bg-pandan`, `text-muted`). Roles
resolve per mode automatically; a hex does not. For Skia, charts and other
imperative surfaces, read `useThemeColors()`.

**A number is typed on the app's own pad.** Any `keyboardType` that means a
number opens `Numpad` instead of the system keyboard, and `TextField` arranges
that for you. A bare `TextInput` asks for it with `useNumpadField`, whose result
is spread onto the input **last**: it composes `onFocus` and `onBlur` with the
ones you passed in, and the composed pair has to be the one that reaches the
field.

**A field can carry an action on its label's line.** `labelAction` puts one at
the right edge, level with the label ("Forgot your password?" over the password
box). It is for the action that belongs *to* a field rather than one that comes
after it, which under the field would compete with the primary button.

**A secure field draws its own placeholder.** `TextField` does it whenever
`secureTextEntry` is set and the value is empty, because iOS restyles the native
placeholder of an AutoFill target and there is no prop that stops it.

### iPhone Duo: the side column and two panes

Every layout decision that depends on the shape of the device is made in
`src/ui/adaptive.ts`, and nowhere else. Every iPhone but one gets the answer it
always got: the floating tab bar along the bottom and one column. The exception
is iPhone Duo, Apple's foldable, recognised by the space iOS gives the app and
never by its model name.

| Pose | Window (pt) | What iOS reserves | Tab bar | Panes |
|---|---|---|---|---|
| Closed (outer display) | 466 × 678 | 84pt column on the right | rail in that column | one |
| Open on its side, flat or book | 951 × 669 | 84pt column on the right | rail in that column | two, meeting at the fold |
| Open and upright | 669 × 951 | nothing at the sides | bottom | one |
| Any iPhone, an iPad, Android | | nothing at the sides | bottom | one |

- **The side column** is the clock and the camera's, and Apple's own tab bars
  stand in it. `NavBar` turns into a vertical rail there (`NavRail`), same items,
  same order. `Screen` keeps every page inside the side insets, which are zero on
  every other phone, so the camera never covers a header action.
- **Two panes.** A screen wraps the part that can stand beside the rest in
  `<Aside>`. On a phone the marker renders its children where they stand, so the
  phone layout is the code as written. With room for two (content 760pt or
  wider), `Screen` moves the marked parts into a second pane that scrolls on its
  own. The panes meet at the window's centre, which is the fold, so nothing
  tappable sits in the crease. A `footer` CTA stands under the second pane, with
  the content it acts on. The tabs use it: Today (summary | diary, or month |
  the chosen day's diary), Trends (figures | reviews and history), Me (account |
  settings), Feed (Following | Discover) and Groups (list | open board). So do
  the pushed pages with more than one card, reflowed into two phone-width
  columns: the paywall (what Pro adds | plans over Subscribe), the meal page
  (picture and portion | nutrition), the settings pages and the workout pages.
  A page that is one card or one list keeps one pane.
- **Overlays** (sheets, dialogs, toasts, the running workout's bar) take
  `useOverlayInsets()`: clear of the column, and in the trailing pane when there
  are two, even over a one-pane page, because centred they would rest in the
  fold. The number pad spans the page, or the sheet it types into.
- **Anything sized by arithmetic** rather than flex (a pager, a grid of tiles)
  reads `usePaneWidth()`, not the window. A pager keyed to its width must also
  survive the width changing under it: opening the device kept the closed
  display's offset and showed a week two weeks back (`WeekPicker`, the board).

Rules: an `Aside` counts only among `Screen`'s own children (fragments and
arrays are looked through, components are not), so a page whose body is a
component splits that component in two. Fields work in either pane; the number
pad scrolls whichever one holds the field. React Native gets no hinge or fold
signal, so nothing here moves when the device is half-folded: the pane split is
what keeps controls off the crease. The Duo simulator is iOS 27.1 only, and
Argent's `fold` tool moves its hinge.

**None of this reaches users unless the store build is linked against the iOS
27.1 SDK.** iOS decides what an app supports from the SDK it was built with, and
a binary from an older one runs in compatibility mode on the open Duo: a
phone-sized window centred on the display, with no side column or panes. That is
why the iOS deploy in `.github/workflows/deploy.yml` runs on GitHub's `xcode-27`
image with Xcode 27.1 pinned; every `macos-*` image stops at Xcode 26. A local
Xcode 27.1 build looks right on the simulator either way, so check which Xcode
CI used before blaming the layout.

### Icons

593 illustrated icons across six sets (`ui`, `system`, `body`, `food`, `dishes`,
`scenes`) in `assets/icons`, with a generated require map in
`icons.generated.ts`.

`scenes` is the odd one out and is nine drawings rather than a library: a desk,
sneakers, an apron, a dumbbell, a ring, capsules, a plate, an alarm clock and a
phone. They are whole little scenes rather than single objects, cut from one
sheet, and they exist for onboarding, where a screen has room for a picture that
says what a question is about. Eight of them are placed there; `capsules` is not
used yet and is kept because the set was drawn as a set.

```tsx
<Icon set="dishes" name="nasi-lemak" size={44} />
```

`set` narrows `name`, so a typo is a type error rather than a blank square. They
are full-colour illustrations and are not tinted by default; `tintColor` exists
for the few places that need a monochrome treatment.

**The app icon files at the top of `assets/` are not part of this.**
`app-icon-source` is the transparent master. `generate-app-icons.py` turns it
into `icon`, `icon-dark`, `icon-tinted`, `favicon`, the two `android-icon-*`
layers and `splash-icon`, which feed the native pipelines through `app.json`.
Preview framing with `python3 scripts/generate-app-icons.py --preview <file>`;
regenerate the chosen balanced framing with
`python3 scripts/generate-app-icons.py --write balanced`. `sync-icons.mjs`
never touches these files. Store them losslessly: do not quantise them to match
the icon set. It turns softly shaded artwork into palette PNGs and can make the
output larger.

To re-import them after the source set changes: `node scripts/sync-icons.mjs`.
That script downscales and quantises (38 MB → 8.4 MB) and needs the design system
checked out at `.secrets/RiceCal Design System`. The processed PNGs are
committed, so CI and EAS never run it.

**Adding one is three steps, and the third is the one people forget.** Slice the
sheet (`slice-icon-sheet.py`, or `sync-icons.mjs` for a single file), then
`sync-icons.mjs --registry-only`, then a phrase in
`functions/_shared/icon-match.ts` pointing at it. An icon nothing points at is a
file nothing draws. The third step is only for `dishes` and `food`, which are
the two sets a model is allowed to pick from; an icon a screen names directly
needs the first two.

**A sheet with drop shadows needs `slice-icon-sheet.py --shadows`.** The default
fill spreads through whatever is within a tolerance of the background colour,
and a shadow is not a colour that can be given one — on the `scenes` sheet the
shadow under the plate is darker than the rice beside it. The flag fills by
continuity instead: a shadow fades smoothly out to paper, so a fill that may
only step a little at a time follows it out and cannot cross an edge to get back
in.

Naming follows the set already in `assets/icons`: kebab-case, with `dishes` for
prepared Malaysian and regional food and `food` for ingredients, packaged goods
and drinks.

**Coverage is 73.5%**, 35,259 of 47,940 catalogue rows, after a round of 100
icons in August 2026 took it from 61.1%. The 12,681 rows with no drawing mostly
never will have one: they are brands, flavours and pack sizes that no
illustration answers. "Kellogg's Corn Flakes Original 500g" is a name, not a
food.

What is left worth drawing is a long tail rather than another hundred. The
biggest remaining clusters are protein drinks, cooking oils, squash and
cordials, and cheeses by variety, each worth tens of rows rather than hundreds.
Size the next round by what a person would actually notice missing rather than by
what closes the most rows.

### Adding a colour role

1. Add it to **both** maps in `src/theme/tokens.ts`.
2. `pnpm theme:gen` to refresh the `:root` fallback in `global.css`.
3. Map it in `tailwind.config.js`.

`src/theme/__tests__/tokens.test.ts` fails if any of the three drift.

---

## Deploying

### Deploy the schema first, then the code that reads it

**Always.** The chain is:

```
D1 schema  →  the Worker  →  the Supabase edge functions  →  the app
```

Each arrow means "is read by", and it has to be extended from the end nothing is
pointing at yet. Deployed in that order, every intermediate state has something
existing that nobody asks for, which is invisible. Deployed against it, every
intermediate state has something asked for that does not exist, which is an error
on a live request.

- A **column** added before the Worker that selects it is simply unread. A Worker
  deployed first answers *every* request with a D1 error, including requests that
  have nothing to do with the new column.
- A **field** the Worker starts returning before the edge functions read it is
  ignored. The other way round, `undefined` reaches the cascade and a scan
  silently prices a meal off a missing number.
- The same again for the app: a shape the server has not started returning yet is
  a crash on a screen somebody is already looking at.

CI does the first arrow: `cloudflare.yml` runs the schema job before the deploy
job and stops if it fails. The Supabase half happens on merge as well, through
the Supabase GitHub integration rather than a workflow in this repo: production's
default branch tracks git `main`, so a merge applies new migrations and then
redeploys every edge function, within a minute or so. The app ships through EAS
from the same merge, and a store build takes far longer than that, so in practice
the order holds. `supabase functions deploy` is for a hotfix between merges. Make
every step backwards compatible so the window is survivable rather than merely
short.

**Removing runs backwards**: stop reading it everywhere, ship that, then drop the
column. Now that the app is in a store, "ship that" means a release people have
actually taken, which is the next section.

### The store holds copies of the app you cannot recall

The app is live. Every binary that has shipped goes on calling this backend, and
nothing in the repo can stop it or fix it in place:

- `runtimeVersion` is the `appVersion` policy, so an `eas update` only reaches
  phones running the same `version` in `app.json`. A user still on 1.0.0 cannot
  be patched over the air. They get the fix when they update from the store, if
  they ever do.
- Nothing checks who is asking. There is no minimum-version gate, no version
  header, no kill switch, so the server cannot refuse an old client or tell it
  to go and update.

The Worker's routes, the edge functions' request and response shapes, and the
tables both of them share are therefore a contract with clients that have already
shipped. Deploy order, above, makes the gap between two of our own deploys
survivable. This is the other half of it: the client on the far side may never
move at all, and "the app was changed to match" is not a fix for the person who
has not taken that app.

**A backend change is additive, or it is a bug.** Concretely, on Supabase and on
Cloudflare both:

- **Add a key, never repurpose one.** Changing what an existing field *means*
  passes every typecheck here and is wrong on every phone that has not updated.
- **Keep returning what the old app reads**, long after nothing new reads it. A
  response the client destructures is part of the contract even when the value is
  now ignored.
- **New inputs are optional, or the server fills them in.** An edge function that
  starts requiring a field 400s the release that shipped before it, and a scan
  that 400s reads as a broken pipeline rather than as a version skew.
- **Do not narrow what an old client may send**: an enum, a status string, a
  validated range, an RLS policy, a check constraint. Widening is safe; narrowing
  rejects traffic that is already in the wild.
- **A new column the app writes to needs a default**, or `not null` turns every
  insert from an old binary into an error. `food_logs`, `daily_goals`,
  `weight_logs`, `activity_days`, `activity_hours`, `health_connections`,
  `recipes`, `user_settings` and the rest are written through PostgREST
  directly, with no function in between to paper over a change.
- **Renaming is deleting.** A renamed route, edge function or column is gone as
  far as a shipped binary is concerned, whatever the new name does.

**Removal runs backwards, on the store's clock.** Stop reading it in the app,
ship *that* through review, wait for the release to be adopted, and only then
drop the column or the route. The wait is adoption by users, which is weeks, not
the minute between two deploys.

When a change genuinely cannot be made compatible, the shape is a second thing
beside the first: a new route, a new field, a new function name, with the old one
still answering until the binaries that call it are gone. Say so in the PR rather
than deciding it quietly.

### Where each piece deploys

**Cloudflare production** is `.github/workflows/cloudflare.yml`. It runs on
nothing but changes under `apps/cloudflare`, and only on a merge to `main`:
schema first, then `wrangler deploy`. Every statement in a `schema.sql` is
`if not exists`, so re-applying it is a no-op.

**A pull request's Worker** is in `deploy.yml`, beside the app's own preview,
because a preview is only a preview if the JS and the catalogue behind it come
from one commit:

```
wrangler versions upload --preview-alias pr-42
```

A **version**, not a deployment and not a second Worker. It takes 0% of
production traffic, inherits every binding from `wrangler.jsonc`, and is
addressable at a stable `https://pr-42-ricecal-catalogue.<subdomain>.workers.dev`
for as long as the PR is open. No second script to keep in step, no duplicated
bindings, nothing to tear down when the PR closes.

`deploy.yml`'s push trigger ignores `apps/cloudflare` in return, so a Worker
change cannot archive and submit a new binary for a change the app never sees.
The trade is that the two filters have to stay opposites.

**Everything shares one D1 database**, including PR versions. There is one copy
of the catalogue, it is 257 MB, and callers cannot submit arbitrary writes over
HTTP. `/public/search` performs one internal increment of the aggregate search
counter, while the existing service routes remain the only caller-directed
write path. A preview pointed at a stub would prove nothing about a change to
how 3.2 million packets are queried. What makes that safe is the route policy
rather than the database.

The one thing this costs: **the schema is applied on merge only.** A PR's version
reads the database production is serving, so a migration in that PR is not in
effect while it is being previewed.

### The catalogue hostname

One: `https://catalogue.ricecal.app`.

It is a **route** in `wrangler.jsonc`, not a custom domain. The difference is
which credential can create it: a custom domain writes the zone's DNS itself and
so needs a token holding both DNS edit and Workers edit, where a route needs only
Workers edit and sits on a DNS record made separately. That record is a proxied
`AAAA` to the discard prefix `100::`. Nothing is listening there and nothing
needs to be, because the route answers the request before an origin is chosen. If
the hostname ever starts returning a Cloudflare error page rather than this
Worker's JSON, that record being unproxied is the first thing to check.

**`preview_urls` has to stay, and has to stay explicit**, because it defaults to
whatever `workers_dev` is. Turning one off silently takes the other with it, and
preview URLs are what `versions upload --preview-alias pr-N` hands to a PR's
`eas update`. Wrangler mentions that default only in a warning printed *after*
the upload has landed, which is how both halves were learnt.

**The token needs Workers Routes edit on the zone, and the failure names
neither.** A route is applied at deploy time like any other trigger, so an
account-scoped Workers Scripts token uploads the script happily and then fails on
the trigger with a bare "a request to `/zones/<id>/workers/routes` failed", after
the upload, so the Worker is live and the deploy is red. The fix is
Zone → Workers Routes → Edit on `ricecal.app`. Zone *read* is not enough and is
what makes this confusing: wrangler resolves the zone name to an id, so it gets
far enough to look as though the permission is there.

### Pointing a bundle at a PR's Worker

`EXPO_PUBLIC_CATALOGUE_URL` is inlined into the JS bundle by Babel at export
time, so a PR preview reaches its own Worker only if that value is right at the
moment `eas update` exports.

**The obvious way does not work, and fails quietly.** Setting the variable in the
workflow step's `env:` while the update command carries
`--environment development` gets you the production URL: EAS downloads that
environment and **assigns** it over the process, overwriting the export. Nothing
errors; the preview simply talks to production.

So the workflow pulls the environment to a file and rewrites one line of it:

```bash
eas env:pull development                                   # writes .env.local
sed -i "s|^EXPO_PUBLIC_CATALOGUE_URL=.*|...=$WORKER_URL|" .env.local
eas update --branch pr-42                                  # no --environment
```

One source for the export to read, and no precedence left to get wrong.

### Adding a second Worker or database

A **Worker** is a directory under `workers/` with a `package.json` (needs a
`typecheck` script) and a `wrangler.jsonc`. The CI matrix for typecheck and the
production deploy is discovered from the filesystem, so there is no workflow to
edit.

It gets no PR preview of its own, deliberately. The preview exists to point an
app bundle somewhere, and `catalogue` is the one Worker the app talks to. A
second Worker wanting one would need a second `EXPO_PUBLIC_*` to point at it.

A **database** is a directory under `d1/` holding `schema.sql` and a `d1.json`
naming it. The schema job iterates the directory, so that is the whole change.
The name lives in `d1.json` rather than being derived from the folder so the
folder can read as English while what is sent to Cloudflare stays literal.

### By hand

```bash
cd apps/cloudflare/workers/catalogue
pnpm exec wrangler deploy                              # production, 100% traffic
pnpm exec wrangler versions upload --preview-alias me  # 0%, at me-<worker>.workers.dev
pnpm exec wrangler d1 execute ricecal-d1-food-catalogue --remote \
  --file ../../d1/food-catalogue/schema.sql
```

---

## Testing

`pnpm check` is typecheck + jest + biome across the workspace, and CI runs it on
every push.

Two more workflows guard the database. `supabase-migrations` rebuilds a throwaway
Postgres from every migration, runs the pgTAP suite in `apps/supabase/tests`, and
deno-checks each edge function.

`supabase-drift` diffs the **deployed** schema against the committed migrations
nightly. It exists because there is no hosted toggle to make the dashboard
read-only: anything applied through the SQL editor, or through the Supabase MCP
server, bypasses migrations entirely, and this job is the only thing that
notices. A migration applied that way needs its file committed at the *same*
version, or the job goes red on a change that is genuinely in the repo.

### pgTAP

`apps/supabase/tests/*.test.sql`, run with `pnpm db:test`. Each file is one
transaction that is rolled back, including `create extension pgtap`, so running
the suite leaves nothing behind and pgTAP never reaches production.

Social fixtures block existing local profiles for their temporary readers.
Fixture setup reads `profiles` directly: the legacy `social_profiles` view needs
an authenticated user claim and cannot enumerate accounts before that claim is
set. Without isolation, simulator profiles fill the limited suggestion pages
and their posts interfere with pagination expectations.

`02_rls.test.sql` is the one that matters. It runs as the `authenticated` role
with a forged `request.jwt.claims`, which is what PostgREST does on every
request. Running RLS tests as `postgres` proves nothing: the table owner bypasses
RLS and every query passes.

### The catalogue

Not in Postgres, so pgTAP says nothing about it. `pnpm foods:gate` is what guards
it: thirty queries and, for each, the dish somebody typing it is after, read from
`search-gate.cases.json`.

There were two of these for a while, one grading Postgres and one grading the
Worker off the same file, which is what made the move answerable rather than
hopeful: D1 scored 28/30 top-1 against Postgres's 26/30 on identical work.

### The model paths

Three harnesses, and they answer different questions.

| | what it drives | what it grades |
|---|---|---|
| `pnpm eval:prompts` | the prompt alone, imported | the shape of one answer: which action, how many components, whether the band brackets something sane |
| `pnpm eval:scan` | the deployed functions, photographs and all | the row that lands in the diary. 27 cases, with the cascade's `debug: true` trace on every call |
| `pnpm eval:recipe` | the deployed recipe reader | the arithmetic, and the writing (one action a step, imperative, a doneness cue) |

`eval:prompts` says nothing about the upload, the catalogue search, the verifier,
the ratio gate or the portion sizing, and most of what goes wrong with a scan
goes wrong in exactly those. It imports the prompts rather than copying them: a
harness with its own copy grades a prompt nobody ships.

The two that drive deployed functions need a session, which is why
`.secrets/eval.json` holds a password for a throwaway account rather than a
token. Setting that password revokes every refresh token the account holds, so a
simulator signed in as it lands back on the welcome screen.

**Use `--repeat` whenever you change something.** One pass over these cases is not
a measurement. The same sentence resolved to tier 1 at 657 kcal, tier 4 at 525
and tier 3 at 821 on three consecutive runs of identical code, which is wide
enough to credit a prompt change with an improvement it did not make.

---

## Rules you must not break

Break these and the feature is wrong in ways tests may not catch.

**An entry with a breakdown IS its breakdown.** `food_log_details` coalesces
three sources in order: what the user typed (`override_*`), what the parts add up
to times `plate_quantity` (how much of the plate was eaten, read only when there
are parts), what the dish costs at this portion. `lib/nutrition.ts`'s
`entryTotals` is the client's copy of that same rule, and they must agree down to
the rounding: the client rounds a true half up with `roundHalfUp`, as Postgres
does, because scaling a sum by a portion lands on halves all the time and a plain
`Math.round` put the screen a calorie below the day. Scaling one parent row
moves all four macros in lockstep, which is why editing an ingredient once
changed only the calories.

**An entry states its own numbers, and `food_id` is only a note about where they
came from.** It is nullable and unconstrained, and null is ordinary: a tier-4
estimate, a plate rebuilt from its own parts and a part somebody added by hand
are none of them catalogue rows. Anything that needs to exclude guesses filters on
`food_id is not null`. `serving_id` is text, not a uuid: D1 keys a portion
`(food_id, slug)` and the Worker names one `"<food id>:<slug>"`.

So **a screen editing a saved entry prices it from the entry, never from the
catalogue.** `app/log/food/[id].tsx` fetches the food anyway, but only for the
portions it can offer (`withCataloguePortions`, which declines a list that
disagrees with the entry about the size the entry is already at). Letting the
catalogue win showed a soy milk logged at 108 kcal off its own nutrition panel as
511, priced from an unrelated row while wearing the entry's own name and
photograph, with Today still showing 108.

**Changing a portion writes three columns, not one.** `serving_label` and
`serving_factor` are what the day counts; `serving_id` is a soft note that
nothing in Postgres can resolve. Writing the id alone changes what a row *claims*
its portion is and nothing about its arithmetic: switching a nasi lemak to Large
previewed 975 kcal, saved, and left a row labelled "1 serving" still counting
650. `snapshotColumns` writes all three on insert; `EntryPatch` carries all three
on update.

**`item_icon_*` moves with `item_name` wherever the food changes.** They are the
food's name and the food's drawing, and a write that rewrites one and leaves the
other puts a picture of the corrected-away dish under the new dish's name. Two
writers change the food: `writeEntry` and `scan-refine`'s redescribe, both
through `dishIcon`. `scan-refine`'s **adjust** is the deliberate exception, and
the reason is what separates the two branches: an adjust is the same plate
re-priced ("no sambal"), so its drawing is still the drawing of what is on it,
where a redescribe is a different food. `food_logs.icon_set` is a different
column answering a different question (the user's own picture of this plate) and
is left alone by all three.

**An LLM figure is never averaged with a catalogue figure**, and the nutrition
call is never told the vision call's guess. Anchored, the model answered 450 kcal
for a plate of apple slices, and 120 without.

**A scan that failed says so, and writes nothing.** There is no floor under the
cascade and there must not be one again. A guessed row is indistinguishable, on
the day and in every total built from it, from a row the app actually worked out
— so the failure the floor was hiding surfaced as real meals logged at 600 kcal
under the model's own labels for them. `resolveItem` returns null, `scan-meal`
answers `ok: false`, and the pending row on Today becomes "could not read this
one" with a way to log it by hand. The same rule downstream: `scan-refine`
declines rather than replacing a real entry with something generic.

**Every model call sends `reasoning: { enabled: false }`.** Reasoning tokens
come out of `max_tokens`, and a model that thinks past the ceiling answers
`finish_reason: length` with an empty body — which is a failure with no error
message in it, and every caller in `llm.ts` has somewhere quiet to put one. This
has been removed twice; see [Edge functions own the
model](#edge-functions-own-the-model).

**`StoreReview.requestReview()` is called from one place, on one branch.** It
lives behind "I like it" in `lib/rating/prompt.ts` and nowhere else. The OS
allows about three dialogs a year per device, counts them itself, and tells the
app nothing when it draws none, so a second call site cannot be tested into
existence and cannot be noticed once it ships. See
[Asking for a rating](#asking-for-a-rating).

**A breakdown must account for the meal.** The parts and the calorie band are two
answers from the same model to the same question, and when they contradict each
other the *list* is the one that is wrong, because the band is about the meal and
the list is about whatever the model chose to enumerate. A basket of wings came
back as celery and a pot of dip, and since the entry is priced from the parts, a
meal the model itself bounded at 780-900 kcal was logged at 160. A breakdown far
outside its own band is dropped, not repaired.

**The band is also what says whether the counts have been applied**, and that is
a comparison and not a tolerance. A component states what ONE of it costs and
`count` says how many, so two readings of the same answer exist: `sum(kcal x
count)` and `sum(kcal)`. `unfoldCounts` divides the counts back out when the
second lands in the band and the first does not, and does nothing when the first
lands in it (the parts really do multiply) or when neither does (the band cannot
referee anything). Measured against a fixed ceiling instead, it could not see the
case it exists for: a Filet-O-Fish with three nuggets read per unit at 830 and as
stated at 530 against the model's own 500-560 band, the ceiling was 1.8x the top
of that band, and 830 slipped under 1008. The meal was logged at 889.

**A helping is capped and a measurement is converted.** They are different
questions and `namesAPortion` is what tells them apart. Nobody is served eleven
of a helping, so `clampQuantity` stops at three; a unit of measure has no such
ceiling, because the multiple is arithmetic and "100 g" of a dish against a
450 g plate is 4.5 servings whatever either party thinks it costs. Applying the
helping cap to a measurement is what turned a photographed latte into "Coffee,
Iced Latte x3" at 24 kcal, for a drink holding about 180: the row was published
per fluid ounce, the conversion was 11.7, and three was as far as the clamp
could count. Nothing downstream could see it, because the number was too small
to trip a calorie gate and the only strange thing on screen was a portion count.
The components tier already asked this question before capping a weight;
`measuredQuantity` is the dish tier asking it. The bound is still a bound at
twenty, since the numerator is the model's guess at a weight.

**A catalogue row that names one whole article already knows what it weighs.**
A helping varies with who served it, so `boundGramsToServing` lets the model's
weight run to half again the row's. An article does not vary: a Filet-O-Fish is
142 g because that is what one is. Priced by weight against a photograph guessed
at 180 g, the catalogue's own 330 kcal row charged 418 for it. `namesOneArticle`
holds the short list of words that mean one whole thing (burger, sandwich, can,
bar), and `piece`, `slice` and `fillet` are deliberately not on it: they are
countable but their size is whatever was cut. The dish tier never had this bug,
because `SAME_PORTION_LOW`/`HIGH` already let a row stand when the two weights
are within 0.7-1.4 of each other.

**Every way into the questions starts at the head of `ONBOARDING_STEPS`.** The
flow is a chain rather than a menu: `setup` collects the units the screen after
it is typed in, and `isComplete` — the check `finish` makes before the one write
— wants every answer the chain collects. `index.tsx` sent a signed-in account
with no draft to `about` instead, which was the first question until the language
and units screen went in front of it. Nothing then asked for `units`, so `finish`
refused to write and sent them back to `about`, which asked for everything except
the missing answer. Signing in through "I already have an account" and creating
the account there, which is what a social login does, meant onboarding could not
be finished at all. Both redirects name `ONBOARDING_STEPS[0]` now, and the tests
either side of the loop assert that rather than a path.

**A signup form never says an address is taken.** Supabase will not, because that
turns the form into an oracle for who uses this app.

**A wrong code and an expired one are one error.** Both come back 403
`otp_expired`, so there is one `code_invalid` reason and its copy covers both.

**A recovery code creates the session, so choosing a new password is one screen.**
`(auth)/_layout` redirects the moment a session appears, which is right for every
other way into that stack and wrong for this one. The layout exempts
`new-password` by name.

**Deleting an account sweeps the objects BEFORE it deletes the row.** The keys
are derived from the user id (`meals/<id>/`, `avatars/<id>/`), so the id is the
only thing that knows where the photographs are. Delete the account first and a
sweep that fails leaves every one of them in the bucket with nothing left in the
system that could ever name them. The other order is safe in both directions: a
failure deletes nothing at all, and a retry finishes what the last attempt
started. This is the opposite of the retention sweep's order, which deletes the
object first because there the ROW is the only record of the key.

**A screen that can start a purchase carries its own small print.** Price,
period, renewal, and the two links — `PurchaseTerms`. Guideline 3.1.2, and the
trap is that the screens that sell are not only the ones called "paywall": the
trial-ended screen bought a year off one button that named no figure.

**A permission screen leads to the permission.** Guideline 5.1.1(iv): a message
shown before a system sheet may not offer a way past it, and its button may not
be worded as the ask ("Connect Apple Health", "Enable notifications"). One
button, "Continue", and the answer is the system's own dialog. This app has been
rejected for both halves. There are three such screens — the two onboarding
steps and `ConnectPanel` — and a fourth would have to obey the same rule.

**The captcha fails open on the client and closed on the server.** Failing closed
in the app adds no protection the gate is not already providing, and does add a
way for a broken WebView to lock somebody out. The consequence is an ordering
rule: `security_captcha_enabled` must not be turned on until a build carrying the
site key is what people are running.

**A client may read the catalogue as itself, and may never write it.** The app
carries the user's own Supabase JWT and the Worker verifies it against a public
key. Nothing but our own server, holding the shared secret, reaches `/product`.
See `apps/cloudflare/workers/catalogue/src/auth.ts` for what a token has to
survive, including `alg` being pinned to ES256, without which `alg: none` and an
HMAC over the public key are both accepted forgeries.

**A barcode is a GTIN-14, at both ends.** Normalized where it is stored and where
it is asked for. The check digit is not validated, on purpose.

**D1 takes at most 100 bound parameters in a statement.** The candidate list in
`search` is bound one id per parameter, so it is capped at that. Uncapped it
over-fetched `limit * 4` and every search above `limit` 25 failed, which the edge
function turned into an empty result and the app drew as "No dish by that name".
It looked perfect at the small limits it was tested with.

**An unreachable catalogue is not an empty one.** `data/catalogue.ts` throws for
anything that is not a clean answer, so react-query reaches its error state.
Answering `[]` for a Worker that is down tells somebody their dish does not
exist. The scan cascade keeps the same line: a search that got no answer is
never written to `food_scan_misses`, which is the list of dishes the catalogue
lacks. Before that, one bad minute put "spaghetti", "shrimp" and "steamed white
rice" on it.

**Anything a user can read that another user wrote needs a report and a block.**
Guideline 1.2, and the community shelf is the only such surface here. Both are
RLS rather than a query filter, so nothing that reads `recipes` has to remember
them. See [Reporting a recipe](#reporting-a-recipe-and-blocking-its-cook).

**A recipe reaches the community only when a reviewer says so.** `is_public` and
`review_status` are outside the client's column grant, and the community query
requires `approved`. Every failure in the review leaves the row `pending`, which
is invisible.

**Adjust the amount, never the macros**, when a row is the right dish at the
wrong size.

**The gap between the current and target weights IS the calorie plan.** Its sign
says lose or gain, its size says how hard, and equal says neither. There was a
`weight_goal` enum with its own onboarding screen, and it could only agree with
those two numbers or disagree with them; disagreeing, it forced the formula to
pick which of the user's own answers to ignore.

**Every input to `compute_targets` is on the recompute trigger's column list.**
`profiles_sync_daily_goals` is `after update of <columns>`, so a column the
formula reads and the trigger does not name is one whose edits are silently
ignored.

**A hand-set budget is one the user actually set.** `daily_goals.is_custom` stops
the recompute permanently, so writing it for a save that merely passed through
the goals screen freezes a user's target for good. It is set when the numbers
differ from what the formula asks for, and not before — which is why "Use
recommended" fills the fields with the formula's answer rather than remembering
that they were touched, and why editing the target weight clears them outright.

The corollary is easy to miss: the blur that settles a field into range must stay
SILENT when the box already says what it means. Reported on every focus and blur,
it froze the budget of anybody who tapped a field and tapped out again — and an
account whose stored macros predate the adjusted protein basis opens this screen
with figures that differ from the recommendation, so it was one tap away from
permanent for most of them.

**All four targets are edited, and they are independent.** Calories, carbs,
protein and fat are four boxes on the goals screen and on the onboarding target
step, and nothing re-splits one when another moves. The alternative — re-deriving
the macros whenever the calorie total changes — silently overwrites a protein
target somebody set on purpose, and the four rings and bars around the app have
always been drawn against four independent numbers anyway. When the grams stop
adding up to the calorie figure the card says what they add up to; it reports the
difference rather than correcting a number the user just typed. The recommended
calorie total is the calorie box's own placeholder rather than a line under it,
which was printing the figure the box already held on every budget nobody had
touched.

**Onboarding's copy of the budget is written after the weigh-in.** The questions
come before the account, so an edited budget rides in the MMKV draft and
`useFinishOnboarding` upserts it as the last write. It has to be last: the
weigh-in is what fires the recompute trigger, and a custom row written before it
is overwritten by the trigger's own `on conflict do update`, which only skips
rows already flagged.

**A weigh-in the user typed is never overwritten by a synced one.**
`provider is null` means "typed", and `sync_weight_readings` refuses to update a
row that says so. It is a function rather than an `.upsert()` because that rule
is a `WHERE` on the `ON CONFLICT DO UPDATE` and PostgREST cannot express one.

The corollary lives on the client: `useLogWeight` writes `provider: null`
explicitly, because PostgREST updates only the columns a payload names, so
omitting it would leave a corrected weigh-in still marked as the scale's, and the
next foreground would put the scale's number back. The user would watch their own
correction undo itself and blame the text field.

**A synced weigh-in moves the calorie budget, and that is the point.** A scale
can change somebody's target with the app closed. Two consequences: anything that
writes weight has to invalidate `keys.goals` as well as `keys.weighIns`, and a
reading a health store rejects must be dropped rather than raised, because this
runs inside the same pass that writes activity.

**Burned calories extend the budget; they never shrink what was eaten.** The
arithmetic is `goal + active - eaten`, written as an addition on screen. Every
app in this category has at some point shipped the subtraction, and it turns a
diary into a scoreboard people play by eating less.

**Only active energy reaches the budget.** The goal is already Mifflin-St Jeor
with an activity multiplier, so adding the store's resting figure would credit a
user about 1,500 kcal for being alive twice.

**Null is not zero in `activity_days`.** Health Connect has no stand hours at
all, and a store reports only what its writers wrote; a confident zero there is a
claim about the user rather than about the provider. This is harder than it reads
on Android, because the aggregate API cannot say "nobody wrote this": the native
bridge coalesces a missing metric to `0.0`. `dataOrigins` on the result is the
only thing that tells the two apart, and believing the zero once filed a Samsung
user's entire daily burn as resting for a week.

**On Android, one app answers for a measurement, not all of them.** Health
Connect dedupes Activity by a priority list the user owns and can empty, so a
plain aggregate can return the same walk twice from two sources: read as 4,675
steps against the 2,808 Samsung Health showed the same user. The provider picks
one origin and re-reads with `dataOriginFilter`.

**A read that came back empty never writes a null over a stored reading.** The
rolling window re-reads the same seven days on every foreground, so a provider
that stops being able to answer erases history rather than merely failing. It
happened to heart rate: a fortnight of basketball and badminton lost its
averages, maxima and zone charts a day at a time, and no screen said why.
`sessionBatches` in `health-sync.ts` is where that rule lives: a session with no
reading carries no heart columns at all, so the upsert never names them and the
last good reading stays. Rows then go out one request per shape, because
PostgREST builds its column list from the payload and rejects a batch whose
objects disagree about their keys. A figure kept past its deletion is the
smaller wrong.

A figure the table's check would refuse is treated the same way. One request
carries every day, and one refused row failed it: a Health Connect account saved
no day for three weeks behind one day above 20,000 kcal, and an iPhone saved no
workout behind one longer than a day. `dayBatches` and `sessionBatches` leave an
impossible figure out of the row. A day or workout whose steps, duration or
energy is impossible is not sent at all, since a new row without them would
read a confident zero or be refused. Hours are a replacement, so an impossible
hour is not sent. The bounds are copied from `41_activity.sql` and must move
with it.

**A Nitro HybridObject's `name` is the name of its class.** `sourceRevision.source`
in `@kingstinct/react-native-healthkit` is one, so `source.name` type-checks,
compiles, and returns the string `"SourceProxy"` for every workout ever recorded.
Read a proxy through `toJSON()`. `device` beside it is a plain struct, which is
why the identical-looking line under it was right all along.

**A "no" from the mirror is checked with RevenueCat before it is believed.** Two
rules keep that from being a hole: it heals upward only, and the sandbox policy
applies to a reconcile exactly as it does to a webhook event.

**A paywall enforced only in the client is enforced only on people running the
client.** `useRequirePro` makes the buttons read honestly; `requireEntitlement`
in the edge functions is what stops the request, and it fails **shut**. The meter
fails the other way on purpose: a database blip while claiming budget lets the
request through uncounted, since telling somebody who has paid that they are cut
off is worse than losing a tally mark.

**The client asks two sources whether this account is Pro; the server asks one.**
The two can disagree for the seconds between a purchase settling and the webhook
landing, and that state has one correct answer on screen: say the purchase is
going through, never show a paywall.

**A plan is named from data or not named at all.** `profile:home.proActive` was
the literal string "Yearly plan, active" and was printed to every subscriber
there is, including everyone holding a promotional grant whose
`subscriptions.plan` is null by design. `usePlanSummary` returns null rather than
guessing, and a null plan means no plan name, no renewal price and "Manage in the
store".

**Nothing offers a plan switch during a trial.** A plan change out of a free
trial ends the trial and bills the new plan on the spot, so a switch offered to a
trial is a purchase wearing the clothes of plan admin. That is the store's rule
rather than this app's, and it is the store's page the switch opens. On
`settings/subscription` the switch was also the full-width footer button, one tap
from the same page as Cancel: two accounts on a Pro Yearly trial switched to
monthly, 37 seconds and 11 hours in, were charged RM19.90 and cancelled 99 and 43
seconds later, one of them asking Apple for the money back. Cancelling is the
footer now; switching is a ghost button under the plan card, and `canSwitch`
hides it while `plan.state === 'trial'`. Lifetime and a promotional grant keep
"Manage in the store" and are offered no cancellation, having nothing to cancel.

Both incidents were App Store, which is all the evidence there is: nothing here
was measured against Play, and Play's own answer depends on a replacement mode
nobody chooses from its subscriptions page. The rule does not need the
difference settled, since the app declines to offer the switch either way.

**Every hand-off to the store's own subscription page says what it was for.**
Cancelling, switching and plain management are one call apart in the app and the
same URL at the other end, and what opens is a list of the plans in the group
with the cancel action underneath: a tap on the wrong row is a charge with
nothing in the funnel behind it. `openManageSubscriptions` takes the intent
rather than defaulting one, and fires `Manage Subscription Opened` with it. It is
the last event before the app stops being able to see anything.

**An entitled status is not enough; the period has to be running too.**
`entitledBy` on the server and `isEntitledRow` on the client both read
`current_period_end`, and null means no expiry rather than an expired one:
lifetime renews never. Written on the status alone, every missed ending is
permanent instead of temporary. It does not replace the webhook and cannot, since
only RevenueCat knows a subscription ended early. It bounds the damage of never
hearing to the period that was actually paid for. The two copies cannot import
each other across the Deno / React Native line and have to be changed together.

**A suggestion is never written, and never becomes a row.** `suggest-meal`
writes nothing to `food_logs` or the catalogue. The app no longer asks for
suggestions, but released binaries do, and a guess about a meal nobody has eaten
is the last thing that should become a row other diaries are priced from.

**The quota counts scans, not requests to OpenRouter, and it is claimed once
before any of them.** Claimed afterwards, an account already at its ceiling would
still get to send the request that put it there.

**A scheduled job has no HTTP route.** Anything periodic is a Cron Trigger on
`apps/cloudflare/workers/jobs`, whose `scheduled()` handler is not addressable. A
job has no caller to authenticate, so the answer is to have no caller rather than
a better check. It follows that a job never gains a `fetch` handler to "make it
testable".

**The OpenRouter key never reaches the client**, and neither do the R2
credentials. A client that could name its own object key, or hold a key that does
not expire, is a client that can read someone else's plate.

**A plate is stored wider than it is shown.** The two readers of a photograph
want opposite things: the model judges a portion against what is around the food,
while the person wants back the picture they framed. So the viewfinder is already
a centre crop of what the shutter records, and every box that draws a stored
photo afterwards crops in by the same amount. One constant, `PHOTO_CROP` in
`lib/photo.ts`, because two of them is a diary framed differently from the
viewfinder that took it.

**A stored photo may be missing its last two bytes, and a model must never be
sent one as it is.** The app's base64 decoder (`decodeBase64` in
`data/photos.ts`) once subtracted the `=` padding after stripping it, so two iOS
photos in three were uploaded without the `FF D9` that ends a JPEG. Every image
viewer and Qwen shrug that off; Anthropic answers "Could not process image",
which sent half of all photo scans to the fallback on the day Haiku went live.
The decoder is fixed, but every binary already in a store keeps uploading
clipped photos and the bucket already holds them, so every path that reads a
photo for a model goes through `photoBase64` in `_shared/llm.ts`, which puts the
marker back (`completeJpeg`). A new path that reads a photo for a model uses it
too.

**An image column holds a key, never a URL.** That is what made a change of
storage provider a change of base URL rather than a migration over every row.

**The bucket is the authority on what a user has stored, not the rows.** A key
is minted before the row that will hold it exists, so an upload whose insert
failed is an object no column has ever named. Anything that has to account for
*everything* a user stored — account deletion is the one that does — lists the
prefix rather than selecting `photo_path`.

**A key names one object, for good.** `newKey` mints a UUID per upload and
nothing ever writes over an existing one. That is what lets the client cache the
picture under the key instead of under a signature that rotates hourly, and it is
what makes a correction invalidate itself. It has a price, and `clearImageCache`
is it: cached against a rotating URL those pictures aged off the device by
accident, and cached against a stable key they do not, so signing out has to say
so.

**The disk is asked before the network, and the disk copy is unkeyed.**
`resolveStoredImage` returns expo-image's own cache path when there is one. That
path *is* the cache entry, so `storedImageSource` hands it over with no
`cacheKey`.

**Nothing off the diary reaches RiceCal's product-event plan.**
`src/lib/analytics/events.ts` is the whole list of app decisions sent to PostHog
and GA4, and a call site cannot add to it without editing that file. GA4's
SDK-managed lifecycle events carry app and device context, not diary content.
`email` is the one PostHog-only exception, explained above. AI observability
(model-call text and answers, never photos) is a separate PostHog product; see
[AI observability](#ai-observability).

**No embeddings.**

---

## Traps

Things that will bite you.

### Database

**A trigger that fires inside the `auth.users` cascade runs as
`supabase_auth_admin`, which has no privileges in `public`.** GoTrue performs
the delete, so every `on delete cascade` and every trigger those deletes fire
happen under its role. `sync_daily_goals` is attached to `weight_logs` for
DELETE and its first statement reads `public.profiles`; invoker-rights, that was
`permission denied for table profiles`, which GoTrue reports as the wonderfully
unhelpful "Database error deleting user". The symptom is the shape to remember:
account deletion worked perfectly for an account with nothing in it and failed
for every account anyone had actually used. The fix is `security definer` (with
`set search_path = ''` and every name qualified, as ever), and
`tests/15_account_deletion.test.sql` asserts the property over every table the
cascade can reach rather than over the one function that had the bug.

**`supabase db diff` misses function grants.** Against the full local stack it
reports no changes for `revoke`/`grant` deltas; the CI `migrations` job catches
them. Five functions shipped executable by `PUBLIC` this way. After touching
grants, check that job or query `pg_proc.proacl` directly: a leading
`=X/postgres` means PUBLIC still has EXECUTE.

**A function's comments are part of its body, as far as the diff is concerned.**
Postgres stores `prosrc` exactly as written, so `db diff` compares the comment
text too. A migration that redefines a function with the prose trimmed declares a
function no migration produces, and the `migrations` job fails on a change that
is genuinely captured. When a hand-written migration has to restate a function,
copy the block out of `schemas/` verbatim. Only what is between the `$$` markers
counts; a note above the `create` is free.

**A join into a grouped view does not narrow the view.** `daily_nutrition`
groups `food_log_details` by user and day, and `left join daily_nutrition n on
n.user_id = p_user_id and n.log_date = c.at` filters the user inside the view
(a constant) but not the day (a join condition). So `day_marks`, the trend,
activity and review ranges each summed the user's whole diary and kept a week of
it: 49,000 buffers and 15 to 25 ms for three years of history, on the most
called function in the app. Each of them now repeats its range beside the join
(`and n.log_date between p_from and p_to`), which Postgres does push down, and
reads a few hundred buffers in about a millisecond. The bound has to come from
the arguments: one read from a CTE is a join condition again, and a `lateral`
subquery over the view is not pushed down either. The two named-range functions
take both the calendar and the bound from `private.range_start`, so they cannot
disagree. Anything new that joins `daily_nutrition` needs the same line, and
`08_reviews.test.sql` fails on a function body that joins it without one.

**A predicate has to match a partial or expression index exactly to use it.**
`record_social_photo_etags` matched `photo_path = key` while the only index on
it is limited to approved, unquarantined posts, and matched `avatar_path = key`
while the avatar index is on the `case` expression the social view returns. Both
updates read their whole table on every photo signature (7,500 buffers at
150,000 posts, 140 once each repeats the index's own predicate).

**`SELECT name FROM pg_timezone_names` near the top of the slow-query list is
PostgREST, and it is not ours to fix.** PostgREST runs it, at about 335 ms on
this project, each time it rebuilds its schema cache, along with three catalog
queries of 25 to 35 ms. Supabase's `pgrst_ddl_watch` event trigger asks for that
rebuild after any `CREATE TABLE` or `ALTER TABLE` outside `pg_temp`, and
Realtime's own maintenance makes one of each for every daily partition of
`realtime.messages`, every half hour or so. That was 191 rebuilds in two days
(October 2026) with no migration among them. The trigger belongs to
`supabase_admin` and `postgres` is not a superuser, so no migration can narrow
it. Turning the partitions off is not an option either: group chat broadcasts
from the database with `realtime.send`, which writes there. If it ever matters,
it goes to Supabase support, not into `schemas/`.

**The Supabase CLI's remote endpoints move.** On 2.111.0, `functions deploy` and
`gen types --project-id` both answer 404 when handed a project ref that does not
exist, which is indistinguishable from the endpoint being gone. Check the ref
against `apps/supabase/.temp/project-ref` before concluding the CLI is broken.
`pnpm db:apply` never has this problem, because it derives the ref from the app's
own `.env.local`.

**`supabase db push` and other networked CLI commands** block on an invisible
login prompt when `~/.supabase/` has no access token. The Supabase MCP tools work
regardless.

**A hosted Postgres does not fail a write when the disk fills. It stops accepting
them all.** Supabase puts a project over its plan's ceiling into read-only, and
the free plan's ceiling is 500 MB. This is what drove the catalogue out to D1:
loading three million packaged rows crossed it mid-statement, and the database
then refused every write including the `drop table` that would have freed the
space. The way out is `set default_transaction_read_only = off` on a session,
then drop whatever grew. The catalogue cannot do this again, but the diary shares
the ceiling.

### Edge functions

**Adding or renaming an edge function** needs a full stop and start of the local
stack; the running edge runtime does not pick it up.

**Edge functions are Deno and outside the pnpm workspace**, so the workspace
check does not see them. `deno check --no-lock --config <fn>/deno.json
<fn>/index.ts` is their typecheck, and CI runs it over every function.
`--no-lock` matters: a lockfile left in a function directory gets bundled and
triples the deployed script.

For real local AI testing, keep `OPENROUTER_API_KEY` in the gitignored
`apps/supabase/functions/.env` (owner read/write only). Supabase's secrets API
returns hashes, not recoverable values. Local auth and database keys must stay
local; only the AI provider credential is shared. Stop and start the local stack
after changing the env file, and leave `MOCK_AI` unset. The prompt suite can read
the same file with `deno run --env-file=apps/supabase/functions/.env -A
apps/supabase/scripts/eval-prompts.ts refine 3`. It grades Haiku, the model
every call asks first; `EVAL_ROUTE=fallback` grades Qwen, which answers whenever
Haiku fails, so a prompt change should pass both. The key in that file is a
separate OpenRouter key on the same account, so Haiku still runs on the
Anthropic key (BYOK). `pnpm eval:refine --repeat=3`
seeds its own local Pro account, checks persisted ingredients and totals, then
deletes the account. It refuses a hosted API URL.

**Mock AI** is on whenever `OPENROUTER_API_KEY` is unset (or `MOCK_AI=true`), so
a local stack scans with no config and production can never mock silently.
Requests may steer it via `body.mock`, honoured in mock mode only.

**The free tier applies to a local stack too, so the fourth scan of the day fails
there.** Both gates run before the mock-AI branch on purpose, and `handle_new_user`
creates a profile, settings and meal times but no `subscriptions` row. So a fresh
local account is a **free** account: three photographed plates a day work, and
describe, fix-by-typing and the recipe reader all answer 402 `not_entitled`,
which reads as a broken pipeline if you are not expecting it. One row fixes all
of it:

```sql
insert into public.subscriptions (user_id, status, plan)
values ('<your uuid>', 'active', 'yearly')
on conflict (user_id) do update set status = 'active';
```

Testing the other direction is the same row with `status = 'none'`, or no row at
all. `scan_usage` is where the day's count lives, and deleting the row is how you
get your three back without waiting for midnight.

The same applies to the account behind `.secrets/eval.json`: `pnpm eval:scan` and
`pnpm eval:recipe` drive the deployed functions, so that account needs a real
entitlement or every case fails identically at the first request. And it has a
ceiling too: Pro is fifty scans a day and `eval:scan` is 27 cases, so a second
`--repeat` in one day runs into it and the cases past 50 fail as 429s rather than
as bad answers.

### React Native

**`instanceof` against a platform class is a test about the runtime, not about
the value.** `refusalFrom` in `data/refusals.ts` read a refusal off a failed
`functions.invoke` by checking `error.context instanceof Response`, and that was
**always false** in the app: Expo ships its own fetch, so what hangs off a
`FunctionsHttpError` is a `FetchResponse` that does not subclass the global
`Response`.

Every 402 and 429 the server has ever sent was therefore read as an ordinary
failure and shown as "could not read this one", with no toast and no paywall. The
server was refusing correctly the whole time and the client was mistranslating
it, which is exactly the shape of "the paywall never opens".

It survived because the **test was green**: jest runs on Node, where `Response`
is the global, so the suite exercised a runtime the app does not have. Duck-type
what you actually need (a `status`, a `json`) and write at least one case with a
foreign response object in it.

**Expo Router orders a navigator's screens by the length of their route names**,
and a tab navigator goes "back" to whichever it decides is first. Left to itself,
`me` is two characters and sorts ahead of `today`, so the Android back button on
any tab went to the profile. `unstable_settings = { anchor: 'today' }` in
`(tabs)/_layout.tsx` pins it.

**`router.back()` is offered to every navigator in the focused chain**, so a back
with nothing left to pop is answered by the tabs underneath, and answering it
means changing tab. `canGoBack()` asks the same chain and says yes for the same
reason, which is why a fallback guarded by it never ran. `useBack` pops instead:
POP is a stack's action, and a dismissal that arrives twice finds nothing to pop
rather than taking a bite out of the screen behind.

**A ref is an instance type, not the component.** Since React Native 0.88 the
strict types are the default: `useRef<TextInput>` no longer has `focus`, and a
`useRef<View>` will not go on a `View`. Write `TextInputInstance`,
`ViewInstance` or `ScrollViewInstance` (all exported by `react-native`), and
`ListViewToken` where `ViewToken` was. A list's `ListHeaderComponent` and
friends take `undefined`, not `null`, for "nothing".

**Gesture handler 3 still runs the `Gesture.Pan()` builder API, deprecated.**
Every gesture in the app uses it (`grep -rn "Gesture\." src app` in
`apps/mobile`), and v3's `GestureDetector` accepts it alongside the new hook
gestures (`usePanGesture` and friends). Move them before the next major drops
it.

**NativeWind only styles React Native's own components.** A third-party one takes
`className` as an ordinary prop and drops it silently. `Screen.tsx` registers
`cssInterop` for gesture-handler's ScrollView for exactly this.

**Changing `tailwind.config.js` needs a Metro cache clear.** NativeWind caches
the compiled stylesheet, and a stale cache produces an app with *no styling at
all* rather than an error. `npx expo start --clear`.

**Dark mode is not `dark:` variants.** `ThemeProvider` swaps the whole palette
via `vars()`, so the same `bg-surface` means white or `#1A2220` depending on the
mode. A `.dark:root` block in `global.css` does nothing.

**Following the OS needs `userInterfaceStyle: "automatic"` in app.json.** Set to
`"light"`, iOS pins the whole app and `Appearance` reports light on a device in
dark mode.

**`flex-1` names an axis you cannot see.** In a row it shares the width; in a
column it takes the leftover *height* from a basis of nothing, and collapses when
that height is bounded, which is what a keyboard does to a card. Let the caller
ask for it rather than baking it into a component.

**A `TextInput` crops to its line box where `Text` does not.** Copying a text
variant's `leading-*` onto an input slices tall glyphs. Let the font choose its
line box and pin the row's height instead.

**Baloo 2 needs at least 1.36x line height.** A browser lets glyphs overflow
their line box; React Native clips them. The shared `Text` component enforces
the font-face floor for variants, class-based overrides and inline styles.

**An Expo patch range can pull in a module built against a newer core.**
`expo-store-review@57.0.2` swapped its own scene lookup for
`SceneGeometry.foregroundScene()`, a helper that first ships in
`expo-modules-core@57.0.11`. SDK 57.0.8 pins core to `~57.0.7`, so the EAS build
stopped at `cannot find 'SceneGeometry' in scope` while compiling somebody
else's Swift.

Nothing catches it: the peer range is `expo: *`, the SDK's own
`bundledNativeModules` asks for `~57.0.1`, and `~` lets 57.0.2 through.
`expo-store-review` is therefore pinned **exactly**, at the version the SDK
bundles (`58.0.2` on SDK 58). Anything that widens the range back to `~` lets
the next patch in ahead of the core it was built for. The SDK itself lists it
as `~58.0.2`, so `expo install --fix` on the next upgrade can write a `~` range;
check `package.json` afterwards and put the exact pin back by hand.

**React Native Firebase makes Skia's missing iOS header paths visible.**
Firebase requires static frameworks, while Expo asks Skia to build from source.
Under that combination CocoaPods does not expand Skia's recursive header glob, so
the production archive fails on `third_party/base64.h` and then the Skia headers.
The pnpm patch adds the explicit `cpp/api` and `cpp/api/third_party` roots to
Skia's podspec. Skia 2.14.0 (SDK 58) still lists only `cpp`, `cpp/skia` and
`cpp/dawn/include`, so the patch moved to it; the patch file is named for the
version and pnpm refuses to install when it names one that is not in the tree.
Keep it until Expo's supported Skia version lists those roots itself.

**A screen that holds its own back cannot navigate while it holds it.**
`usePreventRemove` refuses every removal of the screen, its own included: a
save that ends in `router.dismissTo` was refused like a swipe. Sending the
refused action again from the hook's callback, the pattern React Navigation's
docs show, did nothing here either, so the finish screen stayed in the stack
under the saved workout and came back when that page was deleted. The workout
editors go through `useLeaveGuard` (`features/workouts/leaveGuard.tsx`), whose
`leave` stands the guard down first and navigates once that has rendered. Use it,
or the same order, for any screen that blocks leaving and then leaves itself.

### Sheets and the keyboard

**A bottom sheet with a text field in it is `fullHeight`. Every time.** This
has been got wrong repeatedly, so it is a rule rather than a judgement call. A
capped panel is padded up off the bottom edge by `KeyboardAvoidingView` when the
keyboard opens, and the strip left behind shows the scrim through the curve of
the keyboard's top corners: the sheet stops reading as attached to the bottom of
the screen. `fullHeight` keeps the panel where it is and lets the scroll view
inset its own content instead. A `placement="center"` card is the exception: it
floats, so being lifted above the keyboard is what it should do, and its footer
rises with it. The routine editor's name and note card is one.

Two corollaries, both learnt the hard way. Such a sheet has **no `footer`**: a
footer sits outside the scroll view, so at full height it lands at the bottom of
the panel behind the keyboard. Put the button in the body, after the field. And
if the content is short (a field, some chips, a button, rather than a list) pass
`scrollable={false}` as well: a scroll view scrolls itself to reveal the first
responder when the keyboard opens, and on the first open, before the keyboard's
real height is known, it overshoots and carries the field clean off the top.

**Any other sheet is as tall as its content, up to just below the status bar.**
The wrapper, the panel and the scroll view all shrink, so a panel that would
pass the top of the screen (keyboard and number pad included) gives the
difference to its body, which scrolls. Do not cap the body at a fixed height.
It was a flat 440pt, and on a tall phone that cut the third card of the group
meal sheet in half above the home indicator with a third of the screen unused,
which reads as a sheet running off the bottom rather than one that scrolls.

**A toast fired over a sheet needs a host inside the sheet.** A native modal
window is above the app's root view, so the toast the provider draws in the tree
renders *underneath* it: it mounts, joins the accessibility tree, runs its timer
and dismisses itself, entirely invisible. `ToastHost` is the same fix
`NumpadHost` is, and `SheetSurface` renders one. It pins the placement to the
top, because the bottom of a sheet is the panel and its buttons.

Every toast can also be dismissed with a swipe left, right, up or down. The
gesture waits for a clear drag, so tapping an action such as Undo keeps its
normal touch behaviour.

**And the host has to go when the window does**, which is not the same as when
the component does. On iOS a `Modal` keeps its children mounted after `visible`
turns false, until the native `modalDismissed` event arrives a tick or more
later. So a sheet that has just been closed still held the topmost claim, and a
toast fired in the same handler as the close was drawn inside a window on its way
off the screen. `Sheet` passes its own `visible` to `SheetSurface` as `hosting`
for exactly this.

**`autoFocus` inside a `Modal` is dropped.** The field mounts with the window,
before the platform has presented it, and the keyboard never comes up. `Sheet`
takes an `onShow` for this: fire `ref.focus()` there. A route's `SheetSurface`
uses `onEntered` instead, after the panel finishes rising. Focusing a search
field while it is still below the screen makes the keyboard's reveal scroll a
long list past its own field. The logging sheet focuses after that callback
and whenever switching into Search or Describe after the entrance.

### The number pad

**A number is typed on the app's own pad, and that is not a flourish.** The
system number pad has no return key, so iOS 26 floats a "Done" pill above it,
inside the keyboard frame the app is told about while the keys are not.
Everything positioned against that frame therefore clears a control it cannot
see, and the strip left behind shows the diary through it. The height of that
pill is Apple's to change, so there is no number to correct by.

`src/ui/Numpad.tsx` is the answer. `showSoftInputOnFocus={false}` leaves the
caret and takes the keyboard away on both platforms, and what slides up instead
is a view whose height is a constant this app owns. Two consequences: a numeric
field needs a `NumpadHost` above it, which `Screen` and `Sheet` both provide, and
a `Sheet` provides its own because a native modal window cannot be drawn over
from below. `keyboardType` stays on every field regardless, as the fallback if a
platform ever declines to suppress the keyboard.

**One field is exempt, and it is the six digit code.** The pad types a quantity,
and a code is a string that happens to be digits: the pad refuses a leading zero,
because `07` is a typo in every figure this app holds and the first digit of one
code in six, and suppressing the keyboard suppresses `oneTimeCode` autofill with
it. `systemKeyboard` on `TextField` is the opt-out, and `(auth)/verify` and
`(auth)/new-password` are the only two callers.

**A field on that pad never blurs when you leave the screen.** Taking the system
keyboard away also takes away the reason the platform had to resign first
responder, so a push, a replace or a tab change fires no `onBlur` at all. That is
survivable only because the pad's inset is scoped to the host *drawing* it
(`useNumpadZone`). Read straight off the provider, which holds one offset for the
whole app, a stale session lifted the footer and the floating action of every
screen by the pad's full height. Onboarding's weight field is the first numeric
field a new user meets, so a first app open showed the log button and the
paywall's button floating 280pt up the screen. It reads as a layout bug and is a
lifetime bug.

**A worklet freezes everything it closes over, and the pad's live value was
reachable from one.** The symptom was absurd: the app's own number pad could not
type a two-digit number. Press 1, then 2, and the field read "2".

`useNumpadField` writes the field's current value into a ref on every render and
the pad reads it back on every key. `NumpadSurface`'s slide animation was written
`useAnimatedStyle(() => ... context.height - context.offset.value)`, which
captures `context`, which holds the session, which holds that ref. Reanimated
freezes the whole graph so the UI thread can read it, so `field.current = {...}`
became a silent no-op and the pad went on appending to the value the field had
when it was first focused.

In dev Reanimated does say so ("Tried to modify key `current` of an object which
has been already passed to a worklet"), buried among warnings; in a release build
it is silent. The fix is one line of destructuring. **Never let a worklet close
over an object that owns mutable state.** Pull the primitives out first.

**A field subscribes to whether it is the one being edited, not to the pad.**
The provider's value changes on every open, close and Next, and a field reading
it re-rendered on each one, memoised or not: in a workout that was every set row
at every keypress of Next. Fields read a second context of stable actions and
`useSyncExternalStore` one boolean, so a move between two fields renders those
two.

**The keyboard's reported height is still not where the keys start.** `Screen`'s
footer skirts for it: canvas continuing below the footer for a screen's worth, so
a frame taller than what it covers reads as chrome rather than a hole. The
numeric case is fixed at the source now, but the class is not. Do not cap the
lift instead: a frame taller than its keys is usually taller for a reason, and
covering the difference puts Save under somebody else's control.

### Simulators and stores

**A current iOS simulator has a Health store with nothing in it.** It is widely
documented as having no Health app; that stopped being true. iOS 26 reports
`isHealthDataAvailable()` as true and shows the real permission sheet, then reads
a year and returns nothing, which looks like a broken feature rather than an
empty device. Settings, Health offers generated data once a connected store turns
out to have no days in it.

**Built with Xcode 27, the app must adopt the UIScene lifecycle or iOS 27 kills
it at launch** (`EXC_BREAKPOINT` in
`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`, before any JS
runs). SDK 58's template does it: prebuild writes a `SceneDelegate.swift` and a
scene manifest, and React Native starts from the scene delegate rather than the
app delegate. SDK 57 needed `ios.enableSceneSupport` and a plugin to move
Firebase's line out of its way; both are gone.

**SDK 58's AppDelegate loses `FirebaseApp.configure()` without saying so.**
@react-native-firebase/app 26.x anchors that line on `factory.startReactNative(`,
which the scene template no longer has, so prebuild prints "Unable to determine
correct Firebase insertion point" and the app starts with no Firebase at all.
`plugins/withFirebaseConfigure.js` writes it above `return super.application(…)`,
the anchor v27 adopted, and stands aside once Firebase's plugin writes it. v27
also drops the CocoaPods build (`disableSPM`), which is why this is a plugin and
not an upgrade. The warning still prints; the line in the generated
`AppDelegate.swift` is what to check. `plugins/withWatch.js` puts the watch's
Health handoff at the end of the same class, since the template's
`// Linking API` section is gone too.

**SDK 58 turns on R8 for Android release builds; this app turns it back off.**
`android.enableMinifyInReleaseBuilds: false` in expo-build-properties keeps
release builds as they were on SDK 57. R8 strips classes that are only reached
by reflection, and Firebase, RevenueCat and Health Connect all do some of that,
so turning it on needs keep rules and a tested release build on a device, not a
config flip in an SDK upgrade.

**`platforms` in app.json keeps web out.** SDK 58's router needs `react-dom`,
and Expo reads an installed `react-dom` as "this app has a web build". The PR
preview's `eas update` exports every platform, so it then failed on a missing
`react-native-web`. `"platforms": ["ios", "android"]` says what the app is.

**A purchase cannot be tested with the real store, and the flow that could not be
run is the one that was broken.** Apple's sandbox wants a sandbox Apple ID on a
device, Play's wants a licensed tester on a phone, and an Xcode StoreKit
configuration file mints a receipt RevenueCat's backend will not validate.

What works is **RevenueCat's Test Store**: a `test_` SDK key, three products in
the project's "Test Store" app attached to the `pro` entitlement and to the three
packages. It sells, mints a real customer, grants the entitlement and delivers a
real webhook, all on a simulator with no store account.
`EXPO_PUBLIC_RC_TEST_STORE_KEY` in `.env.local` switches to it, and it is read
only under `__DEV__` so a release bundle cannot reach it.

Two things it costs: the periods are compressed (a "year" is an hour, a "month"
five minutes), which is a gift for testing expiry and a surprise otherwise; and
the products carry no introductory offer, so the purchase comes back `active`
rather than `trial`.

**`REVENUECAT_SANDBOX_SUBSCRIBERS` decides who a sandbox purchase may grant to,
and it is currently `*`.** A sandbox purchase costs nothing and carries a genuine
Supabase user id, so this is the one setting that can hand the paid app out for
free. Unset is nobody, a list of uuids is just those, and `*` is everybody.

`*` is deliberate: every purchase made outside the App Store's own checkout is a
sandbox transaction, so an allow-list meant the paid path could only be exercised
by whoever somebody remembered to add, which is how a real purchase sat in
RevenueCat for hours while the app went on refusing it. **What it costs is that
TestFlight testers get Pro without paying**, because TestFlight always transacts
against the sandbox. Narrow it when the tester group stops being people you know.

Both the webhook and `reconcileEntitlement` read the same policy, from
`sandboxPolicy`. Either way the decision is logged: a dropped sandbox event and a
delivery that never arrived used to leave the same trace, which is none.

---

## Conventions

**Comments explain why, in plain English.** They are worth the space when the
reason is not recoverable from the code: a bug that motivated a shape, a
constraint that looks arbitrary. Keep them short. Match the density around you
rather than adding a header to everything.

**Commit subjects are a sentence about what changed**, not a conventional-commits
prefix.

**No long dashes in copy.** Anything a user reads is written without em dashes or
en dashes. Use a comma, a full stop, a semicolon or a pair of brackets instead.
That covers every bundle in `src/i18n`, any string that reaches a screen, a
notification, a
share sheet or a toast, and the model prompts that produce text we display back.

Two things it does not cover. **Comments and this file** are prose for whoever is
reading the code. And a lone `—` standing in for a missing measurement is a
symbol rather than a sentence: it is how a stat tile says "no reading", and it
stays. A missing *name* is different and gets a word ("Someone"), because a dash
where a person should be reads as a rendering fault.

Rewrite rather than substitute. "Enter it once — what went in and how many it
feeds — and logging it is one tap" becomes "Enter what went in and how many it
feeds, once, and logging it is one tap". Swapping the dashes for commas without
moving the words leaves a sentence with too many clauses in it.

---

## What is not wired up

**RevenueCat is live**, and the dashboard has caught up with the code: the `pro`
entitlement exists with all six store products attached, and the webhook points
at the `revenuecat` function with no environment filter, which is the right
setting because the function applies the production/sandbox policy itself.

What cannot be read back from the API, and so is worth checking by hand when a
purchase does not land: `REVENUECAT_WEBHOOK_TOKEN` set on the edge functions and
matched in the dashboard's webhook, and an App Store Connect API key uploaded to
RevenueCat before an iOS receipt can be validated.

**RevenueCat → PostHog and GA4 are configured.** The canonical Analytics tables
record their settings, revenue ownership, verification and rollout limits.
