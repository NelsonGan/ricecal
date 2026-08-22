import { Platform } from 'react-native'

import { dateKey } from '@/data/client'
import { type HeartBeatSample, hrZonesFromSamples } from './hrZones'
import { fromAppleWorkoutType } from './kinds'
import type {
  AccessResult,
  ActivityDayReading,
  Availability,
  HealthProvider,
  HealthReading,
  HourReading,
  HrZones,
  LocalDate,
  WeightReading,
  WorkoutReading,
} from './types'

/**
 * Apple Health.
 *
 * Why every import of the library is a `require` inside a function:
 * `@kingstinct/react-native-healthkit` is a Nitro module. On iOS, Metro resolves
 * `healthkit.ios.ts`, which reaches for a native HybridObject at module scope, so
 * a top-level `import` throws during the bundle's first evaluation on any build
 * whose native side does not have it. That is not hypothetical: it is every dev
 * client built before this dependency landed, and the failure is a white screen
 * on launch rather than a broken Activity tab.
 *
 * Loading it lazily costs one `require` per call and turns that class of mistake
 * into `not-linked` on one screen, which the connect screen can explain.
 *
 * Why the simulator is a first-class answer: `HKHealthStore.isHealthDataAvailable()`
 * is false on the iOS Simulator, so every screen below has to work with no
 * provider at all, which is why `demo.ts` exists.
 *
 * What we ask for, and why it is short: nine read types and nothing else.
 * HealthKit's permission sheet lists exactly what you request, and a calorie
 * diary asking for sleep and cycle tracking because it might want them later is a
 * diary people decline. Nothing is requested for writing at all.
 *
 * Body mass and body fat are the two that are not about movement. They are here
 * because a weigh-in is an input to the calorie budget rather than a statistic
 * beside it: `weight_logs` is what `compute_targets` reads, so a user whose scale
 * writes to Health gets a budget that follows their weight without them typing
 * anything.
 */

const QUANTITY = {
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  restingEnergy: 'HKQuantityTypeIdentifierBasalEnergyBurned',
  steps: 'HKQuantityTypeIdentifierStepCount',
  distance: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  exerciseTime: 'HKQuantityTypeIdentifierAppleExerciseTime',
  standTime: 'HKQuantityTypeIdentifierAppleStandTime',
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
  bodyMass: 'HKQuantityTypeIdentifierBodyMass',
  bodyFat: 'HKQuantityTypeIdentifierBodyFatPercentage',
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
 * double-counts every step on a phone that has both an iPhone and a Watch writing
 * step counts, which is the classic "12,000 steps in the app, 6,000 in Health"
 * bug.
 *
 * The anchor is local midnight of the first day, so the day boundaries Apple cuts
 * on are the ones the diary uses.
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

/**
 * The last sample of each local day, for a discrete quantity.
 *
 * `dailyTotals` above is the wrong tool for a weight and not merely a roundabout
 * one: it asks for `cumulativeSum`, and the sum of three weigh-ins on a Saturday
 * is 217 kg. HealthKit rejects a cumulative statistic over a discrete type
 * outright, so the mistake surfaces as a thrown query rather than as a wrong
 * number, but the reason it is wrong is worth stating.
 *
 * Samples are asked for ascending and written into the map as they come, so the
 * last write for a date is the last reading of that day. That is the same rule
 * `weight_logs` applies to somebody weighing themselves twice before breakfast.
 *
 * Deduplication across sources is not a concern here the way it is for steps. A
 * scale and a phone writing the same weigh-in twice is one value repeated rather
 * than doubled.
 */
async function latestPerDay(
  hk: HealthKitModule,
  identifier: string,
  unit: string,
  from: LocalDate,
  to: LocalDate,
): Promise<Map<LocalDate, number>> {
  const out = new Map<LocalDate, number>()

  // Ascending so the last sample of a date is the last one written to the map.
  const options = {
    filter: { date: { startDate: startOf(from), endDate: endOf(to) } },
    limit: -1,
    ascending: true,
    unit,
  }

  const samples = await hk.queryQuantitySamples(
    // biome-ignore lint/suspicious/noExplicitAny: the identifier union is generated per-platform
    identifier as any,
    // biome-ignore lint/suspicious/noExplicitAny: same
    options as any,
  )

  for (const sample of samples) {
    if (sample.quantity == null || !sample.startDate) continue
    out.set(dateKey(new Date(sample.startDate)), sample.quantity)
  }

  return out
}

/**
 * A body-fat figure as a percentage, whichever way the store expressed it.
 *
 * `HKUnit.percent()` is documented as a fraction, so 22% body fat reads as 0.22,
 * where Health Connect's `BodyFat.percentage` is already 22. Multiplying blind
 * would be right on one platform and give 2,200 on the other.
 *
 * The branch is on 1 rather than on the platform because 1% body fat is not a
 * body: the column's own floor is 1, the lowest figure ever measured in a living
 * person is around 3, and a scale reporting under 1 has therefore reported a
 * fraction.
 */
const asPercent = (value: number): number => (value <= 1 ? value * 100 : value)

/**
 * Weigh-ins, and the body fat recorded alongside them.
 *
 * Keyed off the weight: a day with a body-fat reading and no weight is skipped,
 * because `weight_logs.weight_kg` is not null and there is no honest row to
 * write.
 *
 * The whole thing is wrapped, like `readHeartRate`, because a user can grant
 * movement and decline body measurements, and an account with no weigh-ins in
 * Health is the ordinary case rather than a failure. Neither may cost the caller
 * its steps.
 */
async function readWeights(
  hk: HealthKitModule,
  from: LocalDate,
  to: LocalDate,
): Promise<WeightReading[]> {
  try {
    const [mass, fat] = await Promise.all([
      latestPerDay(hk, QUANTITY.bodyMass, 'kg', from, to),
      latestPerDay(hk, QUANTITY.bodyFat, '%', from, to),
    ])

    const out: WeightReading[] = []
    for (const [date, kg] of mass) {
      const pct = fat.get(date)
      out.push({
        date,
        // Two places, which is what the column holds. Rounding a scale's own
        // precision away here would be discarding the one thing it is better at
        // than the person typing.
        kg: Math.round(kg * 100) / 100,
        bodyFatPct: pct == null ? null : Math.round(asPercent(pct) * 10) / 10,
      })
    }
    return out
  } catch {
    return []
  }
}

export const appleHealth: HealthProvider = {
  id: 'apple_health',
  readTypes: APPLE_READ_TYPES,

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
     * The second argument is the write list, and it is empty on purpose.
     *
     * iOS will not tell you whether a read was granted: `authorizationStatusFor`
     * returns `sharingDenied`/`sharingAuthorized` for writes only, and reports
     * `notDetermined` for reads however the sheet was answered. That is a deliberate
     * Apple privacy decision, since knowing an app was denied is itself information
     * about the user.
     *
     * So `granted` here means "the sheet was shown and dismissed", and what actually
     * proves access is whether the first read returns anything. The connect flow
     * syncs immediately afterwards for exactly that reason.
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
    if (!hk) return { days: [], workouts: [], hours: [], weights: [], deviceName: null }

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

    const [workouts, hours, weights] = await Promise.all([
      readWorkouts(hk, from, to, age),
      withHours ? readHours(hk, from, to) : Promise.resolve<HourReading[]>([]),
      // Read for the whole range, not only the hourly window: a weigh-in is one
      // row a day and the chart draws ninety of them, so there is nothing to be
      // saved by narrowing it and a gap in the middle to be caused by doing so.
      readWeights(hk, from, to),
    ])

    return {
      days,
      workouts,
      hours,
      weights,
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
     * A session costs a round trip and can cost three, which is why the floor
     * exists: a four-minute "workout" is a mis-tap or a stretch, and zone bands
     * over it are noise drawn at the same size as a marathon's. Only a session
     * whose first read comes back empty pays for the rungs below it.
     */
    const hr =
      durationS >= 5 * 60
        ? await readHeartRate(hk, sample, { startDate: started, endDate: ended }, age)
        : null

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
 * `source` is the app that wrote the sample ("Strava", "Fitness") and `device` is
 * the hardware it came off ("Apple Watch"). They answer different questions, so
 * both are kept: the workout screen credits the app, and the settings screen
 * names the watch.
 *
 * The source is read through `toJSON()` and never as `source.name`, which is the
 * trap this function exists to hold shut. `source` is a Nitro HybridObject, and
 * every HybridObject carries a built-in `name` giving the name of the CLASS. So
 * the plain read compiled, type-checked, and put the string "SourceProxy" on
 * every workout anybody had ever recorded. `device` is a plain struct, which is
 * why the same field name is safe one line down.
 *
 * Wrapped because a sample written by an app that has since been deleted can
 * leave either side absent, and a workout whose provenance we cannot read is
 * still a workout.
 */
function names(sample: {
  sourceRevision?: { source?: { toJSON?: () => { name?: string } } }
  device?: { name?: string }
}): { sourceName: string | null; deviceName: string | null } {
  try {
    return {
      sourceName: sample.sourceRevision?.source?.toJSON?.()?.name ?? null,
      deviceName: sample.device?.name ?? null,
    }
  } catch {
    return { sourceName: null, deviceName: null }
  }
}

type HeartRate = { avg: number; max: number; zones: HrZones | null }

/**
 * A session's heart rate, asked for three ways.
 *
 * The workout predicate alone was the whole of this and it is the wrong shape of
 * question to ask only once. `predicateForObjects(from:)` matches the samples
 * the recorder ATTACHED to the workout, so an app that saves a session it
 * imported from somewhere else attaches none, and the answer for a game a watch
 * measured throughout comes back empty. A fortnight of basketball and badminton
 * read as pulseless that way.
 *
 * So the second rung asks the session's own start and end, strictly on both
 * sides. On a watch worn all day the readings inside a workout's window ARE that
 * workout's heart rate; strictness is what keeps the beat before the whistle out
 * of it. Zones survive this rung, since it is still samples.
 *
 * The third rung is the average and maximum HealthKit stores ON the workout,
 * which is what the Fitness app shows. Two numbers and nothing to band.
 */
async function readHeartRate(
  hk: HealthKitModule,
  // biome-ignore lint/suspicious/noExplicitAny: WorkoutProxy is only typed on iOS
  workout: any,
  window: { startDate: Date; endDate: Date },
  age: number | null,
): Promise<HeartRate | null> {
  const attached = await heartBeats(hk, { workout })
  const beats =
    attached.length > 0
      ? attached
      : await heartBeats(hk, {
          date: { ...window, strictStartDate: true, strictEndDate: true },
        })

  return summariseHeartRate(beats, age) ?? storedHeartRate(workout)
}

/**
 * Readings to an average, a maximum and four bands.
 *
 * The bands are the part that can come back empty on their own:
 * `hrZonesFromSamples` wants ten readings before it will draw anything, and a
 * writer that sends one average per session gives it three. The average and the
 * maximum are still real, so they are computed apart from the banding rather
 * than inside the same answer — a session with six readings has a heart rate,
 * and the screen has a tile for it.
 */
export function summariseHeartRate(
  beats: readonly HeartBeatSample[],
  age: number | null,
): HeartRate | null {
  if (beats.length === 0) return null

  return {
    avg: Math.round(beats.reduce((sum, beat) => sum + beat.bpm, 0) / beats.length),
    max: Math.round(Math.max(...beats.map((beat) => beat.bpm))),
    zones: hrZonesFromSamples(beats, age),
  }
}

/** Heart-rate samples matching one filter. An empty list for anything else. */
async function heartBeats(
  hk: HealthKitModule,
  filter: Record<string, unknown>,
): Promise<HeartBeatSample[]> {
  try {
    const samples = await hk.queryQuantitySamples(
      // biome-ignore lint/suspicious/noExplicitAny: the identifier union is generated per-platform
      QUANTITY.heartRate as any,
      // biome-ignore lint/suspicious/noExplicitAny: same
      { filter, limit: -1, unit: 'count/min' } as any,
    )

    const beats: HeartBeatSample[] = []
    for (const sample of samples) {
      // A sample carrying no number is not a beat of zero. One of those through
      // `summariseHeartRate` is a NaN average, which JSON writes as `null` and
      // the column accepts without complaint.
      if (!Number.isFinite(sample.quantity) || !sample.startDate) continue
      beats.push({ bpm: sample.quantity, at: new Date(sample.startDate).getTime() })
    }
    return beats
  } catch {
    // A workout with no heart rate is ordinary — a phone-only walk, a session
    // imported from Strava. It must not fail the sync around it.
    return []
  }
}

/**
 * The average and maximum HealthKit keeps on the workout itself.
 *
 * `HKWorkout.statistics(for:)`, the figures the Fitness app puts on a session.
 * Last of the three because there are no samples behind them: the tiles can be
 * filled from here and the zone chart cannot.
 */
// biome-ignore lint/suspicious/noExplicitAny: WorkoutProxy is only typed on iOS
async function storedHeartRate(workout: any): Promise<HeartRate | null> {
  try {
    const stat = await workout.getStatistic?.(QUANTITY.heartRate, 'count/min')
    const avg = stat?.averageQuantity?.quantity
    if (!Number.isFinite(avg)) return null

    const max = stat?.maximumQuantity?.quantity
    return { avg: Math.round(avg), max: Math.round(Number.isFinite(max) ? max : avg), zones: null }
  } catch {
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
