import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

/**
 * The catalogue, reached directly.
 *
 * The Worker verifies the user's own Supabase JWT now, against the public key
 * the project publishes. So the phone still holds no secret, and the hop is
 * gone. See `apps/cloudflare/workers/catalogue/src/auth.ts`.
 *
 * WHAT THIS FILE HAS TO GET RIGHT
 *
 * A FRESH token. `getSession()` refreshes one that is close to expiring, where
 * reading the access token off a stored session hands the Worker something it
 * will correctly refuse. An access token lives about an hour and a diary is an
 * app people leave open.
 *
 * AND UNREACHABLE IS NOT EMPTY. This throws for anything that is not a clean
 * answer, so react-query goes to its error state and the search panel says
 * something went wrong. Returning `[]` for a Worker that is down tells somebody
 * their dish does not exist, which is the bug that cost an hour when the
 * catalogue moved and is written into the invariants for that reason.
 */

/** How long to wait before deciding the catalogue is not going to answer. */
const TIMEOUT_MS = 6000

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  // Every screen that reads the catalogue is behind a session, so this is a bug
  // rather than a state to render — and it must not be mistaken for a dish that
  // does not exist.
  if (!token) throw new Error('the catalogue needs a signed-in user')
  return token
}

export async function catalogueGet<T>(
  path: '/search' | '/food',
  params: Record<string, string | number>,
): Promise<T> {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  )
  const token = await accessToken()

  // `AbortSignal.timeout` rather than a manual controller: the whole point is
  // that a hung request becomes an error state rather than a spinner, and the
  // shorter spelling is harder to get wrong.
  const res = await fetch(`${env.EXPO_PUBLIC_CATALOGUE_URL}${path}?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!res.ok) {
    // The status, because the three that can happen mean different things to
    // whoever reads the log: 401 is a token the Worker would not take, 429 is
    // the rate limit, 500 is D1.
    throw new Error(`catalogue ${path} failed (${res.status})`)
  }

  const body = (await res.json()) as { ok: boolean } & T
  if (!body.ok) throw new Error(`catalogue ${path} refused`)
  return body
}
