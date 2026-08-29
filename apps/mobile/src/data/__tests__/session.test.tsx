import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from '@testing-library/react-native'
import { Text } from 'react-native'

import { render, screen, waitFor } from '@/test-utils'
import { SessionProvider, useSession } from '../session'

/**
 * What a launch does to the cache, and what it makes of a session it cannot
 * check. Both are about the same morning: the phone is opened with no signal and
 * everything saved yesterday is on disk. Either bug alone hides the lot, and
 * neither shows up online.
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
  identifyPurchaser: (id: string, traits: unknown) => mockIdentifyPurchaser(id, traits),
  forgetPurchaser: () => mockForgetPurchaser(),
}))

/**
 * Shaped like the real seam: `identifyUser` answers with the distinct id it
 * registered, which is what the purchase SDK is then told to file its forwarded
 * events under. A fake that returned nothing would let the tie below pass while
 * asserting nothing.
 */
const mockIdentifyUser = jest.fn((id: string, _email: string | null): string | null => id)
const mockResetIdentity = jest.fn()
// Spread over the real module rather than replacing it: the provider tracks
// nothing today, and a `track` call added to it later should fail on what it
// asserts rather than on this mock not having the function.
jest.mock('@/lib/analytics', () => ({
  ...jest.requireActual('@/lib/analytics'),
  identifyUser: (id: string, email: string | null) => mockIdentifyUser(id, email),
  resetIdentity: () => mockResetIdentity(),
}))

const sessionFor = (id: string, email: string | null = `${id}@example.com`) => ({
  user: { id, email: email ?? undefined },
  access_token: `token-for-${id}`,
})

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
 * Whatever supabase announces, announced to everyone listening. Inside `act`,
 * because these arrive from outside React the way the real ones do.
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
 * The one that made every other offline fix pointless. `_recoverAndRefresh`
 * announces SIGNED_IN on every launch that finds a usable session, so clearing on
 * the event threw away the cache MMKV had just rehydrated, and the persister
 * wrote the empty result back over it.
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
 * The one that left the app on a spinner. Everything above is about what supabase
 * answers with no connection; this is about how long it takes to answer at all.
 * `_recoverAndRefresh` refreshes a token within 90 seconds of expiring, which
 * offline is a backoff loop of at least thirty seconds before `getSession()`
 * resolves, and `loading` was true throughout.
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
 * The half of the paywall that lives outside the paywall. RevenueCat is
 * configured before anybody has signed in, so it starts anonymous: left that way,
 * a purchase reaches the webhook as `$RCAnonymousID:...` and there is no account
 * to credit.
 *
 * The first version keyed off the same "has the person changed" flag the cache
 * clearing uses, which is false on a cold start, so it only fired on an account
 * switch.
 */
it('tells RevenueCat who is signed in on an ordinary launch', async () => {
  await mount(primed())

  await emit('SIGNED_IN', sessionFor('user-1'))

  await waitFor(() =>
    expect(mockIdentifyPurchaser).toHaveBeenCalledWith('user-1', {
      email: 'user-1@example.com',
      mixpanelDistinctId: 'user-1',
    }),
  )
})

/**
 * One person across both platforms. RevenueCat forwards its purchase events into
 * Mixpanel under the distinct id it was given, so the two identifiers have to be
 * the same string or a subscription lands on a profile with no behaviour on it.
 * Neither dashboard shows that failure; both look plausible alone.
 */
it('names the same person to Mixpanel and to RevenueCat', async () => {
  await mount(primed())

  await emit('SIGNED_IN', sessionFor('user-1'))

  await waitFor(() => expect(mockIdentifyUser).toHaveBeenCalledWith('user-1', 'user-1@example.com'))
  const [id, traits] = mockIdentifyPurchaser.mock.calls[0]
  expect(traits.mixpanelDistinctId).toBe(mockIdentifyUser.mock.results[0].value)
  expect(id).toBe('user-1')
  // The ADDRESS is the other half of that agreement, and it comes from one read
  // of the session rather than from each platform's own idea of who this is —
  // so somebody who writes in about a purchase is findable on both dashboards
  // by the address they wrote from.
  expect(mockIdentifyUser.mock.calls[0][1]).toBe(traits.email)
})

/**
 * A build that sends nothing to Mixpanel claims no distinct id either, rather
 * than asserting one for a person Mixpanel has never heard of.
 */
it('leaves the distinct id unset when nothing was sent to Mixpanel', async () => {
  mockIdentifyUser.mockReturnValueOnce(null)
  await mount(primed())

  await emit('SIGNED_IN', sessionFor('user-1'))

  await waitFor(() =>
    expect(mockIdentifyPurchaser).toHaveBeenCalledWith('user-1', {
      email: 'user-1@example.com',
      mixpanelDistinctId: null,
    }),
  )
})

/** An account made through a provider that gave no address has none to send. */
it('says so rather than inventing one when the account has no address', async () => {
  await mount(primed())

  await emit('SIGNED_IN', sessionFor('user-1', null))

  await waitFor(() =>
    expect(mockIdentifyPurchaser).toHaveBeenCalledWith('user-1', {
      email: null,
      mixpanelDistinctId: 'user-1',
    }),
  )
  // Mixpanel is told the same nothing, and leaves `$email` unset rather than
  // filing a blank one — see `identifyUser`.
  expect(mockIdentifyUser).toHaveBeenCalledWith('user-1', null)
})

it('does not repeat itself while the same person stays signed in', async () => {
  await mount(primed())

  await emit('SIGNED_IN', sessionFor('user-1'))
  await emit('TOKEN_REFRESHED', sessionFor('user-1'))
  await emit('TOKEN_REFRESHED', sessionFor('user-1'))

  await waitFor(() => expect(mockIdentifyPurchaser).toHaveBeenCalledTimes(1))
})

/**
 * The one fact here that moves under a stable account. `USER_UPDATED` carries
 * the same user id, so keyed on the id alone the dashboard would go on showing
 * the address somebody has just stopped using — and the support search that
 * matters is the one done from the new one.
 */
it('follows an address changed while signed in', async () => {
  await mount(primed())

  await emit('SIGNED_IN', sessionFor('user-1'))
  await emit('USER_UPDATED', sessionFor('user-1', 'moved@example.com'))

  await waitFor(() =>
    expect(mockIdentifyPurchaser).toHaveBeenLastCalledWith('user-1', {
      email: 'moved@example.com',
      mixpanelDistinctId: 'user-1',
    }),
  )
  // Both platforms follow it, or the two dashboards answer different searches.
  expect(mockIdentifyUser).toHaveBeenLastCalledWith('user-1', 'moved@example.com')
})

it('follows a change of account, and forgets on the way out', async () => {
  await mount(primed())

  await emit('SIGNED_IN', sessionFor('user-1'))
  await emit('SIGNED_IN', sessionFor('user-2'))
  await waitFor(() =>
    expect(mockIdentifyPurchaser).toHaveBeenCalledWith('user-2', {
      email: 'user-2@example.com',
      mixpanelDistinctId: 'user-2',
    }),
  )

  await emit('SIGNED_OUT', null)
  // Or the next account on this handset inherits the last one's entitlement.
  await waitFor(() => expect(mockForgetPurchaser).toHaveBeenCalled())
  // And Mixpanel stops filing this handset's events under the account that left.
  expect(mockResetIdentity).toHaveBeenCalled()
})
