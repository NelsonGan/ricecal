import { Platform } from 'react-native'

import { dateKey } from '@/data/client'
import { eachDay } from './apple'
import { preferredOrigin } from './connectOrigins'
import { CONNECT_READ_TYPES, isConnectReadType } from './connectPermissions'
import { hrZonesFromSamples } from './hrZones'
import { fromConnectExerciseType } from './kinds'
import type {
  AccessResult,
  ActivityDayReading,
  Availability,
  HealthProvider,
  HealthReading,
  HourReading,
  LocalDate,
  WeightReading,
  WorkoutReading,
} from './types'

/**
 * Health Connect: the Android path, and by 2026 the only Android path.
 *
 * Google Fit's REST and Android APIs stopped taking new developers in May 2024
 * and are switched off through late 2026, with no automatic data migration.
 * Health Connect replaced them, and since Android 14 it is part of the framework
 * rather than an app you install. Everything a user's phone knows about their
 * movement reaches us through it, which is why this file talks to one API and the
 * connect screen talks about several apps.
 *
 * What is reliably missing here, and why that is the design. Health Connect is an
 * aggregator, so what it holds depends entirely on what wrote to it:
 *
 *   * No stand hours. There is no such record type, so the Activity screen shows
 *     steps in its place.
 *   * Heart rate at whatever resolution the writer chose. A watch writes a sample
 *     a second and gives real zones; Strava writes one average per session and
 *     gives none.
 *   * Hourly steps only if the writer recorded short segments. Samsung Health
 *     writes one record for the whole day, so `readHours` returns nothing for it
 *     rather than a flat carpet.
 *
 * None of that is an error state. It is the shape of the platform, and the
 * screens report it rather than hiding it behind zeros.
 *
 * Two things this file refuses to take at face value, both learnt from a Samsung
 * user whose diary disagreed with the app on their own phone.
 *
 * 1. A sum across every app that wrote. Health Connect dedupes Activity by a
 *    priority list the user owns and can empty, so the same walk can arrive twice
 *    from two sources and be counted twice. `aggregated` picks one origin and
 *    filters to it.
 *
 * 2. A zero. The native bridge reads a missing metric out of an aggregate as
 *    `0.0`, so "nothing wrote active energy on this phone" and "this user burned
 *    nothing" are the same number coming back. `dataOrigins` tells them apart.
 *    Believing the zero is what filed a Samsung user's entire daily burn as
 *    resting: active came back 0, resting is total minus active, and two hours of
 *    badminton went into the column the budget never reads.
 *
 * Energy is the part where providers differ most. `ActiveCaloriesBurned` is the
 * figure the budget wants and plenty of sources never write it: Samsung Health
 * writes `TotalCaloriesBurned` and nothing else, Garmin writes both, and a phone
 * with only its own pedometer writes neither. `energyFor` is the ladder that
 * comes out of that.
 *
 * The `require` is lazy for the same reason as `apple.ts`.
 */

type ConnectModule = typeof import('react-native-health-connect')

const permissionsFor = () =>
  CONNECT_READ_TYPES.map((recordType) => ({ accessType: 'read' as const, recordType }))

let cached: ConnectModule | null = null

function load(): ConnectModule | null {
  if (cached) return cached
  try {
    cached = require('react-native-health-connect') as ConnectModule
    return cached
  } catch {
    return null
  }
}

function startOf(date: LocalDate): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

function endOf(date: LocalDate): Date {
  const at = startOf(date)
  at.setDate(at.getDate() + 1)
  return at
}

const between = (from: LocalDate, to: LocalDate) =>
  ({
    operator: 'between' as const,
    startTime: startOf(from).toISOString(),
    endTime: endOf(to).toISOString(),
  }) as const

/** The shape every aggregate result carries, whatever the record type. */
type Bucket = { result: Record<string, unknown>; startTime: string }

/**
 * Whether anything actually wrote the data behind an aggregate bucket.
 *
 * The one guard that keeps this file honest, and it exists because the native
 * bridge reads a missing metric as zero:
 *
 *     putDouble("COUNT_TOTAL", record[StepsRecord.COUNT_TOTAL]?.toDouble() ?: 0.0)
 *
 * So every bucket comes back with a number in it whether or not a single record
 * fell inside it, and a type nobody on the phone writes is indistinguishable from
 * a type everybody wrote a zero to. `dataOrigins` is the difference: it lists the
 * packages that contributed, and it is empty when none did.
 *
 * And the number is not always zero, which is the part worth measuring rather
 * than reasoning about. Probed against a Health Connect with nothing at all in
 * it, on a Pixel API 36 emulator, eight daily buckets each:
 *
 *     Steps                { dataOrigins: [], COUNT_TOTAL: 0 }
 *     ActiveCaloriesBurned { dataOrigins: [], ACTIVE_CALORIES_TOTAL: 0 kcal }
 *     Distance             { dataOrigins: [], DISTANCE: 0 m }
 *     TotalCaloriesBurned  { dataOrigins: [], ENERGY_TOTAL: 1564.5 kcal }
 *     BasalMetabolicRate   { dataOrigins: [], BASAL_CALORIES_TOTAL: 1564.5 kcal }
 *
 * The last two are the ones to remember: Health Connect derives an energy figure
 * rather than declining to answer, so a store holding nothing reports 1,564.5
 * kcal a day as confidently as a watch would. Only the empty `dataOrigins` says
 * it came from nowhere.
 *
 * Run the old code over that payload and it wrote eight rows of `active_kcal 0,
 * resting_kcal 1565, distance_m 0` for a phone that had never recorded a step,
 * which is the shape the Samsung account's rows were actually in.
 */
function hasOrigins(result: Record<string, unknown>): boolean {
  return Array.isArray(result.dataOrigins) && result.dataOrigins.length > 0
}

const originsOf = (buckets: readonly Bucket[]): string[] => {
  const seen = new Set<string>()
  for (const bucket of buckets) {
    const origins = bucket.result.dataOrigins
    if (!Array.isArray(origins)) continue
    for (const origin of origins) if (typeof origin === 'string') seen.add(origin)
  }
  return [...seen]
}

/** One grouped-aggregate call, or null if the read failed. */
async function group<T extends string>(
  hc: ConnectModule,
  recordType: T,
  from: LocalDate,
  to: LocalDate,
  slicer: { period: 'DAYS'; length: 1 } | { duration: 'HOURS'; length: 1 },
  origin?: string,
): Promise<Bucket[] | null> {
  const request = {
    // biome-ignore lint/suspicious/noExplicitAny: the record-type union is wider than this helper needs
    recordType: recordType as any,
    timeRangeFilter: between(from, to),
    ...(origin ? { dataOriginFilter: [origin] } : {}),
  }

  try {
    const groups =
      'period' in slicer
        ? await hc.aggregateGroupByPeriod({ ...request, timeRangeSlicer: slicer })
        : await hc.aggregateGroupByDuration({ ...request, timeRangeSlicer: slicer })

    return groups.map((entry) => ({
      result: entry.result as unknown as Record<string, unknown>,
      startTime: entry.startTime,
    }))
  } catch {
    return null
  }
}

/** What an aggregate came back with, and whose numbers they turned out to be. */
type Aggregated = {
  /** Only dates something actually wrote. An absent date is UNKNOWN, not zero. */
  values: Map<LocalDate, number>
  /** The origin the values were read from, once more than one had written. */
  origin: string | null
}

/**
 * A FUNCTION rather than a shared constant, because the empty answer carries a
 * Map and a Map is mutable. One `const NOTHING` handed back from six different
 * reads is six references to the same Map, and the day anybody writes into a
 * result instead of reading from it, every type that returned nothing shares
 * the damage. Nothing does that today; the point is that nothing can.
 */
const nothing = (): Aggregated => ({ values: new Map(), origin: null })

/**
 * An aggregate, read from one app rather than summed across all of them.
 *
 * Two calls in the case that needs two, and one in the case that does not. The
 * first is unfiltered and is what discovers who wrote; with a single origin,
 * which is most phones, its numbers are already the answer. Only a genuinely
 * contested type pays for the second call.
 *
 * A failed second call returns nothing rather than the first call's totals, and
 * that direction is deliberate. The unfiltered numbers are the double count this
 * function exists to avoid, so falling back to them would answer a transient
 * failure by writing a figure known to be wrong. Returning nothing leaves
 * whatever the last good sync stored, and stale is a better failure than wrong.
 *
 * A failure of the first call is caught the same way and for the older reason:
 * one denied record type must not take the whole sync with it.
 */
async function aggregated<T extends string>(
  hc: ConnectModule,
  recordType: T,
  from: LocalDate,
  to: LocalDate,
  pick: (result: Record<string, unknown>) => number | null,
): Promise<Aggregated> {
  const discovered = await group(hc, recordType, from, to, { period: 'DAYS', length: 1 })
  if (!discovered) return nothing()

  const origins = originsOf(discovered)
  if (origins.length === 0) return nothing()

  const origin = preferredOrigin(origins)
  const buckets =
    origins.length === 1
      ? discovered
      : await group(hc, recordType, from, to, { period: 'DAYS', length: 1 }, origin ?? undefined)
  if (!buckets) return nothing()

  const values = new Map<LocalDate, number>()
  for (const bucket of buckets) {
    if (!hasOrigins(bucket.result)) continue
    const value = pick(bucket.result)
    if (value == null) continue
    values.set(dateKey(new Date(bucket.startTime)), value)
  }

  return { values, origin }
}

export const healthConnect: HealthProvider = {
  id: 'health_connect',
  readTypes: CONNECT_READ_TYPES,

  async isAvailable(): Promise<Availability> {
    if (Platform.OS !== 'android') return { ok: false, reason: 'wrong-platform' }

    const hc = load()
    if (!hc) return { ok: false, reason: 'not-linked' }

    try {
      const status = await hc.getSdkStatus()
      // Anything short of SDK_AVAILABLE is "the user has to go and install or
      // update Health Connect", which is one message on the connect screen with
      // a button that opens the Play Store entry.
      if (status !== hc.SdkAvailabilityStatus.SDK_AVAILABLE) {
        return { ok: false, reason: 'not-installed' }
      }
      const ready = await hc.initialize()
      return ready ? { ok: true } : { ok: false, reason: 'not-installed' }
    } catch {
      return { ok: false, reason: 'not-installed' }
    }
  },

  async requestAccess(): Promise<AccessResult> {
    const hc = load()
    if (!hc) return { granted: false, permissions: [] }

    await hc.initialize()

    /**
     * The answer is trustworthy here, unlike on iOS.
     *
     * Health Connect returns the permissions actually granted, so a partial
     * grant — steps yes, workouts no — is knowable and gets recorded on
     * `health_connections.permissions` for the screens to read. This is why
     * that column exists at all; on iOS it can only ever hold what we asked for.
     */
    const granted = await hc.requestPermission(permissionsFor())
    const names: string[] = []
    for (const permission of granted) {
      // The array also carries the special permissions — background access,
      // exercise routes — which have no `recordType`. They are not read types
      // and do not belong in the list the screens explain themselves from.
      if (!('recordType' in permission) || typeof permission.recordType !== 'string') continue

      /**
       * And it carries record types we never asked for.
       *
       * A permission covers a family of record classes, and the library answers in
       * record types by reporting every class the granted permission implies.
       * `READ_EXERCISE` drags in `CyclingPedalingCadence` and `READ_STEPS` drags in
       * `StepsCadence`, neither of which this file reads. Observed on a Pixel API 36
       * emulator rather than inferred, which is also why the count is not written down:
       * only the platform decides what a permission implies.
       *
       * They are dropped because this list is what `health_connections.permissions`
       * stores and what the Activity screens explain a gap from, and a column claiming
       * a reading the app never takes is a lie waiting for somebody to build on it.
       */
      if (!isConnectReadType(permission.recordType)) continue

      names.push(permission.recordType)
    }

    return { granted: names.length > 0, permissions: names }
  },

  async read(from, to, { withHours, age, basalKcal }): Promise<HealthReading> {
    const hc = load()
    if (!hc) return { days: [], workouts: [], hours: [], weights: [], deviceName: null }

    await hc.initialize()

    const [active, total, basal, steps, distance, exercise] = await Promise.all([
      aggregated(hc, 'ActiveCaloriesBurned', from, to, (r) => energy(r.ACTIVE_CALORIES_TOTAL)),
      aggregated(hc, 'TotalCaloriesBurned', from, to, (r) => energy(r.ENERGY_TOTAL)),
      aggregated(hc, 'BasalMetabolicRate', from, to, (r) => energy(r.BASAL_CALORIES_TOTAL)),
      aggregated(hc, 'Steps', from, to, (r) =>
        typeof r.COUNT_TOTAL === 'number' ? r.COUNT_TOTAL : null,
      ),
      aggregated(hc, 'Distance', from, to, (r) => length(r.DISTANCE)),
      /**
       * The one type where filtering to one origin can undercount, so the asymmetry
       * with the session list below is worth naming.
       *
       * Steps and energy describe the whole day, so two sources are two descriptions of
       * the same thing and taking one is right. Exercise sessions are events, and two
       * apps more often hold different ones (a Strava ride and a watch-recorded walk)
       * than two copies of the same.
       *
       * It stays, for two reasons. It only engages when more than one app wrote
       * sessions at all, which is exactly the population that can double count; and
       * this figure feeds a tile, while `readWorkouts` below reads records unfiltered
       * so no workout ever disappears from the list.
       */
      aggregated(hc, 'ExerciseSession', from, to, (r) => {
        const duration = r.EXERCISE_DURATION_TOTAL as { inSeconds?: number } | undefined
        return duration?.inSeconds == null ? null : Math.round(duration.inSeconds / 60)
      }),
    ])

    const days: ActivityDayReading[] = []
    for (const date of eachDay(from, to)) {
      const stepCount = steps.values.get(date)
      const burn = energyFor({
        active: active.values.get(date),
        total: total.values.get(date),
        measuredBasal: basal.values.get(date),
        profileBasal: basalKcal,
      })

      // A day nothing at all was written for is not a day of zeros. Skipping it
      // leaves no row, and `activity_days_range` draws the gap as a gap.
      if (burn.activeKcal == null && stepCount == null) continue

      days.push({
        date,
        activeKcal: burn.activeKcal,
        restingKcal: burn.restingKcal,
        steps: Math.round(stepCount ?? 0),
        distanceM: round(distance.values.get(date)),
        exerciseMinutes: round(exercise.values.get(date)),
        // No such record type. Null, never zero — see the header.
        standHours: null,
        flights: null,
        moveGoalKcal: null,
        exerciseGoalMin: null,
        standGoalHr: null,
      })
    }

    const [workouts, hours, weights] = await Promise.all([
      readWorkouts(hc, from, to, age, basalKcal),
      // The SAME origin the day totals came from. A chart whose bars are one
      // app's and whose headline figure is another's does not add up, and the
      // first thing anybody does with an hourly chart is check that it does.
      withHours ? readHours(hc, from, to, steps.origin) : Promise.resolve<HourReading[]>([]),
      // The whole range, not only the hourly window — see the note in `apple.ts`.
      readWeights(hc, from, to),
    ])

    return {
      days,
      workouts,
      hours,
      weights,
      /**
       * Whoever the STEPS were read from, falling back to whoever recorded a
       * workout. It used to be the workout writer alone, which named the app
       * behind the smallest part of the screen: a phone can have workouts from
       * Strava and every daily figure from Samsung Health, and the settings row
       * would credit Strava for a step count it did not write.
       */
      deviceName: steps.origin ?? workouts.find((w) => w.sourceName)?.sourceName ?? null,
    }
  },
}

/**
 * The day's energy, split into the half the budget reads and the half it must
 * not, out of whichever of three figures this phone actually has.
 *
 * A ladder, because providers disagree about which of them they write:
 *
 *   active measured        Garmin, and anything with a real activity tracker.
 *                          Resting is then total minus active, the store's own
 *                          arithmetic rather than ours.
 *   total measured only    Samsung Health. Total is basal plus movement, so it
 *                          has to be split before any of it reaches a budget that
 *                          is already a Mifflin-St Jeor figure. Subtract the
 *                          basal: the store's own when it wrote one, else the
 *                          profile's.
 *   neither                Null. Not zero, for the reason in the header.
 *
 * The middle rung is the whole point of this function. Without it a Samsung
 * user's active energy is zero every day, so movement never extends their budget,
 * and their entire daily burn lands in `resting_kcal` where nothing reads it. Two
 * hours of badminton showed as 0 kcal on the session and 2,524 kcal of "resting"
 * on the day.
 *
 * The subtraction is clamped at zero and the resting half is capped at the total,
 * so a basal estimate that overshoots a quiet day reports no movement instead of
 * negative movement.
 */
export function energyFor(input: {
  active: number | undefined
  total: number | undefined
  measuredBasal: number | undefined
  profileBasal: number | null
}): { activeKcal: number | null; restingKcal: number | null } {
  const { active, total, measuredBasal, profileBasal } = input

  if (active != null) {
    return {
      activeKcal: Math.round(active),
      restingKcal: total == null ? round(measuredBasal) : Math.max(0, Math.round(total - active)),
    }
  }

  // Measured before estimated. A store that computes its own basal knows this
  // user's, and the profile's figure is a formula over four numbers they typed.
  const basal = measuredBasal ?? profileBasal ?? null

  if (total != null && basal != null) {
    return {
      activeKcal: Math.max(0, Math.round(total - basal)),
      restingKcal: Math.min(Math.round(basal), Math.round(total)),
    }
  }

  /**
   * A total with nothing to split it by is not an active figure.
   *
   * Writing it as active would credit the user their whole basal metabolism on
   * top of a goal that already contains it — the "alive twice" bug the schema
   * warns about, worth roughly 1,500 kcal a day of budget nobody earned.
   */
  return { activeKcal: null, restingKcal: round(measuredBasal) }
}

/**
 * Weigh-ins, and the body fat recorded alongside them.
 *
 * Records rather than an aggregate, which is the opposite of every other read in
 * this file. `Weight` does have a `WEIGHT_AVG`/`WEIGHT_MIN`/`WEIGHT_MAX`
 * aggregate and none of the three is the number wanted: a day's weight is its
 * last reading, the same rule `weight_logs` has always applied. The
 * dedup-across-sources argument that makes an aggregate mandatory for steps does
 * not apply to a quantity nobody adds up.
 *
 * Keyed off the weight: a day with body fat and no weight is skipped, because
 * `weight_logs.weight_kg` is not null and there is no honest row to write.
 *
 * Both reads are wrapped separately, so a user who granted weight but declined
 * body measurements still gets their weigh-ins.
 */
async function readWeights(
  hc: ConnectModule,
  from: LocalDate,
  to: LocalDate,
): Promise<WeightReading[]> {
  const mass = new Map<LocalDate, number>()
  const fat = new Map<LocalDate, number>()

  try {
    // Ascending, so the last record written for a date is the one left in the
    // map — the day's final reading.
    const page = await hc.readRecords('Weight', {
      timeRangeFilter: between(from, to),
      ascendingOrder: true,
    })
    for (const record of page.records) {
      const kg = record.weight?.inKilograms
      if (kg == null) continue
      mass.set(dateKey(new Date(record.time)), kg)
    }
  } catch {
    return []
  }

  try {
    const page = await hc.readRecords('BodyFat', {
      timeRangeFilter: between(from, to),
      ascendingOrder: true,
    })
    for (const record of page.records) {
      if (record.percentage == null) continue
      fat.set(dateKey(new Date(record.time)), record.percentage)
    }
  } catch {
    // Weight without body fat is a complete weigh-in. Nothing to recover.
  }

  const out: WeightReading[] = []
  for (const [date, kg] of mass) {
    const pct = fat.get(date)
    out.push({
      date,
      kg: Math.round(kg * 100) / 100,
      // Already 0–100 here, unlike HealthKit's fractional `%` — see `asPercent`
      // in `apple.ts` for the trap that difference sets.
      bodyFatPct: pct == null ? null : Math.round(pct * 10) / 10,
    })
  }
  return out
}

async function readWorkouts(
  hc: ConnectModule,
  from: LocalDate,
  to: LocalDate,
  age: number | null,
  basalKcal: number | null,
): Promise<WorkoutReading[]> {
  let sessions: Awaited<ReturnType<typeof hc.readRecords<'ExerciseSession'>>>['records']
  try {
    const page = await hc.readRecords('ExerciseSession', {
      timeRangeFilter: between(from, to),
      ascendingOrder: false,
    })
    sessions = page.records
  } catch {
    return []
  }

  const readings: WorkoutReading[] = []

  for (const session of sessions) {
    const started = new Date(session.startTime)
    const ended = new Date(session.endTime)
    const durationS = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000))

    const [energyBurned, hr] = await Promise.all([
      sessionEnergy(hc, session.startTime, session.endTime, durationS, basalKcal),
      readHeartRate(hc, session.startTime, session.endTime, age),
    ])

    readings.push({
      externalId: session.metadata?.id ?? `${session.startTime}-${session.exerciseType}`,
      date: dateKey(started),
      kind: fromConnectExerciseType(session.exerciseType),
      // Health Connect lets the writing app title a session ("Morning ride"),
      // which is better copy than anything a type number can produce.
      kindLabel: session.title ?? null,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationS,
      activeKcal: energyBurned ?? 0,
      distanceM: null,
      avgHr: hr?.avg ?? null,
      maxHr: hr?.max ?? null,
      elevationM: null,
      hrZones: hr?.zones ?? null,
      // The package name of whatever wrote the record. Turned into a readable
      // name by `sourceLabel` rather than shown raw — "com.strava" on a detail
      // screen is a leak of an implementation detail.
      sourceName: session.metadata?.dataOrigin ?? null,
    })
  }

  return readings
}

/**
 * A session's calories, which are not on the session record.
 *
 * Health Connect models energy as its own record type over a time range, so the
 * cost of a workout is an aggregate over the workout's window. That window can
 * legitimately hold energy the session did not cause, and the number is still the
 * best available answer, because the alternative is showing no calories at all
 * for every Android workout.
 *
 * The same ladder as `energyFor`, with one extra step. Asked for active energy
 * alone, a Samsung Health session came back at zero against the 1,210 kcal
 * Samsung's own screen showed for it. Falling through to the total means
 * subtracting the basal the body would have spent lying still for those two
 * hours, hence the proration, which is the only part a day-long window does not
 * need.
 */
async function sessionEnergy(
  hc: ConnectModule,
  startTime: string,
  endTime: string,
  durationS: number,
  basalKcal: number | null,
): Promise<number | null> {
  const measured = await windowEnergy(hc, 'ActiveCaloriesBurned', startTime, endTime)
  if (measured != null) return Math.round(measured)

  const total = await windowEnergy(hc, 'TotalCaloriesBurned', startTime, endTime)
  if (total == null) return null

  // A basal we cannot name means the total is the closest thing to an answer
  // there is. It overstates a session by an hour or two of lying-still energy,
  // which is a smaller error than reporting a two-hour workout as free.
  const basalOverWindow = basalKcal == null ? 0 : (basalKcal * durationS) / 86_400

  return Math.max(0, Math.round(total - basalOverWindow))
}

/** One energy aggregate over an arbitrary window, or null if nothing wrote it. */
async function windowEnergy(
  hc: ConnectModule,
  recordType: 'ActiveCaloriesBurned' | 'TotalCaloriesBurned',
  startTime: string,
  endTime: string,
): Promise<number | null> {
  try {
    const result = (await hc.aggregateRecord({
      recordType,
      timeRangeFilter: { operator: 'between', startTime, endTime },
    })) as unknown as Record<string, unknown>

    // Same zero-is-not-nothing trap as everywhere else in this file.
    if (!hasOrigins(result)) return null

    return energy(
      recordType === 'ActiveCaloriesBurned' ? result.ACTIVE_CALORIES_TOTAL : result.ENERGY_TOTAL,
    )
  } catch {
    return null
  }
}

async function readHeartRate(
  hc: ConnectModule,
  startTime: string,
  endTime: string,
  age: number | null,
): Promise<{ avg: number; max: number; zones: ReturnType<typeof hrZonesFromSamples> } | null> {
  try {
    const page = await hc.readRecords('HeartRate', {
      timeRangeFilter: { operator: 'between', startTime, endTime },
    })

    const beats = page.records.flatMap((record) =>
      record.samples.map((sample) => ({
        bpm: sample.beatsPerMinute,
        at: new Date(sample.time).getTime(),
      })),
    )

    if (beats.length === 0) return null

    return {
      avg: Math.round(beats.reduce((sum, b) => sum + b.bpm, 0) / beats.length),
      max: Math.round(Math.max(...beats.map((b) => b.bpm))),
      // Null when a writer sent one average for the session: ten samples is the
      // floor `hrZonesFromSamples` applies, and banding a single number would
      // draw one bar and call it a breakdown.
      zones: hrZonesFromSamples(beats, age),
    }
  } catch {
    return null
  }
}

/**
 * Steps by hour, for the days that genuinely have an hourly shape.
 *
 * `aggregateGroupByDuration` with an hour slice, filtered to the app the day
 * totals came from. What comes back depends on how that source recorded, and the
 * two cases look nothing alike: a watch writing per-minute segments fills the
 * hours it moved in, while Samsung Health writes one record spanning the whole
 * calendar day.
 *
 * Health Connect apportions a record across the buckets it overlaps, so that one
 * record lands in all 24, divided by 24. The chart drawn off it is a flat carpet
 * claiming the user took 117 steps at three in the morning, every morning.
 * `informativeHours` is what drops it.
 */
async function readHours(
  hc: ConnectModule,
  from: LocalDate,
  to: LocalDate,
  origin: string | null,
): Promise<HourReading[]> {
  const buckets = await group(
    hc,
    'Steps',
    from,
    to,
    { duration: 'HOURS', length: 1 },
    origin ?? undefined,
  )
  if (!buckets) return []

  const byDate = new Map<LocalDate, HourReading[]>()
  for (const bucket of buckets) {
    if (!hasOrigins(bucket.result)) continue
    const count = bucket.result.COUNT_TOTAL
    if (typeof count !== 'number' || count <= 0) continue

    const at = new Date(bucket.startTime)
    const date = dateKey(at)
    const hours = byDate.get(date) ?? []
    hours.push({
      date,
      hour: at.getHours(),
      steps: Math.round(count),
      activeKcal: 0,
      distanceM: null,
    })
    byDate.set(date, hours)
  }

  return [...byDate.values()].filter(informativeHours).flat()
}

/**
 * Whether a day's hourly steps say anything the daily total does not.
 *
 * One record spread over a whole day arrives as 24 buckets holding the same
 * number, give or take the rounding of dividing by 24. There is no shape in that,
 * so drawing it invents a night of walking and flattens the evening the user
 * actually did.
 *
 * Both halves of the test matter. The spread is what identifies an apportioned
 * record; the count is what stops it firing on a real day that happens to be
 * flat, because somebody who took 30 steps in each of three hours took them.
 */
export function informativeHours(hours: readonly HourReading[]): boolean {
  if (hours.length < 12) return true

  const counts = hours.map((hour) => hour.steps)
  return Math.max(...counts) - Math.min(...counts) > 1
}

const energy = (value: unknown): number | null => {
  const result = value as { inKilocalories?: number; inCalories?: number } | undefined
  if (result?.inKilocalories != null) return result.inKilocalories
  // Health Connect's "calories" are gram-calories. Everything on the screens is
  // kcal, and a raw 360,000 on a Move ring is a memorable bug to ship.
  if (result?.inCalories != null) return result.inCalories / 1000
  return null
}

const length = (value: unknown): number | null => {
  const result = value as { inMeters?: number } | undefined
  return result?.inMeters ?? null
}

const round = (value: number | undefined): number | null =>
  value == null ? null : Math.round(value)

export { sourceLabel } from './connectOrigins'
