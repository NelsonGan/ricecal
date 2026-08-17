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
  /**
   * Energy spent moving, above resting. The figure that extends the budget.
   *
   * NULLABLE, and the reason is the rule at the top of this file rather than an
   * exception to it. A store can report a day's steps and have no opinion at
   * all about its energy — Health Connect hands back a bucket of zeros for a
   * record type nobody on the phone writes, which is how a Samsung user's
   * active energy read 0 kcal every day for a week while they walked 60,000
   * steps. Zero here has to keep meaning "measured, and it was none".
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
 * One day's weigh-in, as the store reported it.
 *
 * ONE PER LOCAL DAY, and the day's LAST reading when there were several — which
 * is the same rule `weight_logs` has always applied to a user weighing
 * themselves twice before breakfast. A scale that syncs three times in a morning
 * is the ordinary case, not an edge one.
 *
 * Kilograms and a percentage, because that is what the database stores. The
 * conversion happens in each provider rather than here: the two stores disagree
 * about what a percentage is (HealthKit's `%` unit is a FRACTION, Health
 * Connect's is already 0–100), and a shape that carried the provider's own units
 * would push that disagreement into the sync, where there is nothing left to
 * tell the two apart.
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
  /**
   * What this body spends doing nothing, in kcal a day, from the profile.
   *
   * Here for the same reason as `age`: it is a fact about the USER and the
   * providers only know about the store. It is what SPLITS a total-energy
   * figure into the active half a budget may read and the resting half it must
   * not — see `energyFor` in `androidHealth.ts`. Only reached when the store
   * itself has no basal to offer, which on Android is common and on iOS never
   * happens, since HealthKit reports basal energy directly.
   *
   * Null when the profile is missing a body measurement, which leaves a
   * total-only provider unable to report active energy at all. That is the
   * correct answer rather than a degraded one: the alternative is crediting a
   * user their entire basal metabolism as exercise.
   */
  basalKcal: number | null
}

export interface HealthProvider {
  readonly id: ProviderId

  /**
   * The store's own names for everything this provider will read.
   *
   * Declared rather than inferred from `requestAccess`, because the two mean
   * different things: what comes back from a request is what was GRANTED on
   * Android and merely what was asked for on iOS. This is the ask, on both.
   *
   * It exists so the sync can notice that the list has GROWN since this device
   * last saw a permission sheet. A connection is made once and a permission
   * sheet is shown once, so a release that starts reading a new type would
   * otherwise never be authorised for it on any existing install: the
   * incremental pass does not request access, so the new type stays
   * undetermined, reads return nothing, and the feature is silently dead for
   * everybody who was already connected. That is the failure this directory
   * keeps meeting — a refusal the user was never offered the chance to make.
   */
  readonly readTypes: readonly string[]

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
