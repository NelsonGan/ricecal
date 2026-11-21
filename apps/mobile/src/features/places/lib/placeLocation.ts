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
    countryCode: null,
  }
}

export function isLocated(entry: Entry): entry is LocatedEntry {
  return Boolean(entry.location)
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

/**
 * The places the user tagged before, most recent first, one per place. With
 * `near`, the ones within `nearRadiusMeters` come first, closest first, so the
 * picker offers "where I usually eat around here" without a search.
 */
export function recentPlaces(
  entries: readonly Entry[],
  {
    limit = 8,
    near = null,
    nearRadiusMeters = 2000,
  }: { limit?: number; near?: Coordinate | null; nearRadiusMeters?: number } = {},
): PlaceResult[] {
  const byKey = new Map<string, { place: PlaceResult; at: string }>()
  for (const entry of entries) {
    if (!entry.location) continue
    const place = placeOfLocation(entry.location)
    const key = placeKey(place)
    const seen = byKey.get(key)
    if (!seen || entry.loggedAt > seen.at) byKey.set(key, { place, at: entry.loggedAt })
  }
  const all = [...byKey.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  if (!near) return all.slice(0, limit).map((item) => item.place)
  const measured = all.map((item) => ({ ...item, distance: distanceMeters(near, item.place) }))
  const nearby = measured
    .filter((item) => item.distance <= nearRadiusMeters)
    .sort((a, b) => a.distance - b.distance)
  const rest = measured.filter((item) => item.distance > nearRadiusMeters)
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
  for (const entry of entries) {
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
  const out = [...groups.values()]
  for (const group of out) {
    group.entries.sort(newestFirst)
    // The newest visit names the place, so a stall that changed its name shows
    // the new one.
    const newest = group.entries[0]
    if (newest) {
      group.name = newest.location.name
      group.address = newest.location.address ?? null
      group.category = newest.location.category ?? null
    }
  }
  // Busiest first; between two as busy, the one visited last.
  return out.sort((a, b) => {
    const visits = b.entries.length - a.entries.length
    if (visits !== 0) return visits
    const [aLast, bLast] = [a.entries[0]?.loggedAt ?? '', b.entries[0]?.loggedAt ?? '']
    return aLast < bLast ? 1 : aLast > bLast ? -1 : 0
  })
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

/** The smallest box around the points, padded, for a map's first frame. */
export function regionFor(
  points: readonly Coordinate[],
  { padding = 1.4, minDelta = 0.01 }: { padding?: number; minDelta?: number } = {},
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null {
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
