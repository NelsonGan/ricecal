import type { IconRef } from '@/data'
import { asWorkoutKind, type WorkoutKind } from '@/lib/health'

/**
 * How a workout kind looks and reads.
 *
 * The kinds themselves, and every provider's numbering onto them, are in
 * `lib/health/kinds.ts` — that half is read by the platform adapters and knows
 * nothing about icons. This half is the screens': one illustration and one copy
 * key per kind, plus the two questions a row asks before deciding what to show.
 */

export { asWorkoutKind, WORKOUT_KINDS, type WorkoutKind } from '@/lib/health'

const ICONS: Record<WorkoutKind, IconRef> = {
  run: { set: 'body', name: 'running' },
  walk: { set: 'body', name: 'walking' },
  hike: { set: 'body', name: 'hiking' },
  cycle: { set: 'body', name: 'cycling' },
  swim: { set: 'body', name: 'swimming' },
  badminton: { set: 'body', name: 'badminton' },
  tennis: { set: 'body', name: 'tennis' },
  football: { set: 'body', name: 'football' },
  basketball: { set: 'body', name: 'basketball' },
  volleyball: { set: 'body', name: 'volleyball' },
  gym: { set: 'body', name: 'treadmill' },
  strength: { set: 'body', name: 'dumbbell' },
  hiit: { set: 'body', name: 'jump-rope' },
  yoga: { set: 'body', name: 'yoga-mat' },
  dance: { set: 'body', name: 'dancing' },
  martialArts: { set: 'body', name: 'martial-arts' },
  rowing: { set: 'body', name: 'rowing' },
  stairs: { set: 'body', name: 'stairs' },
  other: { set: 'body', name: 'stopwatch' },
}

export const workoutIcon = (kind: string): IconRef => ICONS[asWorkoutKind(kind)]

/**
 * Copy keys as a map, so renaming one is a compile error rather than a row that
 * renders its own key.
 */
export const WORKOUT_KIND_KEY = {
  run: 'activity:kind.run',
  walk: 'activity:kind.walk',
  hike: 'activity:kind.hike',
  cycle: 'activity:kind.cycle',
  swim: 'activity:kind.swim',
  badminton: 'activity:kind.badminton',
  tennis: 'activity:kind.tennis',
  football: 'activity:kind.football',
  basketball: 'activity:kind.basketball',
  volleyball: 'activity:kind.volleyball',
  gym: 'activity:kind.gym',
  strength: 'activity:kind.strength',
  hiit: 'activity:kind.hiit',
  yoga: 'activity:kind.yoga',
  dance: 'activity:kind.dance',
  martialArts: 'activity:kind.martialArts',
  rowing: 'activity:kind.rowing',
  stairs: 'activity:kind.stairs',
  other: 'activity:kind.other',
} as const satisfies Record<WorkoutKind, string>

export const workoutKindKey = (kind: string) => WORKOUT_KIND_KEY[asWorkoutKind(kind)]

/**
 * Which kinds carry a distance worth showing.
 *
 * A badminton game has a distance in the store — the watch counted a few
 * hundred metres of shuffling — and putting "0.4 km" on the row invites a
 * comparison with a 5 km run that does not mean anything.
 */
const DISTANCE_KINDS: ReadonlySet<WorkoutKind> = new Set<WorkoutKind>([
  'run',
  'walk',
  'hike',
  'cycle',
  'swim',
  'rowing',
])

export const showsDistance = (kind: string) => DISTANCE_KINDS.has(asWorkoutKind(kind))

/**
 * Pace only reads as pace on foot.
 *
 * A cyclist thinks in km/h and a swimmer in minutes per 100 m, and "6:42 /km"
 * on a ride is a number nobody can place. Rather than grow three pace formats
 * for two of which there is no screen yet, the ones that do not walk simply do
 * not show a pace tile.
 */
const PACE_KINDS: ReadonlySet<WorkoutKind> = new Set<WorkoutKind>(['run', 'walk', 'hike'])

export const showsPace = (kind: string) => PACE_KINDS.has(asWorkoutKind(kind))

/**
 * Kilometres per hour, for the kinds that travel but are not read in pace.
 *
 * The `showsDistance` half is the part that was missing, and its absence was on
 * the screen. A basketball game is not a `PACE_KIND`, so "not a pace kind"
 * alone said "show a speed" — computed from the same shuffling distance that
 * `showsDistance` exists to suppress. The detail screen rendered
 * "PACE 2.0 km/h" over a 53-minute game.
 *
 * A speed is a distance divided by a time. If the distance is not worth showing
 * then neither is anything derived from it, so both questions are asked here
 * rather than one at each call site.
 */
export const showsSpeed = (kind: string) => showsDistance(kind) && !showsPace(kind)
