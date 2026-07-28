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
