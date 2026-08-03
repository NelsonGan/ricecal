import type { Enums } from '@/lib/database.types'

/**
 * What a health store hands back, once it has stopped being Apple's or Google's
 * and started being ours.
 *
 * Every provider reads a different API with different units and a different
 * idea of what a day is. They agree here, and only here: everything downstream
 * — the sync, the tables, the screens — is written against these four shapes
 * and has never heard of HealthKit.
 *
 * NULL MEANS THE PROVIDER HAS NO OPINION. Zero means it measured none. That
 * distinction survives all the way to the database and then to the screen,
 * where a missing stand-hour tile explains itself instead of showing a
 * confident zero to an Android user whose phone will never report one.
 */

export type ProviderId = Enums<'health_provider'>

/** `yyyy-MM-dd`, in the user's own timezone. Never an instant — see `log_date`. */
export type LocalDate = string

export type ActivityDayReading = {
  date: LocalDate
  /** Energy spent moving, above resting. The figure that extends the budget. */
  activeKcal: number
  restingKcal: number | null
  steps: number
  distanceM: number | null
  exerciseMinutes: number | null
  standHours: number | null
  flights: number | null
  moveGoalKcal: number | null
  exerciseGoalMin: number | null
  standGoalHr: number | null
}

/** Seconds in each band. Four bands because four is what a ring can show. */
export type HrZones = {
  easy: number
  steady: number
  hard: number
  peak: number
}

export type WorkoutReading = {
  /** The store's own id. What makes re-reading a week idempotent. */
  externalId: string
  /** The local day the session STARTED. A 00:30 run is that night's run. */
  date: LocalDate
  /** Our slug — see `workoutKind.ts`. Never the provider's raw type. */
  kind: string
  /** What the provider called it, for the detail screen's subtitle. */
  kindLabel: string | null
  startedAt: string
  endedAt: string
  durationS: number
  activeKcal: number
  distanceM: number | null
  avgHr: number | null
  maxHr: number | null
  elevationM: number | null
  hrZones: HrZones | null
  sourceName: string | null
}

export type HourReading = {
  date: LocalDate
  /** 0–23, local. */
  hour: number
  steps: number
  activeKcal: number
  distanceM: number | null
}

export type HealthReading = {
  days: ActivityDayReading[]
  workouts: WorkoutReading[]
  hours: HourReading[]
  /** "Apple Watch Series 9", "Galaxy Watch". Null until a sample names one. */
  deviceName: string | null
}

/**
 * Why a provider cannot be used, in the words the Activity screen needs.
 *
 * Not an error, and deliberately not a thrown one. "This is an Android phone"
 * and "you are on a simulator" are both ordinary states of the world that the
 * connect screen has copy for, and making them exceptions would mean every
 * caller catching to find out something it could have asked.
 */
export type Availability =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'wrong-platform'
        /** iOS simulator, or an iPad. `HKHealthStore` says no. */
        | 'no-health-store'
        /** Android without Health Connect, or an old enough Android. */
        | 'not-installed'
        /**
         * The JS is here and the native side is not — a dev client built before
         * the dependency was added. Its own reason because the fix is a rebuild,
         * not anything the user can do, and saying "not supported" to a
         * developer on a device that plainly supports it wastes an afternoon.
         */
        | 'not-linked'
    }

export type AccessResult = {
  granted: boolean
  /** The provider's own type names, as stored on `health_connections`. */
  permissions: string[]
}

/**
 * What a read needs to know beyond the dates.
 *
 * `age` is here rather than inside the providers because it is a fact about the
 * USER and the providers only know about the store. It is what turns a heart
 * rate into a zone: the bands are fractions of an estimated maximum, and that
 * maximum is a function of age (see `hrZones.ts`). Null when the profile has no
 * birth date, which `estimatedMaxHr` has its own documented fallback for —
 * every caller falls back the same way rather than each inventing a number.
 */
export type ReadOptions = {
  withHours: boolean
  age: number | null
}

export interface HealthProvider {
  readonly id: ProviderId

  isAvailable(): Promise<Availability>

  /**
   * Ask for read access. Idempotent: on iOS the sheet only appears the first
   * time, and on Android a granted permission returns immediately.
   */
  requestAccess(): Promise<AccessResult>

  /**
   * Everything between two local dates, inclusive.
   *
   * `withHours` is separate because the hourly breakdown is by far the most
   * expensive read — 24 buckets a day against a store that answers slowly — and
   * only the last month of it is ever drawn. A year-long backfill passes false.
   */
  read(from: LocalDate, to: LocalDate, options: ReadOptions): Promise<HealthReading>
}
