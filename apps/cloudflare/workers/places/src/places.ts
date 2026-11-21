// Apple Maps Server API for place search (README: The places Worker): POST
// /search (text search biased toward the user), POST /reverse (coordinates
// to the place there) and POST /nearby (food places around a spot), see
// index.ts for the routes. Ported from Money2Time's
// places Worker, which proxies the same API for transaction locations.
//
// The Apple key never leaves the Worker: it signs a short-lived Maps auth
// token (ES256), trades it at /v1/token for a 30-minute access token, and
// keeps that per isolate. Answers are cached at the edge by the normalized
// request, with coordinates rounded first, so a repeated search is free and
// Apple never sees the user's exact position from a search. Apple allows a
// shared 25,000 calls a day, so each user and each address also has a daily
// allowance (quota.ts) that a cache hit does not use. The per-minute limit per
// user (`PLACES_RL`, in index.ts) counts every request, cached or not.

export interface PlacesEnv {
  // The .p8 of the team's Maps key (Maps enabled), PEM text.
  APPLE_MAPS_PRIVATE_KEY?: string
  APPLE_MAPS_KEY_ID?: string
  APPLE_TEAM_ID?: string
}

/** One place, as the app stores it on a meal. */
export interface PlaceResult {
  /** Apple's place id, when Apple has one (a point of interest). */
  id: string | null
  name: string
  /** Street address without the place name or country, one line. */
  address: string
  latitude: number
  longitude: number
  /** Apple's PoiCategory (e.g. "Cafe"), when the place is one. */
  category: string | null
  countryCode: string | null
}

export interface SearchRequest {
  query: string
  latitude: number | null
  longitude: number | null
  language: string | null
}

export interface ReverseRequest {
  latitude: number
  longitude: number
  language: string | null
}

const APPLE_MAPS_ORIGIN = 'https://maps-api.apple.com'
const MAX_QUERY_LENGTH = 120
const MAX_RESULTS = 12
// Search bias rounds to 2 decimals (about 1 km): enough to rank nearby places
// first, coarse enough that neighbours share cache entries. A reverse lookup
// needs the spot itself, so 4 decimals (about 11 m).
const SEARCH_COORD_DECIMALS = 2
const REVERSE_COORD_DECIMALS = 4
// How long an answer stays in the edge cache. Places rarely move; a day keeps
// popular searches free without serving stale results for long.
const CACHE_TTL_SECONDS = 24 * 60 * 60
// Mint a fresh access token this long before Apple's expiry.
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000
const APPLE_TIMEOUT_MS = 8000
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/

let cachedAccessToken: { token: string; expiresAt: number; keyId: string } | null = null
// The token request in flight: searches that arrive together on a cold
// isolate (or as the token expires) share one call to Apple's /v1/token.
let pendingAccessToken: Promise<string> | null = null

/** Test hook: forget the cached Apple access token. */
export function resetAppleTokenCache(): void {
  cachedAccessToken = null
  pendingAccessToken = null
}

// Fields assigned by hand rather than as parameter properties, which Node's
// type stripping refuses, and the tests run this file under plain Node.
export class PlacesError extends Error {
  readonly code: 'not_configured' | 'capacity' | 'upstream'
  readonly status: number
  constructor(code: 'not_configured' | 'capacity' | 'upstream', status: number) {
    super(code)
    this.code = code
    this.status = status
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    isFiniteNumber(latitude) &&
    isFiniteNumber(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

function normalizeLanguage(value: unknown): string | null {
  return typeof value === 'string' && LANGUAGE_PATTERN.test(value) ? value : null
}

export function parseSearchRequest(raw: unknown): SearchRequest | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'invalid_body' }
  const body = raw as Record<string, unknown>
  const query = typeof body.query === 'string' ? body.query.replace(/\s+/g, ' ').trim() : ''
  if (query.length < 2) return { error: 'query_too_short' }
  if (query.length > MAX_QUERY_LENGTH) return { error: 'query_too_long' }
  const hasLocation = body.latitude != null || body.longitude != null
  if (hasLocation && !validCoordinate(body.latitude, body.longitude)) {
    return { error: 'invalid_location' }
  }
  return {
    query,
    latitude: hasLocation ? (body.latitude as number) : null,
    longitude: hasLocation ? (body.longitude as number) : null,
    language: normalizeLanguage(body.language),
  }
}

export function parseReverseRequest(raw: unknown): ReverseRequest | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'invalid_body' }
  const body = raw as Record<string, unknown>
  if (!validCoordinate(body.latitude, body.longitude)) return { error: 'invalid_location' }
  return {
    latitude: body.latitude as number,
    longitude: body.longitude as number,
    language: normalizeLanguage(body.language),
  }
}

function round(value: number, decimals: number): string {
  // "+ 0" turns -0 into 0, so a point just west of 0° shares a key with 0°.
  return (Number(value.toFixed(decimals)) + 0).toFixed(decimals)
}

/** The Apple path (and edge-cache key) for a search, coordinates rounded. */
export function searchPath(request: SearchRequest): string {
  const params = new URLSearchParams({ q: request.query.toLowerCase() })
  if (request.latitude != null && request.longitude != null) {
    params.set(
      'searchLocation',
      `${round(request.latitude, SEARCH_COORD_DECIMALS)},${round(request.longitude, SEARCH_COORD_DECIMALS)}`,
    )
  }
  if (request.language) params.set('lang', request.language)
  return `/v1/search?${params.toString()}`
}

export function reversePath(request: ReverseRequest): string {
  const params = new URLSearchParams({
    loc: `${round(request.latitude, REVERSE_COORD_DECIMALS)},${round(request.longitude, REVERSE_COORD_DECIMALS)}`,
  })
  if (request.language) params.set('lang', request.language)
  return `/v1/reverseGeocode?${params.toString()}`
}

/**
 * The places to eat around a spot, for the picker's Nearby list before the
 * user types anything. Apple has no "what is near here" call, so this is a
 * search for food places limited to a small box around the point. Rounded to
 * 3 decimals (about 110 m): neighbours share a cache entry, and it is close
 * enough that the nearest stall still comes first once the app sorts by
 * distance from the phone's own fix.
 */
const NEARBY_COORD_DECIMALS = 3
/** Half the box's side, in degrees: about 1.1 km. */
const NEARBY_HALF_SPAN = 0.01
export const FOOD_POI_CATEGORIES = [
  'Restaurant',
  'Cafe',
  'Bakery',
  'FoodMarket',
  'Brewery',
  'Winery',
  'Distillery',
  'Nightlife',
]

export function nearbyPath(request: ReverseRequest): string {
  const lat = Number(round(request.latitude, NEARBY_COORD_DECIMALS))
  const lng = Number(round(request.longitude, NEARBY_COORD_DECIMALS))
  const point = `${lat.toFixed(NEARBY_COORD_DECIMALS)},${lng.toFixed(NEARBY_COORD_DECIMALS)}`
  // Clamped, so a point by a pole or the antimeridian still asks Apple a box
  // it accepts (a little smaller on that side).
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))
  const box = [
    clamp(lat + NEARBY_HALF_SPAN, 90),
    clamp(lng + NEARBY_HALF_SPAN, 180),
    clamp(lat - NEARBY_HALF_SPAN, 90),
    clamp(lng - NEARBY_HALF_SPAN, 180),
  ]
    .map((value) => value.toFixed(NEARBY_COORD_DECIMALS))
    .join(',')
  const params = new URLSearchParams({
    q: 'food',
    resultTypeFilter: 'Poi',
    includePoiCategories: FOOD_POI_CATEGORIES.join(','),
    // `userLocation` rather than `searchLocation`: Apple refuses a request
    // carrying both a search location and a region.
    userLocation: point,
    searchRegion: box,
    searchRegionPriority: 'required',
  })
  if (request.language) params.set('lang', request.language)
  return `/v1/search?${params.toString()}`
}

interface ApplePlace {
  id?: unknown
  name?: unknown
  coordinate?: { latitude?: unknown; longitude?: unknown }
  formattedAddressLines?: unknown
  country?: unknown
  countryCode?: unknown
  poiCategory?: unknown
}

/**
 * The address under a place's name: Apple's formatted lines (sometimes one
 * string holding newlines), without the name itself or the country, joined
 * with commas.
 */
export function addressOf(place: ApplePlace, name: string): string {
  const raw = Array.isArray(place.formattedAddressLines) ? place.formattedAddressLines : []
  const country = typeof place.country === 'string' ? place.country.trim() : ''
  const lines: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    for (const part of entry.split('\n')) {
      const line = part.trim()
      if (!line || line === name || line === country || lines.includes(line)) continue
      lines.push(line)
    }
  }
  return lines.join(', ').slice(0, 300)
}

export function toPlaceResult(place: ApplePlace): PlaceResult | null {
  const latitude = place.coordinate?.latitude
  const longitude = place.coordinate?.longitude
  if (!validCoordinate(latitude, longitude)) return null
  const name = typeof place.name === 'string' ? place.name.trim().slice(0, 200) : ''
  const address = addressOf(place, name)
  if (!name && !address) return null
  return {
    id: typeof place.id === 'string' && place.id ? place.id : null,
    name: name || address,
    address: name ? address : '',
    latitude: latitude as number,
    longitude: longitude as number,
    category: typeof place.poiCategory === 'string' && place.poiCategory ? place.poiCategory : null,
    countryCode:
      typeof place.countryCode === 'string' && /^[A-Z]{2}$/.test(place.countryCode)
        ? place.countryCode
        : null,
  }
}

export function toPlaceResults(payload: unknown): PlaceResult[] {
  const results = (payload as { results?: unknown } | null)?.results
  if (!Array.isArray(results)) return []
  const out: PlaceResult[] = []
  for (const item of results) {
    const place = toPlaceResult((item ?? {}) as ApplePlace)
    if (place) out.push(place)
    if (out.length >= MAX_RESULTS) break
  }
  return out
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodePkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** The ES256 Maps auth token Apple trades for an access token. */
export async function mapsAuthToken(env: PlacesEnv, nowMs: number): Promise<string> {
  const keyId = env.APPLE_MAPS_KEY_ID?.trim() ?? ''
  const teamId = env.APPLE_TEAM_ID?.trim() ?? ''
  const pem = env.APPLE_MAPS_PRIVATE_KEY ?? ''
  const encoder = new TextEncoder()
  const issuedAt = Math.floor(nowMs / 1000)
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })))
  const claims = base64Url(
    encoder.encode(
      JSON.stringify({ iss: teamId, iat: issuedAt, exp: issuedAt + 600, scope: 'server_api' }),
    ),
  )
  const signingInput = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePkcs8(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // WebCrypto's ECDSA signature is the raw r||s pair that ES256 expects.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput),
  )
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`
}

export function isConfigured(env: PlacesEnv): boolean {
  return Boolean(
    env.APPLE_MAPS_PRIVATE_KEY?.trim() &&
      env.APPLE_MAPS_KEY_ID?.trim() &&
      env.APPLE_TEAM_ID?.trim(),
  )
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), APPLE_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch {
    throw new PlacesError('upstream', 502)
  } finally {
    clearTimeout(timer)
  }
}

async function accessToken(env: PlacesEnv, nowMs: number): Promise<string> {
  const keyId = env.APPLE_MAPS_KEY_ID?.trim() ?? ''
  if (
    cachedAccessToken &&
    cachedAccessToken.keyId === keyId &&
    cachedAccessToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > nowMs
  ) {
    return cachedAccessToken.token
  }
  pendingAccessToken ??= mintAccessToken(env, nowMs, keyId).finally(() => {
    pendingAccessToken = null
  })
  return pendingAccessToken
}

async function mintAccessToken(env: PlacesEnv, nowMs: number, keyId: string): Promise<string> {
  const authToken = await mapsAuthToken(env, nowMs)
  const response = await fetchWithTimeout(`${APPLE_MAPS_ORIGIN}/v1/token`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
  if (response.status === 429) throw new PlacesError('capacity', 503)
  if (!response.ok) throw new PlacesError('upstream', 502)
  const body = (await response.json()) as { accessToken?: unknown; expiresInSeconds?: unknown }
  if (typeof body.accessToken !== 'string' || !body.accessToken) {
    throw new PlacesError('upstream', 502)
  }
  const lifetime = isFiniteNumber(body.expiresInSeconds) ? body.expiresInSeconds : 1800
  cachedAccessToken = { token: body.accessToken, expiresAt: nowMs + lifetime * 1000, keyId }
  return body.accessToken
}

/**
 * GET an Apple Maps path with a valid access token. A 401 means the cached
 * token went bad early (a revoked key, a clock jump): mint one more and retry
 * once. Apple's quota answer (429) becomes `capacity`.
 */
export async function appleGet(env: PlacesEnv, path: string, nowMs = Date.now()): Promise<unknown> {
  if (!isConfigured(env)) throw new PlacesError('not_configured', 503)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await accessToken(env, nowMs)
    const response = await fetchWithTimeout(`${APPLE_MAPS_ORIGIN}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (response.status === 401 && attempt === 0) {
      cachedAccessToken = null
      continue
    }
    if (response.status === 429) throw new PlacesError('capacity', 503)
    if (!response.ok) throw new PlacesError('upstream', 502)
    return response.json()
  }
  throw new PlacesError('upstream', 502)
}

/** The synthetic GET request an answer is cached under. */
export function cacheKey(path: string): Request {
  return new Request(`https://places-cache.ricecal.internal${path}`, { method: 'GET' })
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

/** The Workers edge cache, or none outside the Workers runtime (tests, Node). */
export function edgeCache(): EdgeCache | null {
  const store = (globalThis as { caches?: { default?: EdgeCache } }).caches
  return store?.default ?? null
}

export async function readCachedPlaces(path: string): Promise<PlaceResult[] | null> {
  const cache = edgeCache()
  if (!cache) return null
  try {
    const hit = await cache.match(cacheKey(path))
    if (!hit) return null
    const body = (await hit.json()) as { places?: unknown }
    return Array.isArray(body.places) ? (body.places as PlaceResult[]) : null
  } catch {
    return null
  }
}

export async function writeCachedPlaces(path: string, places: PlaceResult[]): Promise<void> {
  const cache = edgeCache()
  if (!cache) return
  try {
    await cache.put(
      cacheKey(path),
      new Response(JSON.stringify({ places }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        },
      }),
    )
  } catch {
    // A cache write that fails only costs a future Apple call.
  }
}
