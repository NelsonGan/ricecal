import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from '@testing-library/react-native'
import { Text } from 'react-native'

import { render, screen, waitFor } from '@/test-utils'
import { SessionProvider, useSession } from '../session'

/**
 * What a launch does to the cache, and what it makes of a session it cannot
 * check.
 *
 * Both of these are about the same morning: the phone is opened with no signal,
 * and everything the app saved yesterday is sitting on disk. Each bug on its own
 * was enough to hide the lot, and neither shows up online — a cleared cache is
 * refilled before the eye catches it, and a session dropped for want of a
 * refresh is restored by the next request.
 */

const authListeners: Array<(event: string, session: unknown) => void> = []
const mockGetSession = jest.fn()
const mockStoredSession = jest.fn()
const mockWhenStoredSession = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        authListeners.push(callback)
        return { data: { subscription: { unsubscribe: jest.fn() } } }
      },
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
  },
  storedSession: () => mockStoredSession(),
  whenStoredSession: () => mockWhenStoredSession(),
}))

jest.mock('../photos', () => ({ clearImageCache: jest.fn() }))

const mockIdentifyPurchaser = jest.fn()
const mockForgetPurchaser = jest.fn()
jest.mock('@/lib/revenuecat', () => ({
  identifyPurchaser: (id: string) => mockIdentifyPurchaser(id),
  forgetPurchaser: () => mockForgetPurchaser(),
}))

const sessionFor = (id: string) => ({ user: { id }, access_token: `token-for-${id}` })

/** Reads the context out, so the assertions can be about what the app sees. */
function Probe() {
  const { userId, loading } = useSession()
  return <Text>{loading ? 'loading' : `user:${userId ?? 'none'}`}</Text>
}

function mount(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  )
}

/**
 * Whatever supabase announces, announced to everyone listening.
 *
 * Inside `act` because these arrive from outside React the way the real ones do
 * — off a promise the auth client owns — and the state they set is the thing
 * every assertion below reads.
 */
const emit = (event: string, session: unknown) =>
  act(() => {
    for (const listener of authListeners) listener(event, session)
  })

/** A client with something in it, so "was it cleared" is answerable. */
function primed() {
  const client = new QueryClient()
  client.setQueryData(['profile', 'user-1'], { onboarded_at: '2026-01-01T00:00:00Z' })
  return client
}

beforeEach(() => {
  jest.clearAllMocks()
  authListeners.length = 0
  mockGetSession.mockResolvedValue({ data: { session: sessionFor('user-1') }, error: null })
  mockStoredSession.mockReturnValue(null)
  // Shaped like the real one, which awaits the keychain read and then reports
  // what it found — so a test that sets one of these has set both.
  mockWhenStoredSession.mockImplementation(async () => mockStoredSession())
})

/** A promise that stays out, the way supabase's init does with no connection. */
const neverAnswers = () => new Promise(() => {})

/**
 * The one that made every other offline fix pointless.
 *
 * `_recoverAndRefresh` announces SIGNED_IN on every launch that finds a usable
 * session in the keychain, so clearing on the event threw away the cache MMKV
 * had just rehydrated — and the persister wrote the empty result back over it.
 */
it('keeps the cache a relaunch just rehydrated', async () => {
  const client = primed()
  await mount(client)

  await emit('INITIAL_SESSION', sessionFor('user-1'))
  await emit('SIGNED_IN', sessionFor('user-1'))

  await waitFor(() => expect(screen.getByText('user:user-1')).toBeTruthy())
  expect(client.getQueryData(['profile', 'user-1'])).toBeDefined()
})

/** A refresh is the same person, and it fires whenever the app is foregrounded. */
it('keeps the cache across a token refresh', async () => {
  const client = primed()
  await mount(client)

  await emit('INITIAL_SESSION', sessionFor('user-1'))
  await emit('TOKEN_REFRESHED', sessionFor('user-1'))

  await waitFor(() => expect(client.getQueryData(['profile', 'user-1'])).toBeDefined())
})

/**
 * The rule the clearing exists for, and it is untouched: one account's diary
 * must never appear under another's name, even for a frame.
 */
it('clears the cache when a different account signs in', async () => {
  const client = primed()
  await mount(client)

  await emit('INITIAL_SESSION', sessionFor('user-1'))
  await emit('SIGNED_OUT', null)
  await emit('SIGNED_IN', sessionFor('user-2'))

  await waitFor(() => expect(client.getQueryData(['profile', 'user-1'])).toBeUndefined())
})

it('clears the cache on the way out', async () => {
  const client = primed()
  await mount(client)

  await emit('INITIAL_SESSION', sessionFor('user-1'))
  await emit('SIGNED_OUT', null)

  await waitFor(() => expect(client.getQueryData(['profile', 'user-1'])).toBeUndefined())
})

/**
 * The leaving edge does not go through the identity comparison, because it can
 * be the FIRST thing this provider hears — a token revoked while the app was
 * closed is removed during supabase's own startup. Compared, that reads as
 * "nobody, still nobody" and would leave the signed-out account's diary on disk.
 */
it('clears the cache when the sign-out is the first thing it hears about', async () => {
  const client = primed()
  await mount(client)

  await emit('SIGNED_OUT', null)

  await waitFor(() => expect(client.getQueryData(['profile', 'user-1'])).toBeUndefined())
})

/**
 * An expired access token and no connection to renew it over. Supabase answers
 * `null` with an error rather than `null` with none, leaves the session on disk,
 * and the router used to read that as a phone with no account on it.
 */
it('keeps a stored session when the refresh could not be sent', async () => {
  const { AuthRetryableFetchError } = require('@supabase/supabase-js')
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: new AuthRetryableFetchError('Network request failed', 0),
  })
  mockStoredSession.mockReturnValue(sessionFor('user-1'))

  await mount(new QueryClient())

  await waitFor(() => expect(screen.getByText('user:user-1')).toBeTruthy())
})

/** And the event that follows says the same thing, so it must not undo it. */
it('keeps a stored session through the initial event supabase could not answer', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
  mockStoredSession.mockReturnValue(sessionFor('user-1'))

  await mount(new QueryClient())
  await emit('INITIAL_SESSION', null)

  await waitFor(() => expect(screen.getByText('user:user-1')).toBeTruthy())
})

/**
 * A signed-out phone has nothing on disk, so the fallback answers nothing —
 * and a sign-out has already emptied that storage by the time SIGNED_OUT
 * arrives, which is what stops this resurrecting the account someone just left.
 */
it('reports no session when the answer really is that there is none', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

  await mount(new QueryClient())
  await emit('INITIAL_SESSION', null)

  await waitFor(() => expect(screen.getByText('user:none')).toBeTruthy())
})

/**
 * THE ONE THAT LEFT THE APP ON A SPINNER.
 *
 * Everything above is about what supabase ANSWERS with no connection. This is
 * about how long it takes to answer at all: `_recoverAndRefresh` refreshes an
 * access token within 90 seconds of expiring — an hour after the last launch,
 * so ordinarily — and offline that is a backoff loop of at least thirty seconds
 * before `getSession()` resolves, longer when the requests hang rather than
 * fail. `loading` was true throughout, so the router's own offline branch and
 * the diary sitting in MMKV were both below a screen nobody could get past.
 */
it('routes off storage while supabase is still trying to refresh', async () => {
  mockGetSession.mockReturnValue(neverAnswers())
  mockStoredSession.mockReturnValue(sessionFor('user-1'))

  await mount(new QueryClient())

  await waitFor(() => expect(screen.getByText('user:user-1')).toBeTruthy())
})

/** And a phone with nobody on it says so, rather than waiting to be told. */
it('reports no session from storage while supabase is still trying', async () => {
  mockGetSession.mockReturnValue(neverAnswers())

  await mount(new QueryClient())

  await waitFor(() => expect(screen.getByText('user:none')).toBeTruthy())
})

/**
 * Storage is a stand-in, not a verdict. It cannot know about an account deleted
 * while the app was closed, so the answer that has actually been to the server
 * lands on top of it whenever it arrives.
 */
it('lets supabase overrule the storage answer when it lands', async () => {
  let answer: (value: unknown) => void = () => {}
  mockGetSession.mockReturnValue(new Promise((resolve) => (answer = resolve)))
  mockStoredSession.mockReturnValue(sessionFor('user-1'))

  await mount(new QueryClient())
  await waitFor(() => expect(screen.getByText('user:user-1')).toBeTruthy())

  await act(async () => {
    answer({ data: { session: null }, error: new Error('refresh_token_not_found') })
  })

  await waitFor(() => expect(screen.getByText('user:none')).toBeTruthy())
})

/** And it does not undo one that got there first. */
it('does not put storage on top of an answer that already arrived', async () => {
  let read: (value: unknown) => void = () => {}
  mockWhenStoredSession.mockReturnValue(new Promise((resolve) => (read = resolve)))
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

  await mount(new QueryClient())
  await waitFor(() => expect(screen.getByText('user:none')).toBeTruthy())

  // The keychain read landing late, holding what a since-revoked session left
  // there. The server has already said otherwise.
  await act(async () => {
    read(sessionFor('user-1'))
  })

  expect(screen.getByText('user:none')).toBeTruthy()
})

/**
 * An EVENT is supabase speaking too, and it is the mouth a sign-out uses. A
 * stand-in landing after one would put the account somebody just left back on
 * screen — so the guard is about both, not only the call.
 */
it('does not put storage on top of an event that already arrived', async () => {
  let read: (value: unknown) => void = () => {}
  mockWhenStoredSession.mockReturnValue(new Promise((resolve) => (read = resolve)))
  mockGetSession.mockReturnValue(neverAnswers())

  await mount(new QueryClient())
  await emit('SIGNED_OUT', null)
  await waitFor(() => expect(screen.getByText('user:none')).toBeTruthy())

  await act(async () => {
    read(sessionFor('user-1'))
  })

  expect(screen.getByText('user:none')).toBeTruthy()
})

/**
 * The cache belongs to whoever was signed in when the app was killed, and the
 * storage answer is about that same person — so it must not read as a change of
 * account and empty the diary this launch just rehydrated.
 */
it('keeps the rehydrated cache when the storage answer is the only one', async () => {
  mockGetSession.mockReturnValue(neverAnswers())
  mockStoredSession.mockReturnValue(sessionFor('user-1'))

  const client = primed()
  await mount(client)

  await waitFor(() => expect(screen.getByText('user:user-1')).toBeTruthy())
  expect(client.getQueryData(['profile', 'user-1'])).toBeDefined()
})

/**
 * A revoked token is an answer, not a failure to ask. Anything that is not a
 * network error means the server spoke, and what it said stands.
 */
it('signs out when the refresh was refused rather than undeliverable', async () => {
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: new Error('refresh_token_not_found'),
  })
  mockStoredSession.mockReturnValue(sessionFor('user-1'))

  await mount(new QueryClient())

  await waitFor(() => expect(screen.getByText('user:none')).toBeTruthy())
})

/**
 * The half of the paywall that lives outside the paywall.
 *
 * RevenueCat is configured before anybody has signed in, so it starts
 * anonymous and has to be TOLD who this is. Left anonymous, a purchase reaches
 * the webhook as `$RCAnonymousID:...`, there is no account to credit, and
 * somebody who has paid stays behind the paywall for good.
 *
 * The first version keyed this off the same "has the person changed" flag the
 * cache clearing uses, which is false on a cold start by construction — so it
 * only ever fired when somebody switched accounts, and the ordinary case of
 * opening the app and buying something identified nobody.
 */
it('tells RevenueCat who is signed in on an ordinary launch', async () => {
  await mount(primed())

  await emit('SIGNED_IN', sessionFor('user-1'))

  await waitFor(() => expect(mockIdentifyPurchaser).toHaveBeenCalledWith('user-1'))
})

it('does not repeat itself while the same person stays signed in', async () => {
  await mount(primed())

  await emit('SIGNED_IN', sessionFor('user-1'))
  await emit('TOKEN_REFRESHED', sessionFor('user-1'))
  await emit('TOKEN_REFRESHED', sessionFor('user-1'))

  await waitFor(() => expect(mockIdentifyPurchaser).toHaveBeenCalledTimes(1))
})

it('follows a change of account, and forgets on the way out', async () => {
  await mount(primed())

  await emit('SIGNED_IN', sessionFor('user-1'))
  await emit('SIGNED_IN', sessionFor('user-2'))
  await waitFor(() => expect(mockIdentifyPurchaser).toHaveBeenCalledWith('user-2'))

  await emit('SIGNED_OUT', null)
  // Or the next account on this handset inherits the last one's entitlement.
  await waitFor(() => expect(mockForgetPurchaser).toHaveBeenCalled())
})
