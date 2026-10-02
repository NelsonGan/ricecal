import type { AnalyticsClient } from './client'
import type { PersonProps, SuperProps } from './events'
import { ga4EventName, ga4EventParameters, ga4UserProperties } from './ga4'
import type { RevenueAnalytics } from './revenue'

/** The modular React Native Firebase calls used by the provider adapter. */
export type FirebaseAnalyticsBridge = {
  setCollectionEnabled(enabled: boolean): Promise<void> | void
  setUserId(userId: string | null): Promise<void> | void
  setUserProperties(properties: Record<string, string | null>): Promise<void> | void
  logEvent(event: string, properties: Record<string, string | number>): Promise<void> | void
  resetData(): Promise<void> | void
  getAppInstanceId?(): Promise<string | null>
  setDefaultEventParameters?(parameters: Record<string, string | number>): Promise<void> | void
}

type ReportFailure = (provider: 'Mixpanel' | 'Firebase', operation: string, error: unknown) => void

// Firebase properties belong to the handset, so changing user_id alone keeps
// the preceding account's answers. Clear every app-owned field at that boundary.
const clearedUserProperties: Record<Exclude<keyof PersonProps, '$email'> | keyof SuperProps, null> =
  {
    onboarded: null,
    onboarded_at: null,
    plan_direction: null,
    activity_level: null,
    referral_source: null,
    health_provider: null,
    meal_reminders: null,
    widgets_installed: null,
    entitled: null,
  }

/**
 * Fan the app's one analytics seam out to both providers.
 *
 * Each provider has its own serial queue. The seam drains queued calls synchronously, and an
 * async `setUserId` racing the event after it would otherwise file that event
 * against the anonymous installation.
 */
export function createAnalyticsProviders(
  mixpanel: AnalyticsClient | null,
  firebase: FirebaseAnalyticsBridge | null,
  reportFailure: ReportFailure,
): {
  client: AnalyticsClient
  revenueAnalytics: RevenueAnalytics
  whenFirebaseIdle(): Promise<void>
  whenMixpanelIdle(): Promise<void>
} {
  let firebaseTail = Promise.resolve()
  let mixpanelTail = Promise.resolve()
  let firebaseUserId: string | null = null
  let identityGeneration = 0
  let desiredUserId: string | null = null
  let firebaseGeneration = 0
  let mixpanelGeneration = 0
  let mixpanelUserId: string | null = null
  let firebasePropertyOwner: string | null = null

  function scheduleFirebase(
    operation: string,
    work: (target: FirebaseAnalyticsBridge) => Promise<void> | void,
  ) {
    const target = firebase
    if (!target) return
    const generation = identityGeneration
    const userId = desiredUserId
    firebaseTail = firebaseTail
      .then(async () => {
        if (firebaseGeneration !== generation) {
          firebaseUserId = null
          if (firebasePropertyOwner !== null && firebasePropertyOwner !== userId) {
            await target.setUserProperties(clearedUserProperties)
          }
          await target.setDefaultEventParameters?.({ revenuecat_revenue_enabled: 0 })
          await target.setUserId(userId)
          if (userId === null) await target.resetData()
          await target.setCollectionEnabled(true)
          firebaseUserId = userId
          firebasePropertyOwner = userId
          firebaseGeneration = generation
        }
        await work(target)
      })
      .catch((error) => {
        reportFailure('Firebase', operation, error)
      })
  }

  function runMixpanel(operation: string, work: (target: AnalyticsClient) => unknown) {
    const target = mixpanel
    if (!target) return
    const generation = identityGeneration
    const userId = desiredUserId
    mixpanelTail = mixpanelTail
      .then(async () => {
        if (mixpanelGeneration !== generation) {
          if (userId === null || (mixpanelUserId !== null && mixpanelUserId !== userId)) {
            await target.reset()
            mixpanelUserId = null
          }
          if (userId !== null) {
            mixpanelUserId = userId
            await target.identify(userId)
          }
          mixpanelGeneration = generation
        }
        await work(target)
      })
      .then(
        () => {},
        (error) => {
          reportFailure('Mixpanel', operation, error)
        },
      )
  }

  const client: AnalyticsClient = {
    track(event, properties) {
      runMixpanel('event tracking', (target) => target.track(event, properties))
      scheduleFirebase('event tracking', (target) =>
        target.logEvent(ga4EventName(event), ga4EventParameters(properties)),
      )
    },
    identify(distinctId) {
      identityGeneration += 1
      desiredUserId = distinctId
      runMixpanel('identification', () => {})
      scheduleFirebase('identification', () => {})
    },
    reset() {
      identityGeneration += 1
      desiredUserId = null
      runMixpanel('reset', () => {})
      scheduleFirebase('reset', () => {})
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

  const revenueAnalytics: RevenueAnalytics = {
    async link(userId) {
      const generation = identityGeneration
      await firebaseTail
      if (
        !firebase?.getAppInstanceId ||
        !firebase.setDefaultEventParameters ||
        firebaseUserId !== userId ||
        generation !== identityGeneration
      )
        return null
      const appInstanceId = await firebase.getAppInstanceId()
      if (!appInstanceId || generation !== identityGeneration) return null
      return {
        appInstanceId,
        async confirm() {
          scheduleFirebase('revenue source', async (target) => {
            if (generation === identityGeneration && firebaseUserId === userId) {
              await target.setDefaultEventParameters?.({ revenuecat_revenue_enabled: 1 })
            }
          })
          await firebaseTail
        },
      }
    },
  }
  return {
    client,
    revenueAnalytics,
    whenFirebaseIdle: () => firebaseTail,
    whenMixpanelIdle: () => mixpanelTail,
  }
}
