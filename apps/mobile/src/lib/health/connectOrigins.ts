/**
 * Whose numbers the app shows, when several apps wrote the same thing.
 *
 * Health Connect dedupes by a priority list the user owns: they can reorder it
 * and remove sources from it, and a removed source goes on writing while no
 * longer being deduped against. A Samsung user's diary read 4,675 steps against
 * Samsung Health's 2,808 for the same day, because Samsung Health writes one
 * record for the whole day and a second stream wrote the same walk in segments.
 *
 * So RiceCal chooses instead: it reads which origins actually wrote, picks one
 * by the order below, and asks again with `dataOriginFilter` set to it.
 *
 * The cost is that a source covering part of the day leaves the rest
 * uncounted, where the priority list would have filled the gap. That is the
 * right way round: a number that is too low can be explained by opening the app
 * it came from, and one that is too high reads as the diary being broken.
 */

/**
 * The apps we can put a human name to, and the order we prefer them in.
 *
 * The order is the load-bearing part. It only settles cases where more than one
 * app wrote the same type, and the question is which describes the whole day.
 *
 * Strava is last among real apps because it writes GPS activities and nothing
 * else, so picking it for steps would report a Sunday ride and none of the
 * walking. Being last never means being ignored: rank only decides between
 * sources that are both present. Health Connect's own package sits below the
 * apps because it is a passthrough rather than a tracker.
 */
const KNOWN_SOURCES: ReadonlyArray<{ id: string; name: string }> = [
  // Dedicated wearable apps, which have already reconciled a watch against a
  // phone before anything reaches Health Connect.
  { id: 'com.garmin.android.apps.connectmobile', name: 'Garmin Connect' },
  { id: 'com.fitbit.FitbitMobile', name: 'Fitbit' },
  { id: 'com.google.android.apps.fitbit.health', name: 'Google Health' },
  { id: 'com.sec.android.app.shealth', name: 'Samsung Health' },
  { id: 'com.xiaomi.wearable', name: 'Mi Fitness' },
  { id: 'com.huami.watch.hmwatchmanager', name: 'Zepp' },
  { id: 'com.polar.polarflow', name: 'Polar Flow' },
  { id: 'com.withings.wiscale2', name: 'Withings' },
  // Phone-based, and on the way out — Google's own direct integrations end in
  // 2026 and Health Connect is the replacement.
  { id: 'com.google.android.apps.fitness', name: 'Google Fit' },
  { id: 'com.google.android.apps.healthdata', name: 'Health Connect' },
  // Activities only. See the note above about why this is at the bottom.
  { id: 'com.strava', name: 'Strava' },
]

const RANK = new Map(KNOWN_SOURCES.map((source, index) => [source.id, index]))

/** Where an origin we do not recognise sorts: after every app we do. */
const UNKNOWN_APP_RANK = KNOWN_SOURCES.length

/** And where the platform's own stream sorts: last of all. */
const PLATFORM_RANK = UNKNOWN_APP_RANK + 1

/**
 * Whether an origin is the phone recording its own steps rather than an app.
 *
 * On-device recording was attributed to `android` until June 2026 and to an
 * undocumented device-specific package after it, so the test is loose: a real
 * package name has a dot in it. Being wrong is cheap, since an origin misread
 * as an app still sorts below every app we recognise.
 */
const isPlatformOrigin = (origin: string): boolean => origin === 'android' || !origin.includes('.')

const rankOf = (origin: string): number =>
  RANK.get(origin) ?? (isPlatformOrigin(origin) ? PLATFORM_RANK : UNKNOWN_APP_RANK)

/**
 * The one origin to read a type from, out of everything that wrote it.
 *
 * Ties break alphabetically rather than in platform order. The choice is made
 * afresh on every sync and the rolling window overwrites the same seven days,
 * so an unstable tiebreak would rewrite the step count to a different number
 * every launch with nothing on screen to say why.
 *
 * Null for an empty list, which is "nothing wrote this type" rather than a
 * failure. See `hasOrigins` in `androidHealth.ts`.
 */
export function preferredOrigin(origins: readonly string[]): string | null {
  if (origins.length === 0) return null

  return [...origins].sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b))[0] ?? null
}

/**
 * A writing app's package name as something a person would recognise. Unknown
 * apps fall back to the last dotted segment, title cased, so `com.acme.tracker`
 * reads "Tracker". The platform's own stream is named after the phone.
 */
export function sourceLabel(dataOrigin: string | null): string | null {
  if (!dataOrigin) return null

  const known = KNOWN_SOURCES.find((source) => source.id === dataOrigin)
  if (known) return known.name

  if (isPlatformOrigin(dataOrigin)) return 'This phone'

  const last = dataOrigin.split('.').filter(Boolean).at(-1) ?? dataOrigin
  return last.charAt(0).toUpperCase() + last.slice(1)
}
