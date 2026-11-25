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
apps/web         ricecal.app: Next.js App Router code built by vinext, one Worker
apps/app-studio  the App Studio: store screenshots, creatives and listing copy
packages/shared  the few constants both sides need
.github          CI workflows (pr-assets/ is an ignored scratch folder for PR captures)
```

This one checkout holds all of RiceCal: the app, the backend, the website and
the App Studio. The website and the studio used to be the sibling repos
`ricecal-web` and `ricecal-screenshots-creator`; those are retired, so work here
even when an old note, memory or PR names them. The one sibling repo still in
use is `ricecal-food-database`, which authors the catalogue data (the
`catalogue-data` skill).

`pnpm check` is typecheck + tests (jest and node) + the website's ESLint + biome. Run it before
you say you are done. Biome skips `apps/web` and `apps/app-studio`; the website
has its own ESLint rules and the studio has none.

**Always include screenshots in PR descriptions after UI testing.** Capture the
final UI and save it, with any recording and the mockup it was built from, in
`.github/pr-assets/<topic>/` (one kebab-case folder per PR, ignored by git) and
upload it as a GitHub attachment:
reference it in the description by that path (`![alt](.github/pr-assets/<topic>/after.png)`)
and pass the same path to `--attach` on `gh pr create`, `gh pr edit` or
`gh pr comment`, which uploads it and rewrites the reference. **Never commit
screenshots, recordings or other evidence**: committed evidence once made every
clone 101 MB bigger. Non-image evidence goes in the description as text. Then
read the description back and check every image is a
`github.com/user-attachments` URL. Local file paths and a text-only report are
not enough. Keep private account details out of the images. Include
before/after screenshots only when both were actually captured. The `create-pr`
skill covers the rest of the description.

**Expo has changed.** Read the versioned docs at
<https://docs.expo.dev/versions/v58.0.0/> before writing any Expo code. Do not
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

**Every visible UI change starts from a generated mockup.** Load `ui-mockups`
before building or restyling anything a user sees (an app screen, sheet, card,
row or state, a website page or section, an App Studio view) and before a design
or user review of one. It draws the screen first with `image-generation`, which
uses whichever image model is available (Codex, Antigravity, or the agent's own
tool), builds toward that picture with the project's real components, and checks
the real UI against it before the change is done. A generated mockup is usually
more coherent than a first build, and it is the guide every later round and
review compares against. Attach it beside the final screenshot in the PR. The
skill names the only exceptions: nothing visible moves, or the user supplied the
design, which then is the guide.

**Do not add a documentation file.** Everything goes in `README.md`. Scattered
docs are what this layout replaced.

**Analytics changes require table synchronization.** Apply
`.agents/skills/maintain-analytics-tracking/SKILL.md` whenever changing or reviewing
PostHog, GA4, RevenueCat revenue, identity, provider gates or dashboard settings.
Update the canonical Analytics tables in README.md in the same change. Keep the
`.agents` and `.claude` skill copies synchronized and run the inventory test.


## The website (`apps/web`)

**This is Next.js code that does not run on Next.js.** It is built and served by
[vinext](https://github.com/cloudflare/vinext), Cloudflare's reimplementation of
the App Router API on Vite. The `next` package is not installed: every `next/*`
import resolves to a vinext shim. Where the Next.js docs and vinext disagree,
vinext wins. Before relying on a Next.js feature, check
`apps/web/node_modules/vinext/README.md` (its API coverage and *Known gaps*) and
`.claude/skills/migrate-to-vinext/references/compatibility.md`. Webpack and
Turbopack configuration do nothing here.

README: *The website*. Load the `work-on-website` skill before changing it. Run
`pnpm web:dev`, then `node apps/web/scripts/links.mjs` after a visible change,
and look at it in a browser, both themes and a phone width. For SEO work load
`seo-loop` first.

- **`src/lib/catalogue.ts` and `src/lib/catalogue-static.ts` are generated.**
  Never hand-edit them; run `node scripts/catalogue.mjs` from `apps/web`.
- **hreflang is a cluster**, and every page links to every other page and to
  itself. `HREFLANG_HOME` and `HREFLANG_FOOD` in `src/lib/seo.ts` must not bleed
  into each other, and only the home cluster has `x-default`.
- **The two pages per market answer different questions**, and a country page
  is never one template with the name swapped in. That is a doorway page.
- **Structured data matches what is rendered.** No `aggregateRating`, ever.
- **Element defaults belong in `@layer base`.** An unlayered rule beats every
  Tailwind utility.
- **A missing dish 404s, an unreachable catalogue 500s.** A 404 would tell
  Google to drop a page that is really there.
- **Dish pages are `noindex, follow` and not in the sitemap.** The September
  2026 spam update took the whole site out of results for 52,000 templated
  pages. Do not re-index them in bulk.
- **Prerendered pages are frozen until the next deploy**, and a Worker version
  holds at most 100,000 asset files. Do not raise `STATIC_LIMIT` without that sum.
- **`cloudflare.config.ts` is the Worker's config; there is no `wrangler.jsonc`.**
  Keep the `DOQueueHandler` tombstone. Do not declare `WEB_CATALOGUE_TOKEN`
  there. `cf` and `@cloudflare/vite-plugin` are betas pinned exactly.
- **`src/lib/pricing.ts` is a snapshot** of App Store Connect's prices. Re-read
  it there rather than editing a figure on a hunch.
- **Bump `LEGAL_LAST_UPDATED` whenever a legal page changes**, and keep the
  legal pages describing the app's real data flow.
- **Its analytics contract is the README's *Website product analytics*.** Six
  events, all in `EVENTS`; adding one means arguing it is worth the weight.
- **A merge to `main` is the website's deploy**, through the **Web** workflow
  (`web.yml`), which also uploads every PR's build as an unused Worker version.
  It deploys with the `CLOUDFLARE_WEB_API_TOKEN` secret, a token that can only
  deploy this Worker.

## The App Studio (`apps/app-studio`)

README: *The App Studio*. Load the `work-on-app-studio` skill before changing it.
`pnpm studio:dev` serves it on port 3001. Store uploads
go through the `asc` and `gplay` CLIs, which hold their own credentials; the
studio's `.env.local` names only the app to write to. `$update-whats-new` writes
the release note in `src/data/appDescriptions.ts` and opens its PR here, and
`$update-app-studio-screenshots` recaptures the app screens in every language
from the `app-studio-seed-data` branch.

- **Exports need a visible, foreground tab.** Rasterization waits on
  `requestAnimationFrame`, which a background tab never fires.
- **Captures carry recorded checksums.** After replacing one, recompress it with
  `oxipng -o 4 --nc --strip safe`, then record its checksum, and run
  `pnpm --filter @ricecal/app-studio check:screenshots`.
- **Uploads change the live store listing.** Upload only when asked, and dry
  run first.
- **The API answers this Mac's own page only.** Keep the `127.0.0.1` binding,
  `src/middleware.ts` and `stageLocale`'s name checks: without them any web page
  or LAN machine could delete files here or rewrite the listings.
- **Keep large binaries out of history.** The studio's captures are most of this
  repo's size. Replace a capture set in one commit rather than iterating on it
  in several, and keep PR screenshots small JPEGs.

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

**The history was rewritten on 2026-11-09.** Every branch was force-pushed
without `.github/pr-assets/` (159 MB of committed PR screenshots), so every
commit before that date has a new SHA. A branch, worktree or clone made before
then still carries the old history: move only its own commits onto the new
`main` (`git rebase --onto origin/main <the old main commit it started from>`)
and never push it as it is, or the screenshots come back. Old PR descriptions
still show their images, because GitHub keeps each PR's commits.

**Devices come from a small pool.** Every simulator and emulator is leased
from the Simlock pool on this machine (the `drive-the-app` skill), which runs two
devices at once and at most one Android emulator, so close yours when you are
done. Memory is the limit, and the failure mode is wrong answers rather than
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
run it from: where the credentials are, which stack the app points at, how
functions deploy, and which skill holds the rest. The README documents the product;
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
| `POSTHOG_PROMPTS_API_KEY` (PostHog personal key, `llm_prompt:read` only) | the function secrets, and `.secrets/posthog-prompts.key` for `pnpm prompts:check` |
| `OPENROUTER_API_KEY` (production) | the function secrets, and it cannot be read back |
| `OPENROUTER_API_KEY` (local testing, a separate key on the same OpenRouter account) | `apps/supabase/functions/.env` |

**The secrets endpoint returns digests, not secrets.**
`GET /v1/projects/<ref>/secrets` puts a 64-character hex hash in `value`. A
script that reads that field and sends it as a bearer token gets a 401 from
OpenRouter rather than an obvious "that is a hash", which is an expensive
twenty minutes. That is why local testing uses its own key, kept in
`apps/supabase/functions/.env`, rather than the production one. The same
file sets `MOCK_AI=true` so the local stack spends nothing; override it for a
script that should reach the model (`MOCK_AI=false deno run --env-file=…`).

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

**Resetting the local database without losing its accounts.** `pnpm db:reset`
wipes every row, including the signed-in simulator's session. To keep them,
dump first with `pg_dump --data-only --disable-triggers --schema=public
--schema=auth --schema=storage` inside the db container, reset, then restore.
The restore looks clean and is not: `--disable-triggers` cannot disable the
triggers on `auth.users` (another role owns it), so loading the users fires
`handle_new_user`, which makes default `profiles`, `user_settings` and
`meal_times` rows; the dump's own rows for those three then collide and each
table's whole `COPY` is refused, while the row counts still match. Load those
three again into a temp table and upsert them by primary key. Never delete a
profile to make room, since everything cascades from it. Compare a few known
values (`onboarded_at`, reminder days) rather than counts.

**Folding a change into a branch's one unreleased migration needs no reset.**
`pnpm db:diff` compares the schema files with what the migrations folder builds,
not with the local database. Move the branch's migration out of `migrations/`,
diff, and the output is the whole migration again from `main`; give it the old
file's version, restate the hand-written revokes at its foot, and apply only the
difference to the local database with `psql`, since it already holds the old
version. Diff once more with the file back in place: it should report nothing.

## Deploying edge functions

**A merge to `main` already deploys them.** The Supabase GitHub integration
tracks `main`: it applies new migrations, then redeploys every function, within
about a minute of the merge. Nothing in `.github/workflows` shows it. Check the
result through the Management API (`schema_migrations`, and the versions at
`/v1/projects/<ref>/functions`). The CLI below is for a hotfix between merges.

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

## Native builds

**An edit under `widgets/ios/` needs a prebuild, or a copy.** `withWidgets.js`
copies those files into `ios/RiceCalWidgets/` at prebuild time, so
`expo run:ios` without one compiles the stale copy and the widget or Live
Activity keeps the old code with no warning. `cp widgets/ios/*.swift
ios/RiceCalWidgets/` before an incremental build is enough, plus `cp
widgets/ios/WorkoutActionIntent.swift ios/RiceCal/`: the Live Activity's
buttons run in the app, so that file is in the app target too, and a stale copy
there runs old code behind a new-looking button. A *new* Swift file needs
`expo prebuild --clean`, because the targets' source lists are written once.

**`pod install` from an agent's shell needs `LANG=en_US.UTF-8`.** Without a
UTF-8 locale CocoaPods dies while *reporting* whatever went wrong
(`Unicode Normalization not appropriate for ASCII-8BIT`), so a prebuild looks
like it failed for an encoding reason. With the locale set the same install
passes. `expo prebuild` runs it, so set it there too.

## The rest of the workbench is in skills

These notes load when a task needs them, not in every request. This file is
read into every agent request, so a section here costs tokens on every turn
of every session (see the README's *Agent instructions cost tokens*). Load the
skill before the work it names:

| skill | before you |
|---|---|
| `drive-the-app` | launch, deep link, screenshot or test the app on a simulator or emulator, or test offline |
| `drive-the-watch` | build, install or drive the Apple Watch app |
| `hosted-supabase` | run SQL against the hosted project, or need a session on it |
| `catalogue-data` | change what is in the D1 catalogue, or research a food source |
| `payments-consoles` | touch RevenueCat, App Store Connect or Play products, or debug a purchase |
| `grade-scans` | change a scan prompt, the cascade or the model routing |

## Copy

**Keep user-facing strings terse.** First drafts of labels, hints, empty states
and confirmation dialogs run long — two sentences where one does, both sides of
a toggle explained where naming one is enough — and they get cut. Write the
shortest string that still says the thing, then cut again. Drop a hint entirely
if the label already carries it. The one tooltip is `InfoTip` (an ⓘ that opens
a bubble), for where a figure came from; it is not a place to park a detail
that will not fit, which is a detail to cut rather than to hide. Every string is also
carried into twelve other languages (`src/i18n/languages.ts` is the list), so
length costs screen space and translation churn in all thirteen.
