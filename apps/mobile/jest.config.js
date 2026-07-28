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
  '@ricecal',
].join('|')

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup-after-env.js'],
  // Wraps the preset's resolver rather than replacing it — see jest.resolver.js.
  resolver: '<rootDir>/jest.resolver.js',
  // Prefix match, deliberately unanchored at the end: the entry `expo` has to
  // cover `expo-modules-core`, `expo-router`, and every other expo-* package.
  transformIgnorePatterns: [`node_modules/(?!\\.pnpm/)(?!(${PACKAGES_NEEDING_TRANSFORM}))`],
}
