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

`migrations/` starts from ONE file, and that is deliberate. The first
week's twenty-nine migrations recorded how the schema was arrived at — columns
added and dropped, functions rewritten four times, one migration whose only job
was to revoke what an earlier one granted by accident — and none of it needed
replaying, because the deployed project was already at the end of the chain and
every other database is built from scratch. So the chain was squashed into
`20260805040853_initial_schema.sql`, which is `schemas/*.sql` concatenated in
`schema_paths` order plus the two things below, and the remote migration ledger
was reset to that single version. Nothing about the workflow changed: the next
change is still `pnpm db:diff <name>`, and the baseline is never edited again.

One thing lives outside `schemas/`, because `supabase db diff` cannot see it,
and it is folded into the foot of that baseline:

| what | why |
|---|---|
| the `select seed_archetype_foods()` call | the rows are data, and a diff only ever emits structure |

There used to be a second: the `storage` buckets and their object policies,
invisible to the diff because it ignores the `storage` schema entirely. Images
moved to Cloudflare R2 and both buckets were deleted, so that exception is gone
— `tests/03_storage.test.sql` now asserts the absence rather than the shape,
since a bucket recreated through the dashboard would still be invisible to
every other check in the pipeline.

The `auth` schema is **not** in that category — see below.

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

The CSV loader is for the bulk import. The other way in is `import_foods`
(`95_import_foods.sql`), which takes a JSON payload of researched dishes and
returns a verdict per row — inserted, skipped as a duplicate, or rejected with a
reason — rather than failing the batch. It is `service_role` only, and unlike
the CSV loader it is a declared function rather than a script, because it makes
decisions: the dedupe rule it applies is `food_name_norm`, the same expression
the `name_norm` column is written with, and a second copy of that rule outside
the database would eventually disagree with the column it compares against.
`tests/06_import_foods.test.sql` pins the verdicts.

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
       ├── weight_logs ────── the source of truth for current weight
       └── health_connections  which health store, and how far back it has read
            ├── activity_days ───── one day of movement, keyed by local date
            ├── activity_sessions  one workout, keyed by the store's own id
            └── activity_hours ──── steps by local hour, last month only

foods ──── food_servings      the shared catalogue, read-only to clients
```

Read shapes are views, all `security_invoker`: `food_details`,
`food_log_details`, `daily_nutrition`, `user_food_stats`, `current_daily_goals`.
Plus `goals_on(date)` and `logging_streak()`, and the two range families —
`trend_days` / `trend_series` / `trend_summary` for the diary, and
`activity_days_range` / `activity_series` / `activity_summary` for movement.

`day_marks(from, to)` sits beside them and is the one that takes DATES rather
than a named range: it feeds the week strip on Today, which is a calendar week
and any earlier one swiped back to, so there is no window for `local_today()`
to name.

**The activity tables are the one thing `authenticated` writes in bulk**, and
they are the only tables in this schema with a background writer. Nothing about
them needs a server: the data is already on the user's phone, behind a
permission granted to the app, so there is no secret to hold and nothing for an
edge function to authenticate against. What makes that safe to repeat is the
keys — a day by its date, an hour by its hour, a session by the health store's
own identifier — so the phone re-reading the last seven days on every foreground
converges instead of doubling. See the app's `data/health-sync.ts` for why it
re-reads a window rather than tracking a cursor.

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

**Images are stored as keys, never URLs.** `avatar_path` and `photo_path` hold
an object key, and that is what made the move to Cloudflare R2 a change of base
URL rather than a migration over every row. It also made the *shape* of a key
free to change with it: one bucket now holds both kinds, so the kind leads —
`meals/<user>/<uuid>.jpg`, `avatars/<user>/<uuid>.jpg`.

**Images live in Cloudflare R2, behind the `photos` function.** Supabase Storage
let the client talk to the bucket and let Postgres decide whether it was allowed
to, as eight RLS policies over `storage.objects`. R2 has no notion of a user, so
that check is now `ownsKey` in `functions/_shared/r2.ts` and the client holds no
credential at all — it asks the `photos` function for a signed URL that expires.
Uploads still go phone → R2 directly; only the signature is a round trip.

Two things the buckets used to enforce for free are worth knowing about. The
mime allowlist survives as a SIGNED HEADER, so an upload sending a different
content type fails R2's own signature check. The size limit does not: a
presigned PUT has no length condition, so the ceiling is checked against what
the client declares when it asks for the URL, which stops the oversized photo
that skipped the resize and would not stop a client that lied.

## Seams left open

**Calorie scanning.** Most of the shape is here: `entry_source` has a `camera`
value, `food_logs.photo_path` exists, and the R2 bucket behind the `photos`
function holds the object, so a scan that resolves to a catalogue row writes an
ordinary entry and nothing moves. `foods.verified` tells a reviewed dish from a
guessed one.

The open question is the miss. With no per-user rows, a photo matching nothing
in the catalogue cannot be logged at all — that has to be answered by widening
the catalogue or by asking the user to pick from candidates, not by writing a
private food.

**RevenueCat.** `subscriptions` is the mirror. Nothing writes it until the
webhook exists; an empty table reads correctly as "no subscription".

**Fibre and sugar** are nullable columns on `foods`, currently unfilled. The
nutrition screen derives them from carbohydrate; that hack gets deleted as rows
get filled in rather than rewritten.

## Function secrets

Four of them belong to R2 and are read by `functions/_shared/r2.ts`:
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. The
credentials are an R2 API token scoped to the one bucket — not an account-wide
key — and they never leave the server: the client is handed a URL that expires,
never a key that does not.

```sh
supabase secrets set --workdir apps \
  R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=ricecal-assets
```

Locally they go in `apps/supabase/functions/.env` (gitignored), which the local
edge runtime loads. Without them the `photos` function answers 503 in so many
words rather than failing at the tap, and a local stack still starts, still
resets and still scans — mock AI never reads the photo, so only the upload and
the tiles need Cloudflare to exist.

## Tests

`apps/supabase/tests/*.test.sql`, pgTAP, run with `pnpm db:test` and in CI. Each file
is one transaction that is rolled back, including `create extension pgtap`, so
running the suite leaves nothing behind and pgTAP never reaches production.

`02_rls.test.sql` is the one that matters. It runs as the `authenticated` role
with a forged `request.jwt.claims`, which is what PostgREST does on every
request. Running RLS tests as `postgres` proves nothing: the table owner
bypasses RLS and every query passes.

### The prompts

`pnpm eval:prompts` (Deno, `scripts/eval-prompts.ts`) grades the two model
calls that decide something the cascade below them cannot check: what a typed
meal names and how much of it there was, and whether a correction is a portion
change, a part change or a different dish. Both are a paragraph of English, and
both used to be edited on the strength of whichever example was on screen.

The cases assert the SHAPE of the answer — which action, how many components,
whether the count matched, whether the calorie band brackets something sane —
never an exact number, because the model is sampled and the cascade is what
turns a band into calories. Run it a few times over (`eval:prompts refine 3`)
after touching a prompt: one pass proves less than it looks.

It needs `OPENROUTER_API_KEY`, which normally lives only in the project's
function secrets. `EVAL_ENDPOINT` + `EVAL_TOKEN` point it at anything that
proxies `{system, user, max_tokens}` to a chat completion, for a machine that
has no key of its own.
