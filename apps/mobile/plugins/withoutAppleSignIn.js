const { withEntitlementsPlist } = require('expo/config-plugins')

/**
 * Deletes `com.apple.developer.applesignin` from the generated entitlements.
 *
 * Dropping `expo-apple-authentication` from `plugins` is not enough: Expo
 * autolinking applies a package's `app.plugin.js` on its own, so the entitlement
 * comes back at prebuild time even when the resolved config shows no Apple
 * Sign-In (`expo config --type prebuild` reports `entitlements: undefined`, and
 * the written .entitlements file has the key anyway). Only a mod that runs after
 * it can take the key back out.
 *
 * Used by the APP_VARIANT=simulator branch in app.config.ts — see the comment
 * there for why a simulator build cannot carry this entitlement.
 */
module.exports = function withoutAppleSignIn(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['com.apple.developer.applesignin']
    return cfg
  })
}
