import { z } from 'zod'

/**
 * Every EXPO_PUBLIC_ value must be referenced as a static property access.
 * Babel inlines `process.env.EXPO_PUBLIC_FOO` at build time by literal text
 * match — `process.env[name]` is NOT inlined and resolves to undefined in a
 * release bundle. Do not refactor the object below into a loop.
 */
const raw = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_RC_IOS_KEY: process.env.EXPO_PUBLIC_RC_IOS_KEY,
  EXPO_PUBLIC_RC_ANDROID_KEY: process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
  EXPO_PUBLIC_MIXPANEL_TOKEN: process.env.EXPO_PUBLIC_MIXPANEL_TOKEN,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
}

/**
 * Sentinel written by .env.example. A key set to this is "declared but not yet
 * provisioned" — validation passes, but the SDK that consumes it stays off.
 * A key that is absent or empty is a real error and throws.
 */
export const PLACEHOLDER = 'REPLACE_ME'

const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().min(1),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  EXPO_PUBLIC_RC_IOS_KEY: z.string().min(1),
  EXPO_PUBLIC_RC_ANDROID_KEY: z.string().min(1),
  EXPO_PUBLIC_MIXPANEL_TOKEN: z.string().min(1),
  EXPO_PUBLIC_SENTRY_DSN: z.string().min(1),
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().min(1),
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: z.string().min(1),
})

const parsed = schema.safeParse(raw)

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
  throw new Error(
    `Missing environment variables: ${missing}\n` +
      'Copy apps/mobile/.env.example to .env.local and fill it in. ' +
      'Restart Metro with --clear after editing — EXPO_PUBLIC_ values are ' +
      'inlined at build time and survive a fast refresh.',
  )
}

export const env = parsed.data

/** True once a key holds a real provisioned value rather than the sentinel. */
export function isConfigured(value: string): boolean {
  return value !== PLACEHOLDER
}
