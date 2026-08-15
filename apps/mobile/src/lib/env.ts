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
  EXPO_PUBLIC_CATALOGUE_URL: process.env.EXPO_PUBLIC_CATALOGUE_URL,
  EXPO_PUBLIC_RC_IOS_KEY: process.env.EXPO_PUBLIC_RC_IOS_KEY,
  EXPO_PUBLIC_RC_ANDROID_KEY: process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
  EXPO_PUBLIC_MIXPANEL_TOKEN: process.env.EXPO_PUBLIC_MIXPANEL_TOKEN,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY,
  EXPO_PUBLIC_TURNSTILE_ORIGIN: process.env.EXPO_PUBLIC_TURNSTILE_ORIGIN,
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
  /**
   * The food catalogue Worker. A hostname, not a credential: the app reaches it
   * with the user's own Supabase JWT, and the Worker verifies that against a
   * public key. Nothing here is worth hiding, which is the whole reason the
   * edge function in front of it could go.
   */
  EXPO_PUBLIC_CATALOGUE_URL: z.string().min(1),
  EXPO_PUBLIC_RC_IOS_KEY: z.string().min(1),
  EXPO_PUBLIC_RC_ANDROID_KEY: z.string().min(1),
  EXPO_PUBLIC_MIXPANEL_TOKEN: z.string().min(1),
  EXPO_PUBLIC_SENTRY_DSN: z.string().min(1),
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().min(1),
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: z.string().min(1),
  /**
   * Cloudflare Turnstile, which is the bot gate in front of Supabase's auth
   * endpoints. The SITE key, which is public by design: it identifies the
   * widget to Cloudflare and proves nothing. The secret is Supabase's, set with
   * `pnpm auth:config --captcha-secret`, and never reaches a phone.
   *
   * Left at the placeholder the app asks for no token and sends none, which is
   * the correct behaviour while the gate on the project is still off. See
   * `features/auth/turnstile.tsx` for why that direction is the safe one.
   */
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  /**
   * The origin the widget believes it is running on.
   *
   * A Turnstile widget is bound to a hostname list, and a WebView rendering
   * inline HTML has no hostname of its own — so the page is loaded under this
   * one and it has to be a domain the widget allows. It is not a secret and not
   * fetched; nothing is served from it.
   */
  EXPO_PUBLIC_TURNSTILE_ORIGIN: z.string().min(1),
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
