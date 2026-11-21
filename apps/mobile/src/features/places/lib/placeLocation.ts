/**
 * Pure helpers for meal locations (README: Meal locations): a place into an
 * entry's location and back, distances, the user's recent places, and a
 * period's entries grouped by place for the food map. Ported from Money2Time's
 * `placeLocation.ts`, with entries in place of transactions.
 */

import type { Entry, EntryLocation, LocatedEntry } from '@/data'

import { type Coordinate, type PlaceResult, toEntryLocation } from '@/lib/places'

export { toEntryLocation }

/** An entry's saved location as a place, for the picker's lists. */
export function placeOfLocation(location: EntryLocation): PlaceResult {
  return {
    id: location.placeId ?? null,
    name: location.name,
    address: location.address ?? '',
    latitude: location.latitude,
    longitude: location.longitude,
    category: location.category ?? null,
  }
}

const EARTH_RADIUS_M = 6371008.8
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/** Great-circle distance in metres. */
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLng = toRadians(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "40 m", "850 m", "1.1 km", "12 km", digits in the given locale. */
export function formatDistance(meters: number, locale?: string): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters < 1000) {
    const rounded = Math.max(10, Math.round(meters / 10) * 10)
    return `${new Intl.NumberFormat(locale).format(rounded)} m`
  }
  const km = meters / 1000
  const digits = km < 10 ? 1 : 0
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(km)} km`
}

/**
 * Which entries share a place: Apple's id when it has one, else the name at
 * the point rounded to about 11 m. Two visits to one stall are one place; a
 * different name next door is another.
 */
export function placeKey(
  place: Pick<PlaceResult, 'id' | 'name' | 'latitude' | 'longitude'>,
): string {
  if (place.id) return `id:${place.id}`
  const name = place.name.trim().toLowerCase()
  return `pt:${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}:${name}`
}

export function locationKey(location: EntryLocation): string {
  return placeKey(placeOfLocation(location))
}

/** `logged_at` order, newest first, as ISO instants sort. */
const newestFirst = (a: Entry, b: Entry) =>
  a.loggedAt < b.loggedAt ? 1 : a.loggedAt > b.loggedAt ? -1 : 0

/** How far "around here" reaches for the picker's recent places. */
const NEAR_RADIUS_M = 2000

/** The places the user tagged before, one per place, most recent first. */
export function knownPlaces(entries: readonly Entry[]): PlaceResult[] {
  const byKey = new Map<string, PlaceResult>()
  // Newest first, so the first entry seen per place is its latest name.
  for (const entry of [...entries].sort(newestFirst)) {
    if (!entry.location) continue
    const place = placeOfLocation(entry.location)
    const key = placeKey(place)
    if (!byKey.has(key)) byKey.set(key, place)
  }
  return [...byKey.values()]
}

/**
 * The first `limit` places, the ones within 2 km of `near` first, closest
 * first, so the picker offers "where I usually eat around here" without a
 * search.
 */
export function nearFirst(
  places: readonly PlaceResult[],
  near: Coordinate | null,
  limit: number,
): PlaceResult[] {
  if (!near) return places.slice(0, limit)
  const measured = places.map((place) => ({ place, distance: distanceMeters(near, place) }))
  const nearby = measured
    .filter((item) => item.distance <= NEAR_RADIUS_M)
    .sort((a, b) => a.distance - b.distance)
  const rest = measured.filter((item) => item.distance > NEAR_RADIUS_M)
  return [...nearby, ...rest].slice(0, limit).map((item) => item.place)
}

export type PlaceGroup = {
  key: string
  name: string
  address: string | null
  category: string | null
  latitude: number
  longitude: number
  /** Newest first. */
  entries: LocatedEntry[]
  kcal: number
}

/** A period's located entries, one group per place, busiest place first. */
export function groupByPlace(entries: readonly LocatedEntry[]): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>()
  // Newest first: each group's first entry is then its newest, which names the
  // place, so a stall that changed its name shows the new one.
  for (const entry of [...entries].sort(newestFirst)) {
    const key = locationKey(entry.location)
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        name: entry.location.name,
        address: entry.location.address ?? null,
        category: entry.location.category ?? null,
        latitude: entry.location.latitude,
        longitude: entry.location.longitude,
        entries: [],
        kcal: 0,
      }
      groups.set(key, group)
    }
    group.entries.push(entry)
    group.kcal += entry.macros.kcal
  }
  // Busiest first; between two as busy, the one visited last.
  return [...groups.values()].sort(
    (a, b) =>
      b.entries.length - a.entries.length ||
      newestFirst(a.entries[0] as Entry, b.entries[0] as Entry),
  )
}

/**
 * The picture a place's pin wears: its newest entry with a photo, else its
 * newest entry with a drawing, else its newest entry.
 */
export function coverEntry(entries: readonly LocatedEntry[]): LocatedEntry | undefined {
  return (
    entries.find((entry) => entry.photoPath) ?? entries.find((entry) => entry.icon) ?? entries[0]
  )
}

export type MapRegion = {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

/** Where a map opens with nothing to show: Kuala Lumpur. */
export const HOME_COORDINATE: Coordinate = { latitude: 3.139, longitude: 101.6869 }

/** About a street's width across: close enough to tell two stalls apart. */
const STREET_DELTA = 0.006

/** A square region around one point. */
export function regionAround(point: Coordinate, delta = STREET_DELTA): MapRegion {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  }
}

/** The smallest box around the points, padded, for a map's first frame. */
export function regionFor(
  points: readonly Coordinate[],
  { padding = 1.4, minDelta = 0.01 }: { padding?: number; minDelta?: number } = {},
): MapRegion | null {
  if (points.length === 0) return null
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let minLng = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude)
    maxLat = Math.max(maxLat, point.latitude)
    minLng = Math.min(minLng, point.longitude)
    maxLng = Math.max(maxLng, point.longitude)
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.min(170, Math.max(minDelta, (maxLat - minLat) * padding)),
    longitudeDelta: Math.min(360, Math.max(minDelta, (maxLng - minLng) * padding)),
  }
}
