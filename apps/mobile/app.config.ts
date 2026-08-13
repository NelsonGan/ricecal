import type { ConfigContext, ExpoConfig } from 'expo/config'

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
 * THE SUFFIX COSTS YOU IN-APP PURCHASES, and there is no way round that. A
 * store keys its products to a bundle id, and `com.nelsongan.ricecal.dev` is
 * not an app in App Store Connect — so StoreKit has nothing to return and
 * RevenueCat reports "none of the products could be fetched", however
 * correctly the products are set up. A StoreKit configuration file does not
 * help either: that is an Xcode SCHEME setting, so it applies to builds
 * launched from Xcode and not to an EAS build installed on a phone.
 *
 * The `development-purchases` profile in eas.json is the way round it: the
 * same dev client, without APP_VARIANT, so it carries the real bundle id and
 * can fetch real products. It cannot sit on a device beside the TestFlight
 * build, which is the whole reason this variant exists — so you get
 * coexistence or working purchases, and have to pick per build.
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

export default ({ config }: ConfigContext): ExpoConfig => {
  const merged: ExpoConfig = { ...baseConfig, ...config }

  if (IS_SIMULATOR_VARIANT) return applySimulatorVariant(merged)
  return IS_DEV_VARIANT ? applyDevVariant(merged) : merged
}
