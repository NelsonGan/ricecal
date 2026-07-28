// Naming `resolver` in jest.config REPLACES the one jest-expo's preset sets —
// Jest merges `setupFiles` and `transform` from a preset but not `resolver`.
// Losing it breaks React Native's platform-extension resolution, and the
// symptom is not an error: `render()` succeeds and returns an object with no
// query methods, so every component test fails with "`render` function has not
// been called".
//
// So: take the preset's resolver and wrap it, rather than replacing it.
//
// Resolved through jest-expo rather than by requiring @react-native/jest-preset
// directly, which pnpm does not hoist into this package.
const { resolver: reactNativeResolver } = require('jest-expo/ios/jest-preset')

const resolve = require(reactNativeResolver)

/**
 * react-native-worklets' `.native` entrypoints reach for a TurboModule that
 * does not exist under Jest — importing Animated fails with "Cannot read
 * properties of undefined (reading 'loadUnpackers')". Dropping the `.native`
 * extension for requests inside that package picks its JS fallback instead.
 *
 * This mirrors `react-native-worklets/jest/resolver.js`, which cannot be used
 * as-is because it delegates to Jest's default resolver and so would lose the
 * React Native behaviour above.
 */
module.exports = (request, options) => {
  const insideWorklets =
    options.basedir.includes('react-native-worklets') || request.includes('react-native-worklets')

  if (!insideWorklets) return resolve(request, options)

  return resolve(request, {
    ...options,
    extensions: options.extensions?.filter((extension) => !extension.includes('native')),
  })
}
