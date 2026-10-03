import type { ActivitySession } from '@/data'
import { pace, speed } from './format'
import { asWorkoutKind, showsDistance, showsSpeed, type WorkoutKind } from './workoutKind'

/** The illustration's setting follows the sport; the numbers keep their own meaning. */
export const WORKOUT_TONE = {
  run: 'pandan',
  walk: 'pandan',
  hike: 'pandan',
  cycle: 'kaya',
  swim: 'water',
  badminton: 'kaya',
  tennis: 'pandan',
  football: 'pandan',
  basketball: 'teh',
  volleyball: 'kaya',
  gym: 'water',
  strength: 'hibiscus',
  hiit: 'hibiscus',
  yoga: 'water',
  dance: 'hibiscus',
  martialArts: 'teh',
  rowing: 'water',
  stairs: 'kaya',
  other: 'pandan',
} as const satisfies Record<WorkoutKind, string>

export type WorkoutTone = (typeof WORKOUT_TONE)[WorkoutKind]

/**
 * A court's shuffling distance must not become a pace. Missing distance also
 * keeps an indoor ride useful: its hero falls back to time, without empty tiles.
 */
export function workoutDetails(session: ActivitySession) {
  const kind = asWorkoutKind(session.kind)
  const metres = session.distanceM
  const hasDistance = showsDistance(kind) && metres != null && metres > 0
  const distance = hasDistance
    ? kind === 'swim' || metres < 1000
      ? { value: Math.round(metres).toLocaleString(), unit: 'm' as const }
      : { value: (metres / 1000).toFixed(2), unit: 'km' as const }
    : null

  // These are averages over the recorded duration, not lap or moving-time pace.
  const perKm = hasDistance ? pace(session.durationS, metres) : null
  const rhythm = showsSpeed(kind)
    ? { value: hasDistance ? speed(session.durationS, metres) : null, unit: 'speedUnit' as const }
    : kind === 'swim'
      ? {
          value: hasDistance && perKm ? pace(session.durationS, metres * 10) : null,
          unit: 'swimPaceUnit' as const,
        }
      : kind === 'rowing'
        ? {
            value: hasDistance && perKm ? pace(session.durationS, metres * 2) : null,
            unit: 'rowPaceUnit' as const,
          }
        : { value: perKm, unit: 'paceUnit' as const }

  return {
    kind,
    tone: WORKOUT_TONE[kind],
    distance,
    rhythm: rhythm.value ? { value: rhythm.value, unit: rhythm.unit } : null,
  }
}
