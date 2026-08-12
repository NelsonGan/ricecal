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
}))

jest.mock('../photos', () => ({ clearImageCache: jest.fn() }))

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
})

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
