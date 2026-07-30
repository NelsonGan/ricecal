// EXPO_PUBLIC_ values are inlined at build time from .env.local, which is
// gitignored and therefore absent in CI. src/lib/env.ts throws on a missing
// key by design, so supply the same placeholders the example file uses.
//
// The Supabase URL is the one exception, and it has to be a real URL rather than
// the sentinel: `createClient` validates it at module scope, so `REPLACE_ME` made
// importing ANY data module throw "Invalid supabaseUrl" — from whatever test
// happened to pull it in, which is a long way from the cause. Nothing branches on
// this value (`isConfigured` is only ever asked about Sentry, Mixpanel,
// RevenueCat and Google), and the client makes no request unless a query runs.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://replace-me.supabase.co'
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
 * The two native modules the data layer reaches at IMPORT time, which is what
 * makes them different from the rest.
 *
 * `src/lib/supabase.ts` installs the keychain as its auth store and
 * `src/data/photos.ts` pulls in the image resizer, both at module scope — so
 * anything importing `@/data` needed them before a single test ran. Together with
 * the Supabase URL above, these three are the whole reason a module that uses a
 * data hook could not be unit-tested without replacing `@/data` wholesale.
 *
 * Neither is exercised: no test signs in, and no test uploads a photo. The real
 * adapter's interesting behaviour is its fallback for a build with no keychain,
 * which is a property of the build rather than of anything a test can reach.
 */
jest.mock('expo-secure-store', () => {
  const store = new Map()

  return {
    getItemAsync: async (key) => store.get(key) ?? null,
    setItemAsync: async (key, value) => void store.set(key, value),
    deleteItemAsync: async (key) => void store.delete(key),
    AFTER_FIRST_UNLOCK: 'afterFirstUnlock',
  }
})

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}))

/**
 * The camera, in the three modules it takes to have one.
 *
 * Reached by anything that renders the picture picker, which now offers the
 * viewfinder as one of its two halves — so this is not only the snap flow's
 * problem any more. `expo-camera` throws at import with "Cannot find native module
 * 'ExpoCamera'", and the other two are what the viewfinder asks about the device
 * around it.
 *
 * `isDevice: false` deliberately: that is the truth here, and it is the branch the
 * viewfinder takes on a simulator — an illustration instead of a live feed, which
 * is the only one a test can render.
 */
jest.mock('expo-camera', () => ({
  CameraView: require('react-native').View,
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}))

jest.mock('expo-device', () => ({ isDevice: false }))

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
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
