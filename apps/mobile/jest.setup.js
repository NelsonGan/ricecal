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
// A real URL for the same reason, one step removed: `catalogueGet` builds a
// request from it, and a test that reaches the catalogue should fail on the
// fetch it mocked rather than on parsing "REPLACE_ME" as a host.
process.env.EXPO_PUBLIC_CATALOGUE_URL ??= 'https://replace-me.workers.dev'
process.env.EXPO_PUBLIC_RC_IOS_KEY ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_RC_ANDROID_KEY ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_MIXPANEL_TOKEN ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_SENTRY_DSN ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??= 'REPLACE_ME'
// The sentinel deliberately, so `captchaConfigured()` is false under test and
// `useCaptchaToken()` resolves `undefined` without a WebView. A real-looking key
// here would put a Turnstile widget in the middle of every auth test.
process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ??= 'REPLACE_ME'
process.env.EXPO_PUBLIC_TURNSTILE_ORIGIN ??= 'ricecal.app'

// `react-native-webview` reaches for a TurboModule at import time, which under
// Jest is "'RNCWebViewModule' could not be found". The captcha provider already
// survives that — it requires the module rather than importing it, because a
// dev client built before the dependency landed fails the same way — but the
// warning it prints would then be on every auth test's output. A stub view is
// quieter and lets a test render the provider if it ever wants to.
jest.mock('react-native-webview', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: View, WebView: View }
})

// Two Expo modules reach for native views or a native module the moment they
// are imported, which fails under Jest with "not available on ios, are you sure
// you've linked all the native dependencies". Neither is what the UI tests are
// about — they assert behaviour and accessibility, not image decoding or the
// taptic engine — so both are replaced with the smallest thing that renders.
jest.mock('expo-image', () => ({
  // The cache statics have no React Native equivalent to borrow, so they are
  // stubbed onto it: `data/photos.ts` empties both on sign-out, asks the disk
  // where a picture already is before it signs for one, and seeds it with what
  // it has just uploaded.
  //
  // `getCachePathAsync` answers "not here" by default, which is the branch that
  // reaches the network — the tests that care about a hit say so themselves.
  Image: Object.assign(require('react-native').Image, {
    clearMemoryCache: jest.fn(() => Promise.resolve(true)),
    clearDiskCache: jest.fn(() => Promise.resolve(true)),
    getCachePathAsync: jest.fn(() => Promise.resolve(null)),
    writeToCacheAsync: jest.fn(() => Promise.resolve()),
  }),
}))

/**
 * `expo-store-review` resolves to `requireNativeModule('ExpoStoreReview')` on a
 * native platform, which throws the moment it is required. `lib/rating` already
 * survives that on a device by requiring it lazily inside a try, so this mock is
 * not what keeps the suite running: it is what keeps it QUIET and deterministic,
 * since the real module would otherwise print a warning from every test that
 * answers the rating sheet.
 *
 * `isAvailableAsync` answers "no store here" by default, which is the branch a
 * test would want: nothing should be able to open a review dialog from a suite.
 */
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  requestReview: jest.fn(() => Promise.resolve()),
  storeUrl: jest.fn(() => null),
}))

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

/**
 * The two native modules the data layer reaches at import time, which is what
 * makes them different from the rest. `src/lib/supabase.ts` installs the keychain
 * as its auth store and `src/data/photos.ts` pulls in the image resizer, both at
 * module scope, so anything importing `@/data` needed them before a single test
 * ran.
 *
 * Neither is exercised: no test signs in, and no test uploads a photo.
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
 * The camera, in the three modules it takes to have one. Reached by anything that
 * renders the picture picker, which offers the viewfinder as one of its halves.
 * `expo-camera` throws at import with "Cannot find native module 'ExpoCamera'",
 * and the other two are what the viewfinder asks about the device around it.
 *
 * `isDevice: false` deliberately: that is the truth here, and it is the branch the
 * viewfinder takes on a simulator, which is the only one a test can render.
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
        // Numbers and booleans go in as strings like everything else, so the
        // typed reads parse on the way out. Without them a store that writes a
        // timestamp reads back `undefined` and the caller decides it has never
        // been written — which is a working feature in a test and a broken one
        // on a device.
        getNumber: (key) => (store.has(key) ? Number(store.get(key)) : undefined),
        getBoolean: (key) => (store.has(key) ? store.get(key) === 'true' : undefined),
        remove: (key) => store.delete(key),
        clearAll: () => store.clear(),
        getAllKeys: () => [...store.keys()],
        contains: (key) => store.has(key),
      }
    },
  }
})

/**
 * Keyboard-controller reads its native bindings at import time and throws
 * "doesn't seem to be linked" off a device. `Screen` and `Sheet` both import
 * it, so without this most of the app is unrenderable under Jest.
 *
 * The package ships the substitutes — plain Views and a ScrollView, which is
 * what these are in a test anyway — but only as an object to be handed to
 * `jest.mock`. Listed in `setupFiles` on its own it registers nothing.
 */
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
)
