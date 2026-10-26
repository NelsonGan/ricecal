import type { TFunction } from 'i18next'

import { type EnergyBody, estimateKcal } from './energy'
import type { LiveWorkout } from './model'

/**
 * Where a workout's burn comes from, while it runs and when it is saved.
 *
 * One figure, from one place, never two added together. The Apple Watch's
 * when the watch is recording: it measured the minutes with a heart rate and
 * its own motion sensors, and it is the copy Apple Health keeps. Our estimate
 * only when no watch is, since a session the watch recorded is never written
 * to Health a second time from the phone (`syncWorkoutToHealth`), and a figure
 * on screen that is not the one being saved would change at the finish.
 *
 * Nothing here reaches the budget. The budget hears a workout through the
 * health store, as it hears every other movement (README, "Workouts and the
 * budget"); this is what the logger and the finish screen show while it does.
 */

export type Burn = {
  /** Null while the watch has said nothing yet, or with no weight to estimate from. */
  kcal: number | null
  source: 'watch' | 'estimate'
}

export function workoutBurn(
  workout: LiveWorkout,
  durationS: number,
  body: EnergyBody | undefined,
  /** The energy the watch has streamed for this workout, if any has arrived. */
  watchKcal: number | null,
): Burn {
  // A figure streamed from the watch counts before its `recording` command
  // has, since the two arrive by different paths.
  if (watchKcal !== null || workout.watch?.recorded) {
    const kcal = watchKcal ?? workout.watch?.kcal ?? null
    return { kcal: kcal === null ? null : Math.round(kcal), source: 'watch' }
  }
  // Nothing done yet is nothing burned yet, as far as an estimate can say.
  return { kcal: estimateKcal(workout, durationS, body) ?? (body ? 0 : null), source: 'estimate' }
}

/**
 * What tapping the burn says about where it came from. `weighed` is whether
 * there was a weight to estimate from, since without one there is no figure.
 */
export function burnNote(
  t: TFunction<['workouts', 'common']>,
  source: Burn['source'],
  weighed: boolean,
): string {
  if (source === 'watch') return t('workouts:logger.kcalWatch')
  return weighed ? t('workouts:logger.kcalEstimated') : t('workouts:logger.kcalNoWeight')
}
