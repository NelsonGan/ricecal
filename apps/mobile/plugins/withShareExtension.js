const fs = require('node:fs')
const path = require('node:path')

const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withXcodeProject,
} = require('expo/config-plugins')

/**
 * "Share to RiceCal" from another app's share sheet, on both platforms. Each
 * half does one thing: take whatever the other app shared, find the first web
 * link in it, and open the app at `<scheme>:///recipe/import?url=<link>`, so
 * the import arrives as an ordinary deep link and the router does the rest.
 *
 * iOS: a share extension target, `RiceCalShare`, built from `share/ios/*.swift`
 * the way `withWidgets.js` builds the widget extension, since `ios/` is build
 * output. It needs no App Group and no entitlements: it hands the link over by
 * opening the app rather than through a shared container.
 *
 * Android: a SEND intent filter on the main activity. The rewriting from SEND
 * to a VIEW deep link happens in `modules/ricecal-share`, before React Native
 * reads the intent.
 */

/** The extension's target name, its folder under `ios/`, and its product name. */
const TARGET = 'RiceCalShare'

const shareBundleId = (bundleId) => `${bundleId}.share`

/** Read by `ShareIntent.kt`, so the scheme is written down only in app.json. */
const ANDROID_SCHEME_META = 'expo.modules.ricecalshare.SCHEME'

module.exports = function withShareExtension(config) {
  const bundleId = config.ios?.bundleIdentifier
  if (!bundleId) {
    throw new Error('withShareExtension: ios.bundleIdentifier must be set before this plugin runs.')
  }
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : (config.scheme ?? 'ricecal')

  let next = withShareFiles(config, { scheme })
  next = withShareTarget(next, { bundleId, deploymentTarget: iosDeploymentTarget(config) })
  next = withSendIntentFilter(next, { scheme })
  return next
}

/**
 * The app's iOS floor, from expo-build-properties, so the extension cannot be
 * built for an iOS the app does not run on or drift from it when it moves.
 */
function iosDeploymentTarget(config) {
  for (const plugin of config.plugins ?? []) {
    if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
      const target = plugin[1]?.ios?.deploymentTarget
      if (target) return String(target)
    }
  }
  return '16.4'
}

/** Sources and Info.plist into `ios/RiceCalShare/`, on every prebuild. */
function withShareFiles(config, { scheme }) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot
      const targetDir = path.join(cfg.modRequest.platformProjectRoot, TARGET)
      fs.mkdirSync(targetDir, { recursive: true })

      for (const file of swiftSources(projectRoot)) {
        fs.copyFileSync(file, path.join(targetDir, path.basename(file)))
      }

      fs.writeFileSync(
        path.join(targetDir, 'Info.plist'),
        infoPlist({
          scheme,
          displayName: cfg.name ?? 'RiceCal',
          version: cfg.version ?? '1.0.0',
          // The app's own build number: App Store Connect rejects an upload
          // whose extension disagrees with its app (ITMS-90473). See withWidgets.
          build: String(cfg.ios?.buildNumber ?? '1'),
        }),
      )
      return cfg
    },
  ])
}

function swiftSources(projectRoot) {
  const own = path.join(projectRoot, 'share/ios')
  return fs
    .readdirSync(own)
    .filter((name) => name.endsWith('.swift'))
    .map((name) => path.join(own, name))
}

/**
 * Creates the extension target, once. A second prebuild without `--clean`
 * would otherwise add a second target of the same name, so a new Swift file
 * needs `expo prebuild --clean`, as it does for the widgets.
 */
function withShareTarget(config, { bundleId, deploymentTarget }) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    if (project.pbxTargetByName(TARGET)) return cfg

    const sources = fs
      .readdirSync(path.join(cfg.modRequest.platformProjectRoot, TARGET))
      .filter((name) => name.endsWith('.swift'))

    // Sources only. Listing `Info.plist` here reuses the app's own reference of
    // that name, and Xcode then refuses to open a project where one file
    // belongs to two groups.
    const group = project.addPbxGroup(sources, TARGET, TARGET)
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup)

    // `app_extension` gives the product type and embeds the .appex in the app.
    const target = project.addTarget(TARGET, 'app_extension', TARGET, shareBundleId(bundleId))

    project.addBuildPhase(
      sources.map((name) => `${TARGET}/${name}`),
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid,
    )
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid)
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)

    // So the app is never built without a current .appex. `addTarget` asks
    // for this itself, but only lands it when the project already has target
    // dependency sections, which `withWatch.js` creates. Mods run in reverse
    // plugin order, which is why app.json lists this plugin before that one.
    // Creating the sections here instead would make withWatch's own request
    // land twice.
    if (!dependsOn(project, project.getFirstTarget().uuid, target.uuid)) {
      const objects = project.hash.project.objects
      objects.PBXTargetDependency ??= {}
      objects.PBXContainerItemProxy ??= {}
      project.addTargetDependency(project.getFirstTarget().uuid, [target.uuid])
    }

    const listId = project.pbxNativeTargetSection()[target.uuid].buildConfigurationList
    const wanted = new Set(
      (project.pbxXCConfigurationList()[listId]?.buildConfigurations ?? []).map((e) => e.value),
    )
    const configurations = project.pbxXCBuildConfigurationSection()
    for (const key of Object.keys(configurations)) {
      if (!wanted.has(key)) continue
      const settings = configurations[key].buildSettings
      settings.PRODUCT_BUNDLE_IDENTIFIER = `"${shareBundleId(bundleId)}"`
      settings.PRODUCT_NAME = `"${TARGET}"`
      settings.INFOPLIST_FILE = `"${TARGET}/Info.plist"`
      settings.CODE_SIGN_STYLE = 'Automatic'
      settings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget
      settings.SWIFT_VERSION = '5.0'
      settings.TARGETED_DEVICE_FAMILY = '"1,2"'
      settings.SKIP_INSTALL = 'YES'
      settings.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = 'NO'
      // Off: the plugin writes the whole Info.plist, and a synthesised one has
      // no NSExtension dictionary, which is an extension that never appears.
      settings.GENERATE_INFOPLIST_FILE = 'NO'
      settings.CURRENT_PROJECT_VERSION = '1'
      settings.MARKETING_VERSION = cfg.version ?? '1.0.0'
      settings.CLANG_ENABLE_MODULES = 'YES'
      settings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO'
    }
    return cfg
  })
}

/** Whether `appUuid` already lists a dependency on `targetUuid`. */
function dependsOn(project, appUuid, targetUuid) {
  const dependencies = project.hash.project.objects.PBXTargetDependency ?? {}
  return (project.pbxNativeTargetSection()[appUuid]?.dependencies ?? []).some(
    (entry) => dependencies[entry.value]?.target === targetUuid,
  )
}

/**
 * One web URL or some text. Instagram and Safari share a URL; TikTok, X and
 * Rednote share a sentence with the link inside it, and some apps share only
 * that. Images and videos are left out on purpose: the import reads the post,
 * not a file of it.
 */
function infoPlist({ scheme, displayName, version, build }) {
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
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionAttributes</key>
    <dict>
      <key>NSExtensionActivationRule</key>
      <dict>
        <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
        <integer>1</integer>
        <key>NSExtensionActivationSupportsText</key>
        <true/>
      </dict>
    </dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
  </dict>
  <key>RiceCalScheme</key>
  <string>${scheme}</string>
</dict>
</plist>
`
}

/**
 * Lists RiceCal in Android's share sheet for text, which is how every app
 * there shares a link, and records the scheme for `ShareIntent.kt`.
 */
function withSendIntentFilter(config, { scheme }) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest)
    activity['intent-filter'] ??= []
    const already = activity['intent-filter'].some((filter) =>
      (filter.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.SEND'),
    )
    if (!already) {
      activity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      })
    }
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      AndroidConfig.Manifest.getMainApplicationOrThrow(manifest),
      ANDROID_SCHEME_META,
      scheme,
    )
    return cfg
  })
}

module.exports.SHARE_TARGET = TARGET
module.exports.shareBundleId = shareBundleId
