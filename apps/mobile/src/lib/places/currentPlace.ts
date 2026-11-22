/**
 * Where the phone is and what the spot is called, for a new meal's automatic
 * tag (README: Meal locations). The tag is applied by the data layer, after the
 * insert, so a meal never waits on the GPS to be saved. Never asks for
 * permission: the Locations switch and the map screens ask, and only when
 * tapped.
 */

// The data layer imports this module for the tag, so from it only `today`
// (in `client`, which imports nothing back) and types.
import { today } from '@/data/client'
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

type ResolvedPlace = {
  coordinate: Coordinate
  place: PlaceResult
  /** False when neither geocoder named the spot and `place` is "Pinned location". */
  named: boolean
}

type Cached = ResolvedPlace & { at: number; language: string }

/**
 * One fix and its name serve every meal logged within this window, so three
 * drinks logged in a row ask the GPS and the geocoder once.
 */
const REUSE_MS = 90_000
let cached: Cached | null = null
let inFlight: {
  promise: Promise<ResolvedPlace | CurrentPlaceFailure>
  language: string
  remote: boolean
} | null = null

/** A spot neither geocoder could name: kept, with a generic name. */
function pinnedPlace(coordinate: Coordinate): PlaceResult {
  return {
    id: null,
    name: i18n.t('places:pinned'),
    address: '',
    ...coordinate,
    category: null,
  }
}

async function nameSpot(
  coordinate: Coordinate,
  language: string,
  remote: boolean,
): Promise<ResolvedPlace> {
  const named = await describeCoordinate(coordinate, { language, remote })
  // A spot left unnamed only because the Worker was not asked is not kept:
  // the next caller who may ask it should.
  const resolved = { coordinate, place: named ?? pinnedPlace(coordinate), named: Boolean(named) }
  if (named || remote) cached = { ...resolved, at: Date.now(), language }
  return resolved
}

async function locate(
  language: string,
  remote: boolean,
): Promise<ResolvedPlace | CurrentPlaceFailure> {
  try {
    return await nameSpot(await getCurrentCoordinate(), language, remote)
  } catch (error) {
    return failureOf(error)
  }
}

function failureOf(error: unknown): CurrentPlaceFailure {
  const code = error instanceof CurrentLocationError ? error.code : 'no_fix'
  if (code === 'permission') return 'ask'
  if (code === 'services_off') return 'services_off'
  if (code === 'unavailable') return 'unavailable'
  return 'error'
}

/** What to offer instead of a place when permission is not given. */
async function permissionFailure(): Promise<CurrentPlaceFailure | null> {
  const permission = await getLocationPermission()
  if (permission.status === 'unavailable') return 'unavailable'
  if (permission.status !== 'granted') return permission.canAskAgain ? 'ask' : 'blocked'
  return null
}

const stillGood = (entry: Cached | null, language?: string): entry is Cached =>
  entry !== null &&
  (language === undefined || entry.language === language) &&
  Date.now() - entry.at < REUSE_MS

/**
 * The current place, or why there is none. Permission is checked every time,
 * even for a cached fix: access revoked a moment ago means no place.
 */
export async function resolveCurrentPlace({
  fresh = false,
  remote = true,
}: {
  fresh?: boolean
  /** Whether the Worker's Apple lookup may name a spot the phone cannot. */
  remote?: boolean
} = {}): Promise<ResolvedPlace | CurrentPlaceFailure> {
  const failure = await permissionFailure()
  if (failure) return failure
  const language = currentLanguage()
  const reusable = cached
  if (!fresh && stillGood(reusable, language)) return reusable
  // Two callers at once (a meal tagged as its page previews the tag) share a fix,
  // unless a fresh fix was explicitly requested.
  const flight = !fresh && inFlight?.language === language ? inFlight : null
  if (flight && (flight.remote || !remote)) return flight.promise
  if (flight) {
    // The preview never asks the Worker. A save that joins it keeps its fix but
    // may still ask, or it would write "Pinned location" for a spot Apple names.
    return flight.promise.then((found) =>
      typeof found === 'string' || found.named
        ? found
        : nameSpot(found.coordinate, language, true).catch(() => found),
    )
  }
  const promise = locate(language, remote).finally(() => {
    if (inFlight?.promise === promise) inFlight = null
  })
  inFlight = { promise, language, remote }
  return promise
}

/**
 * Only where the phone is, for a map's blue dot and first frame: naming the
 * spot would spend a geocode, and maybe an Apple call, on a name nobody shows.
 */
export async function currentCoordinate({
  fresh = false,
}: {
  fresh?: boolean
} = {}): Promise<Coordinate | CurrentPlaceFailure> {
  const failure = await permissionFailure()
  if (failure) return failure
  const reusable = cached
  if (!fresh && stillGood(reusable)) return reusable.coordinate
  try {
    return await getCurrentCoordinate()
  } catch (error) {
    return failureOf(error)
  }
}

/**
 * Whether a meal logged now for `logDate` should be tagged: Locations and
 * Auto-tag on, and the meal is today's. Synchronous, for a caller deciding
 * whether to start a fix at all (`autoTagLocation` checks it again).
 */
export function autoTagWanted(userId: string, logDate: string): boolean {
  return locationsEnabled(userId) && autoTagEnabled(userId) && logDate === today()
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
  {
    preview = false,
  }: {
    /**
     * For a screen showing the tag before anything is saved: the phone's own
     * geocoder only, so browsing dishes never spends Apple calls, and nothing
     * when it cannot name the spot (the save then tags the row itself).
     */
    preview?: boolean
  } = {},
): Promise<EntryLocation | null> {
  if (!autoTagWanted(userId, logDate)) return null
  try {
    const resolved = await resolveCurrentPlace({ remote: !preview })
    if (typeof resolved === 'string') return null
    if (preview && !resolved.named) return null
    return toEntryLocation(resolved.place)
  } catch {
    return null
  }
}
