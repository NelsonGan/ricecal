/**
 * Telling a session the server has disowned from one it merely could not reach.
 *
 * The two look identical from inside the app and mean opposite things: acting
 * on the first signs out a user whose account is fine, and ignoring the second
 * leaves them tapping buttons that cannot succeed.
 *
 * Pure on purpose. `lib/supabase.ts` owns the client and the wiring; these are
 * the two judgement calls in it, testable without a client or a network.
 */

/**
 * Whether a 401 says anything about the session.
 *
 * A 401 from `/auth/v1/` is an ordinary answer: a wrong password, an expired
 * code, a spent link. Those belong to whichever screen asked, and treating one
 * as a revoked session would sign the user out of the account they are signing
 * into. Everywhere else a 401 means the token this app sent was refused.
 */
export function tokenWasRefused(url: string, status: number): boolean {
  if (status !== 401) return false
  return !url.includes('/auth/v1/')
}

/**
 * The shape auth-js errors arrive in, read structurally rather than with
 * `instanceof` against a class the runtime may swap. Same argument
 * `refusals.ts` makes about `FunctionsHttpError`.
 */
type AuthFailure = {
  __isAuthError?: boolean
  name?: string
  status?: number
}

/**
 * The statuses that mean the server answered and said no.
 *
 * Not "any error": auth-js reports an unreachable server, a 5xx and every
 * gateway code as `AuthRetryableFetchError` with status 0 or 5xx, and a 429 as
 * an ordinary `AuthApiError`. None of those is evidence about the session.
 */
const REFUSALS = new Set([400, 401, 403, 404])

/**
 * Whether a failed refresh means the session is gone for good.
 *
 * `AuthSessionMissingError` is excluded despite its 400: it means there was
 * nothing to refresh, which is the state after a sign-out rather than a reason
 * for one, and counting it would have every request made while signed out
 * announce a fresh sign-out.
 */
export function sessionIsGone(error: unknown): boolean {
  const failure = error as AuthFailure | null | undefined
  if (failure?.__isAuthError !== true) return false
  if (failure.name === 'AuthSessionMissingError') return false
  return typeof failure.status === 'number' && REFUSALS.has(failure.status)
}
