/**
 * Place search for meal locations (README: The places Worker), at
 * places.ricecal.app:
 *
 *   POST /search   { query, latitude?, longitude?, language? }
 *   POST /reverse  { latitude, longitude, language? }
 *   POST /nearby   { latitude, longitude, language? }   places to eat around a spot
 *
 * Both answer `{ places: PlaceResult[] }` from the Apple Maps Server API
 * (places.ts). Money2Time's places Worker is the model; what differs is who
 * may ask. Money2Time works signed out and signs requests with a key shipped in
 * the app. Every RiceCal user is signed in, so this takes the same Supabase
 * JWT the catalogue Worker does and verifies it the same way (the catalogue's
 * own `auth.ts`, imported rather than copied: two verifiers would drift).
 *
 * An edge-cache hit answers without touching anybody's daily allowance or
 * Apple; a miss checks the allowance, asks Apple, then counts one use and
 * caches the answer. Neither the query nor a coordinate is ever logged:
 * together they say where somebody eats.
 */

import { verifyUser } from '../../catalogue/src/auth.ts'
import {
  appleGet,
  nearbyPath,
  type PlaceResult,
  type PlacesEnv,
  PlacesError,
  parseReverseRequest,
  parseSearchRequest,
  readCachedPlaces,
  reversePath,
  searchPath,
  toPlaceResults,
  writeCachedPlaces,
} from './places.ts'
import {
  addressSubject,
  checkQuota,
  consumeQuota,
  pruneExpired,
  type QuotaEnv,
  type QuotaSubjects,
} from './quota.ts'

export interface Env extends PlacesEnv, QuotaEnv {
  /** Which project's JWTs to accept (wrangler.jsonc). */
  SUPABASE_URL: string
  /** Searches per user per minute. Optional so tests and `wrangler dev` without it still run. */
  PLACES_RL?: RateLimit
}

/** A request is a query and a point: anything bigger is refused unread. */
const MAX_BODY_BYTES = 4096

type Kind = 'search' | 'reverse' | 'nearby'
const ROUTES: Record<string, Kind> = {
  '/search': 'search',
  '/reverse': 'reverse',
  '/nearby': 'nearby',
}

/** One JSON line per event, for Workers Logs. Never a query or a coordinate. */
function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...data }))
}
function logError(event: string, data: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...data }))
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const kind = ROUTES[new URL(request.url).pathname]
    if (request.method !== 'POST' || !kind) return json({ error: 'not_found' }, 404)

    const auth = request.headers.get('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const user = token ? await verifyUser(token, env.SUPABASE_URL) : null
    if (!user) return json({ error: 'unauthorized' }, 401)

    if (env.PLACES_RL && !(await env.PLACES_RL.limit({ key: user.id })).success) {
      return json({ error: 'rate_limited' }, 429)
    }
    return handlePlaces(request, env, ctx, kind, user.id)
  },

  // D1 has no TTL, so the daily cron drops the counters of days that are over.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      pruneExpired(env, new Date())
        .then(() => log('prune_expired', {}))
        .catch((err) =>
          logError('prune_failed', { error: err instanceof Error ? err.message : String(err) }),
        ),
    )
  },
}

async function handlePlaces(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  kind: Kind,
  userId: string,
): Promise<Response> {
  const reqId = crypto.randomUUID()
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json({ error: 'too_large' }, 413)
  }
  let raw: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413)
    raw = JSON.parse(text)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  let path: string
  if (kind === 'search') {
    const parsed = parseSearchRequest(raw)
    if ('error' in parsed) return badRequest(reqId, kind, parsed.error)
    path = searchPath(parsed)
  } else {
    const parsed = parseReverseRequest(raw)
    if ('error' in parsed) return badRequest(reqId, kind, parsed.error)
    path = kind === 'nearby' ? nearbyPath(parsed) : reversePath(parsed)
  }

  const cached = await readCachedPlaces(path)
  if (cached) return json({ places: cached }, 200)

  const now = new Date()
  const subjects: QuotaSubjects = {
    user: userId,
    address: await addressSubject(request.headers.get('cf-connecting-ip') ?? 'unknown', now),
  }
  let quota: Awaited<ReturnType<typeof checkQuota>>
  try {
    quota = await checkQuota(subjects, env, now)
  } catch (err) {
    // The database is down: answer an error rather than throw, and never ask
    // Apple without the allowance checked.
    logError('quota_failed', { reqId, error: err instanceof Error ? err.message : String(err) })
    return json({ error: 'upstream' }, 503)
  }
  if (!quota.allowed) {
    log('limit_reached', { reqId, by: quota.reachedBy })
    return json({ error: 'limit_reached' }, 429)
  }

  let places: PlaceResult[]
  try {
    places = toPlaceResults(await appleGet(env, path, now.getTime()))
  } catch (err) {
    const error = err instanceof PlacesError ? err : new PlacesError('upstream', 502)
    logError('apple_failed', { reqId, kind, error: error.code })
    return json({ error: error.code }, error.status)
  }
  ctx.waitUntil(
    Promise.all([
      consumeQuota(subjects, env, now).catch(() => undefined),
      writeCachedPlaces(path, places),
    ]),
  )
  log('places_ok', { reqId, kind, results: places.length })
  return json({ places }, 200)
}

function badRequest(reqId: string, kind: Kind, error: string): Response {
  logError('bad_request', { reqId, kind, error })
  return json({ error }, 400)
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
