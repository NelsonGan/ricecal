# RiceCal — Phase 0 setup state

Local scaffolding is complete and verified. No cloud account has been created,
linked, or authenticated. This file is the ledger of what is left.

App identity, fixed across every service: **`com.nelsongan.ricecal`**
(iOS bundle id, Android package, and — as `ricecal` — the deep-link scheme).

---

## 1. Toolchain on a fresh machine

Node 24 is installed via Homebrew as a keg-only formula, so it does **not**
shadow the existing `node@22` on `PATH`. Either add it to your shell profile:

```bash
echo 'export PATH="/opt/homebrew/opt/node@24/bin:$PATH"' >> ~/.zshrc
```

or install a version manager and let `.node-version` (pinned to 24.18.0) select
it per-directory. `packageManager` in the root `package.json` pins pnpm 10, so
`corepack` activates the right version automatically.

```bash
pnpm install
pnpm check   # turbo typecheck + test, then a root Biome pass
```

### Always run EAS and Expo through the root scripts

`eas.json` and `app.json` live in `apps/mobile/`, and EAS looks in the current
directory rather than walking up. Running `eas` from the repo root does not
error usefully — it decides you are starting a *new* project, writes a stub
`app.json` at the root, and then fails. The stub then shadows the real config
for anything that searches upward.

Use these instead; they run inside the app package no matter where you are:

```bash
pnpm eas <any eas command>   # generic passthrough
pnpm eas:credentials
pnpm expo <any expo command>
pnpm start                   # expo start --dev-client
pnpm build:android           # development profile
pnpm build:ios               # development profile
```

For a non-development build, use the passthrough:
`pnpm eas build --profile production --platform ios`.

### Container runtime — required before the first schema change

`supabase db diff` provisions a shadow database in Docker, and `supabase start`
(local dev stack) needs one too. **Neither is installed on this machine**, so
both currently fail with `Cannot connect to the Docker daemon`.

This does not block Phase 0 — there are zero tables to diff — but it blocks the
first real schema change, because the declared workflow is
`edit schemas/ → db diff → PR` and hand-writing migrations is explicitly out.

[OrbStack](https://orbstack.dev) is the lighter option on Apple Silicon and is
free for personal use; Docker Desktop also works.

```bash
brew install --cask orbstack
```

CI is unaffected — GitHub runners already provide Docker, so
`supabase-drift.yml` works without this.

---

## 2. Placeholders that must be replaced

### `apps/mobile/.env.local`

Copied from `.env.example`, gitignored, currently **all eight values are
`REPLACE_ME`**. `src/lib/env.ts` validates them at startup: a *missing* key
throws, a `REPLACE_ME` key passes validation but leaves that SDK uninitialised.
That is what lets the app boot before any account exists.

| Variable | Comes from |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | same |
| `EXPO_PUBLIC_RC_IOS_KEY` | RevenueCat → iOS app → SDK key |
| `EXPO_PUBLIC_RC_ANDROID_KEY` | RevenueCat → Android app → SDK key |
| `EXPO_PUBLIC_MIXPANEL_TOKEN` | Mixpanel → Project settings |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry → Project → Client Keys |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Cloud → OAuth client (Web) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google Cloud → OAuth client (iOS) |

Restart Metro with `--clear` after editing. `EXPO_PUBLIC_` values are inlined at
build time and survive a fast refresh.

### `apps/mobile/app.json`

Resolves cleanly today (`npx expo config --type prebuild` exits 0), but two
things are still absent and are needed before the first real build:

- **`extra.eas.projectId`** — written by `npx eas init`.
- **`updates.url`** — written by `npx eas update:configure`.
- **Google Sign-In `iosUrlScheme`** — the plugin does not require it at config
  time, but iOS sign-in will not complete without it. Add once the iOS OAuth
  client exists:
  ```json
  ["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.YOUR_ID" }]
  ```

### Sentry org/project

`npx expo config` warns `Missing config for organization, project`. This is
expected — the plugin falls back to `SENTRY_ORG` / `SENTRY_PROJECT` environment
variables at build time. Set them in EAS rather than hardcoding them.

---

## 3. Cloud accounts, in dependency order

Nothing below has been done. Each is a browser/credential step.

1. **Supabase** — ✅ done. Project `wgybijmprafqkshmmxdl` ("RiceCal") in
   `ap-southeast-1` (Singapore), CLI linked, MCP registered.

   Created with **"Automatically expose new tables" unchecked** — the Supabase
   default since 2026-05-30. Tables are invisible to the Data API until
   explicitly granted, so every table needs grants alongside its RLS policies.
   See `supabase/schemas/_template.sql.example` for the four-part unit.

   `config.toml` sets `schema_paths = ["./schemas/*.sql"]`. Without it the CLI
   ignores the directory and the declarative workflow silently does nothing.

   `DUMMY_SECRET` is set and `healthcheck` is deployed (the one sanctioned
   laptop deploy — every deploy after this goes through GitHub).

   Remaining: connect the **Supabase GitHub integration** once the remote
   exists, with `main` as the production branch. That replaces the custom
   deploy workflow (deleted) and needs no GitHub secrets, because the GitHub
   App carries its own auth.
2. **GitHub** — ✅ done. `NelsonGan/ricecal`, private, default branch `main`.

   All three Actions secrets are set: `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`. Only `supabase-drift.yml`
   consumes them; deploys go through the Supabase GitHub integration and need
   no secrets at all.

   Note that the Supabase personal access token is **account-wide** — Supabase
   has no per-project token scoping — so it can also reach the `MPG`,
   `MPG Staging`, and `b2b` projects. Revoke and rotate it if this repo's
   visibility ever changes.
3. **Cloudflare R2** — bucket + custom domain `img.<yourdomain>` (not `r2.dev`).
   Token scoped to that bucket only, stored as Supabase secrets:
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
   The `healthcheck` function reads exactly these four names.
4. **Apple Developer** — ✅ done.

   | Item | Value |
   | --- | --- |
   | Bundle ID | `com.nelsongan.ricecal` (internal `3D3YS5HBMU`) |
   | Capabilities | `APPLE_ID_AUTH` (PRIMARY_APP_CONSENT), `PUSH_NOTIFICATIONS`, `HEALTHKIT`, `IN_APP_PURCHASE` |
   | Team ID | `A9QF26PBRS` |
   | App Store Connect app | `6795558595`, SKU `ricecal` |
   | APNs push key | `C5723554WZ` — EAS-generated, shared with `money2time` |

   Sign in with Apple needs nothing further: the native
   `expo-apple-authentication` flow authenticates against the bundle ID alone.
   A Services ID and signing key are only required for the web/Android OAuth
   flow, which carries a **6-month secret rotation** — deliberately avoided.

   Managed with `asc` (App Store Connect CLI). Two auth surfaces:
   `asc auth login` (API key, in the keychain) for bundle IDs and capabilities,
   and `asc web auth login` (Apple ID + 2FA) for app creation, which the public
   API cannot do.

   **Let EAS generate push credentials.** It reuses the team's existing key
   automatically. Creating one by hand produced a redundant second key and hit
   Apple's two-key cap for nothing; it was revoked the same day.
5. **Google** — three OAuth client IDs (web, iOS, Android), Firebase project for
   FCM + `google-services.json`, Play Console record, Health Connect data type
   declaration.
6. **RevenueCat** — project, both apps, both SDK keys, Paywalls enabled, one
   placeholder paywall.
7. **Sentry** — `npx @sentry/wizard@latest -i reactNative`. **Afterwards, diff
   `apps/mobile/metro.config.js`** and restore it if the wizard rewrote it (see
   §5 below — the wizard does not know about NativeWind).
8. **Mixpanel** — project, token, data residency.
9. **EAS** — `npx eas login && npx eas init && npx eas build:configure`, then
   mirror the env vars: `npx eas env:create --environment development --name ... --value ...`
   (the old `eas secret:*` commands are deprecated).

---

## 3a. Environments: one project, no staging

**There is one Supabase project.** No separate staging project, and no
long-lived staging branch.

**Production deploys** run through the Supabase GitHub integration with `main`
as the production branch — connect the repo in the dashboard once it exists.
The custom `supabase-deploy.yml` was deleted; running both would deploy twice
on every merge. The integration's deploy half works on any plan.

**Per-PR previews** are handled by `supabase-migrations.yml`, not by Supabase
preview branches. Real branching needs Pro ($25/mo plus $0.01344 per branch per
hour) and was deliberately deferred until there is revenue to justify it.

The workflow spins up throwaway Postgres on the runner and checks two things:

1. every migration applies cleanly against an **empty** database — catching the
   migration that only works locally because of state a hand-edit left behind
2. `supabase/schemas/` produces **no diff** against the migrations — catching a
   schema file that was edited without running `db diff -f <name>`

That second check is what actually enforces the declarative workflow. Without
it, schemas and migrations can silently diverge until a deploy fails.

To upgrade later: enable branching in the dashboard, and keep this workflow —
it fails in about a minute without provisioning anything, where a branch takes
longer and bills hourly.

### The three workflows

| Workflow | Trigger | Needs secrets |
| --- | --- | --- |
| `ci.yml` | every PR | no |
| `supabase-migrations.yml` | PRs touching `supabase/**` | no |
| `supabase-drift.yml` | daily cron + manual | yes |

Only the drift check needs `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
and `SUPABASE_PROJECT_REF`, because it is the only one that touches the remote
project.

**Drift detection matters more than the original plan assumed.** The Supabase
MCP server is connected with **write access**, and anything applied through it
bypasses migrations exactly the way a Table Editor click does. This job is the
only thing that notices.

---

## 4. Maestro

Not installed. The plan's installer pipes a remote script straight into a shell,
so it was left for you to run deliberately:

```bash
curl -Ls https://get.maestro.mobile.dev | bash
```

`.maestro/smoke.yaml` is written and targets `com.nelsongan.ricecal`. It needs a
dev build on a device before it can run.

---

## 5. Decisions taken that differ from the original plan

Each of these was a correction forced by what SDK 57 actually ships.

| Plan said | Reality | Why it changed |
| --- | --- | --- |
| iOS `deploymentTarget: "15.1"` | **`16.4`** | `expo-modules-core` declares `:ios => '16.4'`. 15.1 would fail at pod install. |
| metro.config.js sets `watchFolders`, `nodeModulesPaths`, `disableHierarchicalLookup` | **All three removed** | Since SDK 52 `expo/metro-config` resolves monorepos itself; the Expo guide says to delete these. Setting `disableHierarchicalLookup` by hand breaks pnpm's isolated store. |
| `react-native-mmkv` 3.x | **4.3.2** | What `expo install` resolves for SDK 57. v4 replaces `new MMKV()` with `createMMKV()`, renames `delete` → `remove`, and requires `react-native-nitro-modules` as a peer (now installed). |
| TypeScript unspecified | **~6.0.3** | The root initially pulled TS 7; aligned down to the version SDK 57 pins so one compiler covers the workspace. |
| `jest` latest | **29.x** | `jest-expo@57` is built against Jest 29. Jest 30 crashes with `clearMocksOnScope is not a function`. |
| `pnpm turbo typecheck lint test` | **`pnpm check`** | `turbo lint` only sees workspace packages, so `supabase/functions/` would never be linted. Lint is now one root Biome pass. |
| `.gitignore` had bare `ios` / `android` | **`/apps/*/ios`, `/apps/*/android`** | A bare entry matches a directory at any depth, so a future `src/lib/ios/` would be silently untracked. |
| `userInterfaceStyle: "light"` | **`"automatic"`** | The design system ships a full dark mode. Pinned to light, Expo writes `UIUserInterfaceStyle: Light` into Info.plist and iOS forces `Appearance` to report light on a device in dark mode. |
| `react-native-reanimated` alone | **plus `react-native-worklets` 0.10.0** | Reanimated 4 requires it as a direct install; pnpm does not hoist it, so `babel-preset-expo` silently skipped the worklets plugin and no animation would have run. |
| `@testing-library/react-native` alone | **plus `test-renderer`** | RNTL v14 has it as an unmet peer. Without it `render()` returns a promise with no query methods and every component test fails with the unrelated-sounding "`render` function has not been called". |

Also worth knowing:

- **`jest.config.js` transform pattern is pnpm-specific.** pnpm stores packages
  at `node_modules/.pnpm/<pkg>/node_modules/<pkg>/`, and the standard
  `transformIgnorePatterns` regex matches at the `.pnpm/` segment, excluding the
  entire store from transformation. The leading `(?!\.pnpm/)` is what makes
  jest-expo work here. Do not "simplify" it back to the stock pattern.
- **Third-party SDK inits are gated** in `src/lib/startup.ts` on the key not
  being `REPLACE_ME`. Remove a gate when its key becomes real — never to silence
  the startup log.
- **pnpm 10 blocks postinstall scripts.** `@sentry/cli`,
  `@shopify/react-native-skia`, and `unrs-resolver` are allowlisted under
  `pnpm.onlyBuiltDependencies`. A new native dep may need adding there; check
  `pnpm ignored-builds`.
- **`jest.config.js` sets a `resolver`, which REPLACES the preset's.** Naming
  one in the config does not merge with jest-expo's — it drops React Native's
  platform-extension resolution, and the symptom is not an error: `render()`
  succeeds and returns an object with no query methods. `jest.resolver.js`
  wraps the preset's resolver instead of replacing it.
- **Changing `tailwind.config.js` requires `expo start --clear`.** NativeWind
  caches the compiled stylesheet, and a stale cache produces an app with no
  styling at all rather than an error.
- **Local simulator builds have no entitlements, so SecureStore cannot reach the
  keychain.** `security find-identity -v -p codesigning` reports 0 valid
  identities on this machine, and without one Xcode signs ad-hoc and embeds an
  empty entitlements dictionary — verified, and neither `CODE_SIGNING_ALLOWED=YES`
  nor passing `DEVELOPMENT_TEAM=A9QF26PBRS` changes it. The visible symptom is
  `KeyChainException: A required entitlement isn't present` on every Supabase
  auth read. EAS builds sign properly and are unaffected, and the storage
  adapter in `src/lib/supabase.ts` now degrades to "signed out" rather than
  throwing, so this is noise rather than breakage. Installing an Apple
  development certificate locally is the only way to clear it.

---

## 6. Verification checklist status

Verified locally:

- [x] `pnpm check` passes (turbo typecheck + test, Biome clean)
- [x] Mobile imports `SCHEMA_VERSION` from `@ricecal/shared`
- [x] `app.json` resolves through all 13 config plugins (`expo config` exits 0)
- [x] Bundle id, package, entitlements, health usage strings, `minSdkVersion 26`,
      `deploymentTarget 16.4`, AD_ID blocked — all correct in resolved config

Needs a dev build (`eas build --profile development`) — blocked on cloud setup:

- [ ] NativeWind `className` actually styles something
- [ ] expo-router navigates between the two routes
- [ ] Skia renders a shape / Victory renders a chart
- [ ] Supabase `getSession()` returns null without error
- [ ] MMKV value survives app restart
- [ ] NetInfo state change on airplane mode
- [ ] **Static query renders after force-quit + airplane mode** ← the one that matters
- [ ] Apple / Google sign-in sheets appear
- [ ] Camera, image picker, push token, local notification
- [ ] HealthKit sheet / Health Connect availability
- [ ] `Purchases.getOfferings()`, paywall, Sentry error, Mixpanel event
- [ ] Maestro smoke test

`app/diagnostics.tsx` exists to make most of the UI/data rows above a single
screen rather than an ad-hoc debugging session.

Needs a linked Supabase project:

- [ ] `healthcheck` returns 200 with the caller's user id
- [ ] It reads `DUMMY_SECRET` at runtime
- [ ] Presigned R2 PUT uploads a file; it loads over the custom domain
- [ ] Merge to `main` deploys the function
- [ ] Drift check passes clean, then fails on a deliberate Table Editor edit

---

## 7. Non-technology decisions still open

From §13 of the plan, none of these are made yet:

- Account deletion flow (Apple requires it wherever signup exists)
- Play Console open testing — 12 testers / 14 days on a personal account; that
  clock starts with the Phase 0 dev build, not at launch
- i18n — English only, or English + BM. Cheap now, painful at 200 strings
- HealthKit terms — health data cannot be used for advertising or shared with
  third parties
- Marketing language — "estimate", never medical claims (App Store 1.4.1)
