/**
 * Where a scanned meal was eaten (README: Meal locations), as the app sends it
 * beside a photo or a typed meal: the phone's own fix named by its geocoder,
 * or a place it picked from Apple Maps search. The cascade writes it onto every
 * entry the scan becomes.
 *
 * Read defensively and never trusted to be whole. A build older than this
 * field sends none, a malformed one is dropped rather than failing the scan
 * (a meal is worth more than its address), and the row's own check constraint
 * would refuse a point without a name.
 */

/** The six `food_logs` columns a location fills. */
export type LocationColumns = {
  latitude: number
  longitude: number
  location_name: string
  location_address: string | null
  location_id: string | null
  location_category: string | null
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, max) : null
}

export function readLocation(raw: unknown): LocationColumns | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Record<string, unknown>
  const { latitude, longitude } = body
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  const name = text(body.name, 200)
  if (!name) return null
  return {
    latitude,
    longitude,
    location_name: name,
    location_address: text(body.address, 300),
    location_id: text(body.placeId, 200),
    location_category: text(body.category, 64),
  }
}
