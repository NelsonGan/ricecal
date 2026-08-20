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
 * `pnpm ios` sets APP_VARIANT=simulator (see the root package.json). The two
 * variants are exclusive: a local simulator build is unsigned and collides with
 * nothing, so it keeps the release identifiers and drops an entitlement, while
 * the EAS `development` profile below does the opposite.
 *
 * The variant exists for exactly one reason: `com.apple.developer.applesignin`.
 * Expo CLI keeps a list of entitlements that force development code signing
 * even for a *simulator* build (`run/ios/codeSigning/simulatorCodeSigning.ts` —
 * associated-domains and applesignin), and this machine has no signing identity
 * (`security find-identity -v -p codesigning` → 0). So `expo run:ios` refuses
 * before it ever compiles, with "No code signing certificates are available to
 * use" and a link about building onto *physical* devices — which is misleading,
 * since the target was a simulator.
 *
 * Dropping Apple Sign-In from the local build removes the entitlement and the
 * build proceeds unsigned, which is what a simulator wants anyway. The cost is
 * narrow and only local: tapping "Continue with Apple" in a `pnpm ios` build
 * fails at `signInAsync`. Email and Google sign-in are untouched, and EAS builds
 * carry the entitlement as before.
 *
 * Installing a development certificate makes this variant unnecessary — and also
 * fixes the SecureStore keychain failures noted in src/lib/supabase.ts, which
 * this does not. Delete the variant if that ever happens.
 */
const IS_SIMULATOR_VARIANT = process.env.APP_VARIANT === 'simulator'

/**
 * The development EAS profile sets APP_VARIANT=development (see eas.json), and
 * that build is a SEPARATE APP: its own bundle id, package, name and URL scheme.
 *
 * Without it a dev client and the TestFlight build cannot coexist on one phone —
 * installing either replaces the other, so testing a change means giving up the
 * build you were comparing it against. The identifiers are what iOS and Android
 * key an installed app on, so a suffixed id is the whole trick.
 *
 * The scheme has to move with them. Two apps registering `ricecal://` on one
 * device is undefined behaviour on both platforms: the OS picks one, and a login
 * link mailed to a dev build can open the store build instead. That is why
 * `loginLinkRedirect` in src/data/auth.ts reads the scheme off the resolved
 * config rather than hardcoding it — and why `ricecal-dev://**` has to be in the
 * Supabase project's redirect allow-list (apps/supabase/config.toml locally,
 * Authentication → URL Configuration on the hosted project) or the link falls
 * back to `site_url` and dev sign-in silently stops working.
 *
 * THE SUFFIX COSTS YOU IN-APP PURCHASES, and that is accepted rather than
 * solved. A store keys its products to a bundle id, and
 * `com.nelsongan.ricecal.dev` is not an app in App Store Connect — so StoreKit
 * has nothing to return and RevenueCat logs "none of the products could be
 * fetched" on every launch of a dev build. The products are fine; the bundle
 * id is not one the store knows.
 *
 * Two things that look like fixes and are not. A StoreKit configuration file
 * is an Xcode SCHEME setting, so it applies to builds launched from Xcode and
 * not to an EAS build on a phone. And a dev client built without APP_VARIANT
 * would fetch products correctly, but it carries the real bundle id and so
 * REPLACES the TestFlight build on the device, which is the one thing this
 * variant exists to prevent.
 *
 * So the dev build shows a dash where a price goes, and that is the whole
 * symptom. Use a `preview` build when the prices themselves need looking at.
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
 * TELLS EAS THAT THE WIDGET EXTENSION EXISTS.
 *
 * EAS resolves credentials before it builds anything, from the app config —
 * NOT from the Xcode project, which under Continuous Native Generation does not
 * exist yet: `plugins/withWidgets.js` creates the extension target during the
 * prebuild that runs on the build server, minutes later. So without this block
 * EAS registers a bundle id and a profile for the app alone, the server then
 * prebuilds a second target it has no profile for, and the build fails at
 * signing with "no profile matching com.nelsongan.ricecal.widgets".
 *
 * The names come from the plugin rather than being written out again, because
 * they are derived from the bundle id and the derivation has to agree in both
 * places. A hand-copied `com.nelsongan.ricecal.widgets` here is a credential
 * for a target that no longer exists the first time the app is renamed.
 *
 * Applied AFTER the variants, so a development build declares
 * `com.nelsongan.ricecal.dev.widgets` and `group.com.nelsongan.ricecal.dev` —
 * which is the whole reason it is a function of the resolved config.
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
