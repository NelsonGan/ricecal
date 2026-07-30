# The database

The schema behind RiceCal. Read this before adding a table.

## The workflow

`apps/supabase/schemas/*.sql` is the source of truth. You edit those files; you do
not write migrations by hand and you do not touch the dashboard.

```bash
pnpm db:start                 # local stack (ports 544xx, not the 543xx default)
# edit apps/supabase/schemas/*.sql
pnpm db:diff add_water_goal    # generates apps/supabase/migrations/<ts>_add_water_goal.sql
pnpm db:reset                 # applies every migration to an empty database
pnpm db:test                  # pgTAP
pnpm db:types                 # regenerates the TypeScript Database type
```

Then open a PR. `supabase-migrations.yml` re-runs the last three steps on a
throwaway Postgres, and merging to `main` deploys through the Supabase GitHub
integration.

One thing lives outside `schemas/` because `supabase db diff` cannot see it:

| file | why |
|---|---|
| `migrations/*_storage_buckets.sql` | the diff ignores the `storage` schema entirely |

Nothing seeds the catalogue. `foods` and `food_servings` are empty on a fresh
database and fill from the import loader running as `service_role`, which is
deliberately not a migration: a multi-gigabyte `COPY` in the migration chain
makes `db:reset` and CI unusable. Migrations own structure; the loader owns rows.

That loader is `scripts/import-catalogue.sql`. It reads two CSVs written by the
sibling `ricecal-food-database` project, whose `scripts/export_for_ricecal.sql`
converts that database's per-100 g rows into the per-base-serving shape `foods`
uses:

```bash
# in ../ricecal-food-database, against its own local stack
psql "$SOURCE_DB_URL" -f scripts/export_for_ricecal.sql   # -> /tmp/xfer_*.csv
# here
psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/supabase/scripts/import-catalogue.sql
```

457,014 dishes, 478,236 portions. Every test in `apps/supabase/tests` passes both on
an empty catalogue and on a loaded one — assertions about the catalogue are
written against its actual size rather than a fixture count, because a developer
who has run the import has half a million rows in that table.

The `auth` schema is **not** in that list. The diff tracks triggers on
`auth.users` perfectly well, and putting `on_auth_user_created` in a migration
made the next diff emit `DROP TRIGGER` for it. It is declarative, in
`16_new_user.sql`.

## The tables

```
auth.users
  └── profiles ────────────── body + goal: the inputs to the calorie budget
       ├── user_settings ──── display, notifications, privacy
       ├── meal_times ─────── when each meal is, and whether to remind
       ├── daily_goals ────── the budget, effective-dated
       ├── subscriptions ──── read-only mirror of RevenueCat
       ├── food_logs ──────── what was eaten          → foods, food_servings
       ├── daily_logs ─────── water and a day note
       └── weight_logs ────── the source of truth for current weight

foods ──── food_servings      the shared catalogue, read-only to clients
```

Read shapes are views, all `security_invoker`: `food_details`,
`food_log_details`, `daily_nutrition`, `user_food_stats`, `current_daily_goals`.
Plus `goals_on(date)` and `logging_streak()`.

## Conventions

Every table gets the same four-part unit — table, `enable row level security`,
grants, policies. `apps/supabase/schemas/_template.sql.example` is the canonical
copy and explains why grants and RLS are both required (this project was
created with "automatically expose new tables" off).

- **`(select auth.uid())`, never bare `auth.uid()`.** The subquery form is
  evaluated once per statement instead of once per row.
- **A policy per command.** `for all` makes it too easy to omit the with-check
  half and let a user insert rows attributed to someone else.
- **`set search_path = ''` on every function**, with every name schema
  qualified. Without it a caller can shadow a table we reference.
- **Grants are the outer gate.** Where a client must never write —
  `subscriptions`, and the write half of `foods` / `food_servings` — there is no
  grant at all, not merely no policy, so a policy added later by mistake cannot
  become an entitlement or a way to edit the catalogue.
- **Enums for closed domains.** `supabase gen types` turns them into string
  literal unions, which is what keeps `Meal` in SQL and `Meal` in TypeScript the
  same set.
- **`updated_at` by trigger**, so no write path has to remember.

## Decisions worth knowing

**Targets are effective-dated.** `daily_goals` is keyed
`(user_id, effective_from)`, not one mutable row per user. The weekly report
draws each day against the target that applied *that day*; with a single row, a
user who tightens their goal on Thursday silently redraws Monday to Wednesday
against a number that did not exist yet. Retrofitting this is impossible —
you cannot reconstruct targets that were never recorded.

**The budget is computed in the database.** `compute_targets()` is
Mifflin-St Jeor with an activity multiplier and a goal delta, the same
arithmetic that used to live in `src/mock/derive.ts`. A trigger recomputes it
when the profile or the newest weigh-in changes — and stops dead if
`is_custom` is set, because overwriting a number the user typed is the worst
thing it could do.

**Current weight is not on `profiles`.** It is the newest `weight_logs` row.
A column would be a cache with no invalidation story: the scale syncs, the
profile still says what onboarding recorded, and the budget is computed from
the stale one. Onboarding writes its weight as the first weigh-in, which also
gives the weight chart a starting point for free.

**Age is stored as `birth_date`.** An integer age is wrong within a year of
being written and nothing would ever correct it.

**Entries reference the catalogue; they do not copy its macros.** Correcting a
dish corrects every log that used it, including historical ones. A snapshot
would make history immutable but also permanently wrong, with no way to fix a
dish entered at double its calories. `food_logs` carries a **composite** foreign
key `(food_id, serving_id)` so a portion always belongs to its own dish.

**Macros are per base serving, not per 100 g.** Nobody weighs a roti canai.
The base is the portion people actually name, so the common case needs no
arithmetic. The default serving's factor is 1 by definition, and there is a
test for it.

**`log_date` is a `date`; `logged_at` is an instant.** They answer different
questions. Supper at 00:30 belongs to the day the user thinks it does, which is
why the day is stored and not derived. Server-side, `local_today()` reads
`profiles.timezone` — `current_date` on a UTC server is the previous day for
the first eight hours of every Malaysian morning.

**One wide `user_settings` rather than three narrow tables.** All of it is
strictly 1:1 with the user, always read together, always written a field at a
time. Three tables would be three selects, three upserts and three sets of
policies to keep identical, for a normalisation with no cardinality to model.

**There is one catalogue and users cannot write to it.** `foods` used to carry a
nullable `owner_id` so a user could keep private dishes in the same table. That
is gone: every row is shared, `slug` is `not null` and unique because it is real
identity now, and `authenticated` holds `select` and nothing else. The cost is
that a photo matching no catalogue row has nowhere to land — see the scanning
seam below.

**Images are stored as paths, never URLs.** `avatar_path` and `photo_path` hold
a key inside a bucket. Moving to Cloudflare R2 (still open) is then
a change of base URL rather than a migration over every row.

## Seams left open

**Calorie scanning.** Most of the shape is here: `entry_source` has a `camera`
value, `food_logs.photo_path` exists, and the private `meal-photos` bucket
exists, so a scan that resolves to a catalogue row writes an ordinary entry and
nothing moves. `foods.verified` tells a reviewed dish from a guessed one.

The open question is the miss. With no per-user rows, a photo matching nothing
in the catalogue cannot be logged at all — that has to be answered by widening
the catalogue or by asking the user to pick from candidates, not by writing a
private food.

**RevenueCat.** `subscriptions` is the mirror. Nothing writes it until the
webhook exists; an empty table reads correctly as "no subscription".

**Fibre and sugar** are nullable columns on `foods`, currently unfilled. The
nutrition screen derives them from carbohydrate; that hack gets deleted as rows
get filled in rather than rewritten.

## Tests

`apps/supabase/tests/*.test.sql`, pgTAP, run with `pnpm db:test` and in CI. Each file
is one transaction that is rolled back, including `create extension pgtap`, so
running the suite leaves nothing behind and pgTAP never reaches production.

`02_rls.test.sql` is the one that matters. It runs as the `authenticated` role
with a forged `request.jwt.claims`, which is what PostgREST does on every
request. Running RLS tests as `postgres` proves nothing: the table owner
bypasses RLS and every query passes.
