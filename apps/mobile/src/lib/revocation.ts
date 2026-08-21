/**
 * Telling a session the server has DISOWNED from one it merely could not reach.
 *
 * The two look identical from inside the app and mean opposite things. A phone
 * in a lift and a session that has been revoked both produce a request that did
 * not work; acting on the first would sign out a user whose account is fine, and
 * not acting on the second leaves them tapping buttons that cannot succeed.
 *
 * Pure on purpose. `lib/supabase.ts` owns the client and the wiring, and these
 * are the two judgement calls in it, which is the part worth testing without a
 * client, a keychain or a network.
 */

/**
 * Whether a 401 says anything about the session.
 *
 * A 401 from `/auth/v1/` is an ordinary answer rather than a verdict: a wrong
 * password, a code that has expired, a link already spent. Those belong to
 * whichever screen asked, they are already translated by `asAuthProblem`, and
 * treating one as a revoked session would sign the user out of the account they
 * are in the middle of signing into.
 *
 * Everywhere else in the project — PostgREST, storage, and every edge function —
 * a 401 means one thing: the token this app sent was refused.
 */
export function tokenWasRefused(url: string, status: number): boolean {
  if (status !== 401) return false
  return !url.includes('/auth/v1/')
}

/**
 * The shape auth-js errors arrive in, read structurally.
 *
 * `instanceof` against a class the runtime may swap is the wrong test for a
 * value that comes out of a library — the same argument `refusals.ts` makes
 * about `FunctionsHttpError`. Every auth-js error carries `__isAuthError`, a
 * `name` and a `status`, and those three are the whole of what this needs.
 */
type AuthFailure = {
  __isAuthError?: boolean
  name?: string
  status?: number
}

/**
 * The statuses that mean the SERVER ANSWERED AND SAID NO.
 *
 * Deliberately not "any error". auth-js reports an unreachable server, a 5xx and
 * every Cloudflare gateway code as `AuthRetryableFetchError` with a status of 0
 * or 5xx, and a 429 as an ordinary `AuthApiError` with the rate limit's status —
 * none of which is evidence about the session. What is left is a refusal: the
 * refresh token was presented and the server would not exchange it.
 */
const REFUSALS = new Set([400, 401, 403, 404])

/**
 * Whether a failed refresh means the session is gone for good.
 *
 * `AuthSessionMissingError` is excluded even though it carries a 400. It means
 * this app had nothing to refresh, which is the state AFTER a sign-out rather
 * than a reason for one, and counting it would have every request made while
 * signed out announce a fresh sign-out of its own.
 */
export function sessionIsGone(error: unknown): boolean {
  const failure = error as AuthFailure | null | undefined
  if (failure?.__isAuthError !== true) return false
  if (failure.name === 'AuthSessionMissingError') return false
  return typeof failure.status === 'number' && REFUSALS.has(failure.status)
}
