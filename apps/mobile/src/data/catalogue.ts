import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

/**
 * The catalogue, reached directly. The Worker verifies the user's own Supabase
 * JWT against the public key the project publishes, so the phone holds no secret
 * and the hop is gone. See `workers/catalogue/src/auth.ts`.
 *
 * Two things to get right. A fresh token: `getSession()` refreshes one close to
 * expiring, where reading it off a stored session hands the Worker something it
 * will correctly refuse.
 *
 * And unreachable is not empty. This throws for anything that is not a clean
 * answer, so the search panel says something went wrong: returning `[]` for a
 * Worker that is down tells somebody their dish does not exist.
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
