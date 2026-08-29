/**
 * The workout types RiceCal draws, and how each provider's numbering reaches one
 * of them.
 *
 * Not an enum anywhere: Apple ships around eighty `HKWorkoutActivityType` values
 * and adds to them in point releases, and Health Connect has its own ninety-odd.
 * `activity_sessions.kind` is `text` and this map is a floor rather than a gate,
 * so an unknown type lands as `other`, keeps the provider's label, and costs an
 * illustration rather than failing a sync mid-backfill.
 *
 * The set is chosen for what a Malaysian phone records: badminton is first-class,
 * and everything Apple splits fine-grained that nobody distinguishes on a list
 * row is folded into one.
 *
 * Icons and copy live in `features/activity/workoutKind.ts`. This is the part the
 * platform adapters need, and it imports nothing.
 */

export const WORKOUT_KINDS = [
  'run',
  'walk',
  'hike',
  'cycle',
  'swim',
  'badminton',
  'tennis',
  'football',
  'basketball',
  'volleyball',
  'gym',
  'strength',
  'hiit',
  'yoga',
  'dance',
  'martialArts',
  'rowing',
  'stairs',
  'other',
] as const

export type WorkoutKind = (typeof WORKOUT_KINDS)[number]

const KIND_SET: ReadonlySet<string> = new Set(WORKOUT_KINDS)

/** A stored `kind` back to a drawable one. Anything unknown is `other`. */
export function asWorkoutKind(kind: string): WorkoutKind {
  return KIND_SET.has(kind) ? (kind as WorkoutKind) : 'other'
}

/**
 * HealthKit's numeric `HKWorkoutActivityType`.
 *
 * Keyed by number rather than by the library's enum so this file does not
 * import an iOS-only package — it is read on the Android path too, when a
 * session synced from an old iPhone is rendered.
 */
const APPLE_TYPES: Record<number, WorkoutKind> = {
  4: 'badminton',
  6: 'basketball',
  8: 'martialArts', // boxing
  11: 'hiit', // crossTraining
  13: 'cycle',
  14: 'dance',
  16: 'gym', // elliptical
  20: 'strength', // functionalStrengthTraining
  24: 'hike',
  28: 'martialArts',
  29: 'yoga', // mindAndBody
  30: 'hiit', // mixedMetabolicCardioTraining
  34: 'badminton', // racquetball — the nearest racquet illustration
  35: 'rowing',
  37: 'run',
  41: 'football', // soccer
  43: 'badminton', // squash
  44: 'stairs', // stairClimbing
  46: 'swim',
  47: 'tennis', // tableTennis
  48: 'tennis',
  50: 'strength', // traditionalStrengthTraining
  51: 'volleyball',
  52: 'walk',
  57: 'yoga',
  58: 'yoga', // barre
  59: 'strength', // coreTraining
  63: 'hiit', // highIntensityIntervalTraining
  64: 'hiit', // jumpRope
  65: 'martialArts', // kickboxing
  66: 'yoga', // pilates
  68: 'stairs',
  69: 'gym', // stepTraining
  72: 'yoga', // taiChi
  73: 'hiit', // mixedCardio
  77: 'dance', // cardioDance
  78: 'dance', // socialDance
  79: 'tennis', // pickleball
}

export function fromAppleWorkoutType(type: number): WorkoutKind {
  return APPLE_TYPES[type] ?? 'other'
}

/**
 * Health Connect's `ExerciseSessionRecord.exerciseType`, which is also numeric
 * and is NOT Apple's numbering — 11 is boxing there and crossTraining here.
 * Keeping the two tables apart is the only thing stopping a badminton game
 * becoming a swim when somebody changes phone.
 *
 * @see https://developer.android.com/reference/androidx/health/connect/client/records/ExerciseSessionRecord
 */
const CONNECT_TYPES: Record<number, WorkoutKind> = {
  2: 'badminton',
  5: 'basketball',
  8: 'cycle', // BIKING
  9: 'cycle', // BIKING_STATIONARY
  10: 'hiit', // BOOT_CAMP
  11: 'martialArts', // BOXING
  13: 'strength', // CALISTHENICS
  16: 'dance', // DANCING
  25: 'gym', // ELLIPTICAL
  26: 'gym', // EXERCISE_CLASS
  28: 'football', // FOOTBALL_AMERICAN
  29: 'football', // FOOTBALL_AUSTRALIAN
  34: 'gym', // GYMNASTICS
  35: 'football', // HANDBALL
  36: 'hiit', // HIGH_INTENSITY_INTERVAL_TRAINING
  37: 'hike', // HIKING
  44: 'martialArts', // MARTIAL_ARTS
  46: 'rowing', // PADDLING
  48: 'yoga', // PILATES
  50: 'badminton', // RACQUETBALL
  53: 'rowing', // ROWING
  54: 'rowing', // ROWING_MACHINE
  55: 'football', // RUGBY
  56: 'run', // RUNNING
  57: 'run', // RUNNING_TREADMILL
  64: 'football', // SOCCER
  66: 'badminton', // SQUASH
  68: 'stairs', // STAIR_CLIMBING
  69: 'stairs', // STAIR_CLIMBING_MACHINE
  70: 'strength', // STRENGTH_TRAINING
  71: 'yoga', // STRETCHING
  73: 'swim', // SWIMMING_OPEN_WATER
  74: 'swim', // SWIMMING_POOL
  75: 'tennis', // TABLE_TENNIS
  76: 'tennis', // TENNIS
  78: 'volleyball', // VOLLEYBALL
  79: 'walk', // WALKING
  81: 'strength', // WEIGHTLIFTING
  83: 'yoga', // YOGA
}

export function fromConnectExerciseType(type: number): WorkoutKind {
  return CONNECT_TYPES[type] ?? 'other'
}
