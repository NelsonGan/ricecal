// Two wrappers, applied in order. Sentry wraps Expo's default config to add
// source maps and debug IDs; NativeWind wraps last so its CSS transformer sits
// outermost.
//
// Deliberately absent: watchFolders / resolver.nodeModulesPaths /
// resolver.disableHierarchicalLookup. Since SDK 52, expo/metro-config resolves
// monorepo workspaces on its own, and the Expo monorepo guide says to delete
// those keys if present. Setting disableHierarchicalLookup by hand breaks
// resolution under pnpm's isolated store.
const { getSentryExpoConfig } = require('@sentry/react-native/metro')
const { withNativeWind } = require('nativewind/metro')

const config = getSentryExpoConfig(__dirname)

module.exports = withNativeWind(config, { input: './global.css' })
