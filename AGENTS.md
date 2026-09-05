# Working in this repo

**[README.md](README.md) is the documentation.** It explains the whole project:
the architecture, every feature, the rules that must not be broken, and the
traps. Read the section you are about to touch before you touch it.

This file is only the things an agent needs that are not in there. It is the
one set of instructions for every agent: `CLAUDE.md` is a pointer to it, and
anything reading `AGENTS.md` by convention gets the same thing.

## Before you start

```
apps/mobile      Expo / React Native app (expo-router, NativeWind, react-query)
apps/supabase    Postgres schema, RLS, pgTAP tests, Deno edge functions
apps/cloudflare  workers/ and d1/, one directory per Worker and per database
packages/shared  the few constants both sides need
```

`pnpm check` is typecheck + jest + biome. Run it before you say you are done.

**Expo has changed.** Read the versioned docs at
<https://docs.expo.dev/versions/v57.0.0/> before writing any Expo code. Do not
work from memory of an older version.

## Rules for changes

**Read "Rules you must not break" in the README** before changing anything in
the diary, the catalogue, entitlement, health sync or photo storage. Each entry
there records a bug that shipped. They are not style preferences.

**Deploy the schema first, then the code that reads it.** D1 schema → the Worker
→ the edge functions → the app. The README has the full version and why the
order cannot be reversed.

**The app is released, so the backend can only ever be extended.** A binary in
a store calls Supabase and Cloudflare forever: `runtimeVersion` is
`appVersion`, so an OTA update cannot reach a user on an older version, and
nothing gates a request on which version sent it. Add fields, keep answering
with the old ones, default anything new, and never narrow an enum, a constraint,
an RLS policy or a response shape an old app depends on. Renaming is deleting.
Removing runs backwards over a store release, not over a deploy. Before you
touch a Worker route, an edge function's request or response, or a column the
app writes, ask what 1.0.0 does when it meets your change. The README's
"The store holds copies of the app you cannot recall" is the full version.

**The database is declarative.** Edit `apps/supabase/schemas/*.sql` and generate
a migration with `pnpm db:diff <name>`. Never hand-write a migration and never
apply SQL through the dashboard or the Supabase MCP server: `supabase-drift`
will catch it, and it goes red on a change that is genuinely in the repo.

**Do not add a documentation file.** Everything goes in `README.md`. Scattered
docs are what this layout replaced.

## Writing

**Comments explain why, in plain English.** Worth the space when the reason is
not recoverable from the code: a bug that motivated a shape, a constraint that
looks arbitrary. Keep them short. Match the density around you.

**No em dashes or en dashes in anything a user reads.** That covers
`src/i18n/en/*`, any string reaching a screen, a notification, a share sheet or
a toast, and the model prompts that produce text we display back. Use a comma, a
full stop, a semicolon or brackets. Rewrite the sentence rather than swapping
the punctuation.

A lone `—` standing in for a missing measurement is a symbol, not a sentence, and
it stays. A missing *name* gets a word ("Someone") instead.

**Commit subjects are a sentence about what changed**, not a
conventional-commits prefix.

## Things that waste the most time

These are the ones an agent hits first. The README has the rest.

**One simulator at a time.** This machine cannot run the iOS simulator and the
Android emulator together, and the failure mode is wrong answers rather than
slowness: a Gradle build beside a jest run pushed 18 tests past their timeout
with nothing broken. Stop the daemons afterwards (`./gradlew --stop`, then
`pkill -f GradleDaemon`, `pkill -f kotlin-daemon`).

**A fresh local account is a free account.** `handle_new_user` writes no
`subscriptions` row, so the fourth scan of the day fails and describe, refine and
the recipe reader all answer 402. That reads as a broken pipeline. The README has
the one-row fix.

**Adding or renaming an edge function** needs a full stop and start of the local
stack.

**Edge functions are Deno and outside the pnpm workspace.** `pnpm check` does not
see them. Their typecheck is
`deno check --no-lock --config <fn>/deno.json <fn>/index.ts`.

**`supabase db diff` misses function grants**, and a function's comments count as
part of its body. Both are in the README's Traps section.

**Changing `tailwind.config.js` needs `npx expo start --clear`.** A stale
NativeWind cache produces an app with no styling at all rather than an error.

---

# The workbench

Everything above is about the code. Everything below is about the machine you
run it from: how to reach the live project, how to get a session, how to drive
the app, and which routes are dead ends here. The README documents the product;
this documents the workbench, and it is written down because each line cost a
session to learn.

**No secret is written here. This repo is public.** Where each credential lives
is named; its value never is. Values stay in `.secrets/` (gitignored wholesale),
in the login keychain, or in the console that issued them. The same goes for
account addresses, passwords and store identifiers: name the file, not the
value. The half that cannot be written here is `.secrets/agent-notes.md`, which
every agent working in this checkout can read and no commit can carry.

## Credentials, and where each one lives

| what | where |
|---|---|
| Supabase CLI access token (`sbp_…`) | login keychain: `security find-generic-password -s "Supabase CLI" -w` |
| service-role and publishable keys | `GET https://api.supabase.com/v1/projects/<ref>/api-keys?reveal=true` with that token |
| Postgres password | `.secrets/db.env`, loaded with `set -a && . ./.secrets/db.env && set +a` |
| the eval account's email and password | `.secrets/eval.json` (it also holds a `service_role` fallback) |
| RevenueCat's Play service account | `.secrets/revenuecat-play.json` |
| `gplay` service account key | `~/.gplay/play-console-cli.json`, profile in `~/.gplay/config.json` |
| App Store Connect API key | `.secrets/*.p8`, reached through the `asc` CLI profile |
| project ref, anon key, catalogue URL | `apps/mobile/.env.local` |
| test account addresses, passwords and uids | `.secrets/agent-notes.md` |
| project and org refs, store and RevenueCat identifiers | `.secrets/agent-notes.md` |
| `OPENROUTER_API_KEY` | the function secrets, and it cannot be read back |

**The secrets endpoint returns digests, not secrets.**
`GET /v1/projects/<ref>/secrets` puts a 64-character hex hash in `value`. A
script that reads that field and sends it as a bearer token gets a 401 from
OpenRouter rather than an obvious "that is a hash", which is an expensive
twenty minutes. It is why `pnpm eval:prompts` cannot run on a machine that has
never held the key, and why a prompt change is graded by deploying and driving
the function that does hold it.

## Which stack the app is pointing at

`apps/mobile/.env.local` decides everything, and three files sit beside it:
`.env.local.cloud-current`, `.env.local.cloud-backup` and
`.env.local.localstack-backup`. Swap by copying one over `.env.local`.
`EXPO_PUBLIC_*` vars are inlined when Metro starts, so restart Metro with
`--clear` after a swap; restarting the app alone changes nothing.

**The catalogue cannot be tested against the local stack.** There is no local
D1, so `EXPO_PUBLIC_CATALOGUE_URL` names the deployed Worker whichever env you
are on, and the Worker verifies the caller's token against the *hosted* project.
A local-stack JWT is signed with the local demo secret and can never pass, so
All foods draws "Could not search" for every query and nothing in the app is at
fault. Test the catalogue arm on the cloud env and the diary, foods and RLS arms
on the local stack.

Local stack ports are 544xx (`api 54421`, `db 54422`, Mailpit `54424`). `psql`
is not on PATH: `docker exec supabase_db_ricecal psql -U postgres`.

## Running SQL against the hosted database

Two routes, and the first is the one scripts use.

**The Management API query endpoint.**
`POST https://api.supabase.com/v1/projects/<ref>/database/query` with
`{"query": "..."}` runs arbitrary SQL with the CLI token from the keychain and
returns the last statement's rows as JSON. `apps/supabase/scripts/lib/sql.mjs`
wraps it (`runSql`), resolving the ref from `EXPO_PUBLIC_SUPABASE_URL` and
honouring `SUPABASE_ACCESS_TOKEN`.

- **It throttles, and a long loop will hit it** (429 `ThrottlerException`).
  `runSql` retries a 429 with backoff and retries nothing else. Before that
  existed, bulk runs died half-applied and reported success because the caller
  was piping stderr to `/dev/null`. Never count a loader's output lines as its
  result.
- Its role is not superuser. `set "pg_trgm.similarity_threshold"` inside a
  function body does not take (the GUC is not loaded on that connection) — put
  an explicit `similarity(...) >= x` beside the `%` operator instead.
- Statements sent this way bypass migrations exactly as a dashboard edit does,
  which is what `supabase-drift` catches. For schema, always write the migration
  file at the same version and insert its
  `supabase_migrations.schema_migrations` row. `pnpm db:apply <file>` does both.
- pgTAP is not installed on the hosted project and must not be. To check a
  pgTAP file's logic without a local stack, run its payloads inside one
  `begin; … rollback;` query and assert on the returned rows.

**A direct connection**, for `COPY` and anything else the endpoint cannot do.
The password is in `.secrets/db.env`; the reachable host is the **session
pooler** on port 5432, not the transaction pooler on 6543, and not
`db.<ref>.supabase.co`, which does not resolve from here.

**The project is on the free plan, with a 500 MB ceiling.** Crossing it does not
fail the statement: Supabase flips the whole database to
`default_transaction_read_only = on`, which then refuses even the `drop table`
that would free the space. Recover with `set default_transaction_read_only = off`
on a session, then drop what grew. Any bulk load must commit per batch and check
`pg_database_size` between batches. After a delete-and-reload the tables are
badly bloated (`foods` once sat at 247 MB for 47,000 rows); `vacuum (full,
analyze)`, smallest table first, took the database from 420 MB to 82 MB.

## Deploying edge functions

```sh
export SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
supabase functions deploy <fn> --workdir apps --project-ref <ref> --no-verify-jwt
```

The CLI bundles from disk. Prefer it over the MCP `deploy_edge_function` route,
which takes file content inline and so turns a deploy into reproducing thousands
of lines exactly and then diffing to prove the upload was not corrupt.

- `--no-verify-jwt` for `healthcheck`, `scan-meal`, `scan-refine` and `photos`:
  each inspects the Authorization header itself so it can say which half failed.
- Typecheck first with what CI runs:
  `deno check --no-lock --config functions/<fn>/deno.json functions/<fn>/index.ts`.
- Each function bundles its own copy of `functions/_shared`, so a change there
  needs every function that imports it redeployed.

**Locally, the edge runtime serves a stale `_shared`.** After editing
`functions/_shared/*.ts`, a call can run the old code with no error and no log
line saying so: a new response field appeared immediately, a regex change two
edits later did not. Run
`docker restart supabase_edge_runtime_ricecal && sleep 8` before testing.
Adding or renaming a function is different and still needs the full
`supabase stop && supabase start --workdir apps`.

**Local object storage.** `functions/_shared/r2.ts` reads an optional
`R2_ENDPOINT`, so the local stack can point the storage seam at the S3 that
Supabase already runs beside it; without it `photos` answers 503 and no photo
path can be walked. Put the four R2 vars in `apps/supabase/functions/.env`
(gitignored) with the access key and secret that `supabase start` prints. Use
the Mac's LAN IP (`ipconfig getifaddr en0`), not `127.0.0.1`: the phone and the
edge-runtime *container* both have to reach it, and inside the container
127.0.0.1 is the container (`tcp connect error: Connection refused`). That env
is baked in at container creation, so a `docker restart` does not pick up an
edit; stop and start the stack.

## Getting a session, with no mailbox

**`POST /auth/v1/admin/generate_link`** with the service-role key returns
`email_otp` in plaintext alongside `hashed_token` and `action_link`, and sends
no mail. Types: `signup`, `magiclink`, `recovery`, `invite`, `email_change`.
Pass `redirect_to` explicitly or it falls back to `site_url`, which makes an
allow-list test look like it passed when nothing was tested.

**Password sign-in on the hosted project is captcha protected.**
`security_captcha_enabled` is on, so `/token?grant_type=password` answers
`captcha_failed` on an account whose password is fine — which reads as a broken
account rather than as a project setting. `/auth/v1/verify` is **not** protected:
the captcha guards the endpoints that ask for something (`/token`, `/signup`,
`/otp`, `/recover`), never the redeeming of a code the server itself issued.
That asymmetry is the whole trick, and `apps/supabase/scripts/lib/live.mjs`
takes either an `EVAL_ACCESS_TOKEN` or the service-role key and does it.

**When a token was created by a real client call** there is no plaintext
anywhere, and `generate_link` would overwrite it. Recover it instead: GoTrue
stores `sha224(email + otp)` hex in `auth.users.confirmation_token` (magic links
and resets land in `recovery_token`), and a six digit code is a million
candidates, which brute-forces in about a second in Node.

- **The mailer rate-limits at 60 seconds per address** (`smtp_max_frequency`),
  and a test script will hit it: a second `/signup` seconds after the first
  answers 429, not the `identities: []` you were testing for. Create the prior
  account with `POST /auth/v1/admin/users` and `email_confirm: true`, which
  sends nothing.
- Use `+tag@` addresses and delete them at the end with
  `DELETE /auth/v1/admin/users/<id>`; nothing else cleans them up.
- **A row INSERTed straight into `auth.users` breaks `generate_link`**, which
  answers `500 "Database error finding user"`: GoTrue scans several token
  columns into Go strings and a NULL is not one. After seeding, set
  `confirmation_token`, `recovery_token`, `email_change_token_new`,
  `email_change_token_current`, `email_change`, `phone_change`,
  `phone_change_token` and `reauthentication_token` to `''` and confirm the
  address. `confirmed_at` is generated — assigning it fails the statement.
- Do not drive the *app's* sign-in with a generated OTP: the app's `verifyOtp`
  rejects a token it did not send itself, so the code reads as "wrong or
  expired" in the UI while verifying fine over REST. Sign in with a password.
- Two sessions cannot share one refresh-token chain. Supabase rotates on use and
  revokes the chain when an old token is presented again, so a script and the
  simulator signed in as the same account kill each other
  (`refresh_token_already_used`). Give the script its own throwaway account.
- Setting a password revokes that account's sessions, so a simulator signed in
  as it lands back on the welcome screen.

**Test accounts.** Three plus-tagged accounts on the hosted project, one on each
side of the paywall and one sandbox buyer, plus the eval account behind
`.secrets/eval.json`. Their addresses, passwords and uids are in
`.secrets/agent-notes.md`, which is gitignored, and never in this repo.
**All three are onboarded** (checked, 2026-09-05; an older note calling the free
one un-onboarded is wrong), so none of them is a way back into onboarding — that
needs a fresh signup. The free one carries a `subscriptions` row at `expired`
rather than no row at all, which entitles the same as none. A fresh account needs
`profiles.onboarded_at` (plus sex, birth date, height, target weight) and one
`weight_logs` row, or the app opens on onboarding; `weight_logs` wants
`measured_on`, not `log_date`. Pick a uuid the pgTAP suite does not seed
(`1111…`, `2222…`, `3333…`), or `07_recipes` fails on a duplicate key that names
nothing you touched.

**Signing out and back in is more trouble than moving a row.** To see the free
side of a gate on the account the simulator is already holding, set the Pro
account's `subscriptions.status` to `expired`, look, then put it back — write
the restore down before running the first statement. `current_period_end` stays
put and `isEntitledRow` reads both. Restart the app rather than reloading: the
subscription query is persisted to MMKV, so a reload rehydrates the old answer
first.

## Driving the iOS app

A simulator build is already on disk, so verifying a UI change does not need
`pnpm ios` (a prebuild plus a full compile):

```
~/Library/Developer/Xcode/DerivedData/RiceCal-*/Build/Products/Debug-iphonesimulator/RiceCal.app
```

`xcrun simctl install <udid> <that path>` puts it on a booted simulator in a
second. It is a dev client, so it runs whatever is in the working tree and a
Metro reload picks up an edit without reinstalling.

- **The scheme is `ricecal://`, not `ricecal-dev://`.** `app.config.ts` says
  `ricecal-dev` for the dev variant and the installed Debug build registers
  `ricecal`; trusting the config gets you
  `LSApplicationWorkspaceErrorDomain error 115`. Read the binary:
  `PlistBuddy -c "Print CFBundleURLTypes" <app>/Info.plist`.
- Then any screen is one call: `ricecal:///paywall`, `ricecal:///reviews`,
  `ricecal:///settings/subscription`, `ricecal:///log?panel=camera`. Much faster
  than tapping, and it reaches screens the UI only offers after a refusal. A
  deep link is restored as the route after a Metro reload, and some screens
  crash when they mount before the session has loaded; `restart-app` clears it.
- **A Metro answering on 8081 is not necessarily this project's.** Another
  project on the machine takes it first and answers `packager-status:running`
  identically. `curl -s localhost:8081/json/list` names the app. Start this one
  on another port rather than fighting for 8081.
- **Do not pass `--localhost`.** It binds Metro to `::1` only, while the dev
  client asks for `http://127.0.0.1:<port>`, so the client red-boxes with "Could
  not connect to development server" while `curl localhost:<port>` answers 200
  and looks fine. Plain `npx expo start --port 8082` binds both. Point the
  client at it with
  `ricecal://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082`, and
  warm the bundle with a `curl` of the entry bundle first (about 30 s cold) or
  the client red-boxes rather than waiting.
- **The dev-menu bubble eats taps in the top right** — roughly x 0.84-0.95,
  y 0.10-0.22, a region much larger than the visible circle, over every `AppBar`
  action and the plate sheet's first "+". Hiding the tools button leaves the
  region live and the app is portrait-locked, so nothing moves it. What works is
  giving the screen a second, temporary way in (an `onPress` on a card lower
  down), driving it, then reverting against a copy taken beforehand.
- Typing on the simulator drops characters: pass `delayMs: 160` to the keyboard
  tool.
- Photos for the library: `xcrun simctl addmedia <udid> <file>`. There is no
  camera, but the library button in `InlineCamera` is there.

## Driving the Android app

- `expo run:android --device emulator-5554` fails with "Could not find device
  with name": that flag wants a device *name*, not an adb serial. Omit it and it
  picks the running emulator.
- A first build is ~15 minutes and outlives a harness background-task timeout.
  Run it detached and watch for the package with `adb shell pm list packages`,
  or it gets killed mid-compile. Kill the daemons afterwards — left running they
  starve the emulator until `system_server` ANRs and taps stop landing.
- The dev client cannot find Metro on its own: `adb reverse tcp:8081 tcp:8081`,
  then
  `adb shell am start -a android.intent.action.VIEW -d "ricecal://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`.
- **No soft keyboard appears when you tap a field.** Gboard ships with "Write in
  text fields" (stylus handwriting) on, which replaces the keyboard with a
  floating strip that counts as an open keyboard while reporting almost no
  height — so keyboard-avoidance code misbehaves in ways that are not real. Turn
  it off in Gboard settings. `pm clear` on the IME does not fix it and leaves the
  keyboard dead until a reboot.
- **Reaching a native module without a session.** The app is bridgeless, so
  there is no `globalThis.__turboModuleProxy`; use
  `globalThis.nativeModuleProxy.<Name>`. Its methods return promises and the
  debugger serializes by value, so park the result on a global and read it back
  in a second call. This is how the Health Connect permission sheet was
  exercised end to end without an account, since onboarding puts the health step
  after the account write.
- The app's own supabase client is reachable through Metro's module registry —
  `globalThis.__r.getModules()` returns a **Map**, so `Object.keys` on it is
  empty; iterate and find the export with `auth.getSession`. Patching
  `globalThis.fetch` does not work: supabase-js captured `fetch` at
  construction.

## Testing offline behaviour

**The simulator reports NetInfo as connected however the host's wifi is set** —
measured, `onlineManager.isOnline()` stayed true for minutes with the host fully
offline. Never test offline by taking the machine off the network: it kills the
agent session and does not even produce the state you want.

A faithful offline launch is two halves and you need both:

1. **NetInfo offline.** Temporarily make `initOnlineManager` in
   `apps/mobile/src/lib/online.ts` call `onlineManager.setOnline(false)` and
   return early. This survives a cold launch, which evaluating in the debugger
   cannot.
2. **Requests failing.** Point `EXPO_PUBLIC_SUPABASE_URL` at
   `https://<same-ref>.supabase.invalid`. The ref must not change: the session's
   storage key is `sb-<first hostname label>-auth-token`, so a different host
   means a different key and the app finds no session to restore.

Everything offline keys on react-query *pausing* a query, so a test that leaves
NetInfo saying "connected" exercises the failing branch instead of the paused
one and proves nothing. The persisted cache, which is usually what you actually
want to read, is MMKV at
`$(xcrun simctl get_app_container <udid> com.nelsongan.ricecal data)/Documents/mmkv/ricecal-query-cache`;
the file appends, so parse the last `{"buster"` blob, not the first.

## The catalogue in D1

The catalogue is Cloudflare D1, reached only through `wrangler`. The Worker is
`apps/cloudflare/workers/catalogue` and the shape is
`apps/cloudflare/d1/food-catalogue/schema.sql`, which CI applies on every merge
to main (schema before Worker) and whose every statement is safe to re-run.
`apps/supabase/scripts/lib/d1.mjs` is the transport, because
`wrangler d1 execute --json` prints a banner before its JSON.

    pnpm foods:have <term>          what is already in there, before researching more
    pnpm foods:import --dry-run     shape, arithmetic and dedup, writing nothing
    pnpm foods:gate --save before   … then --against before
    pnpm foods:dupes --since …      near-duplicates
    pnpm foods:reindex [--all]      normalized columns and the two FTS5 indexes
    pnpm foods:servings             a default portion that is a unit of measure

- **The dish payloads under `apps/supabase/data/foods/` are gitignored**, aliases
  and all. A catalogue data change is made by running `foods:import` /
  `foods:alias` against production and does not appear in a PR. Say so in the PR
  body or the change is invisible to review.
- The normalizer lives in the Worker's `src/text.ts` and the Node scripts import
  that `.ts` directly. Do not copy it: a query folded one way and a column folded
  another is a row nobody can find.
- `foods:import` skips a dish whose name is already taken, so a good row cannot
  be added under a name a bad one holds. That is what `foods:alias` is for.
- SQLite reserves `indexed`; it cannot be a column alias. Contentless FTS5 cannot
  delete a row without the values it was indexed with, so `foods:import` only
  appends and `--all` rebuilds. D1 takes at most 100 bound parameters per
  statement.

**Where the data is authored.** Not in this repo: the sibling
`ricecal-food-database` (Python, DuckDB, `uv`) normalizes each source into
`data/staging/*.parquet`, unions them, and exports the app's shape with
`scripts/export_for_ricecal.py`. Its raw artefacts are gitignored and large —
the Open Food Facts dump alone is 7.2 GB and ~20 minutes to re-download — so
deleting `data/` to save disk costs that before the next catalogue change. The
exporter reads the app's icon directories out of `../ricecal/apps/mobile/assets/icons`,
so the two repos must sit side by side.

**Open Food Facts moved the nutrition panel.** It is no longer
`nutriments.<key>_100g` but `nutrition.aggregated_set.nutrients.<key>.value`
with the basis in `.per`, keys `energy-kcal`, `carbohydrates`, `proteins`,
`fat`. A reader written against the old key does not error: it found four usable
products in 85,000 and looked like a quiet day. The new shape found 54,818 in
the same files. Read the new one first and fall back.

**The national tables that are reachable without an account**, each through the
endpoint its own web tool calls, none of them documented:

- **Singapore, HPB** — `https://pphtpc.hpb.gov.sg/bff/v1/food-portal`;
  `/foods?searchText=<letter>&pageNumber=N` enumerates, `/foods/compare?crIds=…`
  returns detail ten at a time. The best shaped of the six: a household portion
  with its weight, nutrients already priced for it, and the provenance of each.
- **Vietnam, NIN** — `https://viendinhduong.vn` (not `www.`, which 301s and
  breaks the JSON). Two tables and the difference matters:
  `/api/fe/tool/getPageFoodData` is 1,250 dishes priced per portion,
  `/api/fe/foodNatunal/getPageFoodData` is 853 ingredients per 100 g.
- **Thailand, INMU Mahidol** — `https://inmu.mahidol.ac.th/thaifcd`;
  `/appassistant/get_json_food_name?term=<letter>` enumerates, the detail page is
  HTML that reads out as `label|unit|value` once tags are stripped.
- **Taiwan, TFDA** — one 62 MB CSV at `data.fda.gov.tw`, long format, no auth.
- **Indonesia, TKPI** — `https://www.panganku.org/id-ID/view`, POST, and the form
  field is literally named `haha`.
- **India, IFCT 2017** — the `nodef/ifct2017` CSV on GitHub. Energy is in kJ, and
  its `lang` column holds each food's name in a dozen Indian languages, which is
  the real prize.

Korea and the Philippines are blocked on account creation rather than on
technique — ask before signing up in the owner's name. Pakistan's table is a
scanned pdf with no text layer, Sri Lanka's is a Blazor server app that fills
over a SignalR circuit, and Hong Kong's is sourced entirely from tables the
catalogue already holds. None needs checking again.

## Payments

Three consoles, three tools: RevenueCat (MCP), App Store Connect (`asc` CLI),
Google Play (`gplay` CLI). Product identifiers differ per store and RevenueCat
holds both; the ids themselves are in those consoles.

- **Check the store, not RevenueCat, when a purchase fails.** A product listed
  "active" in RevenueCat is only an unarchived reference and may exist on no
  store at all.
- The RevenueCat MCP key cannot attach products to an entitlement (it lacks
  `project_configuration:entitlements:read_write` and answers 403). That step is
  a dashboard click; plan for it rather than discovering it mid-run.
- A Play offer needs both a top-level `regionalConfigs` and per-phase ones, plus
  `--regions-version` from `gplay pricing convert`, or it fails with "must target
  at least one region". The base plan must be ACTIVE first.
- Two Google service accounts exist deliberately, one for the `gplay` CLI and one
  for RevenueCat's purchase validation, so rotating either does not break the
  other. Each must be invited separately in Play Console under Users and
  permissions — a manual grant no CLI can do — and Google can take up to 36 hours
  to propagate it, so a rejection right after granting is usually that.
  `gplay auth doctor` says "No issues found" on an ungranted account because it
  only checks that the key file parses; test with
  `gplay edits create --package com.nelsongan.ricecal`. Two APIs are needed, not
  one: `gplay auth setup` enables `androidpublisher`, while `gplay apps list`
  goes through `playdeveloperreporting.googleapis.com` and 403s until that is
  enabled too.
- **The purchase flow can be walked end to end on a simulator** through
  RevenueCat's Test Store, switched on by `EXPO_PUBLIC_RC_TEST_STORE_KEY` in
  `.env.local`. It compresses periods (a "year" is an hour) and auto-renews, so
  do not wait for one to lapse. Its products carry no introductory offer, so a
  purchase comes back `active` rather than `trial`, and prices follow the device
  storefront, which is the tell that the test store is live. Clean-up rows come
  back: `reconcileEntitlement` refills them from RevenueCat on the next launch,
  which is the point of it.

## Grading the scan pipeline

`pnpm eval:scan` drives the deployed functions the way the app does, with the
cascade's `debug: true` trace on every call. **Always `--repeat` when you change
something** — one pass is not a measurement.

- **The account is capped at 50 scans a day.** The full suite at `--repeat=3` is
  90, so a long run dies partway and every remaining case reports "Daily scan
  limit reached", which reads as a catastrophic regression rather than a quota
  because the cases that already ran passed. Check for that string before
  believing a wall of failures; clear `public.scan_usage` for the eval user to
  reset.
- Two cases are about 50% flaky on identical code and always have been (the
  roti canai photo's portion weight, and the part count on halving a nasi
  lemak). Do not read either as a regression without a control run.
- Cases state a calorie band, not a figure, and may band a macro too: a
  double-counted plate was defensible on calories and twice the dish on protein.
- Photo cases carry a source URL and cache into a gitignored directory rather
  than committing someone else's photographs.

## Copy

**Keep user-facing strings terse.** First drafts of labels, hints, empty states
and confirmation dialogs run long — two sentences where one does, both sides of
a toggle explained where naming one is enough — and they get cut. Write the
shortest string that still says the thing, then cut again. Drop a hint entirely
if the label already carries it. There is no tooltip component here, so a detail
that will not fit is a detail to cut rather than to hide. Every string is also
carried into twelve other languages (`src/i18n/languages.ts` is the list), so
length costs screen space and translation churn in all thirteen.
