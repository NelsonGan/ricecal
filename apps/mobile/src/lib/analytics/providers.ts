import type { AnalyticsClient } from './client'
import { ga4EventName, ga4EventParameters, ga4UserProperties } from './ga4'

/** The modular React Native Firebase calls used by the provider adapter. */
export type FirebaseAnalyticsBridge = {
  setCollectionEnabled(enabled: boolean): Promise<void> | void
  setUserId(userId: string | null): Promise<void> | void
  setUserProperties(properties: Record<string, string | null>): Promise<void> | void
  logEvent(event: string, properties: Record<string, string | number>): Promise<void> | void
  resetData(): Promise<void> | void
}

type ReportFailure = (provider: 'Mixpanel' | 'Firebase', operation: string, error: unknown) => void

/**
 * Fan the app's one analytics seam out to both providers.
 *
 * Firebase work is serial. The seam drains queued calls synchronously, and an
 * async `setUserId` racing the event after it would otherwise file that event
 * against the anonymous installation.
 */
export function createAnalyticsProviders(
  mixpanel: AnalyticsClient | null,
  firebase: FirebaseAnalyticsBridge | null,
  reportFailure: ReportFailure,
): { client: AnalyticsClient; whenFirebaseIdle(): Promise<void> } {
  let firebaseTail = Promise.resolve()

  function scheduleFirebase(
    operation: string,
    work: (target: FirebaseAnalyticsBridge) => Promise<void> | void,
  ) {
    const target = firebase
    if (!target) return
    firebaseTail = firebaseTail
      .then(() => work(target))
      .catch((error) => {
        reportFailure('Firebase', operation, error)
      })
  }

  function runMixpanel(operation: string, work: (target: AnalyticsClient) => unknown) {
    const target = mixpanel
    if (!target) return
    try {
      const result = work(target)
      if (result instanceof Promise) {
        void result.catch((error) => reportFailure('Mixpanel', operation, error))
      }
    } catch (error) {
      reportFailure('Mixpanel', operation, error)
    }
  }

  const client: AnalyticsClient = {
    track(event, properties) {
      runMixpanel('event tracking', (target) => target.track(event, properties))
      scheduleFirebase('event tracking', (target) =>
        target.logEvent(ga4EventName(event), ga4EventParameters(properties)),
      )
    },
    identify(distinctId) {
      runMixpanel('identification', (target) => target.identify(distinctId))
      scheduleFirebase('identification', async (target) => {
        await target.setCollectionEnabled(true)
        await target.setUserId(distinctId)
      })
    },
    reset() {
      runMixpanel('reset', (target) => target.reset())
      scheduleFirebase('reset', async (target) => {
        await target.setUserId(null)
        await target.resetData()
        // RiceCal tracks the anonymous onboarding funnel after sign-out, just
        // as Mixpanel does. Reset the installation identity, not collection.
        await target.setCollectionEnabled(true)
      })
    },
    registerSuperProperties(properties) {
      runMixpanel('super properties', (target) => target.registerSuperProperties(properties))
      scheduleFirebase('user properties', (target) =>
        target.setUserProperties(ga4UserProperties(properties)),
      )
    },
    getPeople() {
      return {
        set(properties) {
          runMixpanel('user properties', (target) => target.getPeople().set(properties))
          const safeProperties = ga4UserProperties(properties)
          if (Object.keys(safeProperties).length > 0) {
            scheduleFirebase('user properties', (target) =>
              target.setUserProperties(safeProperties),
            )
          }
        },
        // GA4 has no client API that removes one server-side user profile.
        // `reset` still clears its local identifiers after account deletion.
        deleteUser() {
          runMixpanel('profile deletion', (target) => target.getPeople().deleteUser())
        },
      }
    },
  }

  return { client, whenFirebaseIdle: () => firebaseTail }
}
