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
const { withNativeWind } = require('nativewind/metro')
const { getPostHogExpoConfig } = require('posthog-react-native/metro')

const config = getPostHogExpoConfig(__dirname)

module.exports = withNativeWind(config, { input: './global.css' })
