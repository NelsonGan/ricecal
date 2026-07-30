import type { ConfigContext, ExpoConfig } from 'expo/config'

const appJson = require('./app.json') as { expo: ExpoConfig }
const baseConfig = appJson.expo

/**
 * `pnpm ios` sets APP_VARIANT=simulator (see the root package.json). Every other
 * caller — EAS, `expo prebuild`, `expo config` — leaves it unset and gets the
 * full configuration in app.json.
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

  return IS_SIMULATOR_VARIANT ? applySimulatorVariant(merged) : merged
}
