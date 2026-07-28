import * as Sentry from '@sentry/react-native'
import { Mixpanel } from 'mixpanel-react-native'
import { Platform } from 'react-native'
import Purchases from 'react-native-purchases'

import { env, isConfigured } from './env'

/**
 * Each SDK is gated on its key being provisioned. Phase 0 runs against
 * REPLACE_ME placeholders, and calling Purchases.configure or Sentry.init with
 * a bogus key produces noisy runtime failures that look like integration bugs
 * rather than what they are: an account that does not exist yet.
 *
 * Remove a gate only once its key is real — never to "make the warning stop".
 */

export let mixpanel: Mixpanel | null = null

const skipped: string[] = []

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

export function initPurchases() {
  const apiKey = Platform.OS === 'ios' ? env.EXPO_PUBLIC_RC_IOS_KEY : env.EXPO_PUBLIC_RC_ANDROID_KEY
  if (!isConfigured(apiKey)) {
    skipped.push('RevenueCat')
    return
  }
  Purchases.configure({ apiKey })
}

/** Call once, as early as possible in the root layout. */
export async function initServices() {
  initSentry()
  initPurchases()
  await initMixpanel()

  if (__DEV__ && skipped.length > 0) {
    console.log(
      `[startup] not initialised (key still ${'REPLACE_ME'} in .env.local): ${skipped.join(', ')}`,
    )
  }
}
