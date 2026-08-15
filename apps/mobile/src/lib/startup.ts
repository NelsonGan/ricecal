import * as Sentry from '@sentry/react-native'
import { Mixpanel } from 'mixpanel-react-native'

import { registerAnalytics } from './analytics'
import { env, isConfigured } from './env'
import { configurePurchases } from './revenuecat'

/**
 * Each SDK is gated on its key being provisioned. Initialising one with a
 * REPLACE_ME placeholder produces noisy runtime failures that look like
 * integration bugs rather than what they are: an account that does not exist
 * yet.
 *
 * Remove a gate only once its key is real — never to "make the warning stop".
 */

const skipped: string[] = []

/**
 * Turned off in code rather than for want of a key, so the dev log does not
 * blame `.env.local` for something a comment did.
 *
 * Empty now that RevenueCat is live. Kept because the mechanism is the useful
 * part: a service switched off deliberately should say so rather than look
 * like a missing key.
 */
const disabled: string[] = []

export function initSentry() {
  if (!isConfigured(env.EXPO_PUBLIC_SENTRY_DSN)) {
    skipped.push('Sentry')
    return
  }
  Sentry.init({
    dsn: env.EXPO_PUBLIC_SENTRY_DSN,
    // Leave off in dev so local crashes stay local.
    enabled: !__DEV__,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  })
}

/**
 * `true` is `trackAutomaticEvents`, and it is why nothing in `lib/analytics`
 * sends an "app opened". The SDK records `$ae_session`, `$ae_first_open` and
 * `$ae_updated` itself, so sessions, installs and upgrades arrive without an
 * event of ours — and an event of ours would be a second, slightly different
 * answer to the same question.
 */
export async function initMixpanel() {
  if (!isConfigured(env.EXPO_PUBLIC_MIXPANEL_TOKEN)) {
    skipped.push('Mixpanel')
    return
  }
  const instance = new Mixpanel(env.EXPO_PUBLIC_MIXPANEL_TOKEN, true)
  await instance.init()
  /**
   * The one place the SDK meets the app's own seam, and the only place the two
   * shapes are checked against each other. Everything else tracks through
   * `lib/analytics`, which imports nothing native — see the header there for
   * what that buys.
   *
   * Registering LAST, after `init` has resolved: whatever was fired during
   * startup is queued in the seam and drains into a client that is ready for
   * it, rather than into one still reading its own persisted state.
   */
  registerAnalytics(instance)
}

/**
 * RevenueCat. The SDK's lifecycle lives in `./revenuecat`, which imports
 * nothing but the env — see the note there for why it is not in this file.
 */
export async function initPurchases() {
  if (!(await configurePurchases())) skipped.push('RevenueCat')
}

/** Call once, as early as possible in the root layout. */
export async function initServices() {
  initSentry()
  await initPurchases()
  await initMixpanel()

  if (__DEV__ && skipped.length > 0) {
    console.log(
      `[startup] not initialised (key still ${'REPLACE_ME'} in .env.local): ${skipped.join(', ')}`,
    )
  }
  if (__DEV__ && disabled.length > 0) {
    console.log(`[startup] switched off in src/lib/startup.ts: ${disabled.join(', ')}`)
  }
}
