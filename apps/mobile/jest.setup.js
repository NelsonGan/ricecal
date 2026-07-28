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
