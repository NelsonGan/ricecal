import type { AnalyticsClient } from '../client'
import { createAnalyticsProviders, type FirebaseAnalyticsBridge } from '../providers'

function fakeMixpanel() {
  const calls: Array<[string, ...unknown[]]> = []
  const client: AnalyticsClient = {
    track: (event, properties) => void calls.push(['track', event, properties]),
    identify: (id) => void calls.push(['identify', id]),
    reset: () => void calls.push(['reset']),
    registerSuperProperties: (properties) => void calls.push(['super', properties]),
    getPeople: () => ({
      set: (properties) => void calls.push(['people', properties]),
      deleteUser: () => void calls.push(['people delete']),
    }),
  }
  return { calls, client }
}

function fakeFirebase() {
  const calls: Array<[string, ...unknown[]]> = []
  const bridge: FirebaseAnalyticsBridge = {
    setCollectionEnabled: async (enabled) => void calls.push(['collection', enabled]),
    setUserId: async (id) => void calls.push(['identify', id]),
    setUserProperties: async (properties) => void calls.push(['user properties', properties]),
    logEvent: async (event, properties) => void calls.push(['event', event, properties]),
    resetData: async () => void calls.push(['reset data']),
  }
  return { bridge, calls }
}

it('sends the same event to both providers without copying email to GA4', async () => {
  const mixpanel = fakeMixpanel()
  const firebase = fakeFirebase()
  const providers = createAnalyticsProviders(mixpanel.client, firebase.bridge, jest.fn())

  providers.client.identify('user-1')
  providers.client.getPeople().set({ $email: 'one@example.com', onboarded: true })
  providers.client.track('Signed In', { method: 'google', is_new_account: false })
  await providers.whenFirebaseIdle()

  expect(mixpanel.calls).toEqual([
    ['identify', 'user-1'],
    ['people', { $email: 'one@example.com', onboarded: true }],
    ['track', 'Signed In', { method: 'google', is_new_account: false }],
  ])
  expect(firebase.calls).toEqual([
    ['collection', true],
    ['identify', 'user-1'],
    ['user properties', { onboarded: 'true' }],
    ['event', 'ricecal_signed_in', { method: 'google', is_new_account: 0 }],
  ])
})

it('resets Firebase in order and leaves anonymous collection enabled', async () => {
  const firebase = fakeFirebase()
  const providers = createAnalyticsProviders(null, firebase.bridge, jest.fn())

  providers.client.reset()
  await providers.whenFirebaseIdle()

  expect(firebase.calls).toEqual([['identify', null], ['reset data'], ['collection', true]])
})

it('continues queued Firebase work after a provider failure', async () => {
  const firebase = fakeFirebase()
  const report = jest.fn()
  firebase.bridge.setUserProperties = async () => {
    throw new Error('provider unavailable')
  }
  const providers = createAnalyticsProviders(null, firebase.bridge, report)

  providers.client.getPeople().set({ onboarded: true })
  providers.client.track('Signed Out', {})
  await providers.whenFirebaseIdle()

  expect(report).toHaveBeenCalledWith('Firebase', 'user properties', expect.any(Error))
  expect(firebase.calls).toContainEqual(['event', 'ricecal_signed_out', {}])
})
