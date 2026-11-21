/**
 * Where the phone is and what the spot is called, shared by the picker's
 * "Current location" row and a new meal's automatic tag (README: Meal
 * locations). The tag is applied by the data layer, after the insert, so a
 * meal never waits on the GPS to be saved. Never asks for permission: the Locations switch and the
 * picker's own row ask, and only when tapped.
 */

import { format } from 'date-fns/format'

// Types only from the data layer, which imports this module for the tag.
import type { EntryLocation } from '@/data/types'
import i18n, { currentLanguage } from '@/i18n'
import {
  CurrentLocationError,
  describeCoordinate,
  getCurrentCoordinate,
  getLocationPermission,
} from './deviceLocation'
import { autoTagEnabled, locationsEnabled } from './preference'
import { type Coordinate, type PlaceResult, toEntryLocation } from './types'

export type CurrentPlaceFailure = 'ask' | 'blocked' | 'services_off' | 'unavailable' | 'error'

export type ResolvedPlace = { coordinate: Coordinate; place: PlaceResult }

type Cached = ResolvedPlace & { at: number; language: string }

/**
 * One fix and its name serve every meal logged within this window, so three
 * drinks logged in a row ask the GPS and the geocoder once.
 */
const REUSE_MS = 90_000
let cached: Cached | null = null
let inFlight: Promise<ResolvedPlace | CurrentPlaceFailure> | null = null

/** A spot neither geocoder could name: kept, with a generic name. */
function pinnedPlace(coordinate: Coordinate): PlaceResult {
  return {
    id: null,
    name: i18n.t('places:pinned'),
    address: '',
    ...coordinate,
    category: null,
    countryCode: null,
  }
}

async function locate(language: string): Promise<ResolvedPlace | CurrentPlaceFailure> {
  try {
    const coordinate = await getCurrentCoordinate()
    const place = (await describeCoordinate(coordinate, { language })) ?? pinnedPlace(coordinate)
    cached = { coordinate, place, at: Date.now(), language }
    return { coordinate, place }
  } catch (error) {
    const code = error instanceof CurrentLocationError ? error.code : 'no_fix'
    if (code === 'permission') return 'ask'
    if (code === 'services_off') return 'services_off'
    if (code === 'unavailable') return 'unavailable'
    return 'error'
  }
}

/**
 * The current place, or why there is none. Permission is checked every time,
 * even for a cached fix: access revoked a moment ago means no place.
 */
export async function resolveCurrentPlace({
  fresh = false,
}: {
  fresh?: boolean
} = {}): Promise<ResolvedPlace | CurrentPlaceFailure> {
  const permission = await getLocationPermission()
  if (permission.status === 'unavailable') return 'unavailable'
  if (permission.status !== 'granted') return permission.canAskAgain ? 'ask' : 'blocked'
  const language = currentLanguage()
  const reusable = cached
  if (!fresh && reusable && reusable.language === language && Date.now() - reusable.at < REUSE_MS) {
    return { coordinate: reusable.coordinate, place: reusable.place }
  }
  // Two callers at once (the picker opening as a meal is tagged) share a fix.
  inFlight ??= locate(language).finally(() => {
    inFlight = null
  })
  return inFlight
}

/**
 * Whether a meal logged now for `logDate` should be tagged: Locations and
 * Auto-tag on, and the meal is today's. Synchronous, for a caller deciding
 * whether to start a fix at all (`autoTagLocation` checks it again).
 */
export function autoTagWanted(userId: string, logDate: string): boolean {
  return (
    locationsEnabled(userId) &&
    autoTagEnabled(userId) &&
    logDate === format(new Date(), 'yyyy-MM-dd')
  )
}

/**
 * The location a new meal is tagged with, or null: only with Locations and
 * Auto-tag on, only for a meal logged for today (a backdated lunch was not
 * eaten where the phone is now), and only with permission already given.
 * Never throws; a meal outranks its address.
 */
export async function autoTagLocation(
  userId: string,
  logDate: string,
): Promise<EntryLocation | null> {
  if (!autoTagWanted(userId, logDate)) return null
  try {
    const resolved = await resolveCurrentPlace()
    return typeof resolved === 'string' ? null : toEntryLocation(resolved.place)
  } catch {
    return null
  }
}

/** Test hook. */
export function forgetCurrentPlace(): void {
  cached = null
  inFlight = null
}
