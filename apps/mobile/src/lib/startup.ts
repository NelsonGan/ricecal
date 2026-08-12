import * as Sentry from '@sentry/react-native'
import { Mixpanel } from 'mixpanel-react-native'
import { Platform } from 'react-native'

import { env, isConfigured } from './env'

/**
 * Each SDK is gated on its key being provisioned. Initialising one with a
 * REPLACE_ME placeholder produces noisy runtime failures that look like
 * integration bugs rather than what they are: an account that does not exist
 * yet.
 *
 * Remove a gate only once its key is real — never to "make the warning stop".
 */

export let mixpanel: Mixpanel | null = null

const skipped: string[] = []

/**
 * Turned off in code rather than for want of a key, so the dev log does not
 * blame `.env.local` for something a comment did.
 */
const disabled: string[] = ['RevenueCat']

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

export async function initMixpanel() {
  if (!isConfigured(env.EXPO_PUBLIC_MIXPANEL_TOKEN)) {
    skipped.push('Mixpanel')
    return
  }
  const instance = new Mixpanel(env.EXPO_PUBLIC_MIXPANEL_TOKEN, true)
  await instance.init()
  mixpanel = instance
}

/**
 * RevenueCat, and why it is not called.
 *
 * The key gate was never the problem — the IMPORT was.
 * `react-native-purchases` reaches for its native module at module scope, so
 * merely pulling this file in threw on any build with no RevenueCat pod, from
 * app start, before anything had rendered. Hence the dynamic import, and hence
 * the call being commented out rather than merely gated.
 *
 * To bring it back once the keys are real: uncomment the call in `initServices`
 * and drop 'RevenueCat' from `disabled` above, or the dev log goes on reporting
 * it as switched off.
 */
export async function initPurchases() {
  const apiKey = Platform.OS === 'ios' ? env.EXPO_PUBLIC_RC_IOS_KEY : env.EXPO_PUBLIC_RC_ANDROID_KEY
  if (!isConfigured(apiKey)) {
    skipped.push('RevenueCat')
    return
  }
  const Purchases = (await import('react-native-purchases')).default
  Purchases.configure({ apiKey })
}

/** Call once, as early as possible in the root layout. */
export async function initServices() {
  initSentry()
  // await initPurchases()
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
