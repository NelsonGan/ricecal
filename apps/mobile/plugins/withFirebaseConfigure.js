const { withAppDelegate } = require('expo/config-plugins')

/**
 * Puts `FirebaseApp.configure()` back into the SDK 58 AppDelegate.
 *
 * SDK 58 starts React Native from `SceneDelegate`, so the generated
 * `didFinishLaunchingWithOptions` no longer contains `factory.startReactNative(`,
 * the line @react-native-firebase/app 26.x anchors on. Its plugin then skips
 * the call with only a prebuild warning, and Analytics never starts. v27 fixes
 * the anchor (invertase/react-native-firebase dce165d) but also drops the
 * CocoaPods build this app uses (`disableSPM`).
 *
 * This inserts the same line above the same anchor v27 uses, and does nothing
 * once Firebase's own plugin has written it. Delete it when the app moves to
 * @react-native-firebase 27 or later.
 */
const CONFIGURE = 'FirebaseApp.configure()'
const ANCHOR =
  /^([ \t]*)return\s+super\.application\(\s*application\s*,\s*didFinishLaunchingWithOptions:\s*launchOptions\s*\)/m

module.exports = function withFirebaseConfigure(config) {
  return withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents
    if (cfg.modResults.language !== 'swift' || contents.includes(CONFIGURE)) return cfg
    if (!ANCHOR.test(contents)) {
      throw new Error(
        'withFirebaseConfigure: no `return super.application(...)` in AppDelegate.swift',
      )
    }
    if (!/^[ \t]*import\s+FirebaseCore[ \t]*$/m.test(contents)) {
      contents = contents.replace(/^((?:internal\s+)?import [^\n]+\n)/m, '$1import FirebaseCore\n')
    }
    contents = contents.replace(ANCHOR, (line, indent) => `${indent}${CONFIGURE}\n${line}`)
    cfg.modResults.contents = contents
    return cfg
  })
}
