const { withAppDelegate } = require('expo/config-plugins')

/**
 * Moves Firebase's `FirebaseApp.configure()` out of the React Native startup
 * block in AppDelegate.swift, so `ios.enableSceneSupport` (expo-build-properties)
 * can remove that block by exact match. Without it prebuild refuses with
 * "requires the standard Expo SDK 57 Swift AppDelegate", and letting the scene
 * mod go first would make Firebase skip `configure()` with only a warning.
 *
 * Firebase writes the file in a dangerous mod, before any AppDelegate mod, and
 * AppDelegate mods run last-listed first: keep this after expo-build-properties
 * in app.json. The README's "Simulators and stores" has the rest.
 */
const FIREBASE_BLOCK =
  /\/\/ @generated begin @react-native-firebase\/app-didFinishLaunchingWithOptions[^\n]*\n[\s\S]*?\/\/ @generated end @react-native-firebase\/app-didFinishLaunchingWithOptions\n/
const STARTUP = '#if os(iOS) || os(tvOS)\n'

module.exports = function withFirebaseOutsideStartup(config) {
  return withAppDelegate(config, (cfg) => {
    const contents = cfg.modResults.contents
    const block = contents.match(FIREBASE_BLOCK)?.[0]
    if (!block || !contents.includes(STARTUP) || contents.includes(`${block}\n${STARTUP}`))
      return cfg
    const without = contents.replace(block, '')
    cfg.modResults.contents = without.replace(STARTUP, `${block}\n${STARTUP}`)
    return cfg
  })
}
