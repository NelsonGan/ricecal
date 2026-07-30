// EXPO_PUBLIC_ values are inlined at build time from .env.local, which is
// gitignored and therefore absent in CI. src/lib/env.ts throws on a missing
// key by design, so supply the same placeholders the example file uses.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_RC_IOS_KEY ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_RC_ANDROID_KEY ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_MIXPANEL_TOKEN ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_SENTRY_DSN ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??= 'REPLACE_ME'

// Two Expo modules reach for native views or a native module the moment they
// are imported, which fails under Jest with "not available on ios, are you sure
// you've linked all the native dependencies". Neither is what the UI tests are
// about — they assert behaviour and accessibility, not image decoding or the
// taptic engine — so both are replaced with the smallest thing that renders.
jest.mock('expo-image', () => ({
  Image: require('react-native').Image,
}))

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

/**
 * MMKV is a Nitro module, so importing it under Jest throws at the TurboModule
 * lookup — "Failed to create a new MMKV instance" is the symptom, but the module
 * is gone long before any instance is asked for.
 *
 * A Map is the whole of what the app uses it for: the onboarding draft, and the
 * query cache persister. Per `id`, so two stores cannot read each other's keys,
 * and cleared between suites by `jest.resetModules` doing nothing to it — tests
 * that care about a fresh store clear it themselves.
 */
jest.mock('react-native-mmkv', () => {
  const stores = new Map()

  return {
    createMMKV: ({ id } = { id: 'default' }) => {
      if (!stores.has(id)) stores.set(id, new Map())
      const store = stores.get(id)

      return {
        set: (key, value) => store.set(key, String(value)),
        getString: (key) => store.get(key),
        remove: (key) => store.delete(key),
        clearAll: () => store.clear(),
        getAllKeys: () => [...store.keys()],
        contains: (key) => store.has(key),
      }
    },
  }
})
