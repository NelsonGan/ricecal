import { AppState } from 'react-native'
import { createMMKV } from 'react-native-mmkv'

import { registerAnalytics } from './analytics'
import { recordAppOpen } from './analytics/engagement'
import { configureGa4Collection, ga4CollectionEnabled } from './analytics/ga4'
import { createAnalyticsProviders, type FirebaseAnalyticsBridge } from './analytics/providers'
import { registerRevenueAnalytics } from './analytics/revenue'
import { env } from './env'
import { registerErrorReporter, reportError } from './errors'
import { registerFeatureFlags } from './feature-flags'
import {
  initPostHog,
  postHogAnalytics,
  postHogErrorReporter,
  postHogFeatureFlags,
  startReplayForLaunch,
} from './posthog'
import { configurePurchases, syncPurchaserAnalytics } from './revenuecat'

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

/**
 * Whether this process is the first launch of a fresh install, decided at module
 * load, before anything has rendered or persisted: only then does "the query
 * cache and the rating store are both empty" mean "never launched". An existing
 * install updating to the build that added `First App Open` has both, so it is
 * not counted as an install.
 */
const freshInstall = (() => {
  try {
    return (
      createMMKV({ id: 'ricecal-query-cache' }).getAllKeys().length === 0 &&
      createMMKV({ id: 'ricecal-rating' }).getAllKeys().length === 0
    )
  } catch {
    return false
  }
})()

const engagementStore = createMMKV({ id: 'ricecal-engagement' })
const engagementStorage = {
  read: () => engagementStore.getString('state'),
  write: (value: string) => engagementStore.set('state', value),
}

/**
 * PostHog, as early as the root layout's module scope so error autocapture
 * covers startup. Registers error reporting and feature flags at once; product
 * analytics waits for `initAnalytics`, which orders it behind Firebase.
 */
let errorTrackingStarted = false

export function initErrorTracking(): void {
  if (errorTrackingStarted) return
  errorTrackingStarted = true
  const posthog = initPostHog()
  if (!posthog) {
    skipped.push('PostHog')
    return
  }
  registerErrorReporter(postHogErrorReporter(posthog))
  registerFeatureFlags(postHogFeatureFlags(posthog))
}

/**
 * Loaded lazily so a same-runtime OTA bundle remains safe on a binary made
 * before Firebase was linked. The old binary keeps PostHog and skips GA4.
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
      getAppInstanceId: () => sdk.getAppInstanceId(instance),
      setDefaultEventParameters: (parameters) =>
        sdk.setDefaultEventParameters(instance, parameters),
    }
  } catch (error) {
    skipped.push('Firebase Analytics')
    if (__DEV__) console.warn('[analytics] Firebase Analytics is unavailable', error)
    return null
  }
}

function reportAnalyticsFailure(
  provider: 'PostHog' | 'Firebase',
  operation: string,
  error: unknown,
) {
  if (__DEV__) {
    console.warn(`[analytics] ${provider} ${operation} failed`, error)
    return
  }
  reportError(error, { analytics_provider: provider, analytics_operation: operation })
}

let foregroundListener: ReturnType<typeof AppState.addEventListener> | null = null

async function initAnalytics() {
  // A preview build uses the release bundle id so the real store can price its
  // products. It is still an internal build, and EAS sets this flag to keep its
  // taps out of the production property. Firebase persists a runtime override,
  // so startup must write false as deliberately as it writes true.
  const ga4Enabled =
    env.EXPO_PUBLIC_ANALYTICS_ENABLED !== 'false' &&
    ga4CollectionEnabled(__DEV__, env.EXPO_PUBLIC_GA4_ENABLED)
  let firebase: FirebaseAnalyticsBridge | null = null
  try {
    const bridge = firebaseAnalytics()
    firebase = await configureGa4Collection(bridge, ga4Enabled)
  } catch (error) {
    reportAnalyticsFailure('Firebase', 'initialization', error)
  }
  const posthog = initPostHog()

  /**
   * Registering last drains startup calls into providers that are ready. The
   * adapter serializes Firebase identity and events in that same order.
   */
  const providers = createAnalyticsProviders(
    posthog ? postHogAnalytics(posthog) : null,
    firebase,
    reportAnalyticsFailure,
  )
  registerRevenueAnalytics(providers.revenueAnalytics)
  registerAnalytics(providers.client)
  void syncPurchaserAnalytics()

  const opened = recordAppOpen(engagementStorage, { freshInstall })
  if (posthog) startReplayForLaunch(posthog, opened.firstOpen)
  foregroundListener?.remove()
  foregroundListener = AppState.addEventListener('change', (state) => {
    if (state !== 'active') return
    void syncPurchaserAnalytics()
    recordAppOpen(engagementStorage, { freshInstall: false })
  })
}

/**
 * RevenueCat. Its lifecycle defers native imports so session and data code can
 * identify the purchaser without importing the SDKs in this file.
 */
export async function initPurchases() {
  if (!(await configurePurchases())) skipped.push('RevenueCat')
}

/** Call once, as early as possible in the root layout. */
export async function initServices() {
  initErrorTracking()
  await initPurchases()
  await initAnalytics()

  if (__DEV__ && skipped.length > 0) {
    console.log(`[startup] not initialised: ${skipped.join(', ')}`)
  }
  if (__DEV__ && disabled.length > 0) {
    console.log(`[startup] switched off in src/lib/startup.ts: ${disabled.join(', ')}`)
  }
}
