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
    ['identify', 'user-1'],
    ['collection', true],
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

it('waits for Mixpanel identification before profiles and events while Firebase proceeds', async () => {
  const mixpanel = fakeMixpanel()
  const firebase = fakeFirebase()
  let release!: () => void
  mixpanel.client.identify = () =>
    new Promise<void>((resolve) => {
      release = resolve
    })
  const providers = createAnalyticsProviders(mixpanel.client, firebase.bridge, jest.fn())
  providers.client.identify('user-1')
  providers.client.getPeople().set({ $email: 'one@example.com' })
  providers.client.track('Signed In', {})
  await providers.whenFirebaseIdle()
  expect(mixpanel.calls).toEqual([])
  expect(firebase.calls).toContainEqual(['event', 'ricecal_signed_in', {}])
  release()
  await providers.whenMixpanelIdle()
  expect(mixpanel.calls).toEqual([
    ['people', { $email: 'one@example.com' }],
    ['track', 'Signed In', {}],
  ])
})

it('does not suppress native revenue until delivery is confirmed for the current account', async () => {
  const firebase = fakeFirebase()
  firebase.bridge.getAppInstanceId = async () => 'installation-id'
  firebase.bridge.setDefaultEventParameters = async (props) =>
    void firebase.calls.push(['defaults', props])
  const providers = createAnalyticsProviders(null, firebase.bridge, jest.fn())
  providers.client.identify('user-1')
  const link = await providers.revenueAnalytics.link('user-1')
  expect(link?.appInstanceId).toBe('installation-id')
  expect(firebase.calls).not.toContainEqual(['defaults', { revenuecat_revenue_enabled: 1 }])
  providers.client.reset()
  await link?.confirm()
  await providers.whenFirebaseIdle()
  expect(firebase.calls).not.toContainEqual(['defaults', { revenuecat_revenue_enabled: 1 }])
})

it('retries failed identities before sending later events or profiles', async () => {
  const mixpanel = fakeMixpanel()
  const firebase = fakeFirebase()
  const nativeMixpanelIdentify = mixpanel.client.identify
  const nativeFirebaseIdentify = firebase.bridge.setUserId
  mixpanel.client.identify = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementation(nativeMixpanelIdentify)
  firebase.bridge.setUserId = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementation(nativeFirebaseIdentify)
  const providers = createAnalyticsProviders(mixpanel.client, firebase.bridge, jest.fn())
  providers.client.identify('new-user')
  providers.client.getPeople().set({ $email: 'new@example.com' })
  providers.client.track('Signed In', {})
  await Promise.all([providers.whenMixpanelIdle(), providers.whenFirebaseIdle()])
  expect(mixpanel.calls[0]).toEqual(['identify', 'new-user'])
  expect(mixpanel.calls[1]).toEqual(['people', { $email: 'new@example.com' }])
  expect(firebase.calls[0]).toEqual(['identify', 'new-user'])
  expect(firebase.calls).toContainEqual(['event', 'ricecal_signed_in', {}])
})

it('drops work when identity still cannot be confirmed', async () => {
  const mixpanel = fakeMixpanel()
  const firebase = fakeFirebase()
  mixpanel.client.identify = async () => {
    throw new Error('offline')
  }
  firebase.bridge.setUserId = async () => {
    throw new Error('offline')
  }
  const providers = createAnalyticsProviders(mixpanel.client, firebase.bridge, jest.fn())
  providers.client.identify('new-user')
  providers.client.getPeople().set({ $email: 'new@example.com' })
  providers.client.track('Signed In', {})
  await Promise.all([providers.whenMixpanelIdle(), providers.whenFirebaseIdle()])
  expect(mixpanel.calls).toEqual([])
  expect(firebase.calls).toEqual([])
})

it('clears the previous account state before a direct account switch', async () => {
  const mixpanel = fakeMixpanel()
  const firebase = fakeFirebase()
  const providers = createAnalyticsProviders(mixpanel.client, firebase.bridge, jest.fn())
  providers.client.identify('first')
  providers.client.registerSuperProperties({ entitled: true })
  providers.client.getPeople().set({ health_provider: 'apple_health' })
  await Promise.all([providers.whenMixpanelIdle(), providers.whenFirebaseIdle()])
  mixpanel.calls.length = 0
  firebase.calls.length = 0
  providers.client.identify('second')
  providers.client.track('Meal Logged', { method: 'search', date_offset: 0 })
  await Promise.all([providers.whenMixpanelIdle(), providers.whenFirebaseIdle()])
  expect(mixpanel.calls[0]).toEqual(['reset'])
  expect(mixpanel.calls[1]).toEqual(['identify', 'second'])
  expect(firebase.calls).toContainEqual([
    'user properties',
    expect.objectContaining({ entitled: null, health_provider: null, plan_direction: null }),
  ])
  expect(firebase.calls.findIndex(([op]) => op === 'user properties')).toBeLessThan(
    firebase.calls.findIndex(([op]) => op === 'event'),
  )
})

it('keeps current account properties when reidentifying the same user', async () => {
  const mixpanel = fakeMixpanel()
  const firebase = fakeFirebase()
  const providers = createAnalyticsProviders(mixpanel.client, firebase.bridge, jest.fn())
  providers.client.identify('same')
  providers.client.registerSuperProperties({ entitled: true })
  await Promise.all([providers.whenMixpanelIdle(), providers.whenFirebaseIdle()])
  mixpanel.calls.length = 0
  firebase.calls.length = 0
  providers.client.identify('same')
  await Promise.all([providers.whenMixpanelIdle(), providers.whenFirebaseIdle()])
  expect(mixpanel.calls).not.toContainEqual(['reset'])
  expect(firebase.calls.some(([op]) => op === 'user properties')).toBe(false)
})
