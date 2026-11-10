---
name: update-app-studio-screenshots
description: Recapture the RiceCal App Studio store screenshots (iPhone and iPhone Duo, all 13 app languages) from the current app with seeded demo accounts on the local stack. Use after screens change, when the store screenshots look out of date, or when someone asks to refresh, update or recapture the App Studio / App Store / Play screenshots.
---

# Update App Studio screenshots

App Studio (`apps/app-studio`, see [work-on-app-studio](../work-on-app-studio/SKILL.md))
frames real captures of the app: six screens per language in
`public/assets/screenshots-iphone/<lang>/` (1320 × 2868) and
`public/assets/screenshots-iphone-duo/<lang>/` (2853 × 2007), named `01-today`,
`02-workout`, `03-dish`, `04-trends`, `05-feed`, `06-recipes`, with a
`capture.json` and `photo-provenance.json` beside them. The iPad and Play sets
reuse the iPhone captures. Each language is captured from its own fictional
account, seeded with that market's food, so a Japanese shot shows Japanese
dishes and the Japanese UI.

A full run is about a minute per language per device.

## 1. The seed branch

`origin/app-studio-seed-data` is `main` plus the screenshot tooling. **It is
never merged.** It adds `scripts/screenshots/` (seed, setup, capture, fixtures,
60 generated food photos and their provenance, tests), the `screenshots:*`
scripts in the root `package.json`, and a dev-only
`EXPO_PUBLIC_SCREENSHOT_MODE` flag (`apps/mobile/src/lib/screenshot-mode.ts`)
that keeps Health sync from replacing the activity fixtures and the logging
sheet from focusing its field. Its README section "Localized screenshot
fixtures" describes the scripts.

Bring it up to date with `main` in its own worktree, so the screens are
today's:

```bash
git fetch origin
W=~/.t3/worktrees/ricecal/app-studio-seed-data
[ -d $W ] || git worktree add $W origin/app-studio-seed-data
cd $W && git checkout -B app-studio-seed-data origin/app-studio-seed-data
git rebase origin/main
pnpm install && pnpm screenshots:test && pnpm --filter @ricecal/mobile typecheck
git push --force-with-lease origin app-studio-seed-data
```

When `main` changes a table, an RPC or a screen the seeder or capture relies
on, fix the tooling on this branch and push it. Keep the branch to one or two
commits so rebases stay easy, and never rebase it onto history from before the
2026-11-09 rewrite (that brings 159 MB of old PR screenshots back).

## 2. The local stack and the seed

The seeder writes only to the **local** Supabase stack on port 54421 (it
refuses a hosted one). Other RiceCal sessions share that stack, so do not
reset or restart it while another session is using it.

1. `pnpm db:start` if it is not running (`pnpm exec supabase status --workdir apps`).
2. **Photo storage must be reachable.** The seeder uploads 60 food photos
   through the `photos` function, and the app later loads them from the same
   address. `R2_ENDPOINT` in `apps/supabase/functions/.env` (the main
   checkout's) must be this Mac's current LAN address, port 59000
   (`ipconfig getifaddr en0`), and the `ricecal-social-s3` MinIO container must
   be running (`docker start ricecal-social-s3`). The address changes when the
   Mac's network does; after changing it, restart the edge runtime (restart
   the stack) so the functions pick it up. A stale address shows up as
   `fetch failed … ConnectTimeoutError` from the seeder.
3. From the seed worktree: `pnpm screenshots:setup` (writes the capture env),
   then `pnpm screenshots:seed` (all languages) or `pnpm screenshots:seed ja ko`.
   Seed on the capture day: Today and the last seven days follow the date.

## 3. Devices

Lease with the T3 Code device tools (`device_open`, host `simlock-mac-mini`).

| Set        | `device_open` id                 | Notes                                                                                    |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| iPhone     | `simlock:ios:iPhone 18 Pro Max`  | 1320 × 2868 at 3x. Not a pre-baked pool model: install the dev client first (below).     |
| iPhone Duo | `simlock:ios:iPhone Duo`         | Captured open, on its side. The script unfolds it.                                      |

The Pro Max lease starts with no apps. From the worktree `device_open` names,
install the shared dev client, then run the seed branch on it:

```bash
<agent-device> install com.nelsongan.ricecal ~/MobileBuilds/ricecal/ios/RiceCal.app
cd ~/.t3/worktrees/ricecal/app-studio-seed-data
simlock-metro <device id> <agent-device>     # prints the Metro port
```

A dev client built from an older `main` refuses a bundle with another runtime
version (an empty red box): build this checkout's with `simlock-build ios
<device id>`. On a model that is not pre-baked, the Expo developer menu opens on
first launch: close it with its × before capturing. If an "Open in RiceCal?"
alert holds the launch, `agent-device alert accept` (on the Duo, tap its Open
button by coordinates).

**On a leased iPhone Duo, `agent-device fold` and `agent-device screenshot`
fail**: Simlock keeps its simulators in its own device set, which CoreDevice
cannot see. The capture script works around both: it compiles
`agent-device`'s own fold helper and sends `open` with `simctl spawn`, and
captures the lit inner display with `simctl io --display=3` (2853 × 2007,
already upright). Taps and `open` still work through `agent-device`.

## 4. Capture

```bash
cd ~/.t3/worktrees/ricecal/app-studio-seed-data
U=$(simlock-udid <device id>)
pnpm screenshots:capture --udid $U --agent-device <agent-device> --port <metro port> \
  --output <checkout you will commit from>/apps/app-studio/public/assets/screenshots-iphone
```

Use `screenshots-iphone-duo` as the output on the Duo. `--locale ja,ko`
recaptures a subset and keeps the other records. With two devices on one
Metro, add `--target <text>` (part of the device's `deviceName` in
`curl -s http://127.0.0.1:<port>/json/list`).

For each language the script signs out, marks the tour as offered, sets the
language, signs into that language's account, then visits the six screens
through the router, checking each route and that every active query
succeeded, and dismissing toasts. It starts a workout part way through (with a
watch heart rate) for `02-workout`, captures it last and clears it. On the Duo
it moves that language's unfollowed cook to the top of Discover before the
Feed. It pins the status bar (9:41, Wi-Fi, full battery) and light appearance.
Shots are staged and only replace the set when every one passed; duplicate
pixels or failed data abort the run.

## 5. Review and finish

- Look at every language before committing: a contact sheet per language is
  quick (`ffmpeg -pattern_type glob -i "<dir>/ja/*.png" -vf
  "scale=300:-1,tile=6x1" -frames:v 1 sheet.png`). Check for a toast or sheet
  over a screen, a missing photo (grey tile: storage unreachable), empty
  charts, the wrong language, and the status bar.
- In that checkout's `apps/app-studio`: recompress with
  `oxipng -o 4 --nc --strip safe`, update each file's `sha256` in that set's
  `capture.json`, then run `pnpm --filter @ricecal/app-studio check:screenshots`,
  `test` and `typecheck`. Look at the scenes in Studio (`pnpm studio:dev`).
- `device_close` with `shutdown: true`, and stop the seed worktree's Metro
  (`pkill -f 'expo start --port <port> '`).
- Replace a set in one commit, open the PR with `create-pr` (contact sheets and
  scenes as attachments, never committed). Uploading to the stores is a
  separate step the user asks for (`work-on-app-studio`, dry run first).
