import Constants from 'expo-constants'
import { PostHog, type PostHogOptions } from 'posthog-react-native'
import { createMMKV } from 'react-native-mmkv'

import type { AnalyticsClient } from './analytics'
import { env } from './env'
import type { ErrorReporter } from './errors'
import type { FeatureFlagSource } from './feature-flags'
import {
  POSTHOG_HOST,
  POSTHOG_PROJECT_TOKEN,
  REPLAY_FIRST_DAY_RATE,
  REPLAY_RETURNING_RATE,
} from './posthog-config'

/**
 * The app's one PostHog client: product analytics, error tracking, session
 * replay and feature flags.
 *
 * Only `startup.ts` imports this file. Everything else reaches PostHog through
 * a seam with no native import (`lib/analytics`, `lib/errors`,
 * `lib/feature-flags`), for the reason `client.ts` gives.
 *
 * PostHog bills per event, so every option that would send events on its own is
 * off: no lifecycle events, no `$screen`, no autocapture, no rage taps. What
 * reaches the project is the typed plan in `analytics/events.ts`, the SDK
 * events listed in `ALLOWED_SDK_EVENTS`, exceptions and the RevenueCat feed.
 */

/**
 * `development`, `preview`, `simulator` or `production`. Any release build with
 * product analytics switched off is internal (the `preview` profile, and every
 * per-PR EAS update, which is exported without `APP_VARIANT`), so it reports as
 * `preview` and the test-account filter keeps its crashes out of production.
 */
export function appVariant(): string {
  if (__DEV__) return 'development'
  if (env.EXPO_PUBLIC_ANALYTICS_ENABLED === 'false') return 'preview'
  const variant = Constants.expoConfig?.extra?.appVariant
  return typeof variant === 'string' && variant ? variant : 'production'
}

/** The `$` events the app relies on; any other SDK event is dropped as a backstop. */
const ALLOWED_SDK_EVENTS: ReadonlySet<string> = new Set([
  '$identify',
  '$set',
  '$exception',
  '$feature_flag_called',
])

export function allowedEvent(event: string): boolean {
  return !event.startsWith('$') || ALLOWED_SDK_EVENTS.has(event)
}

type CaptureEvent = NonNullable<
  Parameters<Extract<PostHogOptions['before_send'], (...args: never[]) => unknown>>[0]
>

/**
 * A render loop or a failing request in a retry can throw the same exception
 * hundreds of times a minute, and the free tier is 100,000 exceptions a month
 * for every install together. So an identical exception is sent once per
 * window, and no more than `EXCEPTION_LIMIT` distinct ones per window.
 */
const EXCEPTION_WINDOW_MS = 5 * 60 * 1000
const EXCEPTION_LIMIT = 25
const recentExceptions = new Map<string, number>()

function exceptionKey(event: CaptureEvent): string {
  const list = (event.properties as { $exception_list?: { type?: string; value?: string }[] })
    ?.$exception_list
  const first = Array.isArray(list) ? list[0] : undefined
  return `${first?.type ?? ''}:${first?.value ?? ''}`.slice(0, 300)
}

/** Exported for its test; `now` is injectable. */
export function exceptionAllowed(event: CaptureEvent, now: number = Date.now()): boolean {
  for (const [key, at] of recentExceptions) {
    if (now - at >= EXCEPTION_WINDOW_MS) recentExceptions.delete(key)
  }
  const key = exceptionKey(event)
  if (recentExceptions.has(key) || recentExceptions.size >= EXCEPTION_LIMIT) return false
  recentExceptions.set(key, now)
  return true
}

function beforeSend(event: CaptureEvent | null): CaptureEvent | null {
  if (!event || !allowedEvent(event.event)) return null
  if (event.event === '$exception' && !exceptionAllowed(event)) return null
  return event
}

/**
 * Whether PostHog runs at all. Every release build, including the internal
 * `preview` builds that send no product analytics (`EXPO_PUBLIC_ANALYTICS_ENABLED`
 * gates those in `client.ts`): their crashes are still worth seeing, as they
 * were in Sentry, and `app_variant: preview` keeps them out of production
 * reports. Development only with `EXPO_PUBLIC_POSTHOG_DEV=1`.
 */
export function posthogEnabled(): boolean {
  return !__DEV__ || env.EXPO_PUBLIC_POSTHOG_DEV === '1'
}

/**
 * PostHog's tracing headers go to the edge functions only, which copy the
 * session onto their `$ai_generation` events, so a scan's model calls link to
 * the replay and events of the session that made it.
 */
function tracingHosts(): string[] {
  try {
    return [new URL(env.EXPO_PUBLIC_SUPABASE_URL).hostname]
  } catch {
    return []
  }
}

let client: PostHog | null | undefined

/**
 * Created once, as early as the root layout's module scope, so error autocapture
 * covers startup. Null in development unless asked for.
 */
export function initPostHog(): PostHog | null {
  if (client !== undefined) return client
  if (!posthogEnabled()) {
    client = null
    return client
  }
  try {
    client = new PostHog(POSTHOG_PROJECT_TOKEN, {
      host: POSTHOG_HOST,
      // Nothing is sent before `identifyUser` except the two engagement
      // events, which PostHog files under the person once identify links them.
      personProfiles: 'identified_only',
      captureAppLifecycleEvents: false,
      // The app starts recordings itself, sampled per launch.
      enableSessionReplay: false,
      sessionReplayConfig: {
        // Food photos and the diary are what a replay is for, so text and
        // images stay visible. On iOS this flag masks every label as well as
        // every field, which would black out the whole app. Password fields
        // are secure text entries, which both native SDKs always mask.
        maskAllTextInputs: false,
        maskAllImages: false,
        maskAllSandboxedViews: true,
        captureTouches: true,
        // Request URLs carry the typed catalogue query and R2 photo signatures
        // (`catalogue.ts`, `photos.ts`), and logcat can carry anything.
        captureNetworkTelemetry: false,
        captureLog: false,
        sampleRate: 1,
      },
      // A rage tap would be a billable `$rageclick` per burst.
      rageClickConfig: { enabled: false },
      errorTracking: {
        autocapture: {
          uncaughtExceptions: true,
          unhandledRejections: true,
          console: false,
          nativeCrashes: true,
          androidNdkCrashes: true,
        },
      },
      before_send: beforeSend,
      addTracingHeaders: tracingHosts(),
      disableSurveys: true,
      capturePushNotificationSubscriptions: false,
      capturePushNotificationOpened: false,
      flushInterval: 30000,
    })
    client.register({ app_variant: appVariant() })
  } catch (error) {
    client = null
    if (__DEV__) console.warn('[posthog] initialization failed', error)
  }
  return client
}

/**
 * Person properties are written only when they change. Each write is a
 * billable `$set`, and both `identifyUser` (the email) and
 * `useAnalyticsIdentity` (the profile) run on every launch with the same
 * answers. Remembered per account on the handset, so a relaunch sends nothing.
 */
const personStore = createMMKV({ id: 'ricecal-posthog-person' })

type PersonRecord = { userId: string; values: Record<string, unknown> }

function personRecord(userId: string): PersonRecord {
  try {
    const raw = personStore.getString('person')
    const parsed = raw ? (JSON.parse(raw) as PersonRecord) : null
    if (parsed?.userId === userId && parsed.values && typeof parsed.values === 'object')
      return parsed
  } catch {
    // Unreadable reads as empty: at worst every property is written once more.
  }
  return { userId, values: {} }
}

/** Every person property the plan sets, for clearing them on account deletion. */
const PERSON_PROPERTIES = [
  'email',
  'onboarded',
  'onboarded_at',
  'plan_direction',
  'activity_level',
  'referral_source',
  'health_provider',
  'meal_reminders',
  'widgets_installed',
]

/** The provider-neutral surface `providers.ts` fans out to. */
export function postHogAnalytics(posthog: PostHog): AnalyticsClient {
  return {
    track(event, properties) {
      posthog.capture(event, properties as Parameters<PostHog['capture']>[1])
    },
    identify(distinctId) {
      // No properties: for an already identified id the SDK would turn them
      // into a `$set` and a flag reload on every launch.
      posthog.identify(distinctId)
    },
    reset() {
      posthog.reset()
      // Reset clears super properties too, and without this a development
      // build's events after a sign-out would pass the test-account filter.
      void posthog.register({ app_variant: appVariant() })
    },
    registerSuperProperties(properties) {
      return posthog.register(properties as Parameters<PostHog['register']>[0])
    },
    getPeople() {
      return {
        set(properties) {
          const userId = posthog.getDistinctId()
          const record = personRecord(userId)
          const changed = Object.fromEntries(
            Object.entries(properties).filter(
              ([key, value]) =>
                value !== undefined && JSON.stringify(record.values[key]) !== JSON.stringify(value),
            ),
          )
          if (Object.keys(changed).length === 0) return
          // No flag reload: flags load at launch and on identify, and each
          // reload is another billable request.
          posthog.setPersonProperties(
            changed as Parameters<PostHog['setPersonProperties']>[0],
            undefined,
            false,
          )
          personStore.set(
            'person',
            JSON.stringify({ userId, values: { ...record.values, ...changed } }),
          )
        },
        deleteUser() {
          posthog.unsetPersonProperties(PERSON_PROPERTIES, false)
          personStore.remove('person')
        },
      }
    },
  }
}

/** Caught errors, with short scalar context, into error tracking. */
export function postHogErrorReporter(posthog: PostHog): ErrorReporter {
  return (error, context) => {
    posthog.captureException(error, context)
  }
}

export function postHogFeatureFlags(posthog: PostHog): FeatureFlagSource {
  return {
    getFeatureFlag: (key) => posthog.getFeatureFlag(key),
    getFeatureFlagPayload: (key) => posthog.getFeatureFlagPayload(key),
    onFeatureFlags: (listener) => posthog.onFeatureFlags(listener),
  }
}

let replayDecided = false

/**
 * Decide once per launch whether this session is recorded: at a higher rate on
 * an install's first day (see `posthog-config.ts`). `random` is for tests.
 */
export function startReplayForLaunch(
  posthog: PostHog,
  firstDay: boolean,
  random: () => number = Math.random,
): boolean {
  if (replayDecided) return false
  replayDecided = true
  if (random() >= (firstDay ? REPLAY_FIRST_DAY_RATE : REPLAY_RETURNING_RATE)) return false
  posthog.startSessionRecording().catch(() => {})
  return true
}
