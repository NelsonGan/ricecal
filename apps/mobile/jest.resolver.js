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
 * Reanimated 4.7 needs the same for a handful of its own modules, and only
 * those: on its web path elsewhere it asks for react-native-web, which is not
 * installed. `WEB_ONLY_IN_JEST` is copied from
 * `react-native-reanimated/jest/resolver.js`; check it against that file when
 * Reanimated moves.
 *
 * Both mirror the libraries' own Jest resolvers, which cannot be used as-is:
 * they delegate to Jest's default resolver and would lose the React Native
 * behaviour above. They also match by substring, and pnpm names a store folder
 * after its peers (`react-native-css-interop@…_react-native-worklets@0.13…`),
 * so a substring match strips `.native` from NativeWind too and loads its web
 * runtime, which dies on `document`. Match the package folder instead.
 */
const inside = (name) => new RegExp(`(^|[\\\\/])node_modules[\\\\/]${name}([\\\\/]|$)`)
const IN_WORKLETS = inside('react-native-worklets')
const IN_REANIMATED = inside('react-native-reanimated')

const WEB_ONLY_IN_JEST = [
  'initializers',
  'mutables',
  'mappers',
  'ConfigHelper',
  'UpdateLayoutAnimations',
  'useAnimatedRef',
  'useAnimatedStyle',
  'WorkletEventHandler',
  'JSPropsUpdater',
  'updateProps',
  'util',
  'css/component/AnimatedComponent',
]

function reanimatedWebOnly(request, basedir) {
  if (!request.startsWith('.') || !IN_REANIMATED.test(basedir)) return false
  const basename = request.split('/').pop()
  return WEB_ONLY_IN_JEST.some((entry) =>
    entry.includes('/') ? request.endsWith(entry) : basename === entry,
  )
}

function workletsRequest(request, basedir) {
  return (
    IN_WORKLETS.test(basedir) ||
    request === 'react-native-worklets' ||
    request.startsWith('react-native-worklets/')
  )
}

module.exports = (request, options) => {
  if (!reanimatedWebOnly(request, options.basedir) && !workletsRequest(request, options.basedir))
    return resolve(request, options)

  return resolve(request, {
    ...options,
    extensions: options.extensions?.filter((extension) => !extension.includes('native')),
  })
}
