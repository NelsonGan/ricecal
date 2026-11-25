---
name: drive-the-app
description: Launch, deep link, screenshot or test the RiceCal iOS or Android app on a Simlock pool device, from any worktree, including offline tests. Use before any simulator or emulator work in this repo: running a branch with simlock-metro, building a dev client with simlock-build, ricecal:// deep links, the queued "Open in RiceCal?" alert, Metro port and --localhost traps, dropped keystrokes, the dev-menu Tools button, the Android adb server on 5038, Gboard handwriting, reaching native modules, and faking an offline launch.
---

# Driving the app on a pool device

Moved out of `AGENTS.md` so it loads when a task drives a device rather than in every request. The machine-wide rules are in `~/.claude/CLAUDE.md` and the `simlock-devices` skill; this is what is specific to RiceCal.

## Driving the iOS app

**Drive the device with the T3 Code device tools, and show it in T3 Code's
Device panel while testing.** Devices come from the Simlock pool on this
machine, which T3 Code leases from: each worktree gets its own fresh device, and
the pool deletes it when you close it. Never create, clone, erase or boot a
simulator or emulator yourself. `device_list` lists the pool's models (host
`simlock-mac-mini`); `device_open` leases one (it waits while the pool is full),
shows it in the panel and returns an `agent-device` command pinned to it. Use
that command for every app launch, deep link, tap, text entry, alert,
screenshot and recording (`agent-device help` lists the commands,
`agent-device help foldable` covers the iPhone Duo), `device_screenshot` to look
at the screen, and `device_close` with `shutdown: true` when you are done, which
gives the device back. Leave the device on the tested screen while the user
should still look at it. Do not drive a device with `xcrun simctl`, `adb` or
scripts that wrap them; those stay fine for builds, installs, port forwards
(`adb reverse`), logs and what `agent-device` cannot do. Use these models:

| Platform | `device_open` id            | Use                                       |
| -------- | --------------------------- | ----------------------------------------- |
| iOS      | `simlock:ios:iPhone 18 Pro` | everyday testing (iOS 27.0)               |
| iOS      | `simlock:ios:iPhone Duo`    | iPhone Duo (foldable) work only, iOS 27.1 |
| Android  | `simlock:android:Pixel 10`  | Android testing (Android 16)              |

**A leased device already has the RiceCal dev client**, built from
`origin/main` (the normal `com.nelsongan.ricecal` app),
signed out and with no data (T3 Code's own note that a pool device starts with
no apps is generic; `agent-device apps` lists them). It is ready to test: the
Expo dev menu's intro and floating Tools button are off, camera and photo
permissions are granted (notifications still ask once), four synthetic meal
photos are in the photo library for scan tests, and keyboard autocorrect is
off. To test a permission prompt, reset it first with
`agent-device settings permission reset <name> --app com.nelsongan.ricecal`.

**Run your working tree on it with `simlock-metro <device id> <agent-device
command>`**, from anywhere in the worktree. It reuses or starts this checkout's
Metro on a free port, copies a missing `.env.local` from the main checkout,
forwards Metro and `54421` on Android, builds the bundle, opens the app and
answers the "Open in RiceCal?" prompt. A JS change needs no build after that;
a Metro reload picks it up. A dev client refuses
a bundle with another app version (an empty red box), so a branch that bumps
the version or changes native code needs its own build: from the worktree, run
`simlock-build ios <device id>` (or `android`), which builds this checkout's dev
client and installs it on the device `device_open` leased. Do not use
`pnpm ios`, `pnpm android` or `expo run:*` for that: they look for devices
outside the pool. The shared builds are in `~/MobileBuilds/ricecal/`, with the
commit they came from beside them.

**Every `adb` command for a leased emulator needs
`ANDROID_ADB_SERVER_PORT=5038`**: Simlock runs its emulators on its own adb
server, and the default one on 5037 cannot see them. Forward Metro and the
local Supabase stack so the emulator reaches them at `127.0.0.1` as iOS does:
`ANDROID_ADB_SERVER_PORT=5038 adb reverse tcp:<metro port> tcp:<metro port>`,
and the same for `54421`. The pool runs one emulator, so no `-s` is needed.
`simlock-udid <device id>` prints the simulator UDID or emulator serial behind a
lease, for what `agent-device` cannot do.

The leased device already has a dev client, so verifying a UI change does not
need `pnpm ios` (a prebuild plus a full compile). It runs whatever is in the
working tree, and a Metro reload picks up an edit without reinstalling.

- **The scheme is `ricecal://`.** Any screen is one call: `ricecal:///paywall`, `ricecal:///reviews`,
  `ricecal:///settings/subscription`, `ricecal:///log?panel=camera`. Much faster
  than tapping, and it reaches screens the UI only offers after a refusal. A
  deep link is restored as the route after a Metro reload, and some screens
  crash when they mount before the session has loaded; relaunching the app clears it.
- **After a reinstall, the first `ricecal://` link raises an "Open in
  RiceCal?" alert that screenshots do not show.** The screen just dims, ignores
  every tap and even the Home button, and looks like a hung app. Each
  link you open queues another. Every freshly leased device starts this way.
  `agent-device alert accept` answers it, once per queued link.
- **A Metro answering on 8081 is not necessarily this project's.** Another
  project on the machine takes it first and answers `packager-status:running`
  identically. `curl -s localhost:8081/json/list` names the app. Start this one
  on another port rather than fighting for 8081.
- **Do not pass `--localhost`.** It binds Metro to `::1` only, while the dev
  client asks for `http://127.0.0.1:<port>`, so the client red-boxes with "Could
  not connect to development server" while `curl localhost:<port>` answers 200
  and looks fine. Plain `npx expo start --port 8082` binds both. Point the
  client at it with
  `ricecal://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8082&disableOnboarding=1`,
  and warm the bundle with a `curl` of the entry bundle first (about 30 s cold)
  or the client red-boxes rather than waiting. `simlock-metro` does all of this.
- **Pool devices start with the dev-menu Tools button off.** If one shows it
  (a device outside the pool, or a dev client reinstalled with its data
  cleared), it eats taps in the top right — roughly x 0.84-0.95, y 0.10-0.22, a
  region much larger than the visible circle, over every `AppBar` action and
  the plate sheet's first "+". Its "Tools button" switch ignores a simulated
  tap (a short horizontal swipe flips it), and hiding it leaves the region
  live. Drag the bubble away instead: a gesture that holds on it for 300 ms,
  then moves to the bottom left, parks it there and frees the top right.
- Typing on the simulator drops characters: pass `--delay-ms 160` to
  `agent-device type`.
- The photo library already has four synthetic meal photos (chicken rice, nasi
  lemak, ramen, economy rice). Add more with
  `xcrun simctl --set ~/.simlock/devices/ios addmedia "$(simlock-udid <id>)" <file>`.
  There is no camera, but the library button in `InlineCamera` is there.

## Driving the Android app

- Build with `simlock-build android <device id>`, not `expo run:android`,
  which only sees emulators on the default adb server. A first build is
  ~15 minutes and outlives a harness background-task timeout: run it detached
  and watch its output. Kill the Gradle daemons afterwards — left running they
  starve the emulator until `system_server` ANRs and taps stop landing.
- The dev client cannot find Metro on its own; `simlock-metro` handles it. By
  hand: `ANDROID_ADB_SERVER_PORT=5038 adb reverse tcp:<port> tcp:<port>` (and
  the same for `54421` when `.env.local` points at the local stack, or every
  auth and diary call fails to connect), then open
  `ricecal://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A<port>` with
  the `agent-device` command's `open com.nelsongan.ricecal <url>`.
- **No soft keyboard appears when you tap a field.** Gboard ships with "Write in
  text fields" (stylus handwriting) on (pool devices start with it off), which
  replaces the keyboard with a floating strip that counts as an open keyboard
  while reporting almost no height — so keyboard-avoidance code misbehaves in
  ways that are not real. Turn it off in Gboard settings. `pm clear` on the IME
  does not fix it and leaves the keyboard dead until a reboot.
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
