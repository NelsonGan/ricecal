import type { Enums } from '@/lib/database.types'

/**
 * What a health store hands back, once it has stopped being Apple's or Google's
 * and started being ours.
 *
 * Every provider reads a different API with different units and a different idea
 * of what a day is. They agree here and only here: the sync, the tables and the
 * screens are written against these four shapes and have never heard of
 * HealthKit.
 *
 * Null means the provider has no opinion; zero means it measured none. That
 * distinction survives to the screen, where a missing stand-hour tile explains
 * itself instead of showing a confident zero.
 */

export type ProviderId = Enums<'health_provider'>

/** `yyyy-MM-dd`, in the user's own timezone. Never an instant — see `log_date`. */
export type LocalDate = string

export type ActivityDayReading = {
  date: LocalDate
  /**
   * Energy spent moving, above resting: the figure that extends the budget.
   *
   * Nullable by the rule at the top of this file. A store can report a day's
   * steps and have no opinion about its energy, which is how a Samsung user's
   * active energy read 0 kcal every day for a week while they walked 60,000
   * steps. Zero has to keep meaning "measured, and it was none".
   */
  activeKcal: number | null
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

/**
 * One day's weigh-in, as the store reported it: one per local day, and the day's
 * last reading when there were several, which is the rule `weight_logs` applies
 * to somebody weighing themselves twice before breakfast.
 *
 * Kilograms and a percentage, because that is what the database stores. Each
 * provider converts, since the two stores disagree about what a percentage is
 * (HealthKit's `%` is a fraction, Health Connect's is already 0-100) and carrying
 * the provider's units would push that into the sync.
 */
export type WeightReading = {
  date: LocalDate
  kg: number
  /** 0–100. Null when the store has no reading, which is most of them. */
  bodyFatPct: number | null
}

export type HealthReading = {
  days: ActivityDayReading[]
  workouts: WorkoutReading[]
  hours: HourReading[]
  weights: WeightReading[]
  /** "Apple Watch Series 9", "Galaxy Watch". Null until a sample names one. */
  deviceName: string | null
}

/**
 * Why a provider cannot be used, in the words the Activity screen needs. Not a
 * thrown error: "this is an Android phone" and "you are on a simulator" are
 * ordinary states the connect screen has copy for, and exceptions would mean
 * every caller catching to find out something it could have asked.
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
 * What a read needs to know beyond the dates. `age` is here rather than inside
 * the providers because it is a fact about the user: it turns a heart rate into a
 * zone, since the bands are fractions of a maximum estimated from age. Null when
 * the profile has no birth date, which `estimatedMaxHr` falls back for.
 */
export type ReadOptions = {
  withHours: boolean
  age: number | null
  /**
   * What this body spends doing nothing, in kcal a day, from the profile. Here
   * for the reason `age` is, and what splits a total-energy figure into the
   * active half a budget may read and the resting half it must not (see
   * `energyFor`). Only reached when the store has no basal to offer, which is
   * common on Android and never happens on iOS.
   *
   * Null when the profile is missing a body measurement, which leaves a
   * total-only provider unable to report active energy: the alternative is
   * crediting a user their entire basal metabolism as exercise.
   */
  basalKcal: number | null
}

export interface HealthProvider {
  readonly id: ProviderId

  /**
   * The store's own names for everything this provider will read. Declared rather
   * than inferred from `requestAccess`, which returns what was granted on Android
   * and merely what was asked for on iOS. This is the ask, on both.
   *
   * It exists so the sync can notice the list has grown since this device last saw
   * a permission sheet. A connection and a sheet happen once, so a release that
   * starts reading a new type would never be authorised for it on any existing
   * install: a refusal the user was never offered the chance to make.
   */
  readonly readTypes: readonly string[]

  isAvailable(): Promise<Availability>

  /**
   * Ask for read access. Idempotent: on iOS the sheet only appears the first
   * time, and on Android a granted permission returns immediately.
   */
  requestAccess(): Promise<AccessResult>

  /**
   * Everything between two local dates, inclusive. `withHours` is separate
   * because the hourly breakdown is the most expensive read, at 24 buckets a day,
   * and only the last month of it is ever drawn.
   */
  read(from: LocalDate, to: LocalDate, options: ReadOptions): Promise<HealthReading>
}
