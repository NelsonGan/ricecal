import { Platform } from 'react-native'
import { healthConnect } from './androidHealth'
import { appleHealth } from './apple'
import { demoHealth } from './demo'
import type { Availability, HealthProvider, ProviderId } from './types'

export { healthConnect, sourceLabel } from './androidHealth'
export { APPLE_READ_TYPES, appleHealth, eachDay } from './apple'
// `ANDROID_HEALTH_PERMISSIONS` deliberately stays out of the barrel. It answers
// a question about the MANIFEST, and nothing at runtime can act on it — a
// screen that imported it would be reading build-time trivia and drawing
// conclusions about a grant it does not describe.
export { CONNECT_READ_TYPES, type ConnectReadType } from './connectPermissions'
export { demoHealth } from './demo'
export {
  estimatedMaxHr,
  hrZonesFromSamples,
  parseHrZones,
  ZONE_KEY,
  ZONE_ORDER,
  type ZoneName,
} from './hrZones'
export {
  asWorkoutKind,
  fromAppleWorkoutType,
  fromConnectExerciseType,
  WORKOUT_KINDS,
  type WorkoutKind,
} from './kinds'
export type {
  AccessResult,
  ActivityDayReading,
  Availability,
  HealthProvider,
  HealthReading,
  HourReading,
  HrZones,
  LocalDate,
  ProviderId,
  WorkoutReading,
} from './types'

const PROVIDERS: Record<ProviderId, HealthProvider> = {
  apple_health: appleHealth,
  health_connect: healthConnect,
  demo: demoHealth,
}

export const providerFor = (id: ProviderId): HealthProvider => PROVIDERS[id]

/** The store this platform has, before asking whether it works. */
export const nativeProvider = (): HealthProvider =>
  Platform.OS === 'ios' ? appleHealth : healthConnect

export type ProviderOffer = {
  /** The real store for this phone, and why it cannot be used if it cannot. */
  native: { provider: HealthProvider; availability: Availability }
  /**
   * Whether to offer generated data up front. Development only, and gated on the
   * native store being unusable rather than on the build type alone: a developer
   * on a real iPhone should be connecting their real Health app.
   *
   * Not the whole rule. A store that is available and empty, which is what a
   * simulator is, can only be detected by reading it; see `canOfferDemo`.
   */
  demo: boolean
}

/**
 * What the connect screen may offer.
 *
 * A release build on a simulator is not a thing that ships, and a release build
 * on a device that reports no health store — an iPad — gets the honest empty
 * state rather than fiction.
 */
export async function offeredProviders(): Promise<ProviderOffer> {
  const provider = nativeProvider()
  const availability = await provider.isAvailable()

  return {
    native: { provider, availability },
    demo: canOfferDemo(availability, false),
  }
}

/**
 * Whether generated data may be offered, given what we now know. Split out from
 * `offeredProviders` because this half of the answer only exists after a
 * connection has been attempted.
 *
 * An iOS 26 simulator reports `isHealthDataAvailable()` true and shows the real
 * permission sheet, but its store is empty, so a granted connection reads a year
 * and writes nothing. Before the read that is indistinguishable from an iPhone
 * whose owner has never worn a watch, so it is decided by the outcome.
 */
export function canOfferDemo(availability: Availability, connectReadNothing: boolean): boolean {
  return __DEV__ && (!availability.ok || connectReadNothing)
}
