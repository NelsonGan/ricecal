jest.mock('@sentry/react-native', () => ({ init: jest.fn(), captureException: jest.fn() }))
jest.mock('mixpanel-react-native', () => ({
  Mixpanel: jest.fn(() => ({ init: jest.fn(async () => {}) })),
}))
jest.mock('../analytics', () => ({ registerAnalytics: jest.fn() }))
jest.mock('../analytics/revenue', () => ({ registerRevenueAnalytics: jest.fn() }))
jest.mock('../revenuecat', () => ({
  configurePurchases: jest.fn(async () => true),
  syncPurchaserAnalytics: jest.fn(async () => {}),
}))
jest.mock('../env', () => ({
  env: {
    EXPO_PUBLIC_MIXPANEL_TOKEN: 'test-token',
    EXPO_PUBLIC_SENTRY_DSN: 'test-dsn',
    EXPO_PUBLIC_ANALYTICS_ENABLED: 'true',
    EXPO_PUBLIC_GA4_ENABLED: 'true',
  },
  isConfigured: (value: string) => !!value && value !== 'REPLACE_ME',
}))
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  setAnalyticsCollectionEnabled: jest.fn(async () => {}),
  setUserId: jest.fn(async () => {}),
  setDefaultEventParameters: jest.fn(async () => {}),
  setUserProperties: jest.fn(async () => {}),
  logEvent: jest.fn(async () => {}),
  resetAnalyticsData: jest.fn(async () => {}),
  getAppInstanceId: jest.fn(async () => 'test-installation'),
}))

const wasDev = __DEV__

beforeEach(() => {
  jest.resetModules()
  // @ts-expect-error The bundler global is writable only in tests.
  global.__DEV__ = false
})

afterEach(() => {
  jest.restoreAllMocks()
  // @ts-expect-error Restore the bundler global for other suites.
  global.__DEV__ = wasDev
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function sdk() {
  const appState = require('react-native').AppState
  jest.spyOn(appState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }))
  return {
    purchases: require('../revenuecat'),
    firebase: require('@react-native-firebase/analytics'),
    mixpanel: require('mixpanel-react-native'),
    analytics: require('../analytics'),
    appState,
    sentry: require('@sentry/react-native'),
    env: require('../env').env,
    start: (require('../startup') as typeof import('../startup')).initServices,
  }
}

it('starts independent SDKs together and shares repeated startup calls', async () => {
  const api = sdk()
  const purchases = deferred<boolean>()
  api.purchases.configurePurchases.mockReturnValue(purchases.promise)
  const first = api.start()
  expect(api.start()).toBe(first)
  expect(api.mixpanel.Mixpanel).toHaveBeenCalledTimes(1)
  expect(api.firebase.setAnalyticsCollectionEnabled).toHaveBeenCalledWith({}, false)
  expect(api.purchases.configurePurchases).toHaveBeenCalledTimes(1)
  purchases.resolve(true)
  await first
  await api.start()
  expect(api.sentry.init).toHaveBeenCalledTimes(1)
  expect(api.analytics.registerAnalytics).toHaveBeenCalledTimes(1)
  expect(api.appState.addEventListener).toHaveBeenCalledTimes(1)
  const listener = api.appState.addEventListener.mock.calls[0][1]
  listener('background')
  expect(api.purchases.syncPurchaserAnalytics).toHaveBeenCalledTimes(1)
  listener('active')
  expect(api.purchases.syncPurchaserAnalytics).toHaveBeenCalledTimes(2)
})

it('waits for both analytics providers before draining queued app calls', async () => {
  const api = sdk()
  const mixpanel = deferred<void>()
  api.mixpanel.Mixpanel.mockImplementation(() => ({ init: () => mixpanel.promise }))
  const ready = api.start()
  for (let i = 0; i < 10; i++) await Promise.resolve()
  expect(api.firebase.setUserId).toHaveBeenCalledWith({}, null)
  expect(
    api.firebase.setAnalyticsCollectionEnabled.mock.calls.map((call: unknown[]) => call[1]),
  ).toEqual([false, true])
  expect(api.analytics.registerAnalytics).not.toHaveBeenCalled()
  mixpanel.resolve()
  await ready
  expect(api.analytics.registerAnalytics).toHaveBeenCalledTimes(1)
})

it('keeps Firebase usable when Mixpanel initialization fails', async () => {
  const api = sdk()
  api.mixpanel.Mixpanel.mockImplementation(() => ({
    init: async () => {
      throw new Error('Mixpanel unavailable')
    },
  }))
  await api.start()
  expect(api.sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
    tags: { analytics_provider: 'Mixpanel', analytics_operation: 'initialization' },
  })
  const client = api.analytics.registerAnalytics.mock.calls[0][0]
  client.track('Signed Out', {})
  for (let i = 0; i < 10; i++) await Promise.resolve()
  expect(api.firebase.logEvent).toHaveBeenCalledWith({}, 'ricecal_signed_out', {})
})

it('keeps Firebase collection disabled when identity cleanup fails', async () => {
  const api = sdk()
  api.firebase.setUserId.mockRejectedValue(new Error('Identity cleanup failed'))
  await api.start()
  expect(
    api.firebase.setAnalyticsCollectionEnabled.mock.calls.map((call: unknown[]) => call[1]),
  ).toEqual([false])
  const client = api.analytics.registerAnalytics.mock.calls[0][0]
  client.track('Signed Out', {})
  for (let i = 0; i < 10; i++) await Promise.resolve()
  expect(api.firebase.logEvent).not.toHaveBeenCalled()
  expect(api.sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
    tags: { analytics_provider: 'Firebase', analytics_operation: 'initialization' },
  })
})

it.each(['development', 'preview', 'unconfigured'])(
  'preserves the %s collection gates',
  async (mode) => {
    const api = sdk()
    if (mode === 'development') {
      // @ts-expect-error Exercise the development gate.
      global.__DEV__ = true
    } else if (mode === 'preview') {
      api.env.EXPO_PUBLIC_ANALYTICS_ENABLED = 'false'
    } else {
      api.env.EXPO_PUBLIC_MIXPANEL_TOKEN = 'REPLACE_ME'
      api.env.EXPO_PUBLIC_GA4_ENABLED = 'false'
    }
    await api.start()
    expect(api.mixpanel.Mixpanel).not.toHaveBeenCalled()
    expect(
      api.firebase.setAnalyticsCollectionEnabled.mock.calls.map((call: unknown[]) => call[1]),
    ).toEqual([false])
    const client = api.analytics.registerAnalytics.mock.calls[0][0]
    client.track('Signed Out', {})
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(api.firebase.logEvent).not.toHaveBeenCalled()
  },
)
