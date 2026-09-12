import * as Sentry from '@sentry/react-native'
import { Mixpanel } from 'mixpanel-react-native'

import { type AnalyticsClient, registerAnalytics } from './analytics'
import { createAnalyticsProviders, type FirebaseAnalyticsBridge } from './analytics/providers'
import { env, isConfigured } from './env'
import { configurePurchases } from './revenuecat'

/**
 * Each remote SDK is gated on the configuration it needs. Initialising one with
 * a placeholder key or a native module the current binary does not contain
 * produces noisy failures that look like integration bugs.
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
    // The one place the diary could leak into a third-party log. Sentry records
    // a breadcrumb for every fetch/XHR with the FULL url, and ours carry the
    // typed search query in the query string (`catalogue.ts`) and the R2
    // signature in it too (`photos.ts`) — the exact data the analytics plan
    // promises never leaves. Drop the query string from every breadcrumb url so
    // the Sentry side keeps the same promise the Mixpanel side does.
    beforeBreadcrumb(breadcrumb) {
      const url = breadcrumb.data?.url
      if (typeof url === 'string') {
        const q = url.indexOf('?')
        if (q !== -1) {
          breadcrumb.data = { ...breadcrumb.data, url: url.slice(0, q) }
        }
      }
      return breadcrumb
    },
  })
}

/**
 * `true` is `trackAutomaticEvents`, and it is why nothing in `lib/analytics`
 * sends an "app opened". The SDK records `$ae_session`, `$ae_first_open` and
 * `$ae_updated` itself, so sessions, installs and upgrades arrive without an
 * event of ours — and an event of ours would be a second, slightly different
 * answer to the same question.
 */
async function initMixpanel(): Promise<AnalyticsClient | null> {
  if (!isConfigured(env.EXPO_PUBLIC_MIXPANEL_TOKEN)) {
    skipped.push('Mixpanel')
    return null
  }
  const instance = new Mixpanel(env.EXPO_PUBLIC_MIXPANEL_TOKEN, true)
  await instance.init()
  return instance
}

/**
 * Loaded lazily so a same-runtime OTA bundle remains safe on a binary made
 * before Firebase was linked. The old binary keeps Mixpanel and skips GA4.
 */
function firebaseAnalytics(): FirebaseAnalyticsBridge | null {
  try {
    const sdk =
      require('@react-native-firebase/analytics') as typeof import('@react-native-firebase/analytics')
    const instance = sdk.getAnalytics()
    return {
      setCollectionEnabled: (enabled) => sdk.setAnalyticsCollectionEnabled(instance, enabled),
      setUserId: (userId) => sdk.setUserId(instance, userId),
      setUserProperties: (properties) => sdk.setUserProperties(instance, properties),
      logEvent: (event, properties) => sdk.logEvent(instance, event, properties),
      resetData: () => sdk.resetAnalyticsData(instance),
    }
  } catch (error) {
    skipped.push('Firebase Analytics')
    if (__DEV__) console.warn('[analytics] Firebase Analytics is unavailable', error)
    return null
  }
}

function reportAnalyticsFailure(
  provider: 'Mixpanel' | 'Firebase',
  operation: string,
  error: unknown,
) {
  if (__DEV__) {
    console.warn(`[analytics] ${provider} ${operation} failed`, error)
    return
  }
  Sentry.captureException(error, {
    tags: { analytics_provider: provider, analytics_operation: operation },
  })
}

async function initAnalytics() {
  const firebase = firebaseAnalytics()
  const mixpanel = await initMixpanel().catch((error) => {
    reportAnalyticsFailure('Mixpanel', 'initialization', error)
    return null
  })

  if (firebase) {
    try {
      // firebase.json keeps collection off until JavaScript can distinguish a
      // release from a local run. Local actions are never product behaviour.
      await firebase.setCollectionEnabled(!__DEV__)
    } catch (error) {
      reportAnalyticsFailure('Firebase', 'initialization', error)
    }
  }

  /**
   * Registering last drains startup calls into providers that are ready. The
   * adapter serializes Firebase identity and events in that same order.
   */
  registerAnalytics(createAnalyticsProviders(mixpanel, firebase, reportAnalyticsFailure).client)
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
  await initAnalytics()

  if (__DEV__ && skipped.length > 0) {
    console.log(`[startup] not initialised: ${skipped.join(', ')}`)
  }
  if (__DEV__ && disabled.length > 0) {
    console.log(`[startup] switched off in src/lib/startup.ts: ${disabled.join(', ')}`)
  }
}
