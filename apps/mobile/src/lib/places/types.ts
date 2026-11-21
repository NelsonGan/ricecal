import type { EntryLocation } from '@/data/types'

/** A place from search or the phone, before it is saved on an entry. */
export type PlaceResult = {
  /** Apple's place id; null for a spot (the current location, a street). */
  id: string | null
  name: string
  /** One-line address without the name or country; may be empty. */
  address: string
  latitude: number
  longitude: number
  /** Apple's PoiCategory ("Restaurant"), or null. */
  category: string | null
}

export type Coordinate = {
  latitude: number
  longitude: number
}

/** The fields a place writes on an entry. */
export function toEntryLocation(place: PlaceResult): EntryLocation {
  const address = place.address.trim()
  return {
    latitude: place.latitude,
    longitude: place.longitude,
    name: place.name.trim() || address,
    ...(address ? { address } : {}),
    ...(place.id ? { placeId: place.id } : {}),
    ...(place.category ? { category: place.category } : {}),
  }
}
