/**
 * WHOSE NUMBERS THE APP SHOWS, when several apps wrote the same thing.
 *
 * Health Connect is an aggregator, and the thing an aggregator does badly is
 * decide. A phone with Samsung Health on it and its own pedometer running has
 * TWO step streams covering the same walk, and the API's answer to that is a
 * user-controlled priority list — "only the Activity and Sleep data types are
 * deduped by Health Connect", by keeping the highest-priority app and dropping
 * the rest.
 *
 * That is the right idea and it cannot be relied upon. The list is the user's,
 * not ours: they can reorder it, and they can REMOVE a source from it, at which
 * point the source goes on writing and simply stops being deduped against. The
 * phone's own stream is in it at the lowest priority by default, and its
 * attribution moved in June 2026 from the `android` package name to a
 * device-specific synthetic one. None of that is knowable from here, and the
 * failure it produces is silent: no error, just a step count getting on for
 * twice what the user's own app shows them.
 *
 * It is not hypothetical. A Samsung user's diary read 4,675 steps against
 * Samsung Health's 2,808 for the same day, because Samsung Health writes ONE
 * record covering the whole day and a second stream wrote the same walk in
 * segments, and the aggregate returned the sum of both. Seven days of it
 * averaged 9,197 against Samsung's own 5,635.
 *
 * So RiceCal stops asking Health Connect to choose. It reads which origins
 * actually wrote, picks ONE by the order below, and asks again filtered to it —
 * `dataOriginFilter`, which the docs offer for exactly this ("you can still
 * build your own logic to calculate the data separately for each app writing
 * that data").
 *
 * WHAT THAT COSTS, stated plainly: a source that covers only part of the day
 * leaves the rest of the day uncounted, where the priority list would have
 * filled the gap from the next source down. That is the trade, and it is the
 * right way round. A number that is too low is a number the user can explain by
 * looking at the app it came from; a number that is too high matches nothing
 * they can see and reads as the diary being broken.
 */

/**
 * The apps we can put a human name to, and the order we prefer them in.
 *
 * ORDER IS THE LOAD-BEARING PART, not the labels. It only ever settles a case
 * where more than one app wrote the same type, and the question it answers is
 * "which of these describes the WHOLE day".
 *
 * Whole-day trackers come first, because a day's steps read off one of them is
 * a day's steps. Strava is deliberately LAST among real apps: it writes GPS
 * activities and nothing else, so choosing it as the step source would report a
 * user's Sunday ride and none of their walking, which is a worse answer than
 * the double count this file exists to fix. The rank only decides between
 * sources that are both present, so being last never means being ignored.
 *
 * Health Connect's own package sits below the apps because it is a passthrough
 * rather than a tracker: what it writes is what something else gave it, and the
 * something else is usually also in this list under its own name.
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
 * `android` is what on-device recording was attributed to until June 2026;
 * after it, a device-specific synthetic package name whose shape is the
 * platform's business and not documented for us to match on. So the test is
 * deliberately loose — a real Android package name has a dot in it, and a bare
 * token does not — and being wrong about it is cheap: an origin misread as an
 * app still sorts below every app we recognise, which is the only comparison
 * that decides anything in practice.
 */
const isPlatformOrigin = (origin: string): boolean => origin === 'android' || !origin.includes('.')

const rankOf = (origin: string): number =>
  RANK.get(origin) ?? (isPlatformOrigin(origin) ? PLATFORM_RANK : UNKNOWN_APP_RANK)

/**
 * The one origin to read a type from, out of everything that wrote it.
 *
 * Ties break ALPHABETICALLY rather than by whatever order the platform handed
 * them over in, and that is not tidiness. This choice is made afresh on every
 * sync, and the rolling window re-reads and overwrites the same seven days each
 * time — so an unstable choice between two equally-ranked sources would rewrite
 * a user's step count to a different number every time they opened the app,
 * with nothing on any screen to say why.
 *
 * Null for an empty list, which is the ordinary "nothing wrote this type"
 * answer rather than a failure — see `hasOrigins` in `androidHealth.ts`.
 */
export function preferredOrigin(origins: readonly string[]): string | null {
  if (origins.length === 0) return null

  return [...origins].sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b))[0] ?? null
}

/**
 * A writing app's package name as something a person would recognise.
 *
 * Anything we have no name for falls back to the last dotted segment, title
 * cased, which turns `com.acme.tracker` into "Tracker" rather than putting a
 * whole package name on a detail screen. The platform's own stream gets the
 * phone rather than a package, because "Android" as the author of a step count
 * means nothing to the person holding it.
 */
export function sourceLabel(dataOrigin: string | null): string | null {
  if (!dataOrigin) return null

  const known = KNOWN_SOURCES.find((source) => source.id === dataOrigin)
  if (known) return known.name

  if (isPlatformOrigin(dataOrigin)) return 'This phone'

  const last = dataOrigin.split('.').filter(Boolean).at(-1) ?? dataOrigin
  return last.charAt(0).toUpperCase() + last.slice(1)
}
