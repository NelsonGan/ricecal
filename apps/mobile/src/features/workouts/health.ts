import { Platform } from 'react-native'

import { deleteWorkoutFromHealth, saveWorkoutToHealth } from '@/lib/health'
import { healthActivityType, totalDistanceM } from './energy'
import type { LiveWorkout } from './model'
import { getWorkoutPrefs } from './prefs'

/**
 * A workout's copy in Apple Health.
 *
 * Best effort throughout: Health is a copy, and Postgres is the record. A save
 * that Health refuses (permission withdrawn in Settings, a store that is not
 * there) must never keep the workout itself from being saved, so failures come
 * back as `failed` for the screen to mention and nothing is thrown.
 */

export type HealthOutcome = {
  healthId: string | null
  failed: boolean
  /** Whether the copy there before was taken out, so a refused save has one to put back. */
  replaced: boolean
}

export async function syncWorkoutToHealth(
  workout: LiveWorkout,
  endedAt: number,
  kcal: number | null,
): Promise<HealthOutcome> {
  if (Platform.OS !== 'ios' || !getWorkoutPrefs().healthWrite) {
    // Writing is off on this phone. A copy saved while it was on is left
    // alone: turning a switch off is not asking for history to be erased.
    return { healthId: workout.healthWorkoutId, failed: false, replaced: false }
  }
  try {
    // Whatever copy is there already: the one on record, or one a save that
    // never heard back left behind.
    await deleteWorkoutFromHealth(workout.healthWorkoutId, workout.id)
  } catch (error) {
    // Kept, and no second copy beside it: the old one stays on record until a
    // later save can replace it.
    console.warn('[workouts] could not replace the Apple Health copy', error)
    return { healthId: workout.healthWorkoutId, failed: true, replaced: false }
  }
  try {
    const healthId = await saveWorkoutToHealth({
      id: workout.id,
      activityType: healthActivityType(workout),
      start: new Date(workout.startedAt),
      end: new Date(Math.max(endedAt, workout.startedAt + 1000)),
      kcal,
      distanceM: totalDistanceM(workout) || null,
    })
    return { healthId, failed: healthId === null, replaced: true }
  } catch (error) {
    console.warn('[workouts] could not save to Apple Health', error)
    return { healthId: null, failed: true, replaced: true }
  }
}

export async function removeWorkoutFromHealth(
  healthId: string | null,
  workoutId: string,
): Promise<void> {
  // With no copy on record and saving off, there is nothing of this workout's
  // in Health to find, and nothing to ask HealthKit for.
  if (Platform.OS !== 'ios' || (!healthId && !getWorkoutPrefs().healthWrite)) return
  try {
    await deleteWorkoutFromHealth(healthId, workoutId)
  } catch (error) {
    console.warn('[workouts] could not remove from Apple Health', error)
  }
}
