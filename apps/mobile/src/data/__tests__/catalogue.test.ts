import { catalogueGet } from '@/data/catalogue'

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}))

const { supabase } = require('@/lib/supabase') as {
  supabase: { auth: { getSession: jest.Mock } }
}

/**
 * The app reading the catalogue as itself. Two things about this module are
 * load-bearing and neither is visible at the call site.
 *
 * Unreachable is not empty: every failure has to throw, so react-query lands in
 * its error state and the search panel says something went wrong. Answering `[]`
 * for a Worker that is down tells somebody their dish does not exist.
 *
 * And the token is fetched, not remembered, because `getSession()` refreshes one
 * close to expiring. An access token lives about an hour, a diary is an app people
 * leave open, and a stale token is a 401 that looks like a catalogue outage.
 */

const SESSION = { data: { session: { access_token: 'jwt-abc' } }, error: null }

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

const answer = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
})

beforeEach(() => {
  jest.clearAllMocks()
  supabase.auth.getSession.mockResolvedValue(SESSION)
})

describe('catalogueGet', () => {
  it('sends the user token and returns the body', async () => {
    fetchMock.mockResolvedValue(answer({ ok: true, foods: [{ id: 'a' }] }))

    const body = await catalogueGet<{ foods: unknown[] }>('/search', { q: 'nasi', limit: 50 })

    expect(body.foods).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/search?q=nasi&limit=50')
    // The Worker verifies this against the project's public key. Sending the
    // anon key instead would be a 401 that looks like an outage.
    expect(init.headers.Authorization).toBe('Bearer jwt-abc')
  })

  it('asks for a session every time rather than caching a token', async () => {
    fetchMock.mockResolvedValue(answer({ ok: true, foods: [] }))

    await catalogueGet('/search', { q: 'a' })
    await catalogueGet('/search', { q: 'b' })

    expect(supabase.auth.getSession).toHaveBeenCalledTimes(2)
  })

  it('throws when the catalogue answers with a status, rather than reporting nothing', async () => {
    fetchMock.mockResolvedValue(answer({ ok: false }, false, 500))

    await expect(catalogueGet('/search', { q: 'nasi' })).rejects.toThrow('500')
  })

  it('throws when the request never lands', async () => {
    fetchMock.mockRejectedValue(new Error('Network request failed'))

    await expect(catalogueGet('/search', { q: 'nasi' })).rejects.toThrow()
  })

  it('throws on a 200 that refuses, which is not an empty result either', async () => {
    fetchMock.mockResolvedValue(answer({ ok: false, error: 'slow down' }))

    await expect(catalogueGet('/search', { q: 'nasi' })).rejects.toThrow('refused')
  })

  it('refuses to ask at all without a signed-in user', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    await expect(catalogueGet('/search', { q: 'nasi' })).rejects.toThrow('signed-in')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
