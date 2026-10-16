const fs = require('node:fs')
const path = require('node:path')

const { withAppDelegate, withDangerousMod, withXcodeProject } = require('expo/config-plugins')

/**
 * Puts the Apple Watch app into the generated Xcode project.
 *
 * The same arrangement as `withWidgets.js`, for the same reason: `ios/` is
 * build output, so the watch app is made at prebuild time from tracked
 * sources.
 *
 *   watch/ios/*.swift   the watch app, SwiftUI, watchOS 10 and up
 *   assets/icon.png     its icon, which watchOS crops to a circle
 *
 * One target, the single-target watch app Xcode has made since 14: an
 * application built for watchOS, embedded in the phone app under `Watch/`.
 * The older two-target shape (a WatchKit app holding an extension) is not
 * needed for anything here and doubles the signing.
 *
 * The phone half (WatchConnectivity, the inbox, starting the watch's workout)
 * is the local module `modules/ricecal-watch`, which autolinking finds.
 */

const TARGET = 'RiceCalWatch'

const watchBundleId = (bundleId) => `${bundleId}.watchkitapp`

module.exports = function withWatch(config) {
  const bundleId = config.ios?.bundleIdentifier
  if (!bundleId) {
    throw new Error('withWatch: ios.bundleIdentifier must be set before this plugin runs.')
  }
  let next = withWatchFiles(config, { bundleId })
  next = withWatchTarget(next, { bundleId })
  next = withHealthAuthorizationHandoff(next)
  return next
}

/**
 * Copies the sources, the icon and the two plists into `ios/RiceCalWatch`.
 * Runs on every prebuild, so editing a watch file and rebuilding is enough;
 * a NEW file needs a `--clean` prebuild, as a widget file does, because the
 * target's source list is written once.
 */
function withWatchFiles(config, { bundleId }) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot
      const targetDir = path.join(cfg.modRequest.platformProjectRoot, TARGET)
      fs.mkdirSync(targetDir, { recursive: true })

      for (const file of swiftSources(projectRoot)) {
        fs.copyFileSync(file, path.join(targetDir, path.basename(file)))
      }

      const iconDir = path.join(targetDir, 'Assets.xcassets', 'AppIcon.appiconset')
      fs.mkdirSync(iconDir, { recursive: true })
      fs.writeFileSync(
        path.join(targetDir, 'Assets.xcassets', 'Contents.json'),
        `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
      )
      fs.copyFileSync(path.join(projectRoot, 'assets/icon.png'), path.join(iconDir, 'icon.png'))
      fs.writeFileSync(
        path.join(iconDir, 'Contents.json'),
        `${JSON.stringify(
          {
            images: [
              { filename: 'icon.png', idiom: 'universal', platform: 'watchos', size: '1024x1024' },
            ],
            info: { author: 'xcode', version: 1 },
          },
          null,
          2,
        )}\n`,
      )

      fs.writeFileSync(
        path.join(targetDir, 'Info.plist'),
        infoPlist({
          bundleId,
          displayName: cfg.name ?? 'RiceCal',
          version: cfg.version ?? '1.0.0',
          // The phone app's own build number, for the reason the widget
          // extension carries it: App Store Connect refuses an upload whose
          // watch app disagrees with its container.
          build: String(cfg.ios?.buildNumber ?? '1'),
        }),
      )
      fs.writeFileSync(path.join(targetDir, `${TARGET}.entitlements`), ENTITLEMENTS)
      return cfg
    },
  ])
}

/**
 * Lets the watch app ask for Health access at all.
 *
 * A watch app that is not independent of its iPhone app can have its request
 * shown on the iPhone, and iOS then asks the phone app's delegate to hand it
 * on, with `handleAuthorizationForExtension`. A delegate that does not answer
 * is a refusal: the watch's request came back denied without a sheet ever
 * being shown, and the workout recorded no heart rate. Expo's app delegate
 * does not forward this call to subscribers, so it is written into the
 * generated `AppDelegate` itself.
 */
const HANDOFF_MARK = 'applicationShouldRequestHealthAuthorization'

function withHealthAuthorizationHandoff(config) {
  return withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents
    if (cfg.modResults.language !== 'swift' || contents.includes(HANDOFF_MARK)) return cfg
    if (!contents.includes('import HealthKit')) {
      contents = contents.replace(/^(import [^\n]+\n)/m, '$1import HealthKit\n')
    }
    const method = [
      '',
      '  // The Apple Watch app asks for Health access through this phone (plugins/withWatch.js).',
      '  @objc public func applicationShouldRequestHealthAuthorization(_ application: UIApplication) {',
      '    HKHealthStore().handleAuthorizationForExtension { _, _ in }',
      '  }',
      '',
    ].join('\n')
    contents = contents.replace(/\n {2}\/\/ Linking API\n/, `${method}\n  // Linking API\n`)
    if (!contents.includes(HANDOFF_MARK)) {
      throw new Error(
        'withWatch: could not find where to add the Health handoff in AppDelegate.swift',
      )
    }
    cfg.modResults.contents = contents
    return cfg
  })
}

function swiftSources(projectRoot) {
  const own = path.join(projectRoot, 'watch/ios')
  return fs
    .readdirSync(own)
    .filter((name) => name.endsWith('.swift'))
    .map((name) => path.join(own, name))
}

/**
 * Creates the target, once; `expo prebuild` without `--clean` applies its mods
 * to the project already there, as `withWidgets.js` explains.
 */
function withWatchTarget(config, { bundleId }) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    if (project.pbxTargetByName(TARGET)) return cfg

    const sources = fs
      .readdirSync(path.join(cfg.modRequest.platformProjectRoot, TARGET))
      .filter((name) => name.endsWith('.swift'))
    const resources = ['Assets.xcassets']

    const group = project.addPbxGroup([...sources, ...resources, 'Info.plist'], TARGET, TARGET)
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup)

    // `watch2_app` is what writes the phone app's "Embed Watch Content" phase,
    // copying the product into `$(CONTENTS_FOLDER_PATH)/Watch`, and makes the
    // phone app depend on it. Its product type is the old WatchKit app's, and
    // is set to a plain application below: a single-target watch app is an
    // application whose SDK is watchOS.
    const target = project.addTarget(TARGET, 'watch2_app', TARGET, watchBundleId(bundleId))
    project.pbxNativeTargetSection()[target.uuid].productType =
      '"com.apple.product-type.application"'

    project.addBuildPhase(
      sources.map((name) => `${TARGET}/${name}`),
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid,
    )
    project.addBuildPhase(
      resources.map((name) => `${TARGET}/${name}`),
      'PBXResourcesBuildPhase',
      'Resources',
      target.uuid,
    )
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)

    // `addTarget` already asked for the phone app to depend on this, and the
    // `xcode` package silently does nothing when the project has no target
    // dependency sections yet, which a fresh Expo project does not. The widget
    // extension gets away with that because Xcode infers a dependency from the
    // embed phase within one platform; across platforms it does not, and the
    // phone app's build fails at the embed with no watch app built to copy.
    const objects = project.hash.project.objects
    objects.PBXTargetDependency ??= {}
    objects.PBXContainerItemProxy ??= {}
    project.addTargetDependency(project.getFirstTarget().uuid, [target.uuid])

    applyBuildSettings(project, target, { bundleId, version: cfg.version })
    return cfg
  })
}

function applyBuildSettings(project, target, { bundleId, version }) {
  const listId = project.pbxNativeTargetSection()[target.uuid].buildConfigurationList
  const lists = project.pbxXCConfigurationList()
  const wanted = new Set((lists[listId]?.buildConfigurations ?? []).map((entry) => entry.value))

  const configurations = project.pbxXCBuildConfigurationSection()
  for (const key of Object.keys(configurations)) {
    if (!wanted.has(key)) continue
    const settings = configurations[key].buildSettings
    settings.PRODUCT_BUNDLE_IDENTIFIER = `"${watchBundleId(bundleId)}"`
    settings.PRODUCT_NAME = `"${TARGET}"`
    settings.INFOPLIST_FILE = `"${TARGET}/Info.plist"`
    settings.CODE_SIGN_ENTITLEMENTS = `"${TARGET}/${TARGET}.entitlements"`
    settings.CODE_SIGN_STYLE = 'Automatic'
    settings.SDKROOT = 'watchos'
    settings.SUPPORTED_PLATFORMS = '"watchos watchsimulator"'
    // NavigationStack and the paged TabView as drawn here are watchOS 10,
    // which runs on Series 4 and later. An older watch is not offered the app.
    settings.WATCHOS_DEPLOYMENT_TARGET = '10.0'
    settings.TARGETED_DEVICE_FAMILY = '4'
    settings.SWIFT_VERSION = '5.0'
    settings.SKIP_INSTALL = 'YES'
    settings.GENERATE_INFOPLIST_FILE = 'NO'
    settings.ASSETCATALOG_COMPILER_APPICON_NAME = 'AppIcon'
    settings.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks"'
    settings.CURRENT_PROJECT_VERSION = '1'
    settings.MARKETING_VERSION = version ?? '1.0.0'
    settings.CLANG_ENABLE_MODULES = 'YES'
    settings.SWIFT_EMIT_LOC_STRINGS = 'YES'
    settings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO'
    // The phone's deployment target, inherited from the project, means
    // nothing to a watch target and only adds a warning.
    delete settings.IPHONEOS_DEPLOYMENT_TARGET
  }
}

function infoPlist({ bundleId, displayName, version, build }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>${displayName}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${build}</string>
  <key>WKApplication</key>
  <true/>
  <key>WKCompanionAppBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>WKRunsIndependentlyOfCompanionApp</key>
  <false/>
  <key>WKBackgroundModes</key>
  <array>
    <string>workout-processing</string>
  </array>
  <key>NSHealthShareUsageDescription</key>
  <string>RiceCal reads your heart rate and energy during a workout you record on Apple Watch, to show them on the workout.</string>
  <key>NSHealthUpdateUsageDescription</key>
  <string>RiceCal saves the workouts you record on Apple Watch to Apple Health, with their heart rate and energy.</string>
</dict>
</plist>
`
}

const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.healthkit</key>
  <true/>
  <key>com.apple.developer.healthkit.access</key>
  <array/>
</dict>
</plist>
`

module.exports.WATCH_TARGET = TARGET
module.exports.watchBundleId = watchBundleId
