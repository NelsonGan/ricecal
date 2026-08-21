import { sessionIsGone, tokenWasRefused } from '../revocation'

/**
 * The two judgement calls behind signing somebody out without being asked.
 *
 * Both of them are decisions about what NOT to do, which is why they are worth
 * pinning. Getting `tokenWasRefused` too wide signs a user out in the middle of
 * typing their password; getting `sessionIsGone` too wide signs out everybody
 * whose train went into a tunnel while Supabase happened to be having a bad
 * minute.
 */

/** An auth-js error, as auth-js actually builds them. See `lib/errors.js`. */
function authError(name: string, status: number, code?: string) {
  return { __isAuthError: true, name, status, code }
}

describe('tokenWasRefused', () => {
  it('reads a 401 from an edge function as the token being refused', () => {
    expect(
      tokenWasRefused('https://ref.supabase.co/functions/v1/scan-meal', 401),
    ).toBe(true)
  })

  it('reads a 401 from PostgREST the same way', () => {
    expect(tokenWasRefused('https://ref.supabase.co/rest/v1/food_logs?select=*', 401)).toBe(true)
  })

  // The important negative. Signing in with the wrong password is a 401, and
  // acting on it would end the session of somebody who is trying to start one.
  it('ignores a 401 from the auth endpoints, which own their own failures', () => {
    expect(tokenWasRefused('https://ref.supabase.co/auth/v1/token?grant_type=password', 401)).toBe(
      false,
    )
    expect(tokenWasRefused('https://ref.supabase.co/auth/v1/verify', 401)).toBe(false)
  })

  it('ignores every other status', () => {
    const url = 'https://ref.supabase.co/functions/v1/photos'
    // 403 is "not your photo", 402 is the paywall, 429 is the day's scans.
    for (const status of [200, 400, 402, 403, 404, 429, 500]) {
      expect(tokenWasRefused(url, status)).toBe(false)
    }
  })
})

describe('sessionIsGone', () => {
  it('is true when the server refused the refresh token', () => {
    expect(sessionIsGone(authError('AuthApiError', 400, 'refresh_token_not_found'))).toBe(true)
    expect(sessionIsGone(authError('AuthApiError', 403, 'session_not_found'))).toBe(true)
    expect(sessionIsGone(authError('AuthApiError', 404, 'user_not_found'))).toBe(true)
  })

  // A phone in a lift. auth-js reports an unreachable server with a status of 0.
  it('is false when the server was never reached', () => {
    expect(sessionIsGone(authError('AuthRetryableFetchError', 0))).toBe(false)
  })

  // Supabase having a bad minute is not the user's account being gone. auth-js
  // reports 5xx and every Cloudflare gateway code as retryable.
  it('is false for an outage', () => {
    expect(sessionIsGone(authError('AuthRetryableFetchError', 503))).toBe(false)
    expect(sessionIsGone(authError('AuthRetryableFetchError', 522))).toBe(false)
  })

  // A real refusal by status, and one that must not count: too many requests
  // says nothing at all about whether the session behind them is good.
  it('is false for a rate limit', () => {
    expect(sessionIsGone(authError('AuthApiError', 429, 'over_request_rate_limit'))).toBe(false)
  })

  // auth-js's own commit guard, when a sign-out lands mid-refresh. The session
  // is already being disposed of by whoever asked for it.
  it('is false for a discarded refresh', () => {
    expect(sessionIsGone(authError('AuthRefreshDiscardedError', 409))).toBe(false)
  })

  /**
   * The one that would loop. `refreshSession()` answers this when there is
   * nothing stored to refresh, which is every request made after a sign-out —
   * so counting it would have a signed-out app announce a fresh sign-out on
   * each one.
   */
  it('is false when there was no session to begin with', () => {
    expect(sessionIsGone(authError('AuthSessionMissingError', 400))).toBe(false)
  })

  it('is false for anything that is not an auth error at all', () => {
    expect(sessionIsGone(null)).toBe(false)
    expect(sessionIsGone(undefined)).toBe(false)
    expect(sessionIsGone(new Error('Network request failed'))).toBe(false)
    expect(sessionIsGone({ status: 401 })).toBe(false)
  })
})
