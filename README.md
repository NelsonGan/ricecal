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
- [Recipes](#recipes)
- [The diary screen](#the-diary-screen)
- [Water](#water)
- [Home screen widgets](#home-screen-widgets)
- [Weekly and monthly reviews](#weekly-and-monthly-reviews)
- [Activity and health](#activity-and-health)
- [Photos](#photos)
- [Money: free and Pro](#money-free-and-pro)
- [Asking for a rating](#asking-for-a-rating)
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

Useful commands:

| command | what it does |
|---|---|
| `pnpm db:reset` | rebuild the local database from every migration |
| `pnpm db:diff <name>` | generate a migration from your schema edits |
| `pnpm db:test` | pgTAP tests |
| `pnpm db:types` | regenerate the TypeScript `Database` type |
| `pnpm foods:gate` | grade catalogue search against 30 fixed queries |
| `pnpm eval:prompts` | grade the model prompts |
| `pnpm eval:scan` | drive the deployed scan pipeline end to end |

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

### Caching

Cached queries persist to MMKV, so a relaunch has yesterday's answers before the
first request returns. `SCHEMA_VERSION` in `packages/shared` is the cache
buster: bump it whenever the shape of anything persisted changes, or old data
rehydrates into new code.

**A query with no connection is paused, never sent.** That is
`networkMode: 'online'`, the same signal that already gates every write.
Reading the cache is untouched; only the request is.

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

Three kinds of change have to be hand-written into a migration, because
`supabase db diff` only emits structure:

| what | why |
|---|---|
| `select seed_archetype_foods()` | the rows are data, and a diff only emits structure |
| `create extension` / `drop extension` | the diff engine does not track extensions at all |
| `cron.schedule(…)` calls | a schedule is a row in `cron.job`, so it is data too |

Nothing schedules anything here any more, but the rule is what made both the
arrival and the removal hand-written.

The `auth` schema is **not** one of these. The diff tracks triggers on
`auth.users` perfectly well, and putting `on_auth_user_created` in a migration
made the next diff emit `DROP TRIGGER` for it. It stays declarative, in
`16_new_user.sql`.

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
       ├── weight_logs ────── current weight, typed or synced
       └── health_connections  which health store, and how far back it has read
            ├── activity_days ───── one day of movement, keyed by local date
            ├── activity_sessions  one workout, keyed by the store's own id
            └── activity_hours ──── steps by local hour, last month only

archetypes            the ~60 tier-5 fallbacks the scan cascade lands on
food_scan_items       what the model claimed, and where it landed
food_scan_misses      the catalogue-widening backlog
barcode_misses        the same, for packets
job_runs              what each periodic job did, written by the job itself
```

`foods`, `food_servings`, `food_aliases` and `food_sources` are **not** here.
They are in Cloudflare D1, and nothing in Postgres joins to them.

The archetypes are here, and that is deliberate. Tier 5 is where a scan lands
when the catalogue, the model or the network has failed it, so reading it over
HTTP would make the fallback for "the network failed" another network call.

Read shapes are views, all `security_invoker`: `food_log_details`,
`food_log_ingredient_details`, `daily_nutrition`, `user_food_stats`,
`current_daily_goals`, `recipe_details`, `recipe_ingredient_details`.

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

**Current weight is not on `profiles`.** It is the newest `weight_logs` row. A
column would be a cache with no invalidation story: the scale syncs, the profile
still says what onboarding recorded, and the budget is computed from the stale
one.

**Age is stored as `birth_date`.** An integer age is wrong within a year of
being written and nothing would ever correct it.

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
- **Enums for closed domains.** `supabase gen types` turns them into string
  literal unions, which keeps `Meal` in SQL and `Meal` in TypeScript the same
  set.
- **`updated_at` by trigger**, so no write path has to remember.

### Function secrets

Two belong to the catalogue, read by `functions/_shared/catalogue.ts`:
`CATALOGUE_URL` and `CATALOGUE_TOKEN`. The same token is set on the Worker with
`wrangler secret put CATALOGUE_TOKEN`, and the two must match or every catalogue
read from a function answers 401. The scan cascade turns that into an archetype
rather than an error, so the symptom is dull scans and not a failure.

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
| archetypes | 65 | the tier-5 fallbacks, which also live in Postgres |

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
1 about   2 activity  3 source    the questions, drafted locally
4 calculating                    a beat, then it replaces itself with…
5 target                         the budget, worked out on the phone
6 account       (auth)/sign-in, carrying the same bar through the params
                Apple, Google, or an address, which leads to (auth)/password
                and then (auth)/verify if a code is owed
  finish                         the one write: profile, first weigh-in, onboarded_at
7 health        connect the store, a permission that gives rather than asks
8 notifications turns the three meal reminders on, not just the OS permission
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
the barcode scanner, the whole catalogue, three recipes, the week's trends.

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

### The first question answers nothing for the user

Every control on `about` starts empty and Continue is dead until all five are
filled. It used to open on 164 cm, 65 kg, 29, female, and every one of those is
a real answer as far as `compute_targets()` is concerned, so tapping straight
through produced a calorie budget worked out for somebody else with nothing on
screen to say so.

### The two permissions come after the account

Both need one: a health connection is a row keyed by user, and enabling a meal
reminder is a write to `meal_times`. Neither can block. A refusal, an unusable
store or a failed write says so in a toast and carries on, because there is a
whole tab for trying again and no version of a permission screen should stand
between a new account and their diary.

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
paywalls) and carry a cross. Every screen draws its own title bar; the native
header is off everywhere. A tab carries a `ScreenTitle` instead, because there
is nothing behind it to go back to.

Five tabs (Today, Recipes, Activity, Trends, Me) on the headless
`expo-router/ui` Tabs rather than a styled navigator, because `NavBar` and
`NavItem` are the design system's and a native tab bar cannot be made to look
like them.

**The log button is not in the bar.** It used to be, raised, in the middle, and
that is what capped the bar at four tabs: a centre action is centred by having
the same number of tabs either side of it, so a fifth put it a tenth of the bar
off to one side. It is a `FloatingAction` at the bottom right of Today now,
through `Screen`'s `floating` slot, which overlaps the scroll content rather
than sitting above it like `footer`. A screen using it owes its last row enough
bottom padding to be read.

Singular and plural is the information hierarchy, not a naming quirk. `/recipes`
is the tab, and `/recipe/[id]` and `/recipe/edit` are pages you go to and come
back from. Those two have a layout of their own that waits for the session,
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

**The leading is Latin's.** Every Baloo 2 line height in `src/ui/Text.tsx` is
about 1.2x its size, measured against a Latin lowercase that uses two thirds of
the em box. A CJK glyph fills the box in both directions, and Thai, Devanagari,
Tamil and Bengali stack marks above and below the base letter. At 1.2x the line
box crops them: 没有上限 came back with the tops sheared off. `TextScriptProvider`
tells the design system which of three scripts it is setting — a metric, not a
word — and `Text` raises the leading to a floor of 1.36x or 1.5x for the two that
need it. English is a floor of 1x, so it renders in exactly the leading it was
designed with.

**Dynamic Type scaled the size and not the leading.** An absolute `lineHeight`
stays where it is while the platform multiplies the font size, so at the largest
setting a 1.19x ramp is nearer 0.9x and every script crops. `Text` multiplies by
`PixelRatio.getFontScale()` to hold the ratio. Callers that set their own
`text-[34px] leading-[42px]` pair — around forty of them, sizing type against a
ring or a stepper — are parsed back out of the class string and scaled the same
way rather than overridden.

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

### The reset is one screen, and that is a race not a taste

Verifying a recovery code creates the session, and that session is both the
licence to change the password and what `(auth)/_layout` watches to decide the
sign-in stack is finished. Split across two screens, the guard carries the user
to Today and the password they came to change is still the password. So the code
and the new password are on one screen, nothing is sent until Save, and the
layout leaves `new-password` alone while it is on top.

Somebody arriving through the link already has a session, so that screen drops
the code field. It tests for the session rather than for a parameter.

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
Sentry as a warning. The code is what separates them.

| what Sentry says | what it is | where the fix is |
|---|---|---|
| `absent: no site key in this build` | never reached the bundle | the EAS environment for that build profile |
| `absent: no WebView in this binary` | binary predates `react-native-webview` | a native rebuild; OTA cannot add it |
| `unusable: 110200` | origin is not on the widget's hostname list | add it under Hostname Management |
| `unusable: 110100` / `110110` / `400020` / `400070` | wrong or disabled site key | the key, or the widget |
| `gave up after N retryable errors` | scored a bot, twice | the widget's mode |
| `timed out with no answer` | executed, then twenty seconds of silence | usually the network |

**Nothing at all in Sentry, with sign-in still failing, is the sixth case: the
secret.** It has to belong to the same widget as the site key. A mismatched pair
produces a token the app is happy with that `siteverify` then rejects. Silence
is the evidence: the widget did its job.

---

## Logging a meal

Four ways in, and the FAB opens all of them in one sheet (`app/log/index.tsx`):
**Snap** a photo, **Describe** it in words, **Scan** the barcode, or **Search**
the catalogue. Whatever the route, the entry is written against `selectedDate`,
the day the strip on Today has selected.

Search, scan and quick-add are ordinary writes. The other two run the cascade.

### Scanning a barcode

The only exact way in. Everything else asks a model what something is or asks
the user to spell it; a barcode **is** the product, so there is no ranking, no
candidates and no confidence. One row or none.

```
camera reads a code → leave immediately for /log/food/packet:<code>
                    ↓
  functions/barcode   D1 by barcode          hit  → the product, priced
                      Open Food Facts, live  hit  → written back, returned
                                             miss → "we do not have this one yet"
                                                    + Describe + Scan again
```

**The viewfinder does not wait for the answer**, and that is the whole shape of
this flow. Waiting put a spinner over the camera and said which of four things
was happening underneath; three of those four were a person standing in a shop
watching a camera not move (the live fallback allows six seconds for Open Food
Facts) and the fourth replaced the sheet with a different screen anyway.

So the code is the answer as far as the scanner is concerned, and the page it
hands the code to owns every way the lookup can turn out: a skeleton while it
waits, the product when it lands, and a screen with Describe and Scan again on
it when nothing knows the packet.

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
- **Tier 4, estimate** → a second model call, Atwater-checked, kept as numbers
  on the entry. It used to write a shared catalogue row; a guess reused is still
  a guess.
- **Tier 5, archetype** → classification over the seeded generic rows, bottoming
  out at a terminal "Mixed meal" at a hardcoded id that needs no model and no
  network.

Once the caller is authenticated and the body parses, this endpoint does not
return an HTTP error. Every failure falls to the archetype floor, because a
diary that refuses the meal is worse than one that logs it roughly.

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
cannot be useful. A photographed meal is never asked: `food_logs` holds one or
the other.

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
what it is about. The footer is left with the one thing that is not a section of
this entry: handing the meal back to the model.

Each `save*` function throws on failure so its sheet can stay open with the
draft still in it, and stages the value locally as well: the write invalidates
the day and the refetch is a round trip behind it.

**The portion is the exception**, and it saves on a short debounce. A plus and a
minus have nowhere to put a Save, and written per tap they are three round trips
to reach two and a half plates. A pending edit is flushed on unmount through a
ref.

The add path is a staged form, because there is nothing to write until Add.

### The layout

**The plate is the top of the screen, full width, with the chrome floating on
it.** The `Screen` is `flush` and one wrapper puts the gutter back for
everything under it; back on the left, then share, the pencil and the bin on the
right, least to most destructive. The dish name is the page's heading
underneath, where it stopped truncating: a bar between two 44pt buttons had room
for about three words of "Nasi Lemak with Fried Chicken with pineapple juice".

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

**A part is edited by weight and read as a count.** The card reads "1 × Fried
Rice (90 g)", and both halves earn their place: the grams are the only thing
about a part somebody can check against the plate in front of them, and the
count is the only thing they can check against themselves. `PartLine` renders
the pair in both places that show it, and the sheet puts the same line in its
row heading, which is the one spot with room for a long name.

Editing moves the weight. `quantityForGrams` is the seam:
`set_ingredient_quantity` takes a quantity, `food_log_ingredients.quantity` is
`numeric(6, 2)`, so a weight lands within a gram or two of what was asked for.
A part nobody weighed keeps its multiplier and cannot be typed into.

**The count is rounded to a quarter and the weight is not**, which is why the
two are allowed to disagree and why `countLabel` prefixes a "~" when they do:
"~1¼ × Fried Rice (110 g)". Rounding the stored amount instead would cost the
weight its resolution, since a 90 g part could then only ever weigh a multiple
of 22.5 g and every 10 g tap of `GRAM_STEP` would round straight back to where
it started. A scan lands on whole counts, so the "~" only ever appears on a
part somebody has resized by hand.

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
  inside a vertical scroller loses every drag.

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
quantity    only the amount changed: rescale the entry and every part under it
adjust      one part added, removed, resized or swapped; re-price from the parts
redescribe  the food itself was wrong: re-run the whole cascade
```

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

---

## What to eat next

The one model path that does not start from something the user already has. A
scan reads a plate, a correction reads a sentence about one, a recipe read reads
a pot; each has a subject. Here the subject is the rest of the day, and the
answer is a suggestion rather than a fact.

A thin row on Today opens it, under the week strip: one line high, flat rather
than raised, because everything raised on that screen writes something and this
writes nothing.

```
row (/today)   →  ask sheet     meal, macros, cuisine, a calorie ceiling
                 ↓
                 the same sheet, holding a skeleton while the model works
                 ↓
                 seven picks    name, kcal, protein, and the drawing
                 ↓
                 one pick       the figures, what the day has left after it,
                                and why this fits
```

**All four are one panel, and the last of them was a pushed page.** A `Sheet` is
a native window drawing over the whole app, so a screen pushed under one arrives
behind it: the panel had to be closed on the way into a pick and raised again on
the way out, which made reading two picks four transitions with a frame of the
diary in each gap. The pick is a body inside the picks sheet now. It slides in
from the right, the title row swaps its "Try again" for a back chevron, and the
panel itself does not move.

Two things went with the page. The provider that held the picks above the
navigator, which existed only because the sheet that produced them and the page
that read one were different routes; `SuggestAction` holds them in ordinary
state. And the counter that told the list a pick's page had left, which was
there because focus cannot say when that is: a screen under a transparent
presentation never loses focus, so a `useFocusEffect` never fired.

`Sheet` grew three props for it: `titleLeading` (the back control, in the title
row rather than at the top of a body that scrolls), `titleLines` (a dish name is
not a screen name, and one line of "Nasi kandar ayam goreng berempah" identifies
nothing), and `scrollResetKey` (the scroll view is the same instance either side
of the swap, so a list read half way down opened its pick half way down too).

**Every control opens on an answer.** A prefilled sitting costs nothing to be
wrong about, because the answer is a list of suggestions. The sitting comes off
the user's own `meal_times` (nearest within two and a half hours, otherwise a
snack) so somebody whose dinner is at nine gets dinner at nine, and the ceiling
opens on what is left of the day, capped at what one sitting plausibly is.

**The cuisines are the user's own list, and it lives on the phone.** Malay,
Chinese and Indian to begin with, and a pencil beside the dropdown edits them.
MMKV rather than a column: it is a preference about a control rather than a fact
about the account, and a column would be a query the sheet has to wait on.

Two consequences. The server has no list to validate against, so `cuisinePhrase`
bounds the string instead: trimmed, capped at 40 characters, and stripped of the
line breaks that would let a text field pose as another instruction in the
prompt. And the cuisine cannot be sent to Mixpanel as itself, so
`trackedCuisine` maps it to one of the shipped defaults or to `custom`.

**Nothing it returns is written anywhere, and the picks are view only.** No
`food_logs` row, no catalogue row, no "Log it" button. A guess about a meal
nobody has eaten is the last thing that should become a row other diaries are
priced from. That is also why a pick has no id and why the detail is reached by
index into a list that lives in memory and nowhere else.

**The panel is one sheet at one size throughout.** A capped sheet sizes itself
to its content, so the wait and the answer would be different heights and the
panel would jump at the one moment this screen has to feel settled. The wait
draws one skeleton row per pick, off `PICK_COUNT` rather than a literal.

**Try again re-sends the last request** rather than reopening the question. It
is absent while a pick is being read rather than disabled, because a new list
under a dish reached by index is a different dish under the same heading. The
model is not deterministic, so the same question genuinely answers differently,
and changing the question is one tap away. The last request is held in a ref
rather than read off the provider, which is only set once an answer has landed.

**The reasons are the product.** A list of dish names against a calorie figure
is a list anybody could write; "you are 39 g short on protein and one bowl
covers most of it" is what makes it a suggestion. `why` is required per pick, a
pick without one is dropped, and the reason's `kind` is a closed set of five so
the screen can draw the right picture beside it.

**The day is assembled on the server, not sent by the client.** A
client-supplied budget decides how big a meal the model offers, and a stale one
produces a suggestion for a day that has moved on. It is one round trip either
way.

**It is Pro, and it claims a scan**, exactly as `scan-refine` does: discretionary,
repeatable at the press of a button, and with no cheaper tier underneath.

**The gate is on "Suggest something", not on the row.** The question is the
feature (the sitting, the macros, the user's own kitchens, the day's remaining
budget) and a paywall in its place is an offer with the product hidden. It also
refused a tap that costs nothing, since a scan is claimed by the request. The
ask sheet is a `Sheet`, which is its own window, so a paywall pushed from under
it would arrive behind it: `useRequirePro`'s `beforePaywall` closes the sheet
first, and only on an actual refusal.

`_shared/suggest.ts` holds the prompt. Five things it was taught after a live
run broke it:

- the sitting is a constraint rather than a label (asked for dinner it wrote "to
  start your day");
- the cuisine likewise (asked for Malay it offered roti canai);
- a pick is a dish somebody orders by name and never a bare ingredient (released
  from a named cuisine it answered with chicken breast and boiled eggs);
- a dish's calories are never shrunk to fit the ceiling (asked for a 300 kcal
  snack it offered "nasi lemak, one plate, 280 kcal");
- the macros left are context for the reasons rather than a specification to
  hit.

`unslug` plus a capital is the belt behind the last of them: the icon list is
the largest block in the prompt and the model answers in its register, with
picks named `char-kuey-teow` and `hokkien-mee`.

**Seven picks**, which is `PICK_COUNT` on the server and a deliberate copy in
`features/suggest/ask.ts`. The two live either side of the Deno / React Native
line and cannot import each other. The heading does not count them, because a
heading that names a number lies whenever a pick is dropped.

**It leans healthier on a toggle, and the lean is a tie-break rather than a
filter.** Told to be healthy outright the model answers with boiled eggs and
steamed fish, which is the bare-ingredient failure again. So the rule is written
as a preference between dishes that both fit, and it is told not to mention
health or dieting in the reasons. The switch lives in the *user* message because
it changes per request, and Off is stated rather than left out, because silence
reads as the default.

**The sheet remembers the macros, the cuisine and the lean**, in MMKV, keyed by
user, saved when the question is asked. Not the sitting, which is answered by
the clock, and not the ceiling, which follows the sitting and the day's
remaining budget: a 300 saved from a snack would open tomorrow's dinner at 300.

**And the sitting has a belt of its own.** "To start your day" kept turning up
on dinners; moved to the last line of the user message it fell to about one
reason in fifteen picks and mutated rather than stopping.
`keepToTheSitting` drops a reason written in the breakfast register from a meal
that is not breakfast, and never empties a pick: losing a dish to a badly worded
sentence is a worse answer than the sentence.

A failure is an empty list rather than an HTTP error. In the cascade a diary
that refuses the meal is worse than one that logs it roughly; here there is
nothing to log, so the honest answer is to say nothing came to mind.

---

## Recipes

A shared pot has no serving size, which is where logging breaks down. A recipe is
two answers, what went in and how many it feeds, entered once, and every future
log of it is one tap.

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

**Three shelves, one list.** Mine, the RiceCal kitchen, and the community. Which
one a recipe is on is a property of the row: official is the *absence* of an
owner, so "official and owned by Farah" cannot be spelled, and community is
somebody else's that is both public and approved.

Somebody else's recipe is **saved before it can be logged** (`save_recipe_copy`,
a copy with `source_recipe_id` for provenance). Logging it directly would put
their future corrections into your past diary.

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
and the steps into an advert. A trigger resets `review_status` when the name, the
steps, the servings or the ingredient list change on a public recipe. In the
database, because a rule the client is trusted to follow is a rule an attacker
declines to. Private recipes are left alone: there is nothing to re-review about
something nobody else can see.

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

### Filling the form in, from a photo or a sentence

Two offers on a new recipe, answering different situations rather than different
preferences: the pot is on the stove, or it is not. Both land in the same `read`
action and come back as the same draft, so only the first model call differs.

**Who the authority is** is the whole difference, exactly as in the scan cascade.
A photograph has one witness and it is the model, so everything it says is
inference. A sentence was written by the person who cooked the dish, so the
amounts and the serving count they gave *are* the answer.

A photo uploads first and then invokes, because the reader on the server fetches
the object out of the bucket. Neither path goes near the catalogue: what comes
back lands in a form the user is about to check line by line, and a lookup per
ingredient would be six searches to populate fields that are about to be edited.
A failed read is a form they fill in themselves, and the endpoint says so.

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

## The diary screen

A week strip above the ring, Monday to Sunday, paged back a year, one page per
calendar week, each fetching only its own seven days. Picking a day moves
`selectedDate` (`data/selected-date.tsx`, the one piece of genuinely
client-owned state) and everything below follows it: the ring, the water, the
entry list, and anything logged while it is selected.

**A way back to today sits in the bottom-left corner, only while there is one.**
`Screen`'s `floatingLeading` is its own slot rather than a row inside
`floating`: the two corners hold unrelated things and appear on different
conditions, and a single row would need an invisible spacer over a scroll view,
eating taps. Absent on today rather than disabled.

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
and the list. What is under the grid instead is the selected day as an
`ItemRow` list, oldest first, and the water tank for that day.

**Every cell carries the day's biggest plate**, from `day_plates(from, to)`: the
photograph where there is one and the drawing where there is not. Biggest rather
than newest, because a 44pt cell has room for one dish and "what did I eat that
day" is answered by the nasi lemak rather than by the teh tarik after it.

It is a separate function from `day_marks` rather than two more columns on it.
The strip asks that one for a week on every swipe and has no use for a picture;
joining the diary twice more per day, fifty-two weeks back, would be a cost paid
by the screen that does not want it.

**The selected cell is filled in its own verdict's colour**, not always pandan.
The verdict is the cell's outline and the selection is its fill, and while the
fill was pandan for every selected day an over-goal day drew a kaya ring around
a green square. Under goal fills pandan, over goal kaya, a missed day grey. The
ink is paired with the fill rather than assumed, because `kaya-ink` is the same
value as `kaya` in the dark palette.

Arrows rather than a pager: twelve taps reaches a year where the strip needs
fifty-two swipes, and a paging grid a screen tall would fight the vertical
scroll of everything under it. Paging moves the selection with it (`dayInMonth`,
same day of the month, clamped to the month's length and to today), because a
card describing a day that is not on screen is a card nobody can act on.

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
small, and an Add button beside it.

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

### What Mixpanel is told

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
install reports nothing at all — deleting the app leaves the widgets on the home
screen, so a reinstall would otherwise report three installs that happened
months ago.

`Widget Water Added` is fired when the queue drains, not when the button was
pressed, because the button runs in a process with no Mixpanel in it. A drink
whose sync failed is never counted, which is the honest direction to be wrong in.

---

## Weekly and monthly reviews

A finished week or month, read as one column of cards. A row at the foot of
Trends leads to `/reviews`, which lists the periods worth opening, and one of
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

### Syncing

`src/data/health-sync.ts`. A **week-deep backfill** on connect, then the last
**seven days** re-read on every foreground.

It was a year, then a month, then a week, and each cut was the same argument
carried further: the backfill exists so the Activity tab is not empty on the day
it is turned on, and a week answers that. What it costs is the 30-day range,
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

---

## Photos

**Images live in Cloudflare R2, behind the `photos` function.** Postgres used to
own this too: Supabase Storage let the client talk to the bucket and let eight
RLS policies over `storage.objects` decide whether it was allowed to. R2 has no
notion of a user, so that check is now `ownsKey` in `functions/_shared/r2.ts`:
one line of TypeScript where there were eight policies, and the only thing
standing between two users' diaries.

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
lifetime. The two subscriptions carry a seven-day free trial and lifetime does
not, which is why the button and the small print on `paywall/intro.tsx` change
with the selection.

### What each tier gets

| | Free | Pro |
|---|---|---|
| photographed plate | 3 a day | 50 a day, sold as unlimited |
| barcode, search, quick add, logging a saved recipe | yes | yes |
| a meal typed in words | no | yes |
| a meal corrected in words | no | yes |
| a recipe read out of a photograph | no | yes |
| asking what to eat | no | yes |
| recipes kept | 3 | unlimited |
| trends | 7 days | 7d / 30d / a year |
| reviews | the newest week | every week and month |
| meal photographs kept | 30 days, or 60 past a lapsed subscription | for good |
| budget, health sync, reminders, the whole catalogue | yes | yes |

Three of those numbers live in `packages/shared` for the copy to interpolate,
and all three are enforced in Postgres: `free_daily_scans()`,
`free_recipe_limit()`, `free_photo_retention_days()`. A fourth,
`lapsed_photo_grace_days()`, is Postgres-only, because the grace period is not
advertised and a promise about it would be one more thing that cannot be
narrowed later.

The client's copy makes the buttons read honestly; the database's is what
refuses. The trend ranges and the older reviews are gated in the **client
alone** and deliberately: they are reads of the user's own data, so the worst a
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

### Identity

**The id is the Supabase uuid and must never become the email.** An address is
wrong on three counts: it changes, and a changed one logs the SDK in as a
different customer whose `app_user_id` matches no row, so a paying user silently
stops being entitled; not every way in supplies one; and it is guessable, which
with a public SDK key is enough to ask about somebody else's purchases. The
address travels as an **attribute** instead, set right after the log in, never
before, or it is filed against the anonymous customer.

**Two platforms are told who this is, and they have to agree.** RevenueCat
forwards its purchase events into Mixpanel under `$mixpanelDistinctId`, falling
back to `app_user_id` when nothing set it, and Mixpanel knows the person by
whatever `identifyUser` registered. Both are the user's uuid, so the fallback
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
ever, the key being their only name. The row keeps a drawing where the plate
was, or a swept month would be a column of grey tiles.

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

**All local.** A meal reminder is "every day at 08:00 in the user's own
timezone", which both platforms express as a repeating calendar trigger. No
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

**2. A line in `src/jobs/index.ts`:** `export const JOBS: Job[] = [retention, digest]`

**3. The cron in `wrangler.jsonc`:** `"triggers": { "crons": ["17 * * * *", "0 2 * * MON"] }`

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

Mixpanel. `src/lib/analytics/events.ts` is the authority: every event is declared
there with the exact properties it carries, and `track` accepts nothing else.

```
client.ts    the seam. Imports nothing, so anything may track.
events.ts    the plan, as a type. A typo does not compile.
props.ts     the two derived properties more than one call site needs.
```

`startup.ts` builds the Mixpanel instance and hands it to `registerAnalytics`.
Nothing else touches the SDK, for the same reason the RevenueCat lifecycle is in
its own file: `mixpanel-react-native` is imported at module scope and jest cannot
transform it, so a native import in a module that tracking is fired from would
drag an untransformable dependency into most of the test suite.

Events fired before the SDK finishes starting are queued and drained on
registration, because `initServices` runs inside an effect and the router has
already decided where a launch belongs by the time it resolves.

Nothing is sent in development.

### The rules this plan was written against

**One event per decision, not per render.** A screen appearing is not a fact
about anybody; a button being pressed is.

**Every event answers a question somebody would actually ask.** If the answer
would not change what gets built next, the event is not here.

**Nothing off the diary.** No calorie totals, no weights, no dish names, no
search text. They are health data, they answer none of the questions, and
Postgres already holds every one of them next to the arithmetic that produced it.
Where a number is genuinely wanted, its *shape* is sent instead: which way a
calorie plan runs rather than the two weights, how many days back an entry was
logged rather than which day.

**Errors belong to Sentry.** A failure that is also a product fact (a scan that
found no food, a barcode nothing knows, a request refused for want of budget)
travels as an `outcome` property on the event it belongs to.

**Scan quality belongs to Postgres.** `food_scan_items` records what the model
claimed and where it landed, and `food_scan_misses` is the catalogue-widening
backlog. Mixpanel measures behaviour; those two measure the pipeline.

### The one identifier that names a person

`$email`, and it is an exception made on purpose rather than a hole in the rule.
The address is what a support conversation starts from, and a profile that cannot
be found by it is a profile nobody can act on. It is set from `identifyUser`
alone, from the address on the session, and it is the same address RevenueCat is
given, so both dashboards answer the same search.

Nothing else about the person follows it: no name, no body figures, and the diary
half of the rule is unchanged.

It is sent **after** the identify. A people property is filed against whichever
distinct id the SDK is holding at the time, so an email sent first lands on the
anonymous device profile and the real account stays blank.

`Signed In` is deliberately **not** fired from `SessionProvider`. Supabase
announces `SIGNED_IN` on every launch that finds a usable token in the keychain,
so counting it as a sign-in would report a returning user's every cold start as
an acquisition. The three call sites in `data/auth.ts` are the moments a person
signed in.

**One super property**, `entitled`, stamped on every event. It is the cut every
other report wants. It waits for a real answer: offline with nothing cached,
registering `false` would mark a paying user's whole session as free.

### Adding an event

1. Declare it in `events.ts`, with its properties and a comment saying what
   question it answers. If that comment is hard to write, the event is probably
   not worth having.
2. Track it at the point of **decision**, not the point of render.
3. Prefer a property on an existing event to a new event. `Meal Logged` with a
   `method` is one thing to reason about; six events are six.
4. If the property is a number off somebody's diary, send its shape instead.

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
job and stops if it fails. **The rest is manual**, because the Supabase functions
deploy with the Supabase CLI and the app ships through EAS. Make every step
backwards compatible so the window is survivable rather than merely short.

**Removing runs backwards**: stop reading it everywhere, ship that, then drop the
column.

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
to, what the dish costs at this portion. `lib/nutrition.ts`'s `entryTotals` is
the client's copy of that same rule, and they must agree. Scaling one parent row
moves all four macros in lockstep, which is why editing an ingredient once
changed only the calories.

**An entry states its own numbers, and `food_id` is only a note about where they
came from.** It is nullable and unconstrained, and null is ordinary: a tier-4
estimate, a tier-5 archetype and a plate rebuilt from its own parts are none of
them catalogue rows. Anything that needs to exclude guesses filters on
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

**An LLM figure is never averaged with a catalogue figure**, and the nutrition
call is never told the vision call's guess. Anchored, the model answered 450 kcal
for a plate of apple slices, and 120 without.

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

**A signup form never says an address is taken.** Supabase will not, because that
turns the form into an oracle for who uses this app.

**A wrong code and an expired one are one error.** Both come back 403
`otp_expired`, so there is one `code_invalid` reason and its copy covers both.

**A recovery code creates the session, so choosing a new password is one screen.**
`(auth)/_layout` redirects the moment a session appears, which is right for every
other way into that stack and wrong for this one. The layout exempts
`new-password` by name.

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
exist.

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
the goals screen freezes a user's target for good. It is set when the number
differs from what the formula asks for, and not before.

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

**An entitled status is not enough; the period has to be running too.**
`entitledBy` on the server and `isEntitledRow` on the client both read
`current_period_end`, and null means no expiry rather than an expired one:
lifetime renews never. Written on the status alone, every missed ending is
permanent instead of temporary. It does not replace the webhook and cannot, since
only RevenueCat knows a subscription ended early. It bounds the damage of never
hearing to the period that was actually paid for. The two copies cannot import
each other across the Deno / React Native line and have to be changed together.

**A suggestion is never written, and never becomes a row.** Nothing lands in
`food_logs`, nothing lands in the catalogue, and the detail screen has no way to
log. It follows that a pick has no id, which is why the detail is reached by
index out of an in-memory provider.

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

**An image column holds a key, never a URL.** That is what made a change of
storage provider a change of base URL rather than a migration over every row.

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

**Nothing off the diary reaches Mixpanel.** `src/lib/analytics/events.ts` is the
whole list of what is sent, and a call site cannot add to it without editing that
file. `$email` is the one exception, explained above.

**No embeddings.**

---

## Traps

Things that will bite you.

### Database

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
**always false** in the app: Expo 57 ships its own fetch, so what hangs off a
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

**Baloo 2 needs line height above its font size.** A browser lets glyphs overflow
their line box; React Native clips them. `lineHeight: 52` on 52px type shears the
top off "1,847".

**An Expo patch range can pull in a module built against a newer core.**
`expo-store-review@57.0.2` swapped its own scene lookup for
`SceneGeometry.foregroundScene()`, a helper that first ships in
`expo-modules-core@57.0.11`. SDK 57.0.8 pins core to `~57.0.7`, so the EAS build
stopped at `cannot find 'SceneGeometry' in scope` while compiling somebody
else's Swift.

Nothing catches it: the peer range is `expo: *`, the SDK's own
`bundledNativeModules` asks for `~57.0.1`, and `~` lets 57.0.2 through.
`expo-store-review` is therefore pinned **exactly**, at `57.0.1`, and it costs
nothing: the two versions differ only in that one function, and the JS build is
byte for byte the same. Anything that widens the range back to `~`, a helpful
`expo install --check` included, brings the build failure back.

### Sheets and the keyboard

**A sheet with a text field in it is `fullHeight`. Every time.** This has been
got wrong repeatedly, so it is a rule rather than a judgement call. A capped
panel is padded up off the bottom edge by `KeyboardAvoidingView` when the
keyboard opens, and the strip left behind shows the scrim through the curve of
the keyboard's top corners: the sheet stops reading as attached to the bottom of
the screen. `fullHeight` keeps the panel where it is and lets the scroll view
inset its own content instead.

Two corollaries, both learnt the hard way. Such a sheet has **no `footer`**: a
footer sits outside the scroll view, so at full height it lands at the bottom of
the panel behind the keyboard. Put the button in the body, after the field. And
if the content is short (a field, some chips, a button, rather than a list) pass
`scrollable={false}` as well: a scroll view scrolls itself to reveal the first
responder when the keyboard opens, and on the first open, before the keyboard's
real height is known, it overshoots and carries the field clean off the top.

**A toast fired over a sheet needs a host inside the sheet.** A native modal
window is above the app's root view, so the toast the provider draws in the tree
renders *underneath* it: it mounts, joins the accessibility tree, runs its timer
and dismisses itself, entirely invisible. `ToastHost` is the same fix
`NumpadHost` is, and `SheetSurface` renders one. It pins the placement to the
top, because the bottom of a sheet is the panel and its buttons.

**And the host has to go when the window does**, which is not the same as when
the component does. On iOS a `Modal` keeps its children mounted after `visible`
turns false, until the native `modalDismissed` event arrives a tick or more
later. So a sheet that has just been closed still held the topmost claim, and a
toast fired in the same handler as the close was drawn inside a window on its way
off the screen. `Sheet` passes its own `visible` to `SheetSurface` as `hosting`
for exactly this.

**`autoFocus` inside a `Modal` is dropped.** The field mounts with the window,
before the platform has presented it, and the keyboard never comes up. `Sheet`
takes an `onShow` for this: fire `ref.focus()` there. `SheetSurface` is a route
rather than a window and needs none of this.

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
empty device. The Activity tab offers generated data once a connected store turns
out to have no days in it.

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
ten minutes), which is a gift for testing expiry and a surprise otherwise; and
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
setting because the function drops anything that is not `PRODUCTION` itself.

What cannot be read back from the API, and so is worth checking by hand when a
purchase does not land: `REVENUECAT_WEBHOOK_TOKEN` set on the edge functions and
matched in the dashboard's webhook, and an App Store Connect API key uploaded to
RevenueCat before an iOS receipt can be validated.

**The RevenueCat → Mixpanel integration is dashboard configuration**, and the app
has done its half: every signed-in customer carries `$mixpanelDistinctId`. Until
the integration is switched on in RevenueCat, purchases never reach Mixpanel and
the funnel stops at `Purchase Started`, which reads as nobody buying anything
rather than as a missing integration.
