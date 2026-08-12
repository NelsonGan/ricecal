/**
 * What RiceCal reads out of Health Connect, and the Android permissions that
 * let it.
 *
 * This is one list written down once, because the two halves of it live in
 * different worlds and cannot check each other. `androidHealth.ts` asks the SDK
 * for RECORD TYPES at runtime; the manifest declares PERMISSION STRINGS at
 * build time, and Android grants nothing that was not declared.
 *
 * Getting the manifest half wrong is silent in the worst way. An undeclared
 * permission is not an error: the type simply never appears on the permission
 * sheet, `requestPermission` returns without it, and `requestAccess` reports a
 * refusal the user was never offered the chance to make. That is exactly how
 * Android health sync shipped broken — the config declared CAMERA and
 * RECORD_AUDIO and nothing else, and `react-native-health-connect`'s config
 * plugin adds only the rationale intent-filter and the
 * `ViewPermissionUsageActivity` alias, never a `uses-permission`.
 *
 * The manifest half is the literal list in `app.json`, beside CAMERA and
 * RECORD_AUDIO, and NOT an import of this file — Expo's config loader
 * transpiles `app.config.ts` alone and requires its relative imports through
 * plain Node, which cannot load a `.ts` module. So the two lists really are two
 * lists, and `__tests__/health.test.ts` is what holds them together: it reads
 * `app.json` and fails when a record type here has no permission there.
 */

/** The record types the provider aggregates. The order is the read order. */
export const CONNECT_READ_TYPES = [
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
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
 * Whether a record type named by the platform is one this app reads.
 *
 * A guard rather than a bare `includes`, because the caller is narrowing a
 * `string` that came back from the SDK and the widening cast that needs would
 * sit at the call site rather than here.
 */
export const isConnectReadType = (value: string): value is ConnectReadType =>
  (CONNECT_READ_TYPES as readonly string[]).includes(value)

/**
 * The permission that reads each record type.
 *
 * Written out rather than derived from the type name. Seven of the eight ARE
 * the name in screaming snake case, which is what makes a derivation tempting;
 * the eighth is not — `ExerciseSession` is read by `READ_EXERCISE` — so a
 * clever version would be right seven times and silently wrong about workouts,
 * which is the half of the feature with a screen of its own.
 */
const READ_PERMISSION: Record<ConnectReadType, string> = {
  ActiveCaloriesBurned: 'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  TotalCaloriesBurned: 'android.permission.health.READ_TOTAL_CALORIES_BURNED',
  Steps: 'android.permission.health.READ_STEPS',
  Distance: 'android.permission.health.READ_DISTANCE',
  ExerciseSession: 'android.permission.health.READ_EXERCISE',
  HeartRate: 'android.permission.health.READ_HEART_RATE',
  Weight: 'android.permission.health.READ_WEIGHT',
  BodyFat: 'android.permission.health.READ_BODY_FAT',
}

/**
 * Every permission `android.permissions` in `app.json` has to declare.
 *
 * Derived from the record types rather than listed a third time, so adding a
 * type to `CONNECT_READ_TYPES` without naming its permission is a TYPE ERROR in
 * the map above, and forgetting the manifest is a failing test.
 */
export const ANDROID_HEALTH_PERMISSIONS: string[] = CONNECT_READ_TYPES.map(
  (recordType) => READ_PERMISSION[recordType],
)
