---
name: drive-the-watch
description: Build, install and drive the RiceCal Apple Watch app on a paired watch simulator: the one exception to the Simlock pool. Use for any watchOS work: pairing a watch with a phone, installing RiceCalWatch.app, copying watch/ios Swift files before a build, a UI-test driver for taps and the Digital Crown, Health authorization on the simulators, WatchConnectivity stalls, made-up heart rate and burn, and reading the watch app's logs.
---

# Driving the Apple Watch app

Moved out of `AGENTS.md` so it loads only for watch work. Ask the user before making a phone and watch pair by hand, and delete both when you are done.

## Driving the Apple Watch app

**Watch work is the one exception to the device pool.** Simlock cannot pair a
watch with a phone, so ask the user before making a pair by hand, and delete
both when you are done. A watch simulator needs its runtime first
(`xcodebuild -downloadPlatform watchOS`, 3.8 GB), then a watch paired with the
iPhone the app is on:
`xcrun simctl create "<name>" com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Series-12-46mm
com.apple.CoreSimulator.SimRuntime.watchOS-27-0`, then `xcrun simctl pair <watch> <phone>`.
`xcrun simctl list pairs` should say `(active, connected)` once both are booted.

- Building the `RiceCal` scheme for the iPhone builds the watch app too, into
  `Debug-watchsimulator/` beside it, and embeds it at `RiceCal.app/Watch/`.
  Installing the phone app on a simulator does **not** put the watch app on the
  paired watch: `xcrun simctl install <watch> RiceCal.app/Watch/RiceCalWatch.app`.
- An edit under `watch/ios/` needs `cp watch/ios/*.swift ios/RiceCalWatch/`
  before an incremental build, as a widget edit does; a new file needs
  `expo prebuild --clean`.
- The Claude simulator tool asks the user for each device, the watch separately
  from the phone, and it stays blocked until they answer. Without it, a watchOS
  UI-test target added to the generated project for the session (CocoaPods
  bundles the `xcodeproj` gem: `GEM_HOME=$(brew --cellar cocoapods)/<v>/libexec
  /opt/homebrew/opt/ruby/bin/ruby`) drives the watch: `XCUIApplication(bundleIdentifier:)`
  with `.activate()`, taps by label, `XCUIDevice.shared.rotateDigitalCrown(delta:velocity:)`
  for the crown, and steps passed in through a `TEST_RUNNER_`-prefixed environment
  variable, since the simulator's `/tmp` is not the Mac's. Do not commit it.
  - **Never name the test `testRun`.** It is a property of `XCTestCase`, and
    XCTest calls the getter: the test passes in 0.05 s without running a line.
  - **A failing test takes ten minutes** to report (diagnostics collection).
    Hand output back as an `XCTAttachment` with `.keepAlways` and read it with
    `xcrun xcresulttool export attachments`, so the test passes.
- **`simctl launch` while a Health sheet is up dismisses it as a refusal.** The
  refusal syncs between the paired simulators and is then never asked again.
  The answers are in each simulator's `data/Library/Health/healthdb.sqlite`,
  table `authorization`, one row per source and type: 101 is allowed, 102 not
  asked, 104 refused. With both simulators shut down, setting the watch app's
  rows (its source, not the phone app's) on both is the way back.
- The watchOS simulator measures **no heart rate** and no active energy (every
  `activeEnergyBurned` sample is 0; only resting energy is real); a simulator
  build feeds the session a made-up pulse and burn (README, "The Apple Watch
  app"), so a heart rate or kcal on screen there is not the sensor's.
- `isWatchAppInstalled` stays false for a watch app installed directly, and
  `transferUserInfo` can take minutes or never arrive between simulators; both
  are handled in the app, and both make a simulator look more broken than it is.
- **A second, smaller watch for layout** (the SE 40 mm is the narrowest) can be
  paired with the same phone (`simctl pair`, then `simctl pair_activate`).
  After any switch the phone's WatchConnectivity stalls at "informing daemon
  ready for session state" and nothing crosses, even after relaunching the app;
  shut down and boot both simulators, then give it a minute. Switch back the
  same way and `simctl unpair` the extra pair.
- The driver's `activate()` launches the watch app if it is not running, and
  XCTest then ends that app with the test, so after a reinstall the watch shows
  the launch screen once the steps finish. With a workout running, watchOS
  relaunches it for the session, which is not a crash.
- The watch app's logs: `xcrun simctl spawn <watch> log show --last 2m
  --predicate 'process == "RiceCalWatch"'`. Its own lines start `[RiceCalWatch]`.
