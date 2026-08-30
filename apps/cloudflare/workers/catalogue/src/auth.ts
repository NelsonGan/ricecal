/**
 * Who is asking, and are they allowed to. Two kinds of caller, authenticated
 * completely differently.
 *
 * A Supabase edge function carries a shared secret: our own server, needing every
 * route including the write, settled by a constant-time compare.
 *
 * The app carries the signed-in user's Supabase JWT and reads the catalogue
 * directly. That used to be impossible, since a secret shipped in a phone is not
 * a secret, so every search went phone to edge function to here.
 *
 * What makes it possible is that the project signs its tokens asymmetrically:
 * Supabase publishes an ES256 public key, so this Worker checks a signature while
 * holding nothing that could forge one. On the legacy HS256 setup the verifying
 * and signing keys are the same string.
 *
 * It does not ask Supabase whether the user still exists, so a token stays good
 * until it expires even if the account was deleted. That is the trade for the
 * round trip removed, and why only the read routes accept one.
 */

/** The claims worth reading off a verified token. */
export type User = { id: string }

type Jwk = JsonWebKey & { kid?: string; alg?: string }

/**
 * The published keys, and when we last asked for them.
 *
 * Module scope, so it survives between requests in the same isolate and most
 * lookups cost nothing. Ten minutes is short enough that a rotation is picked
 * up on its own and long enough that a busy isolate is not refetching.
 */
let cache: { keys: Jwk[]; at: number } | null = null

const JWKS_TTL_MS = 10 * 60_000

/**
 * The floor on refetching after an unknown `kid`.
 *
 * A rotation publishes a new key id, and the cached set will not have it, so an
 * unknown kid is a reason to look again rather than to reject. Left unbounded
 * that is also a free way to make this Worker hammer Supabase Auth: send a token
 * with a made-up kid, get a fetch, repeat. So an unknown kid may force a refetch
 * at most this often.
 */
const REFETCH_FLOOR_MS = 30_000
let lastFetchAttempt = 0

/** Small allowance for clock drift between Supabase's signer and this edge. */
const CLOCK_SKEW_S = 30

function bytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function jsonPart(b64url: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(bytes(b64url)))
  } catch {
    return null
  }
}

async function keys(supabaseUrl: string, force: boolean): Promise<Jwk[]> {
  const fresh = cache && Date.now() - cache.at < JWKS_TTL_MS
  if (fresh && !force) return cache?.keys ?? []
  if (force && Date.now() - lastFetchAttempt < REFETCH_FLOOR_MS) return cache?.keys ?? []

  lastFetchAttempt = Date.now()
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, {
      // Cloudflare's own cache in front of a document that changes on rotation
      // only. Saves the round trip when an isolate starts cold, which on a
      // Worker is often.
      cf: { cacheTtl: 600, cacheEverything: true },
    })
    if (!res.ok) {
      console.error('jwks', res.status)
      return cache?.keys ?? []
    }
    const body = (await res.json()) as { keys?: Jwk[] }
    cache = { keys: body.keys ?? [], at: Date.now() }
    return cache.keys
  } catch (error) {
    console.error('jwks', error)
    // The cached set, even if stale. A blip at Supabase Auth must not sign
    // every user out of search.
    return cache?.keys ?? []
  }
}

/**
 * A verified user, or null.
 *
 * Null covers every way this can fail: no header, a malformed token, an algorithm
 * we do not accept, a bad signature, an expired or misaddressed token. The caller
 * answers all of them with the same 401, because telling an unauthenticated
 * caller which part of their token we disliked is help they have not earned.
 */
export async function verifyUser(token: string, supabaseUrl: string): Promise<User | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [rawHeader, rawPayload, rawSignature] = parts

  const header = jsonPart(rawHeader)
  const payload = jsonPart(rawPayload)
  if (!header || !payload) return null

  /**
   * ES256 and nothing else, checked before a key is chosen.
   *
   * This is the line that matters most in the file. `alg` comes out of the token,
   * which is to say out of the caller, so a verifier that trusts it accepts
   * `{"alg":"none"}` with no signature at all, and accepts HS256 with the public
   * key used as an HMAC secret, which is a public string. Both are the classic JWT
   * forgeries and both are one missing check away.
   */
  if (header.alg !== 'ES256') return null

  const kid = typeof header.kid === 'string' ? header.kid : null
  if (!kid) return null

  let jwk = (await keys(supabaseUrl, false)).find((k) => k.kid === kid)
  // Not a key we know: possibly a rotation, so look once more before refusing.
  if (!jwk) jwk = (await keys(supabaseUrl, true)).find((k) => k.kid === kid)
  if (!jwk) return null

  let ok = false
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      bytes(rawSignature),
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
    )
  } catch (error) {
    console.error('verify', error)
    return null
  }
  if (!ok) return null

  // The signature only says Supabase wrote this. These say it was written for
  // us, for a signed-in user, and recently.
  const now = Math.floor(Date.now() / 1000)
  const exp = typeof payload.exp === 'number' ? payload.exp : 0
  if (exp + CLOCK_SKEW_S < now) return null
  if (payload.aud !== 'authenticated') return null
  if (payload.iss !== `${supabaseUrl}/auth/v1`) return null

  const sub = typeof payload.sub === 'string' ? payload.sub : ''
  return sub ? { id: sub } : null
}
