import { forgetPurchaser, identifyPurchaser, setPurchasesForTest } from '../revenuecat'

/**
 * The purchase SDK's identity lifecycle, which is the half of the paywall that
 * lives outside the paywall.
 *
 * Everything here is about ORDER, because nothing else about these calls can go
 * wrong loudly. They are fired and forgotten from the session provider, each is
 * several awaits deep with a native round trip in the middle, and every way of
 * getting the order wrong leaves a customer record that reads perfectly
 * plausibly: an email on the wrong account, or a purchase filed against
 * `$RCAnonymousID:...` by somebody who was signed in the whole time.
 *
 * The SDK is handed over rather than mocked. `jest.mock` cannot reach it — the
 * module is behind a dynamic import that jest keeps real — which is what
 * `setPurchasesForTest` is for.
 */

/**
 * A provisioned key, and the REAL `isConfigured` around it. The suite's env
 * leaves both RevenueCat keys on the placeholder, which is the state where this
 * module deliberately does nothing at all — so without this every case below
 * would pass by never reaching the SDK.
 */
jest.mock('../env', () => {
  const actual = jest.requireActual('../env')
  return {
    ...actual,
    env: {
      ...actual.env,
      EXPO_PUBLIC_RC_IOS_KEY: 'rc-ios-key',
      EXPO_PUBLIC_RC_ANDROID_KEY: 'rc-android-key',
    },
  }
})

let calls: string[] = []

/** Whether the native log in answers at once, or waits to be let go. */
let holdLogIn = false
let releaseLogIn: (() => void) | null = null

function fakeSdk() {
  return {
    configure: () => {},
    logIn: (id: string) => {
      calls.push(`logIn:${id}`)
      if (!holdLogIn) return Promise.resolve()
      return new Promise<void>((resolve) => {
        releaseLogIn = resolve
      })
    },
    logOut: async () => void calls.push('logOut'),
    setEmail: async (email: string | null) => void calls.push(`setEmail:${email}`),
    setMixpanelDistinctID: async (id: string | null) => void calls.push(`mixpanel:${id}`),
  }
}

/** A macrotask, which drains every microtask queued behind these calls. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  calls = []
  holdLogIn = false
  releaseLogIn = null
  setPurchasesForTest(fakeSdk())
})

afterEach(() => setPurchasesForTest(null))

const traits = (email: string | null, mixpanelDistinctId: string | null = 'user-1') => ({
  email,
  mixpanelDistinctId,
})

it('names the account before it says anything about them', async () => {
  await identifyPurchaser('user-1', traits('one@example.com'))

  // An attribute is filed against whichever app user id the SDK is holding, so
  // an email set first lands on the anonymous customer the process started as,
  // and the real account stays blank.
  expect(calls).toEqual(['logIn:user-1', 'setEmail:one@example.com', 'mixpanel:user-1'])
})

it('deletes the address for an account that has none, rather than skipping it', async () => {
  await identifyPurchaser('user-1', traits(null))

  expect(calls).toContain('setEmail:null')
})

/** A build that sends nothing to Mixpanel claims no distinct id there either. */
it('leaves the distinct id alone when Mixpanel was told nothing', async () => {
  await identifyPurchaser('user-1', traits('one@example.com', null))

  expect(calls).toEqual(['logIn:user-1', 'setEmail:one@example.com'])
})

/**
 * THE ONE THAT COSTS SOMEBODY THEIR SUBSCRIPTION.
 *
 * A sign-out arrives while the log in before it is still in flight, which is
 * what an account switch is: two auth events a few milliseconds apart, both
 * fired and forgotten. Overlapping, the `logOut` can finish first and leave the
 * SDK anonymous for somebody who is signed in, and the email that follows the
 * log in lands on whichever customer the SDK holds by then.
 */
it('keeps a sign-out behind the sign-in it followed', async () => {
  holdLogIn = true

  const identifying = identifyPurchaser('user-1', traits('one@example.com'))
  const forgetting = forgetPurchaser()

  // None of the sign-out may have run yet: the sign-in has not finished saying
  // who this is.
  await settle()
  expect(calls).toEqual(['logIn:user-1'])

  releaseLogIn?.()
  await Promise.all([identifying, forgetting])

  expect(calls).toEqual(['logIn:user-1', 'setEmail:one@example.com', 'mixpanel:user-1', 'logOut'])
})

/**
 * And a second account behind the first, which is the same race one step later:
 * the earlier person's address must not reach the later person's record.
 */
it('finishes with one account before it starts on the next', async () => {
  holdLogIn = true

  const first = identifyPurchaser('user-1', traits('one@example.com'))
  await settle()
  const second = identifyPurchaser('user-2', traits('two@example.com', 'user-2'))

  releaseLogIn?.()
  await first
  // The second log in is held too, since the fake holds every one of them.
  await settle()
  releaseLogIn?.()
  await second

  expect(calls).toEqual([
    'logIn:user-1',
    'setEmail:one@example.com',
    'mixpanel:user-1',
    'logIn:user-2',
    'setEmail:two@example.com',
    'mixpanel:user-2',
  ])
})
