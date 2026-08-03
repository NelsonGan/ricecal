import { Platform } from 'react-native'

import { dateKey } from '@/data/client'
import { eachDay } from './apple'
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
  WorkoutReading,
} from './types'

/**
 * Health Connect: the Android path, and by 2026 the only Android path.
 *
 * Google Fit's REST and Android APIs stopped taking new developers in May 2024
 * and are switched off through late 2026, with no automatic data migration.
 * Health Connect replaced them, and since Android 14 it is part of the
 * framework rather than an app you install. Everything a user's phone knows
 * about their movement — Samsung Health, Fitbit, Garmin Connect, Strava, Mi Fit
 * — reaches us through it, which is why this file talks to one API and the
 * connect screen talks about several apps.
 *
 * WHAT IS RELIABLY MISSING HERE, AND WHY THAT IS THE DESIGN
 *
 * Health Connect is an aggregator, so what it holds depends entirely on what
 * wrote to it:
 *
 *   * No stand hours. There is no such record type. Apple's Stand ring has no
 *     equivalent and the Activity screen shows steps in its place.
 *   * Basal energy only if something writes `BasalMetabolicRate` or
 *     `TotalCaloriesBurned`. Many phones write neither, so the energy-balance
 *     screen falls back to the profile's own Mifflin-St Jeor figure and says so.
 *   * Heart rate at whatever resolution the writer chose. A watch writes a
 *     sample a second and gives real zones; Strava writes one average per
 *     session and gives none. `hr_zones` is null for the second, which is
 *     exactly the N4 screen in the design.
 *   * Hourly steps only if the writer recorded short segments. Samsung Health
 *     writes coarse blocks, so `readHours` here returns what it can and the
 *     steps screen groups the day into three when the answer is too sparse to
 *     draw twenty-four columns of.
 *
 * None of that is an error state. It is the shape of the platform, and the
 * screens are written to report it rather than to hide it behind zeros.
 *
 * The `require` is lazy for the same reason as `apple.ts` — see the note there.
 */

type ConnectModule = typeof import('react-native-health-connect')

const READ_TYPES = [
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  'Steps',
  'Distance',
  'ExerciseSession',
  'HeartRate',
] as const

export const CONNECT_READ_TYPES: string[] = [...READ_TYPES]

const permissionsFor = () =>
  READ_TYPES.map((recordType) => ({ accessType: 'read' as const, recordType }))

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

/**
 * A daily aggregate, folded to `date -> value`.
 *
 * `aggregateGroupByPeriod` with a DAYS slicer rather than reading records and
 * summing, for the reason `apple.ts` uses a statistics collection: Health
 * Connect deduplicates across data origins inside the aggregate, and a phone
 * with both Samsung Health and Google Fit writing steps otherwise counts every
 * step twice.
 *
 * A failure here is caught and returns nothing, because a single denied record
 * type must not take the whole sync with it — a user who granted steps but not
 * workouts has a working Activity screen with an explained gap, which is the N1
 * and N6 screens in the design.
 */
async function daily<T extends string>(
  hc: ConnectModule,
  recordType: T,
  from: LocalDate,
  to: LocalDate,
  pick: (result: Record<string, unknown>) => number | null,
): Promise<Map<LocalDate, number>> {
  const out = new Map<LocalDate, number>()

  try {
    const groups = await hc.aggregateGroupByPeriod({
      // biome-ignore lint/suspicious/noExplicitAny: the record-type union is wider than this helper needs
      recordType: recordType as any,
      timeRangeFilter: between(from, to),
      timeRangeSlicer: { period: 'DAYS', length: 1 },
    })

    for (const group of groups) {
      const value = pick(group.result as unknown as Record<string, unknown>)
      if (value == null) continue
      out.set(dateKey(new Date(group.startTime)), value)
    }
  } catch {
    return out
  }

  return out
}

export const healthConnect: HealthProvider = {
  id: 'health_connect',

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
      if ('recordType' in permission && typeof permission.recordType === 'string') {
        names.push(permission.recordType)
      }
    }

    return { granted: names.length > 0, permissions: names }
  },

  async read(from, to, { withHours, age }): Promise<HealthReading> {
    const hc = load()
    if (!hc) return { days: [], workouts: [], hours: [], deviceName: null }

    await hc.initialize()

    const [active, total, steps, distance, exercise] = await Promise.all([
      daily(hc, 'ActiveCaloriesBurned', from, to, (r) => energy(r.ACTIVE_CALORIES_TOTAL)),
      daily(hc, 'TotalCaloriesBurned', from, to, (r) => energy(r.ENERGY_TOTAL)),
      daily(hc, 'Steps', from, to, (r) =>
        typeof r.COUNT_TOTAL === 'number' ? r.COUNT_TOTAL : null,
      ),
      daily(hc, 'Distance', from, to, (r) => length(r.DISTANCE)),
      daily(hc, 'ExerciseSession', from, to, (r) => {
        const duration = r.EXERCISE_DURATION_TOTAL as { inSeconds?: number } | undefined
        return duration?.inSeconds == null ? null : Math.round(duration.inSeconds / 60)
      }),
    ])

    const days: ActivityDayReading[] = []
    for (const date of eachDay(from, to)) {
      const activeKcal = active.get(date)
      const stepCount = steps.get(date)
      if (activeKcal == null && stepCount == null) continue

      /**
       * Resting is TOTAL minus ACTIVE, and only when total is present.
       *
       * Health Connect has no "basal energy for the day" aggregate that lines
       * up with Apple's — `BasalMetabolicRate` is a rate in kcal/day recorded
       * at instants, not a daily sum. `TotalCaloriesBurned` is the one figure
       * that means the same thing on both platforms, and the subtraction is
       * the only honest way to reach the split the balance screen draws.
       */
      const totalKcal = total.get(date)
      const resting =
        totalKcal == null || activeKcal == null
          ? null
          : Math.max(0, Math.round(totalKcal - activeKcal))

      days.push({
        date,
        activeKcal: Math.round(activeKcal ?? 0),
        restingKcal: resting,
        steps: Math.round(stepCount ?? 0),
        distanceM: round(distance.get(date)),
        exerciseMinutes: round(exercise.get(date)),
        // No such record type. Null, never zero — see the header.
        standHours: null,
        flights: null,
        moveGoalKcal: null,
        exerciseGoalMin: null,
        standGoalHr: null,
      })
    }

    const [workouts, hours] = await Promise.all([
      readWorkouts(hc, from, to, age),
      withHours ? readHours(hc, from, to) : Promise.resolve<HourReading[]>([]),
    ])

    return {
      days,
      workouts,
      hours,
      deviceName: workouts.find((w) => w.sourceName)?.sourceName ?? null,
    }
  },
}

async function readWorkouts(
  hc: ConnectModule,
  from: LocalDate,
  to: LocalDate,
  age: number | null,
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
      sessionEnergy(hc, session.startTime, session.endTime),
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
 * A session's calories, which are NOT on the session record.
 *
 * Health Connect models energy as its own record type over a time range, so the
 * cost of a workout is an aggregate over the workout's window. That window can
 * legitimately hold energy the session did not cause — a walk that overlapped
 * the end of a gym session — and the number is still the best available answer,
 * because the alternative is showing no calories at all for every Android
 * workout.
 */
async function sessionEnergy(
  hc: ConnectModule,
  startTime: string,
  endTime: string,
): Promise<number | null> {
  try {
    const result = await hc.aggregateRecord({
      recordType: 'ActiveCaloriesBurned',
      timeRangeFilter: { operator: 'between', startTime, endTime },
    })
    const value = energy((result as Record<string, unknown>).ACTIVE_CALORIES_TOTAL)
    return value == null ? null : Math.round(value)
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
 * Steps by hour, as far as the writing app allows.
 *
 * `aggregateGroupByDuration` with an hour slice. What comes back depends on how
 * the source recorded: a watch writing per-minute segments fills all 24, while
 * Samsung Health's coarse blocks land in a handful. Both are returned as-is —
 * deciding whether there is enough shape to draw an hourly chart is the steps
 * screen's job, and it is a decision that needs the data to make.
 */
async function readHours(
  hc: ConnectModule,
  from: LocalDate,
  to: LocalDate,
): Promise<HourReading[]> {
  try {
    const groups = await hc.aggregateGroupByDuration({
      recordType: 'Steps',
      timeRangeFilter: between(from, to),
      timeRangeSlicer: { duration: 'HOURS', length: 1 },
    })

    const out: HourReading[] = []
    for (const group of groups) {
      const count = (group.result as unknown as { COUNT_TOTAL?: number }).COUNT_TOTAL
      if (!count) continue
      const at = new Date(group.startTime)
      out.push({
        date: dateKey(at),
        hour: at.getHours(),
        steps: Math.round(count),
        activeKcal: 0,
        distanceM: null,
      })
    }
    return out
  } catch {
    return []
  }
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

/**
 * A writing app's package name as something a person would recognise.
 *
 * The list is the apps that actually matter in this market; anything else falls
 * back to the last dotted segment, title-cased, which turns `com.acme.tracker`
 * into "Tracker" rather than showing the whole package on a detail screen.
 */
const SOURCE_NAMES: Record<string, string> = {
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.strava': 'Strava',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.xiaomi.wearable': 'Mi Fitness',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.google.android.apps.healthdata': 'Health Connect',
}

export function sourceLabel(dataOrigin: string | null): string | null {
  if (!dataOrigin) return null
  const known = SOURCE_NAMES[dataOrigin]
  if (known) return known
  if (!dataOrigin.includes('.')) return dataOrigin
  const last = dataOrigin.split('.').filter(Boolean).at(-1) ?? dataOrigin
  return last.charAt(0).toUpperCase() + last.slice(1)
}
