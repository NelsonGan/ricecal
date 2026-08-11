// pnpm stores every package at
//   node_modules/.pnpm/<name>@<version>_<hash>/node_modules/<name>/...
//
// transformIgnorePatterns is an UNANCHORED regex, so the default
// `node_modules/(?!allowlist)` matches at the `.pnpm/` segment — `.pnpm` is not
// in any allowlist — and every package in the store is excluded from
// transformation. The symptom is @react-native/jest-preset failing with
// "Cannot use import statement outside a module".
//
// The leading `(?!\.pnpm/)` makes that position fail to match, so the decision
// falls through to the real `node_modules/<name>` segment deeper in the path,
// where the allowlist behaves as intended.
const PACKAGES_NEEDING_TRANSFORM = [
  '(jest-)?react-native',
  '@react-native(-community)?',
  'expo(nent)?',
  '@expo(nent)?',
  '@expo-google-fonts',
  'react-navigation',
  '@react-navigation',
  '@sentry',
  'react-native-svg',
  'nativewind',
  'react-native-css-interop',
  '@shopify',
  'victory-native',
  'react-native-nitro-modules',
  'react-native-mmkv',
  'react-native-keyboard-controller',
  '@ricecal',
].join('|')

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Skia's own setup, first: the module installs JSI bindings at import time and
  // throws "Native Skia Module failed to correctly install JSI Bindings" without
  // it. Anything reaching `src/ui`'s barrel pulls in BrandMark, and therefore
  // Skia, whether the test renders a chart or not.
  // Gesture-handler's own setup for the same reason as Skia's: it installs its
  // native module at import time and throws "install is not a function" without
  // it. Reached by anything that renders a `Sheet` — the handle is a pan gesture
  // now — or a `Slider`.
  setupFiles: [
    '@shopify/react-native-skia/jestSetup.js',
    'react-native-gesture-handler/jestSetup.js',
    '<rootDir>/jest.setup.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup-after-env.js'],
  // Wraps the preset's resolver rather than replacing it — see jest.resolver.js.
  resolver: '<rootDir>/jest.resolver.js',
  // Prefix match, deliberately unanchored at the end: the entry `expo` has to
  // cover `expo-modules-core`, `expo-router`, and every other expo-* package.
  transformIgnorePatterns: [`node_modules/(?!\\.pnpm/)(?!(${PACKAGES_NEEDING_TRANSFORM}))`],
}
