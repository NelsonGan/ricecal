import { Platform } from 'react-native'
import { healthConnect } from './androidHealth'
import { appleHealth } from './apple'
import { demoHealth } from './demo'
import type { Availability, HealthProvider, ProviderId } from './types'

export { CONNECT_READ_TYPES, healthConnect, sourceLabel } from './androidHealth'
export { APPLE_READ_TYPES, appleHealth, eachDay } from './apple'
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
   * Whether to offer generated data up front.
   *
   * Development only, and gated on the native store being unusable rather than
   * on the build type alone: a developer on a real iPhone should be connecting
   * their real Health app, and a "use demo data" button next to it is a trap
   * they will fall into once and then debug for an hour.
   *
   * NOT the whole rule. A store that is available and EMPTY — which is what a
   * simulator is — cannot be detected here, only by reading it. The connect
   * screen offers demo data as a second chance after a connect that came back
   * with nothing; see `canOfferDemo`.
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
 * Whether generated data may be offered, given what we now know.
 *
 * Split out from `offeredProviders` because the second half of the answer only
 * exists after a connection has been attempted.
 *
 * The iOS Simulator was long documented as having no Health app at all, and the
 * first version of this checked exactly that. It is no longer true — an iOS 26
 * simulator reports `isHealthDataAvailable()` true and shows the real
 * permission sheet — but its store is EMPTY, so a granted connection reads a
 * year and writes nothing. That state is indistinguishable, before the read,
 * from an iPhone whose owner has simply never worn a watch, which is why it
 * cannot be decided by `isAvailable()` and is decided by the outcome instead.
 */
export function canOfferDemo(availability: Availability, connectReadNothing: boolean): boolean {
  return __DEV__ && (!availability.ok || connectReadNothing)
}
