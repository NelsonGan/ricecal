import type { ConfigContext, ExpoConfig } from 'expo/config'

// The plugin owns the three derived names; see `withEasExtension` below for why
// this file needs them rather than working them out again.
const { WIDGET_TARGET, appGroupFor, widgetBundleId } = require('./plugins/withWidgets') as {
  WIDGET_TARGET: string
  appGroupFor: (bundleId: string) => string
  widgetBundleId: (bundleId: string) => string
}

const appJson = require('./app.json') as { expo: ExpoConfig }
const baseConfig = appJson.expo

/**
 * `pnpm ios` sets APP_VARIANT=simulator. The two variants are exclusive: a local
 * simulator build is unsigned and collides with nothing, so it keeps the release
 * identifiers and drops an entitlement, where the EAS `development` profile below
 * does the opposite.
 *
 * It exists for one reason, `com.apple.developer.applesignin`. Expo CLI forces
 * development code signing for a simulator build carrying that entitlement, and
 * this machine has no signing identity, so `expo run:ios` refuses before it
 * compiles with a message about physical devices.
 *
 * Dropping Apple Sign-In locally removes the entitlement and the build proceeds
 * unsigned. The cost is that "Continue with Apple" fails at `signInAsync` in a
 * `pnpm ios` build; email and Google are untouched, and EAS builds carry the
 * entitlement as before.
 *
 * Installing a development certificate makes this variant unnecessary, and also
 * fixes the SecureStore keychain failures noted in src/lib/supabase.ts.
 */
const IS_SIMULATOR_VARIANT = process.env.APP_VARIANT === 'simulator'

/**
 * The development EAS profile sets APP_VARIANT=development, and that build is a
 * separate app: its own bundle id, package, name and URL scheme. Without it a dev
 * client and the TestFlight build cannot coexist on one phone.
 *
 * The scheme has to move with them, because two apps registering `ricecal://` is
 * undefined behaviour on both platforms. That is why `loginLinkRedirect` reads
 * the scheme off the resolved config, and why `ricecal-dev://**` has to be in the
 * Supabase project's redirect allow-list or the link falls back to `site_url`.
 *
 * The suffix costs in-app purchases, and that is accepted. A store keys its
 * products to a bundle id and `com.nelsongan.ricecal.dev` is not an app in App
 * Store Connect, so RevenueCat logs "none of the products could be fetched".
 *
 * Two things that look like fixes and are not: a StoreKit configuration file is
 * an Xcode scheme setting and does not reach an EAS build, and a dev client built
 * without APP_VARIANT carries the real bundle id and replaces TestFlight.
 *
 * So a dev build shows a dash where a price goes. Use a `preview` build when the
 * prices themselves need looking at.
 */
const IS_DEV_VARIANT = process.env.APP_VARIANT === 'development'

const DEV_SUFFIX = '.dev'

function applyDevVariant(cfg: ExpoConfig): ExpoConfig {
  return {
    ...cfg,
    name: 'RiceCal Dev',
    scheme: 'ricecal-dev',
    ios: { ...cfg.ios, bundleIdentifier: `${cfg.ios?.bundleIdentifier}${DEV_SUFFIX}` },
    android: { ...cfg.android, package: `${cfg.android?.package}${DEV_SUFFIX}` },
  }
}

function applySimulatorVariant(cfg: ExpoConfig): ExpoConfig {
  const ios = { ...cfg.ios }
  ios.usesAppleSignIn = false

  // Dropping the plugin from the list is necessary but NOT sufficient — Expo
  // autolinking re-applies expo-apple-authentication's own app.plugin.js at
  // prebuild time, so ./plugins/withoutAppleSignIn deletes the entitlement the
  // autolinked plugin puts back. Appended last so its mod runs after that one.
  const plugins = (cfg.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin
    return typeof name !== 'string' || name !== 'expo-apple-authentication'
  })

  return { ...cfg, ios, plugins: [...plugins, './plugins/withoutAppleSignIn'] }
}

/**
 * Tells EAS that the widget extension exists. EAS resolves credentials from the
 * app config before it builds anything, and the Xcode project does not exist yet
 * under Continuous Native Generation, so without this block the server prebuilds
 * a second target it has no profile for and signing fails.
 *
 * The names come from the plugin rather than being written out again, because
 * they are derived from the bundle id and a hand-copied one becomes a credential
 * for a target that no longer exists the first time the app is renamed.
 *
 * Applied after the variants, which is why it is a function of the resolved
 * config: a development build declares `com.nelsongan.ricecal.dev.widgets`.
 */
function withEasExtension(cfg: ExpoConfig): ExpoConfig {
  const bundleId = cfg.ios?.bundleIdentifier
  if (!bundleId) return cfg

  return {
    ...cfg,
    extra: {
      ...cfg.extra,
      eas: {
        ...cfg.extra?.eas,
        build: {
          ...cfg.extra?.eas?.build,
          experimental: {
            ...cfg.extra?.eas?.build?.experimental,
            ios: {
              ...cfg.extra?.eas?.build?.experimental?.ios,
              appExtensions: [
                {
                  targetName: WIDGET_TARGET,
                  bundleIdentifier: widgetBundleId(bundleId),
                  entitlements: {
                    'com.apple.security.application-groups': [appGroupFor(bundleId)],
                  },
                },
              ],
            },
          },
        },
      },
    },
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const merged: ExpoConfig = { ...baseConfig, ...config }

  if (IS_SIMULATOR_VARIANT) return withEasExtension(applySimulatorVariant(merged))
  return withEasExtension(IS_DEV_VARIANT ? applyDevVariant(merged) : merged)
}
