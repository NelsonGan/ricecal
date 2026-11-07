// Two wrappers, applied in order. PostHog wraps Expo's default config to inject
// the debug IDs that match an exception's minified frames to the source map a
// production build uploads; NativeWind wraps last so its CSS transformer sits
// outermost.
//
// Deliberately absent: watchFolders / resolver.nodeModulesPaths /
// resolver.disableHierarchicalLookup. Since SDK 52, expo/metro-config resolves
// monorepo workspaces on its own, and the Expo monorepo guide says to delete
// those keys if present. Setting disableHierarchicalLookup by hand breaks
// resolution under pnpm's isolated store.
const path = require('node:path')
const { withNativeWind } = require('nativewind/metro')
const { getPostHogExpoConfig } = require('posthog-react-native/metro')

const config = getPostHogExpoConfig(__dirname)

// `react-native-purchases` requires RevenueCat's whole web SDK (813 KB, a
// twelfth of the bundle) at import, for a browser mode it only enters when its
// native module is missing. Every build of this app has the native module, so
// on iOS and Android that SDK is swapped for a stub that throws if it is ever
// called. Its every use is inside a function, so nothing touches it on load.
const REVENUECAT_WEB = '@revenuecat/purchases-js-hybrid-mappings'
const REVENUECAT_WEB_STUB = path.join(__dirname, 'stubs/purchases-js-hybrid-mappings.js')
const upstreamResolve = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== 'web' && moduleName === REVENUECAT_WEB) {
    return { type: 'sourceFile', filePath: REVENUECAT_WEB_STUB }
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = withNativeWind(config, { input: './global.css' })
