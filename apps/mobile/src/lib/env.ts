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
  EXPO_PUBLIC_RC_TEST_STORE_KEY: process.env.EXPO_PUBLIC_RC_TEST_STORE_KEY,
  EXPO_PUBLIC_GA4_ENABLED: process.env.EXPO_PUBLIC_GA4_ENABLED,
  EXPO_PUBLIC_ANALYTICS_ENABLED: process.env.EXPO_PUBLIC_ANALYTICS_ENABLED,
  EXPO_PUBLIC_POSTHOG_DEV: process.env.EXPO_PUBLIC_POSTHOG_DEV,
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

/**
 * Plain checks rather than zod. This was the only file that used it, and zod
 * was 390 KB of the release bundle for thirteen string checks.
 */
type Check<T extends string | undefined> = (value: string | undefined) => value is T
const text: Check<string> = (value): value is string =>
  typeof value === 'string' && value.length > 0
const optional =
  <T extends string>(check: Check<T>): Check<T | undefined> =>
  (value): value is T | undefined =>
    value === undefined || check(value)
const oneOf =
  <const T extends string>(...values: T[]): Check<T> =>
  (value): value is T =>
    value !== undefined && (values as string[]).includes(value)

const schema = {
  EXPO_PUBLIC_SUPABASE_URL: text,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: text,
  /**
   * The food catalogue Worker. A hostname, not a credential: the app reaches it
   * with the user's own Supabase JWT, and the Worker verifies that against a
   * public key. Nothing here is worth hiding, which is the whole reason the
   * edge function in front of it could go.
   */
  EXPO_PUBLIC_CATALOGUE_URL: text,
  EXPO_PUBLIC_RC_IOS_KEY: text,
  EXPO_PUBLIC_RC_ANDROID_KEY: text,
  /**
   * RevenueCat's test store key, and the only way the purchase flow can be walked
   * on a simulator. Every other way needs a real store, so the paywall's button
   * could be pressed and never observed, which is how "I started the trial and it
   * still says free plan" survived.
   *
   * The test store sells the same packages, mints a real customer, grants the
   * real `pro` entitlement and delivers a real webhook with `environment:
   * SANDBOX` on it, which is why the webhook has `REVENUECAT_SANDBOX_USER_IDS`.
   *
   * Optional, and read only in a development build: `optional` here and
   * `__DEV__` at the one place it is used, so a release bundle cannot reach it.
   */
  EXPO_PUBLIC_RC_TEST_STORE_KEY: optional(text),
  /**
   * Production sends to the live Firebase property by default. Preview builds
   * keep the release identifiers so store products work, but set this to false
   * so an internal purchase walk does not become product behaviour.
   */
  EXPO_PUBLIC_GA4_ENABLED: optional(oneOf('true', 'false')),
  /** Internal releases must not send either product analytics provider. */
  EXPO_PUBLIC_ANALYTICS_ENABLED: optional(oneOf('true', 'false')),
  /**
   * `1` makes a development build send to PostHog (events, errors, replays), to
   * verify a change end to end. Unset, development sends nothing. Those events
   * carry `app_variant: development`, which the project's test filter hides.
   */
  EXPO_PUBLIC_POSTHOG_DEV: optional(oneOf('1')),
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: text,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: text,
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
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: text,
  /**
   * The origin the widget believes it is running on.
   *
   * A Turnstile widget is bound to a hostname list, and a WebView rendering
   * inline HTML has no hostname of its own — so the page is loaded under this
   * one and it has to be a domain the widget allows. It is not a secret and not
   * fetched; nothing is served from it.
   */
  EXPO_PUBLIC_TURNSTILE_ORIGIN: text,
} satisfies Record<keyof typeof raw, Check<string | undefined>>

/** What each check guarantees, read off the checks so the two cannot drift. */
type Env = { [K in keyof typeof schema]: (typeof schema)[K] extends Check<infer T> ? T : never }

const invalid = (Object.keys(schema) as (keyof typeof schema)[]).filter(
  (key) => !schema[key](raw[key]),
)

if (invalid.length > 0) {
  const missing = invalid.join(', ')
  throw new Error(
    `Missing environment variables: ${missing}\n` +
      'Copy apps/mobile/.env.example to .env.local and fill it in. ' +
      'Restart Metro with --clear after editing — EXPO_PUBLIC_ values are ' +
      'inlined at build time and survive a fast refresh.',
  )
}

export const env = raw as Env

/** True once a key holds a real provisioned value rather than the sentinel. */
export function isConfigured(value: string | undefined): boolean {
  // Undefined is not configured either. It became reachable when the first
  // OPTIONAL key landed (`EXPO_PUBLIC_RC_TEST_STORE_KEY`), and reading an
  // absent key as configured would hand the SDK the string "undefined".
  return Boolean(value) && value !== PLACEHOLDER
}
