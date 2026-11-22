/**
 * Place search for meal locations (README: Meal locations), through the
 * places Worker (README: The places Worker), which proxies the Apple Maps
 * Server API with Apple's key kept on the Worker. Signed in like the
 * catalogue: the user's own Supabase JWT, verified there against the
 * project's public key.
 */

import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

import type { PlaceResult } from './types'

type PlaceSearchErrorCode =
  | 'not_available'
  | 'limit_reached'
  | 'rate_limited'
  | 'busy'
  | 'network'
  | 'server'

export class PlaceSearchError extends Error {
  readonly code: PlaceSearchErrorCode
  constructor(code: PlaceSearchErrorCode, message: string) {
    super(message)
    this.name = 'PlaceSearchError'
    this.code = code
  }
}

/**
 * Apple answers within a second or two; a hung request should give way to the
 * user typing again rather than spin.
 */
const TIMEOUT_MS = 10_000

const DEFAULT_BASE_URL = 'https://places.ricecal.app'

function baseUrl(): string {
  return (env.EXPO_PUBLIC_PLACES_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

/**
 * Apple takes BCP 47 tags, which the app's language codes already are, bar
 * Filipino ("fil") which Apple names "tl".
 */
export function appleLanguage(language: string | null | undefined): string | null {
  if (!language) return null
  if (language === 'fil') return 'tl'
  return /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(language) ? language : null
}

function isPlaceResult(value: unknown): value is PlaceResult {
  if (!value || typeof value !== 'object') return false
  const place = value as Record<string, unknown>
  return (
    typeof place.name === 'string' &&
    place.name.trim().length > 0 &&
    typeof place.latitude === 'number' &&
    typeof place.longitude === 'number' &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    place.latitude >= -90 &&
    place.latitude <= 90 &&
    place.longitude >= -180 &&
    place.longitude <= 180
  )
}

async function post(
  path: '/search' | '/reverse' | '/nearby',
  body: object,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  if (signal?.aborted) throw new PlaceSearchError('network', 'aborted')
  let token: string | undefined
  try {
    token = (await supabase.auth.getSession()).data.session?.access_token
  } catch {
    token = undefined
  }
  if (!token) throw new PlaceSearchError('network', 'no session')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort, { once: true })
  if (signal?.aborted) controller.abort()

  let response: Response
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    throw new PlaceSearchError('network', error instanceof Error ? error.message : 'network')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }

  let payload: { places?: unknown; error?: string } = {}
  try {
    payload = (await response.json()) as typeof payload
  } catch {
    // Fall through to the status.
  }
  if (!response.ok) {
    if (payload.error === 'limit_reached') throw new PlaceSearchError('limit_reached', 'limit')
    if (payload.error === 'capacity') throw new PlaceSearchError('busy', 'capacity')
    if (payload.error === 'not_configured') throw new PlaceSearchError('not_available', 'off')
    if (response.status === 429) throw new PlaceSearchError('rate_limited', 'rate limited')
    throw new PlaceSearchError('server', payload.error ?? `places ${path} (${response.status})`)
  }
  const places = Array.isArray(payload.places) ? payload.places : []
  return places.filter(isPlaceResult).map((place) => ({
    id: typeof place.id === 'string' && place.id ? place.id : null,
    name: place.name,
    address: typeof place.address === 'string' ? place.address : '',
    latitude: place.latitude,
    longitude: place.longitude,
    category: typeof place.category === 'string' && place.category ? place.category : null,
  }))
}

export function searchPlaces({
  query,
  near,
  language,
  signal,
}: {
  query: string
  /** Ranks places near here first; the Worker rounds it and never stores it. */
  near?: { latitude: number; longitude: number } | null
  language?: string | null
  signal?: AbortSignal
}): Promise<PlaceResult[]> {
  return post(
    '/search',
    {
      query: query.trim(),
      ...(near ? { latitude: near.latitude, longitude: near.longitude } : {}),
      language: appleLanguage(language),
    },
    signal,
  )
}

type AroundSpot = {
  latitude: number
  longitude: number
  language?: string | null
  signal?: AbortSignal
}

function around(path: '/reverse' | '/nearby', spot: AroundSpot): Promise<PlaceResult[]> {
  return post(
    path,
    {
      latitude: spot.latitude,
      longitude: spot.longitude,
      language: appleLanguage(spot.language),
    },
    spot.signal,
  )
}

export async function reverseGeocodePlace(spot: AroundSpot): Promise<PlaceResult | null> {
  return (await around('/reverse', spot))[0] ?? null
}

/**
 * Places to eat around a spot, for the picker's Nearby list before anything is
 * typed. The Worker rounds the spot to about 110 m before Apple sees it.
 */
export function nearbyPlaces(spot: AroundSpot): Promise<PlaceResult[]> {
  return around('/nearby', spot)
}
