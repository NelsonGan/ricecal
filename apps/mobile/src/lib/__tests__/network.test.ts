import { onlineManager } from '@tanstack/react-query'

import { reportMessage } from '../errors'
import { failureReason, reportNetworkFailure, requestTarget, resetNetworkReports } from '../network'

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
  it('reports the host, path, reason and connection type', async () => {
    await reportNetworkFailure(
      'https://ref.supabase.co/auth/v1/token?grant_type=refresh_token',
      refused,
    )

    expect(reportMessage).toHaveBeenCalledWith('[network] could not reach ref.supabase.co', {
      network_path: '/auth/v1/token',
      network_reason: 'fetch failed: UnexpectedException: Could not connect to the server.',
      network_type: 'cellular',
      network_reachable: 'true',
    })
  })

  // A screen fires a dozen requests at once; the first report says it all.
  it('reports a host once per launch', async () => {
    await reportNetworkFailure('https://ref.supabase.co/rest/v1/profiles', refused)
    await reportNetworkFailure('https://ref.supabase.co/rest/v1/weight_logs', refused)
    await reportNetworkFailure('https://catalogue.example.dev/search', refused)

    expect(reportMessage).toHaveBeenCalledTimes(2)
  })

  // supabase-js sends its token refresh with no connection too. A phone in a
  // tunnel is not news.
  it('stays quiet while the phone is offline', async () => {
    onlineManager.setOnline(false)
    await reportNetworkFailure('https://ref.supabase.co/auth/v1/token', refused)

    expect(reportMessage).not.toHaveBeenCalled()
  })

  it('never throws, even when reporting fails', async () => {
    jest.mocked(reportMessage).mockImplementationOnce(() => {
      throw new Error('reporter down')
    })
    await expect(
      reportNetworkFailure('https://ref.supabase.co/rest/v1/profiles', refused),
    ).resolves.toBe(undefined)
  })
})
