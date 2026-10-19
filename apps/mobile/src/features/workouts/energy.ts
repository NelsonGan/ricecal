import { type Exercise, exerciseById } from './catalogue'
import type { LiveWorkout } from './model'

/**
 * What a workout cost, and what Apple Health should call it.
 *
 * The estimate is the only honest one available without a heart rate: the
 * Compendium of Physical Activities' MET for each movement, times body weight,
 * times time, less what the body would have spent at rest over the same time.
 * Less the rest because Apple Health's active energy excludes it, and a figure
 * that included it would be counted twice the moment it met the day's resting
 * energy. The rest taken off is the person's own (the budget's Mifflin-St
 * Jeor) rather than one MET, which overstates most adults' resting rate by
 * about a third (Byrne et al. 2005) and so took too much away.
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

/** A workout's exercises with a set done, resolved to the catalogue where they can be. */
function catalogued(
  workout: LiveWorkout,
): { exercise: Exercise | undefined; doneSets: number; seconds: number }[] {
  return workout.exercises
    .map((entry) => {
      const done = entry.sets.filter((set) => set.done)
      return {
        exercise: exerciseById(entry.exerciseId),
        doneSets: done.length,
        seconds: done.reduce((sum, set) => sum + (set.durationS ?? 0), 0),
      }
    })
    .filter((row) => row.doneSets > 0)
}

/** MET for a custom exercise, which has no entry to read one from. */
const DEFAULT_MET = 4

/**
 * The most a session of sets is priced at: vigorous resistance training
 * (Compendium 02050). A rep-based movement's own MET can be a continuous one
 * (pull-ups and burpees are vigorous calisthenics, 7.5 to 8), and the lifting
 * is priced over the whole session, rests between sets included, which the
 * Compendium's values leave out. A pull-up day was priced as an hour of burpees.
 */
const LIFTING_MET_MAX = 6

/** Who the estimate is for. */
export type EnergyBody = {
  weightKg: number
  /**
   * This person's resting energy for a day (Mifflin-St Jeor, as the budget
   * uses), or null without the profile to work it out, when one MET stands in.
   */
  restingKcalPerDay: number | null
}

/**
 * Active kilocalories for the workout, or null when the body weight is not
 * known (a figure computed against a made-up weight is a made-up figure), or
 * when nothing has been done yet.
 *
 * Time logged against a timed exercise (a 30-minute run) is priced
 * at that exercise's MET. Whatever is left of the workout's duration is the
 * lifting and the rest between sets, priced at the average MET of the rep-based
 * exercises weighted by how many sets each got.
 */
export function estimateKcal(
  workout: LiveWorkout,
  durationS: number,
  body: EnergyBody | undefined,
): number | null {
  if (!body || body.weightKg <= 0 || durationS <= 0) return null
  const rows = catalogued(workout)
  if (!rows.length) return null

  const kg = body.weightKg
  // Each MET is 1 kcal per kg per hour; what the body spends at rest comes off
  // each hour, since Apple Health's resting energy already holds it.
  const resting =
    body.restingKcalPerDay && body.restingKcalPerDay > 0 ? body.restingKcalPerDay / 24 : kg
  const perHour = (met: number) => Math.max(0, met * kg - resting)

  // Timed sets cannot add up to more than the workout lasted: an hour on the
  // treadmill typed into a workout finished a minute after it started is
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
      kcal += perHour(met) * (seconds / 3600)
    } else {
      repSets += row.doneSets
      repMet += Math.min(met, LIFTING_MET_MAX) * row.doneSets
    }
  }

  const remaining = Math.max(0, durationS - timed)
  if (repSets > 0 && remaining > 0) kcal += perHour(repMet / repSets) * (remaining / 3600)
  return Math.round(Math.min(kcal, 10000))
}

const UPPER_BODY: ReadonlySet<string> = new Set(['chest', 'back', 'shoulders', 'arms'])

/**
 * The `HKWorkoutActivityType` a workout is saved as.
 *
 * A session that is all one activity (a run, a yoga class) is that activity,
 * so it lands in the Fitness app under its own icon. Anything with lifting in it is
 * strength training, because that is what Apple's own list calls a gym
 * session; a workout of nothing but core work is core training.
 */
export function healthActivityType(workout: LiveWorkout): number {
  const rows = catalogued(workout)
  const timed = rows.filter((row) => row.exercise?.health !== undefined)
  const lifted = rows.filter((row) => row.exercise?.health === undefined)

  if (lifted.length === 0 && timed.length > 0) {
    const longest = [...timed].sort((a, b) => b.seconds - a.seconds)[0]
    return longest.exercise?.health ?? STRENGTH
  }
  if (lifted.length > 0 && lifted.every((row) => row.exercise?.category === 'core')) return CORE
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
