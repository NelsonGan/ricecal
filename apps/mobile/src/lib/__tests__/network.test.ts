import { onlineManager } from '@tanstack/react-query'

import { reportMessage } from '../errors'
import {
  failureReason,
  noteResponse,
  reportNetworkFailure,
  requestTarget,
  resetNetworkReports,
} from '../network'

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ type: 'cellular', isInternetReachable: true })) },
}))
jest.mock('../errors', () => ({ reportMessage: jest.fn() }))

/**
 * A request that never reached the server, reported with the phone's own reason.
 *
 * Pinned because the report is the only trace such a failure leaves: the server
 * never saw the request.
 */

/** What Expo's fetch threw on a simulator with the local API stopped. */
const refused = new Error(
  'fetch failed: UnexpectedException: Could not connect to the server. (at ExpoFetchModule.swift:41)',
)

/**
 * What Expo's fetch threw when a caller cancelled, as filed from 1.0.14 phones:
 * a signal that fired in flight on iOS, and one that had already fired.
 */
const cancelledInFlight = new Error(
  'fetch failed: FetchRequestCanceledException: Fetch request has been canceled',
)
const cancelledBeforeSending = new Error('fetch failed: The operation was aborted.')

/**
 * What 1.1.0 phones filed: a request sent down a pooled connection the other end
 * had dropped, and one left to the platform's 60-second timeout.
 */
const connectionLost = new Error(
  'fetch failed: UnexpectedException: The network connection was lost.',
)
const timedOut = new Error('fetch failed: UnexpectedException: The request timed out.')

const RPC = 'https://ref.supabase.co/rest/v1/rpc/day_marks'

function abortedSignal(reason?: unknown): AbortSignal {
  const controller = new AbortController()
  controller.abort(reason)
  return controller.signal
}

/** Moves the clock on and answers the new time, for a request sent then. */
function later(ms = 1_000): number {
  jest.advanceTimersByTime(ms)
  return Date.now()
}

/**
 * A host that stayed down: one request lost, then a retry sent after that
 * failure and lost too. The first only opens the question; the second answers it.
 */
async function loseTwo(url: string, error: unknown = refused, signal?: AbortSignal) {
  await reportNetworkFailure(url, error, Date.now(), signal)
  const retriedAt = later()
  later(50)
  await reportNetworkFailure(url, error, retriedAt, signal)
}

beforeEach(() => {
  resetNetworkReports()
  onlineManager.setOnline(true)
  jest.mocked(reportMessage).mockClear()
})

describe('requestTarget', () => {
  it('keeps the host and the first three path segments', () => {
    expect(requestTarget('https://ref.supabase.co/rest/v1/weight_logs?select=*')).toEqual({
      host: 'ref.supabase.co',
      path: '/rest/v1/weight_logs',
    })
  })

  // The catalogue query string is the typed search, and a storage path names a
  // user. Neither may reach error tracking.
  it('drops the query string and anything past the third segment', () => {
    expect(requestTarget('https://ref.supabase.co/storage/v1/object/user-id/photo.jpg')?.path).toBe(
      '/storage/v1/object',
    )
    expect(requestTarget('https://catalogue.example.dev/search?q=nasi%20lemak')?.path).toBe(
      '/search',
    )
  })

  it('handles a bare origin and a local port', () => {
    expect(requestTarget('http://127.0.0.1:54421')).toEqual({ host: '127.0.0.1:54421', path: '/' })
  })

  it('answers null for something that is not a URL', () => {
    expect(requestTarget('not a url')).toBeNull()
  })
})

describe('failureReason', () => {
  it('keeps the platform reason and drops the native frame after it', () => {
    expect(failureReason(refused)).toBe(
      'fetch failed: UnexpectedException: Could not connect to the server.',
    )
  })

  it('reads something that is not an Error', () => {
    expect(failureReason('timeout')).toBe('timeout')
    expect(failureReason(new Error(''))).toBe('no reason given')
  })
})

describe('reportNetworkFailure', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-10-19T08:00:00Z') }))
  afterEach(() => jest.useRealTimers())

  it('reports the host, path, reason, connection type and how long it has been down', async () => {
    const url = 'https://ref.supabase.co/auth/v1/token?grant_type=refresh_token'
    await reportNetworkFailure(url, refused, Date.now())
    const retriedAt = later(1_000)
    later(500)
    await reportNetworkFailure(url, refused, retriedAt)

    expect(reportMessage).toHaveBeenCalledTimes(1)
    expect(reportMessage).toHaveBeenCalledWith('[network] could not reach ref.supabase.co', {
      network_path: '/auth/v1/token',
      network_reason: 'fetch failed: UnexpectedException: Could not connect to the server.',
      network_type: 'cellular',
      network_reachable: 'true',
      network_down_ms: 1_500,
    })
  })

  // iOS sends the first request after an idle minute, or after the app comes
  // back, down a pooled connection the other end has dropped. The next request
  // opens a fresh one and is answered. On 1.1.0 that was nearly every report.
  it('stays quiet for one lost request', async () => {
    await reportNetworkFailure(RPC, connectionLost, Date.now())

    expect(reportMessage).not.toHaveBeenCalled()
  })

  it('stays quiet when the host answers after a lost request', async () => {
    await reportNetworkFailure(RPC, connectionLost, Date.now())
    later()
    noteResponse('https://ref.supabase.co/rest/v1/workout_summaries?select=*')
    const sentAt = later()
    later(50)
    await reportNetworkFailure(RPC, connectionLost, sentAt)

    expect(reportMessage).not.toHaveBeenCalled()
  })

  // One connection carries every request, so when it is dead they all fail at
  // once. None of them had a connection of its own, so none confirms anything.
  it('stays quiet for requests that went out together on one dead connection', async () => {
    const sentAt = Date.now()
    later(20)
    await reportNetworkFailure(RPC, connectionLost, sentAt)
    await reportNetworkFailure('https://ref.supabase.co/rest/v1/daily_logs', connectionLost, sentAt)
    await reportNetworkFailure(
      'https://ref.supabase.co/functions/v1/photos',
      connectionLost,
      sentAt,
    )

    expect(reportMessage).not.toHaveBeenCalled()
  })

  // A host that swallows requests whole: each one runs to the platform's
  // timeout, and react-query's retry a second later does the same.
  it('confirms a host whose requests time out one after another', async () => {
    const firstSent = Date.now()
    later(60_000)
    await reportNetworkFailure(RPC, timedOut, firstSent)
    const retriedAt = later(1_000)
    later(60_000)
    await reportNetworkFailure(RPC, timedOut, retriedAt)

    expect(reportMessage).toHaveBeenCalledTimes(1)
    expect(jest.mocked(reportMessage).mock.calls[0][1]).toMatchObject({
      network_reason: 'fetch failed: UnexpectedException: The request timed out.',
      network_down_ms: 61_000,
    })
  })

  // A lost request just before a spell in the background and another just
  // after it are two blips, not one outage. The second starts the count again.
  it('starts over when the next lost request comes long after the first', async () => {
    await reportNetworkFailure(RPC, connectionLost, Date.now())
    const resumedAt = later(30 * 60_000)
    later(50)
    await reportNetworkFailure(RPC, connectionLost, resumedAt)

    expect(reportMessage).not.toHaveBeenCalled()

    const retriedAt = later()
    later(50)
    await reportNetworkFailure(RPC, connectionLost, retriedAt)

    expect(reportMessage).toHaveBeenCalledTimes(1)
  })

  it('keeps each host to itself', async () => {
    await reportNetworkFailure('https://ref.supabase.co/rest/v1/profiles', refused, Date.now())
    const sentAt = later()
    later(50)
    await reportNetworkFailure('https://catalogue.example.dev/search', refused, sentAt)

    expect(reportMessage).not.toHaveBeenCalled()
  })

  // A screen fires a dozen requests at once; the first report says it all.
  it('reports a host once per launch', async () => {
    await loseTwo('https://ref.supabase.co/rest/v1/profiles')
    await loseTwo('https://ref.supabase.co/rest/v1/weight_logs')
    await loseTwo('https://catalogue.example.dev/search')

    expect(reportMessage).toHaveBeenCalledTimes(2)
  })

  // supabase-js sends its token refresh with no connection too. A phone in a
  // tunnel is not news.
  it('stays quiet while the phone is offline', async () => {
    onlineManager.setOnline(false)
    await loseTwo('https://ref.supabase.co/auth/v1/token')

    expect(reportMessage).not.toHaveBeenCalled()
  })

  it('never throws, even when reporting fails', async () => {
    jest.mocked(reportMessage).mockImplementationOnce(() => {
      throw new Error('reporter down')
    })
    await expect(loseTwo('https://ref.supabase.co/rest/v1/profiles')).resolves.toBe(undefined)
    expect(reportMessage).toHaveBeenCalledTimes(1)
  })

  // Expo's fetch throws a plain FetchError rather than an AbortError, so a
  // query react-query cancelled was filed as an unreachable host and used up
  // that host's one report for the launch.
  it('stays quiet for a request its caller cancelled, whatever Expo calls it', async () => {
    await loseTwo('https://ref.supabase.co/functions/v1/photos', cancelledInFlight, abortedSignal())
    await loseTwo(RPC, cancelledBeforeSending, abortedSignal())

    expect(reportMessage).not.toHaveBeenCalled()
  })

  // Nor does a cancellation open the question, or a real failure after it
  // would be confirmed on its own.
  it('does not count a cancellation as the first lost request', async () => {
    await reportNetworkFailure(RPC, cancelledInFlight, Date.now(), abortedSignal())
    const sentAt = later()
    later(50)
    await reportNetworkFailure(RPC, refused, sentAt)

    expect(reportMessage).not.toHaveBeenCalled()
  })

  it('still reports a real failure on a host after a cancellation there', async () => {
    await reportNetworkFailure(
      'https://ref.supabase.co/rest/v1/profiles',
      cancelledInFlight,
      Date.now(),
      abortedSignal(),
    )
    await loseTwo('https://ref.supabase.co/rest/v1/profiles')

    expect(reportMessage).toHaveBeenCalledTimes(1)
    expect(jest.mocked(reportMessage).mock.calls[0][1]).toMatchObject({
      network_reason: 'fetch failed: UnexpectedException: Could not connect to the server.',
    })
  })

  it('stays quiet for an AbortError with no signal to check', async () => {
    const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' })
    await loseTwo('https://ref.supabase.co/rest/v1/profiles', abort)

    expect(reportMessage).not.toHaveBeenCalled()
  })

  // A caller that gives up on its own clock has made a decision, not lost the
  // server. React Native's AbortController drops the reason, so both shapes.
  it('stays quiet when the caller gave up on its own time limit', async () => {
    const timeout = Object.assign(new Error('The signal timed out.'), { name: 'TimeoutError' })
    await loseTwo(
      'https://ref.supabase.co/rest/v1/rpc/social_entry_post',
      cancelledInFlight,
      abortedSignal(timeout),
    )
    await loseTwo(
      'https://ref.supabase.co/rest/v1/rpc/social_entry_post',
      cancelledInFlight,
      abortedSignal(),
    )

    expect(reportMessage).not.toHaveBeenCalled()
  })

  // The signal is only evidence once it has fired. A request that failed with
  // its signal still live is a real failure.
  it('reports a failure whose signal never fired', async () => {
    await loseTwo('https://ref.supabase.co/rest/v1/profiles', refused, new AbortController().signal)

    expect(reportMessage).toHaveBeenCalledTimes(1)
  })
})
