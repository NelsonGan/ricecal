import { type Exercise, exerciseById } from './catalogue'
import type { LiveWorkout } from './model'

/**
 * What a workout cost, and what Apple Health should call it.
 *
 * The estimate is the only honest one available without a heart rate: the
 * Compendium of Physical Activities' MET for each movement, times body weight,
 * times time. It uses MET minus one, because Apple Health's active energy
 * excludes what the body would have burned sitting still, and a figure that
 * included it would be counted twice the moment it met the day's resting
 * energy.
 *
 * Nothing in the calorie budget reads this number directly. It travels to
 * Apple Health with the workout, and comes back into the day through the
 * health store like any other active energy, where a watch's own measurement
 * of the same minutes outranks it. See "Workouts and the budget" in the README.
 */

const STRENGTH = 50 // traditionalStrengthTraining
const CORE = 59 // coreTraining
const HIIT = 63 // highIntensityIntervalTraining
const FUNCTIONAL = 20 // functionalStrengthTraining
const FLEXIBILITY = 62

/** A workout's exercises, resolved to the catalogue where they can be. */
function catalogued(
  workout: LiveWorkout,
): { exercise: Exercise | undefined; doneSets: number; seconds: number }[] {
  return workout.exercises.map((entry) => {
    const done = entry.sets.filter((set) => set.done)
    return {
      exercise: exerciseById(entry.exerciseId),
      doneSets: done.length,
      seconds: done.reduce((sum, set) => sum + (set.durationS ?? 0), 0),
    }
  })
}

/** MET for a custom exercise, which has no entry to read one from. */
const DEFAULT_MET = 4

/**
 * Active kilocalories for the workout, or null when the body weight is not
 * known (a figure computed against a made-up weight is a made-up figure).
 *
 * Time logged against a timed exercise (a 60-minute badminton set) is priced
 * at that exercise's MET. Whatever is left of the workout's duration is the
 * lifting and the rest between sets, priced at the average MET of the rep-based
 * exercises weighted by how many sets each got.
 */
export function estimateKcal(
  workout: LiveWorkout,
  durationS: number,
  bodyKg: number | undefined,
): number | null {
  if (!bodyKg || bodyKg <= 0 || durationS <= 0) return null
  const rows = catalogued(workout).filter((row) => row.doneSets > 0)
  if (!rows.length) return null

  // Timed sets cannot add up to more than the workout lasted: an hour of
  // badminton typed into a workout finished a minute after it started is
  // priced as that minute, not as an hour squeezed into it.
  const timedTotal = rows.reduce((sum, row) => sum + row.seconds, 0)
  const squeeze = timedTotal > durationS ? durationS / timedTotal : 1

  let kcal = 0
  let timed = 0
  let repSets = 0
  let repMet = 0
  for (const row of rows) {
    const met = row.exercise?.met ?? DEFAULT_MET
    if (row.seconds > 0) {
      const seconds = row.seconds * squeeze
      timed += seconds
      kcal += Math.max(0, met - 1) * bodyKg * (seconds / 3600)
    } else {
      repSets += row.doneSets
      repMet += met * row.doneSets
    }
  }

  const remaining = Math.max(0, durationS - timed)
  if (repSets > 0 && remaining > 0) {
    kcal += Math.max(0, repMet / repSets - 1) * bodyKg * (remaining / 3600)
  }
  return Math.round(Math.min(kcal, 10000))
}

const UPPER_BODY: ReadonlySet<string> = new Set(['chest', 'back', 'shoulders', 'arms'])

/**
 * The `HKWorkoutActivityType` a workout is saved as.
 *
 * A session that is one sport (a badminton game, a run) is that sport, so it
 * lands in the Fitness app under its own icon. Anything with lifting in it is
 * strength training, because that is what Apple's own list calls a gym
 * session; a workout of nothing but core work is core training.
 */
export function healthActivityType(workout: LiveWorkout): number {
  const rows = catalogued(workout).filter((row) => row.doneSets > 0)
  const timed = rows.filter((row) => row.exercise?.health !== undefined)
  const lifted = rows.filter((row) => row.exercise?.health === undefined)

  if (lifted.length === 0 && timed.length > 0) {
    const longest = [...timed].sort((a, b) => b.seconds - a.seconds)[0]
    return longest.exercise?.health ?? STRENGTH
  }
  if (lifted.length > 0 && lifted.every((row) => row.exercise?.category === 'core')) return CORE
  if (lifted.length > 0 && lifted.every((row) => row.exercise?.category === 'mobility'))
    return FLEXIBILITY
  if (lifted.length > 0 && lifted.every((row) => row.exercise?.category === 'fullBody'))
    return FUNCTIONAL
  // Conditioning moves only: pull-ups carry a MET of 8 too, and a pull-up day
  // is strength training, not an interval session.
  if (
    lifted.length > 0 &&
    lifted.every(
      (row) =>
        row.exercise?.met !== undefined &&
        row.exercise.met >= 8 &&
        !UPPER_BODY.has(row.exercise.category),
    )
  ) {
    return HIIT
  }
  return STRENGTH
}

/** Metres covered by the workout's distance sets, which Apple Health shows beside it. */
export function totalDistanceM(workout: LiveWorkout): number {
  let metres = 0
  for (const exercise of workout.exercises) {
    if (exercise.tracking !== 'distance_duration') continue
    for (const set of exercise.sets) if (set.done) metres += set.distanceM ?? 0
  }
  return Math.round(metres)
}
