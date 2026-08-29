/**
 * What RiceCal reads out of Health Connect, and the Android permissions that
 * let it.
 *
 * `androidHealth.ts` asks the SDK for record types at runtime; the manifest
 * declares permission strings at build time, and Android grants nothing that
 * was not declared. An undeclared permission is silent: the type never appears
 * on the permission sheet, and `requestAccess` reports a refusal the user was
 * never offered. Android health sync shipped that way, because
 * `react-native-health-connect`'s config plugin adds the rationale
 * intent-filter and nothing else.
 *
 * The manifest half is a literal list in `app.json` rather than an import of
 * this file: Expo's config loader requires `app.config.ts`'s relative imports
 * through plain Node, which cannot load a `.ts` module. `__tests__/health.test.ts`
 * reads `app.json` and fails when a record type here has no permission there.
 */

/** The record types the provider aggregates. The order is the read order. */
export const CONNECT_READ_TYPES = [
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  /**
   * Read to split a total rather than to display. Samsung Health and others
   * write the day's total energy and never the active half, and only the active
   * half may reach a budget that is already a Mifflin-St Jeor figure.
   */
  'BasalMetabolicRate',
  'Steps',
  'Distance',
  'ExerciseSession',
  'HeartRate',
  // Not movement. A weigh-in is an input to the calorie budget rather than a
  // statistic beside it, so a scale that writes here moves the user's target
  // without them typing anything.
  'Weight',
  'BodyFat',
] as const

export type ConnectReadType = (typeof CONNECT_READ_TYPES)[number]

/**
 * Whether a record type named by the platform is one this app reads. A guard
 * rather than a bare `includes`, so the widening cast lives here rather than at
 * every call site narrowing a `string` from the SDK.
 */
export const isConnectReadType = (value: string): value is ConnectReadType =>
  (CONNECT_READ_TYPES as readonly string[]).includes(value)

/**
 * The permission that reads each record type. Written out rather than derived:
 * all but one are the type name in screaming snake case, and the exception is
 * `ExerciseSession`, read by `READ_EXERCISE`, so a derivation would be silently
 * wrong about workouts.
 */
const READ_PERMISSION: Record<ConnectReadType, string> = {
  ActiveCaloriesBurned: 'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  TotalCaloriesBurned: 'android.permission.health.READ_TOTAL_CALORIES_BURNED',
  BasalMetabolicRate: 'android.permission.health.READ_BASAL_METABOLIC_RATE',
  Steps: 'android.permission.health.READ_STEPS',
  Distance: 'android.permission.health.READ_DISTANCE',
  ExerciseSession: 'android.permission.health.READ_EXERCISE',
  HeartRate: 'android.permission.health.READ_HEART_RATE',
  Weight: 'android.permission.health.READ_WEIGHT',
  BodyFat: 'android.permission.health.READ_BODY_FAT',
}

/**
 * Every permission `android.permissions` in `app.json` has to declare. Derived
 * rather than listed a third time, so a new record type with no permission is a
 * type error above and a missing manifest entry is a failing test.
 */
export const ANDROID_HEALTH_PERMISSIONS: string[] = CONNECT_READ_TYPES.map(
  (recordType) => READ_PERMISSION[recordType],
)
