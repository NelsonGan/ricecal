/**
 * The watch on the client's own fetch, end to end without a network.
 *
 * The predicates have their own suite; this is the wiring around them, which is
 * where the ways to get it wrong actually are. A guard that signs the user out
 * on a stale token instead of refreshing it is worse than no guard, one that
 * announces on every request in flight toasts four times, and one that acts on
 * the requests made AFTER the sign-out never stops.
 */

const mockStore: { value: string | null } = { value: null }
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'afterFirstUnlock',
  getItemAsync: jest.fn(async () => mockStore.value),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}))

/**
 * The client is never built here. `createClient` is captured instead, so the
 * test can reach the two things the module hands it: the fetch it wants every
 * request to go through, and the storage adapter that decides whether there is
 * a session to lose.
 */
type ClientOptions = {
  global: { fetch: typeof fetch }
  auth: { storage: { getItem: (key: string) => Promise<string | null> } }
}
let mockOptions: ClientOptions
const mockRefresh = jest.fn()
const mockSignOut = jest.fn(async () => ({ error: null }))

jest.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, given: ClientOptions) => {
    mockOptions = given
    return { auth: { refreshSession: mockRefresh, signOut: mockSignOut } }
  },
}))

const { onSessionEnded } = require('../supabase') as {
  onSessionEnded: (listener: () => void) => () => void
}

/** As auth-js builds them. A refusal, rather than a server that was not there. */
const REFUSED = {
  __isAuthError: true,
  name: 'AuthApiError',
  status: 403,
  code: 'session_not_found',
}

const FUNCTION_URL = 'https://ref.supabase.co/functions/v1/scan-meal'

/**
 * Puts a session where `storedSession()` will find it.
 *
 * Through the adapter rather than by reaching inside, because that is the only
 * way in: the module remembers the session as it goes PAST, and supabase's own
 * startup read is what usually does this.
 */
async function signIn() {
  mockStore.value = JSON.stringify({
    access_token: 'still-valid-for-another-hour',
    user: { id: 'user-1' },
  })
  await mockOptions.auth.storage.getItem('sb-ref-auth-token')
}

async function signedOut() {
  mockStore.value = null
  await mockOptions.auth.storage.getItem('sb-ref-auth-token')
}

/** A response from the guarded fetch, with the status the server gave. */
function respondWith(status: number) {
  global.fetch = jest.fn(async () => new Response('{}', { status })) as unknown as typeof fetch
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockRefresh.mockResolvedValue({ data: { session: null }, error: null })
  await signIn()
})

it('signs out when the server refuses the refresh', async () => {
  mockRefresh.mockResolvedValue({ data: { session: null }, error: REFUSED })
  const ended = jest.fn()
  const stop = onSessionEnded(ended)
  respondWith(401)

  await mockOptions.global.fetch(FUNCTION_URL)
  // The probe is deliberately not awaited by the fetch: the caller is owed its
  // response, and the request that noticed has already failed.
  await new Promise(process.nextTick)

  expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(ended).toHaveBeenCalledTimes(1)
  stop()
})

/**
 * The case that makes the probe worth having rather than signing out on the
 * 401 itself. A token can be refused for being a minute old.
 */
it('leaves a live session alone and lets the refresh fix it', async () => {
  mockRefresh.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null })
  const ended = jest.fn()
  const stop = onSessionEnded(ended)
  respondWith(401)

  await mockOptions.global.fetch(FUNCTION_URL)
  await new Promise(process.nextTick)

  expect(mockRefresh).toHaveBeenCalled()
  expect(mockSignOut).not.toHaveBeenCalled()
  expect(ended).not.toHaveBeenCalled()
  stop()
})

it('does not touch the session over a failure to reach the server', async () => {
  mockRefresh.mockResolvedValue({
    data: { session: null },
    error: { __isAuthError: true, name: 'AuthRetryableFetchError', status: 0 },
  })
  respondWith(401)

  await mockOptions.global.fetch(FUNCTION_URL)
  await new Promise(process.nextTick)

  expect(mockSignOut).not.toHaveBeenCalled()
})

// Signing in with the wrong password is a 401 too, and it belongs to the screen
// that asked.
it('ignores a 401 from the auth endpoints', async () => {
  respondWith(401)

  await mockOptions.global.fetch('https://ref.supabase.co/auth/v1/token?grant_type=password')
  await new Promise(process.nextTick)

  expect(mockRefresh).not.toHaveBeenCalled()
})

it('asks nothing of a 200', async () => {
  respondWith(200)

  await mockOptions.global.fetch(FUNCTION_URL)
  await new Promise(process.nextTick)

  expect(mockRefresh).not.toHaveBeenCalled()
})

/**
 * A screen fires several requests at once, so one revoked session produces a
 * handful of 401s within a frame of each other. One sign-out, one sentence.
 */
it('probes once for a screenful of 401s', async () => {
  mockRefresh.mockResolvedValue({ data: { session: null }, error: REFUSED })
  const ended = jest.fn()
  const stop = onSessionEnded(ended)
  respondWith(401)

  await Promise.all([
    mockOptions.global.fetch(FUNCTION_URL),
    mockOptions.global.fetch(FUNCTION_URL),
    mockOptions.global.fetch(FUNCTION_URL),
  ])
  await new Promise(process.nextTick)

  expect(mockRefresh).toHaveBeenCalledTimes(1)
  expect(ended).toHaveBeenCalledTimes(1)
  stop()
})

/**
 * The loop that would otherwise never end. Once signed out, every request the
 * app makes carries the anon key and every edge function answers 401 to it.
 */
it('stays quiet once there is no session left to lose', async () => {
  await signedOut()
  const ended = jest.fn()
  const stop = onSessionEnded(ended)
  respondWith(401)

  await mockOptions.global.fetch(FUNCTION_URL)
  await new Promise(process.nextTick)

  expect(mockRefresh).not.toHaveBeenCalled()
  expect(ended).not.toHaveBeenCalled()
  stop()
})
