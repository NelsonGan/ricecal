const fs = require('node:fs')
const path = require('node:path')

const {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins')

/**
 * Puts the WidgetKit extension into the generated Xcode project.
 *
 * `ios/` is build output, so a widget extension cannot be committed the way it
 * would be in a bare React Native app: everything Xcode needs is produced at
 * prebuild time from tracked sources.
 *
 *   widgets/ios/*.swift                 the extension itself
 *   modules/ricecal-widgets/ios/…Store  the file the app and the widget share
 *   assets/icons/**                     the four icons the widgets draw
 *   node_modules/@expo-google-fonts     Baloo 2 and Nunito
 *
 * Android needs none of this: its widgets are an `AppWidgetProvider` and some
 * layouts inside the local Expo module, where Gradle finds them. A widget
 * extension is a separate binary with its own bundle.
 *
 * The App Group is derived rather than constant. `group.<bundleId>` follows the
 * build variant, because a dev client's bundle id carries a `.dev` suffix. It is
 * written into the entitlements of both targets and both Info.plists, which is
 * how `RiceCalWidgetStore` finds it without hardcoding anything.
 */

/** The extension's target name, its folder under `ios/`, and its product name. */
const TARGET = 'RiceCalWidgets'

/**
 * The icons, flattened out of `assets/icons/<set>/<name>.png`.
 *
 * Renamed on the way in so the extension's bundle cannot collide with anything
 * the app ships, and so a missing one is obvious in the `WidgetIcon` fallback
 * rather than being some other picture that happened to share a name.
 */
const ICONS = [
  ['system/camera.png', 'wg-camera.png'],
  ['system/barcode.png', 'wg-barcode.png'],
  ['ui/search.png', 'wg-search.png'],
  ['food/cooking-pot.png', 'wg-recipe.png'],
  ['food/rice-bowl.png', 'wg-mark.png'],
]

/**
 * The three faces, by the PostScript names `WidgetTheme.swift` asks for. Copied
 * out of node_modules rather than `assets`, because that is where the app's own
 * five come from too. A widget cannot load a font asynchronously, so these are
 * embedded in the extension and declared in `UIAppFonts`.
 */
const FONTS = [
  ['@expo-google-fonts/baloo-2/800ExtraBold/Baloo2_800ExtraBold.ttf', 'Baloo2-ExtraBold.ttf'],
  ['@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf', 'Nunito-ExtraBold.ttf'],
  ['@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf', 'Nunito-Bold.ttf'],
]

const appGroupFor = (bundleId) => `group.${bundleId}`

const widgetBundleId = (bundleId) => `${bundleId}.widgets`

/**
 * The three derived names, exported because `app.config.ts` needs the same
 * answers and must not work them out again. EAS reads the extension's bundle id
 * and entitlements out of app config rather than the Xcode project, which does
 * not exist when credentials are resolved, so a second hand-written copy is a
 * credential for a bundle id that stops matching the first time either moves.
 */
module.exports = function withWidgets(config) {
  const bundleId = config.ios?.bundleIdentifier
  if (!bundleId) {
    throw new Error('withWidgets: ios.bundleIdentifier must be set before this plugin runs.')
  }

  const appGroup = appGroupFor(bundleId)
  // The scheme the widget's deep links use. Read off the resolved config for
  // the reason `loginLinkRedirect` does the same: a dev build registers
  // `ricecal-dev://`, and a widget tap that used the store build's scheme would
  // open whichever of the two the OS felt like.
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : (config.scheme ?? 'ricecal')

  let next = withWidgetFiles(config, { appGroup, scheme })
  next = withAppGroupEntitlement(next, appGroup)
  next = withAppInfoPlist(next, appGroup)
  next = withWidgetTarget(next, { bundleId, appGroup })
  return next
}

/**
 * Copies the extension's sources, assets and two plists into `ios/`. Runs on
 * every prebuild, so editing a widget and rebuilding is enough. The Xcode surgery
 * below happens once, so a new source file needs a `--clean` prebuild: the
 * alternative is a mod that tears a target out of a project it did not create.
 */
function withWidgetFiles(config, { appGroup, scheme }) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot
      const targetDir = path.join(cfg.modRequest.platformProjectRoot, TARGET)
      fs.mkdirSync(targetDir, { recursive: true })

      for (const file of swiftSources(projectRoot)) {
        fs.copyFileSync(file, path.join(targetDir, path.basename(file)))
      }

      for (const [from, to] of ICONS) {
        fs.copyFileSync(path.join(projectRoot, 'assets/icons', from), path.join(targetDir, to))
      }

      for (const [from, to] of FONTS) {
        fs.copyFileSync(resolveFont(projectRoot, from), path.join(targetDir, to))
      }

      fs.writeFileSync(
        path.join(targetDir, 'Info.plist'),
        infoPlist({
          appGroup,
          scheme,
          displayName: cfg.name ?? 'RiceCal',
          version: cfg.version ?? '1.0.0',
          // THE APP'S OWN BUILD NUMBER, not a constant. Apple rejects an
          // upload whose extension disagrees with its container about either
          // half of the version pair (ITMS-90473), and `autoIncrement` in
          // eas.json moves this on every production build — so a hardcoded
          // `1` here is a build that compiles, installs, runs, and then fails
          // at the App Store Connect gate on the second release.
          build: String(cfg.ios?.buildNumber ?? '1'),
        }),
      )

      fs.writeFileSync(path.join(targetDir, `${TARGET}.entitlements`), entitlementsPlist(appGroup))

      return cfg
    },
  ])
}

/**
 * The Swift the extension compiles: its own sources plus the one file it shares
 * with the app. The store is copied rather than referenced, because the reference
 * would have to point out of `ios/` into `modules/`, a path that only holds while
 * the two are siblings. A copy into build output is rewritten every prebuild.
 */
function swiftSources(projectRoot) {
  const own = path.join(projectRoot, 'widgets/ios')
  const files = fs
    .readdirSync(own)
    .filter((name) => name.endsWith('.swift'))
    .map((name) => path.join(own, name))

  return [...files, path.join(projectRoot, 'modules/ricecal-widgets/ios/RiceCalWidgetStore.swift')]
}

/**
 * A font inside a workspace package, without assuming a layout. pnpm does not
 * flatten `node_modules`, so the path is a symlink into a content-addressed
 * store; `require.resolve` follows whatever the installer did.
 */
function resolveFont(projectRoot, request) {
  return require.resolve(request, { paths: [projectRoot] })
}

/** The App Group on the APP, which is the half that lets it publish at all. */
function withAppGroupEntitlement(config, appGroup) {
  return withEntitlementsPlist(config, (cfg) => {
    const key = 'com.apple.security.application-groups'
    const groups = new Set(cfg.modResults[key] ?? [])
    groups.add(appGroup)
    cfg.modResults[key] = [...groups]
    return cfg
  })
}

/** So `RiceCalWidgetStore` finds the container from inside the app too. */
function withAppInfoPlist(config, appGroup) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.RiceCalAppGroup = appGroup
    return cfg
  })
}

/**
 * Creates the extension target, once. The guard is the whole idempotency story:
 * `expo prebuild` without `--clean` applies its mods to the project already
 * there, so a second run adds a second target with the same name, and Xcode's
 * failure for that is a build that succeeds with two identical widget bundles.
 */
function withWidgetTarget(config, { bundleId, appGroup }) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    if (project.pbxTargetByName(TARGET)) return cfg

    const sources = fs
      .readdirSync(path.join(cfg.modRequest.platformProjectRoot, TARGET))
      .filter((name) => name.endsWith('.swift'))
    const resources = [...ICONS.map(([, to]) => to), ...FONTS.map(([, to]) => to)]

    /**
     * The navigator group, so the extension is browsable in Xcode. Basenames,
     * because the group carries the folder in its own `path`, while the build
     * phases name the same files from the project root. Only the build phase's
     * reference is in a phase, so nothing is compiled twice.
     */
    const group = project.addPbxGroup([...sources, ...resources], TARGET, TARGET)
    // The project's own root group, by reference rather than by scanning for
    // the one group with no name and no path. That scan is the recipe usually
    // written for this, and it is a guess: it happens to match exactly one
    // group in an Expo-generated project, and would attach the extension twice
    // in any project where it matched two.
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup)

    // `app_extension` is what puts the .appex into the app's own Embed phase
    // and gives it the right product type. See `addTarget` in the xcode package.
    const target = project.addTarget(TARGET, 'app_extension', TARGET, widgetBundleId(bundleId))

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
    // Empty, and not optional. Xcode adds a Frameworks phase to every native
    // target and the linker settings the extension inherits assume one is
    // there; SwiftUI, WidgetKit and AppIntents are auto-linked from the
    // `import`, so nothing goes in it.
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)

    // So the app cannot be built without a current .appex to embed.
    project.addTargetDependency(project.getFirstTarget().uuid, [target.uuid])

    applyBuildSettings(project, target, { bundleId, appGroup, version: cfg.version })

    return cfg
  })
}

/**
 * The extension's build settings, over the defaults `addTarget` writes. Explicit
 * about the deployment target and the Swift version rather than inheriting: the
 * app's are set by `expo-build-properties` on the app target, and a hand-created
 * target inherits the project's instead.
 */
function applyBuildSettings(project, target, { bundleId, appGroup, version }) {
  const listId = project.pbxNativeTargetSection()[target.uuid].buildConfigurationList
  const lists = project.pbxXCConfigurationList()
  const wanted = new Set((lists[listId]?.buildConfigurations ?? []).map((entry) => entry.value))

  const configurations = project.pbxXCBuildConfigurationSection()
  for (const key of Object.keys(configurations)) {
    if (!wanted.has(key)) continue
    const settings = configurations[key].buildSettings
    settings.PRODUCT_BUNDLE_IDENTIFIER = `"${widgetBundleId(bundleId)}"`
    settings.PRODUCT_NAME = `"${TARGET}"`
    settings.INFOPLIST_FILE = `"${TARGET}/Info.plist"`
    settings.CODE_SIGN_ENTITLEMENTS = `"${TARGET}/${TARGET}.entitlements"`
    settings.CODE_SIGN_STYLE = 'Automatic'
    // The app's floor, from expo-build-properties. WidgetKit itself is iOS 14;
    // the interactive water buttons are 17 and are guarded in Swift.
    settings.IPHONEOS_DEPLOYMENT_TARGET = '16.4'
    settings.SWIFT_VERSION = '5.0'
    settings.TARGETED_DEVICE_FAMILY = '"1,2"'
    settings.SKIP_INSTALL = 'YES'
    settings.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = 'NO'
    // Off, because the plugin writes a complete Info.plist. Left on, Xcode
    // synthesises one and the NSExtension dictionary disappears — which shows
    // up as an extension that builds, installs and never appears in the
    // widget gallery.
    settings.GENERATE_INFOPLIST_FILE = 'NO'
    settings.CURRENT_PROJECT_VERSION = '1'
    settings.MARKETING_VERSION = version ?? '1.0.0'
    settings.SWIFT_EMIT_LOC_STRINGS = 'YES'
    settings.CLANG_ENABLE_MODULES = 'YES'
    settings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO'
    // Not read by anything at build time; it is here so the container the two
    // targets share is visible in the project rather than only in two plists.
    settings.RICECAL_APP_GROUP = `"${appGroup}"`
  }
}

function infoPlist({ appGroup, scheme, displayName, version, build }) {
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
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
  <key>UIAppFonts</key>
  <array>
${FONTS.map(([, to]) => `    <string>${to}</string>`).join('\n')}
  </array>
  <key>RiceCalAppGroup</key>
  <string>${appGroup}</string>
  <key>RiceCalScheme</key>
  <string>${scheme}</string>
</dict>
</plist>
`
}

function entitlementsPlist(appGroup) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${appGroup}</string>
  </array>
</dict>
</plist>
`
}

module.exports.WIDGET_TARGET = TARGET
module.exports.widgetBundleId = widgetBundleId
module.exports.appGroupFor = appGroupFor
