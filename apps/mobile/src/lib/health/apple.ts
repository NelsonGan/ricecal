import { Platform } from 'react-native'

import { dateKey } from '@/data/client'
import { hrZonesFromSamples } from './hrZones'
import { fromAppleWorkoutType } from './kinds'
import type {
  AccessResult,
  ActivityDayReading,
  Availability,
  HealthProvider,
  HealthReading,
  HourReading,
  LocalDate,
  WorkoutReading,
} from './types'

/**
 * Apple Health.
 *
 * WHY EVERY IMPORT OF THE LIBRARY IS A `require` INSIDE A FUNCTION
 *
 * `@kingstinct/react-native-healthkit` is a Nitro module. On iOS, Metro
 * resolves `healthkit.ios.ts`, which reaches for a native HybridObject at
 * module scope — so a top-level `import` throws during the bundle's first
 * evaluation on any build whose native side does not have it. That is not a
 * hypothetical: it is every dev client built before this dependency landed, and
 * the failure is a white screen on launch rather than a broken Activity tab.
 *
 * Loading it lazily costs one `require` per call and turns that class of
 * mistake into `not-linked` on one screen, which is a thing the connect screen
 * can explain.
 *
 * WHY THE SIMULATOR IS A FIRST-CLASS ANSWER
 *
 * `HKHealthStore.isHealthDataAvailable()` is false on the iOS Simulator — there
 * is no Health app there and no store to read. Every screen below therefore has
 * to work with no provider at all, which is why `demo.ts` exists and why this
 * file reports the state rather than throwing.
 *
 * WHAT WE ASK FOR, AND WHY IT IS SHORT
 *
 * Seven read types and nothing else. HealthKit's permission sheet lists exactly
 * what you request, and a calorie diary asking for sleep and cycle tracking
 * because it might want them later is a diary people decline. Nothing is
 * requested for WRITING at all — RiceCal never writes to Health.
 */

const QUANTITY = {
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  restingEnergy: 'HKQuantityTypeIdentifierBasalEnergyBurned',
  steps: 'HKQuantityTypeIdentifierStepCount',
  distance: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  exerciseTime: 'HKQuantityTypeIdentifierAppleExerciseTime',
  standTime: 'HKQuantityTypeIdentifierAppleStandTime',
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
} as const

const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier'

export const APPLE_READ_TYPES: string[] = [...Object.values(QUANTITY), WORKOUT_TYPE]

/**
 * The library, or nothing.
 *
 * Cached after the first success so the cost is paid once. A failure is NOT
 * cached: the only way it fails is a missing native module, and if that ever
 * changes within a session it is because Fast Refresh reloaded the bundle after
 * a rebuild — in which case retrying is exactly right.
 */
type HealthKitModule = typeof import('@kingstinct/react-native-healthkit')
let cached: HealthKitModule | null = null

function load(): HealthKitModule | null {
  if (cached) return cached
  try {
    cached = require('@kingstinct/react-native-healthkit') as HealthKitModule
    return cached
  } catch {
    return null
  }
}

/** Local midnight at the start of a `yyyy-MM-dd`. */
function startOf(date: LocalDate): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

/** Local midnight at the END of a `yyyy-MM-dd` — the first instant of the next day. */
function endOf(date: LocalDate): Date {
  const at = startOf(date)
  at.setDate(at.getDate() + 1)
  return at
}

/**
 * One `queryStatisticsCollectionForQuantity` call, folded to `date -> value`.
 *
 * A statistics collection is the right tool and not merely a fast one: HealthKit
 * deduplicates across sources inside it. Reading raw samples and summing them
 * double-counts every step on a phone that has both an iPhone and a Watch
 * writing step counts, which is most of them — the classic "12,000 steps in the
 * app, 6,000 in Health" bug.
 *
 * The anchor is local midnight of the first day, so the day boundaries Apple
 * cuts on are the ones the diary uses.
 */
async function dailyTotals(
  hk: HealthKitModule,
  identifier: string,
  unit: string,
  from: LocalDate,
  to: LocalDate,
): Promise<Map<LocalDate, number>> {
  const out = new Map<LocalDate, number>()

  const collection = await hk.queryStatisticsCollectionForQuantity(
    // biome-ignore lint/suspicious/noExplicitAny: the identifier union is generated per-platform
    identifier as any,
    ['cumulativeSum'],
    startOf(from),
    { day: 1 },
    // biome-ignore lint/suspicious/noExplicitAny: same
    { filter: { date: { startDate: startOf(from), endDate: endOf(to) } }, unit } as any,
  )

  for (const bucket of collection) {
    const sum = bucket.sumQuantity?.quantity
    if (sum == null || !bucket.startDate) continue
    out.set(dateKey(new Date(bucket.startDate)), sum)
  }

  return out
}

/** The same, bucketed hourly. Only ever asked for over the last month. */
async function hourlyTotals(
  hk: HealthKitModule,
  identifier: string,
  unit: string,
  from: LocalDate,
  to: LocalDate,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()

  const collection = await hk.queryStatisticsCollectionForQuantity(
    // biome-ignore lint/suspicious/noExplicitAny: as above
    identifier as any,
    ['cumulativeSum'],
    startOf(from),
    { hour: 1 },
    // biome-ignore lint/suspicious/noExplicitAny: as above
    { filter: { date: { startDate: startOf(from), endDate: endOf(to) } }, unit } as any,
  )

  for (const bucket of collection) {
    const sum = bucket.sumQuantity?.quantity
    if (sum == null || !bucket.startDate) continue
    const at = new Date(bucket.startDate)
    out.set(`${dateKey(at)}T${at.getHours()}`, sum)
  }

  return out
}

export const appleHealth: HealthProvider = {
  id: 'apple_health',

  async isAvailable(): Promise<Availability> {
    if (Platform.OS !== 'ios') return { ok: false, reason: 'wrong-platform' }

    const hk = load()
    if (!hk) return { ok: false, reason: 'not-linked' }

    // Async rather than the sync twin: the sync one reads a cached value that
    // is not populated on the very first call of a cold launch, and answering
    // "unavailable" on a real iPhone sends the user to the demo provider.
    const available = await hk.isHealthDataAvailableAsync()
    return available ? { ok: true } : { ok: false, reason: 'no-health-store' }
  },

  async requestAccess(): Promise<AccessResult> {
    const hk = load()
    if (!hk) return { granted: false, permissions: [] }

    /**
     * The second argument is the WRITE list, and it is empty on purpose.
     *
     * iOS will not tell you whether a READ was granted — `authorizationStatusFor`
     * returns `sharingDenied`/`sharingAuthorized` for writes only, and reports
     * `notDetermined` for reads however the sheet was answered. That is a
     * deliberate Apple privacy decision: knowing an app was denied is itself
     * information about the user.
     *
     * So `granted` here means "the sheet was shown and dismissed", and what
     * actually proves access is whether the first read returns anything. The
     * connect flow syncs immediately afterwards for exactly that reason, and
     * the empty state on the Activity tab is the honest report of a denial.
     */
    await hk.requestAuthorization({
      toRead: APPLE_READ_TYPES as never,
      // Empty on purpose, and the empty list is the promise: RiceCal reads
      // Health and never writes to it. An app that asks for write access it
      // does not use is one whose permission sheet is asking for something it
      // cannot justify.
      toShare: [],
    })
    return { granted: true, permissions: APPLE_READ_TYPES }
  },

  async read(from, to, { withHours, age }): Promise<HealthReading> {
    const hk = load()
    if (!hk) return { days: [], workouts: [], hours: [], deviceName: null }

    const [active, resting, steps, distance, exercise, standMinutes] = await Promise.all([
      dailyTotals(hk, QUANTITY.activeEnergy, 'kcal', from, to),
      dailyTotals(hk, QUANTITY.restingEnergy, 'kcal', from, to),
      dailyTotals(hk, QUANTITY.steps, 'count', from, to),
      dailyTotals(hk, QUANTITY.distance, 'm', from, to),
      dailyTotals(hk, QUANTITY.exerciseTime, 'min', from, to),
      dailyTotals(hk, QUANTITY.standTime, 'min', from, to),
    ])

    const days: ActivityDayReading[] = []
    for (const date of eachDay(from, to)) {
      const activeKcal = active.get(date)
      const stepCount = steps.get(date)

      // A day the store has nothing for is a day we do not write. Otherwise
      // every date before the watch was bought becomes a confident zero, and
      // "0 of 30 goal days" is a claim about the user rather than the data.
      if (activeKcal == null && stepCount == null) continue

      const stand = standMinutes.get(date)

      days.push({
        date,
        activeKcal: Math.round(activeKcal ?? 0),
        restingKcal: round(resting.get(date)),
        steps: Math.round(stepCount ?? 0),
        distanceM: round(distance.get(date)),
        exerciseMinutes: round(exercise.get(date)),
        // Apple's Stand RING counts hours in which the user stood for a
        // minute; `appleStandTime` is minutes spent standing. They are not the
        // same number, and this is the honest conversion of the one that is
        // queryable as a statistic — an hour of standing time is at most an
        // hour of the ring, and the cap stops a desk-treadmill day reading 31.
        standHours: stand == null ? null : Math.min(24, Math.round(stand / 60)),
        flights: null,
        // Ring goals live on `HKActivitySummary`, which this library does not
        // bind, so on iOS these are ALWAYS null — not merely sometimes. Null
        // rather than a guess, because a target Apple never set is not a target;
        // the Activity tab compares the tile against the user's own recent
        // average instead, which is a real figure it already has.
        moveGoalKcal: null,
        exerciseGoalMin: null,
        standGoalHr: null,
      })
    }

    const [workouts, hours] = await Promise.all([
      readWorkouts(hk, from, to, age),
      withHours ? readHours(hk, from, to) : Promise.resolve<HourReading[]>([]),
    ])

    return {
      days,
      workouts,
      hours,
      // The most recently named piece of hardware, falling back to whichever app
      // wrote the session. `queryWorkoutSamples` is asked for descending order,
      // so the first hit is the newest — a user who has since changed watches
      // sees the one they are wearing.
      deviceName:
        workouts.find((w) => w.deviceName)?.deviceName ??
        workouts.find((w) => w.sourceName)?.sourceName ??
        null,
    }
  },
}

async function readWorkouts(
  hk: HealthKitModule,
  from: LocalDate,
  to: LocalDate,
  age: number | null,
): Promise<Array<WorkoutReading & { deviceName: string | null }>> {
  const samples = await hk.queryWorkoutSamples({
    filter: { date: { startDate: startOf(from), endDate: endOf(to) } },
    // Every workout in the window. A cap here would silently truncate a
    // backfill, and the count is bounded by the window rather than by the user.
    limit: -1,
    ascending: false,
  })

  const readings: Array<WorkoutReading & { deviceName: string | null }> = []

  for (const sample of samples) {
    const started = new Date(sample.startDate)
    const ended = new Date(sample.endDate)
    const durationS = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000))

    /**
     * Heart rate is read per workout rather than for the whole window, and only
     * for workouts long enough to have shape.
     *
     * A statistics query per session is N round trips, which is why the floor
     * exists: a four-minute "workout" is a mis-tap or a stretch, and zone bands
     * over it are noise drawn at the same size as a marathon's.
     */
    const hr = durationS >= 5 * 60 ? await readHeartRate(hk, sample, age) : null

    readings.push({
      externalId: sample.uuid,
      date: dateKey(started),
      kind: fromAppleWorkoutType(sample.workoutActivityType),
      kindLabel: null,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationS,
      activeKcal: Math.round(sample.totalEnergyBurned?.quantity ?? 0),
      distanceM: round(sample.totalDistance?.quantity),
      avgHr: hr?.avg ?? null,
      maxHr: hr?.max ?? null,
      elevationM: null,
      hrZones: hr?.zones ?? null,
      ...names(sample),
    })
  }

  return readings
}

/**
 * Who recorded this session, and on what.
 *
 * Both were `null` here until this was written, and the null was load-bearing in
 * the wrong direction: `deviceName` on the connection is derived from these, so
 * the health-settings screen could never name a watch, and the two strings that
 * name a source — "From Strava", and the sentence explaining why a session has
 * no heart-rate zones — were unreachable on iOS however the data arrived.
 *
 * `source` is the APP that wrote the sample ("Strava", "Fitness") and `device`
 * is the hardware it came off ("Apple Watch"). They answer different questions,
 * so both are kept: the workout screen credits the app, and the settings screen
 * names the watch.
 *
 * Wrapped because these are Nitro hybrid objects reached through a proxy. A
 * sample written by an app that has since been deleted, or by an older build,
 * can leave either side absent — and a workout whose provenance we cannot read
 * is still a workout, so it must not fail the sync around it.
 */
function names(sample: {
  sourceRevision?: { source?: { name?: string } }
  device?: { name?: string }
}): { sourceName: string | null; deviceName: string | null } {
  try {
    return {
      sourceName: sample.sourceRevision?.source?.name ?? null,
      deviceName: sample.device?.name ?? null,
    }
  } catch {
    return { sourceName: null, deviceName: null }
  }
}

async function readHeartRate(
  hk: HealthKitModule,
  // biome-ignore lint/suspicious/noExplicitAny: WorkoutProxy is only typed on iOS
  workout: any,
  age: number | null,
): Promise<{ avg: number; max: number; zones: ReturnType<typeof hrZonesFromSamples> } | null> {
  try {
    const samples = await hk.queryQuantitySamples(
      // biome-ignore lint/suspicious/noExplicitAny: as above
      QUANTITY.heartRate as any,
      // Scoped BY THE WORKOUT rather than by its time window. HealthKit's
      // workout predicate is what associates a sample with the session, and a
      // time filter also catches the heart rate of whatever came before it —
      // which on a watch worn all day is everything.
      // biome-ignore lint/suspicious/noExplicitAny: as above
      { filter: { workout }, limit: -1, unit: 'count/min' } as any,
    )

    if (samples.length === 0) return null

    const beats = samples.map((s) => ({
      bpm: s.quantity,
      at: new Date(s.startDate).getTime(),
    }))

    return {
      avg: Math.round(beats.reduce((sum, b) => sum + b.bpm, 0) / beats.length),
      max: Math.round(Math.max(...beats.map((b) => b.bpm))),
      zones: hrZonesFromSamples(beats, age),
    }
  } catch {
    // A workout with no heart rate is ordinary — a phone-only walk, a session
    // imported from Strava. It must not fail the sync around it.
    return null
  }
}

async function readHours(
  hk: HealthKitModule,
  from: LocalDate,
  to: LocalDate,
): Promise<HourReading[]> {
  const [steps, active, distance] = await Promise.all([
    hourlyTotals(hk, QUANTITY.steps, 'count', from, to),
    hourlyTotals(hk, QUANTITY.activeEnergy, 'kcal', from, to),
    hourlyTotals(hk, QUANTITY.distance, 'm', from, to),
  ])

  const out: HourReading[] = []
  for (const [key, value] of steps) {
    // Empty hours are not written. Twenty-four rows a day of which four are
    // non-zero is a table three times the size of the answer.
    if (value <= 0) continue
    const [date, hour] = key.split('T')
    out.push({
      date,
      hour: Number(hour),
      steps: Math.round(value),
      activeKcal: Math.round(active.get(key) ?? 0),
      distanceM: round(distance.get(key)),
    })
  }

  return out
}

const round = (value: number | undefined): number | null =>
  value == null ? null : Math.round(value)

/** Every `yyyy-MM-dd` from `from` to `to`, inclusive. */
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = []
  const at = startOf(from)
  const last = startOf(to)
  while (at <= last) {
    out.push(dateKey(at))
    at.setDate(at.getDate() + 1)
  }
  return out
}
