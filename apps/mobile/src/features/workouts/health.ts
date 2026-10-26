import { Platform } from 'react-native'

import { requestHealthSync } from '@/data/health-sync'
import {
  deleteWorkoutFromHealth,
  requestWorkoutWrite,
  saveWorkoutToHealth,
  workoutWriteStatus,
} from '@/lib/health'
import { healthActivityType, totalDistanceM } from './energy'
import type { LiveWorkout } from './model'
import { getWorkoutPrefs, setWorkoutPrefs } from './prefs'
import { watchEnergy } from './pulse'

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
  // A figure streamed from the watch says it is recording even when its
  // `recording` command has not landed yet (they travel by different paths).
  if (workout.watch?.recorded || watchEnergy(workout.id) !== null) {
    // The watch saved its own copy, with its measured heart rate and energy.
    // A second one from here would count the session's energy twice, and an
    // edit replacing it would throw away what the watch measured.
    return { healthId: workout.healthWorkoutId, failed: false, replaced: false }
  }
  try {
    if (!(await mayWrite())) {
      return { healthId: workout.healthWorkoutId, failed: false, replaced: false }
    }
  } catch (error) {
    console.warn('[workouts] could not request Apple Health permission', error)
    return { healthId: workout.healthWorkoutId, failed: true, replaced: false }
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

/**
 * Saving is on until it is turned off, so the first save is where Health's
 * sheet is shown, and a "no" there turns the switch off rather than reporting
 * a failure the user just chose. Refused afterwards, in Health's own settings,
 * is still a save that failed, and the finish screen says so.
 */
async function mayWrite(): Promise<boolean> {
  const status = workoutWriteStatus()
  if (status === 'unavailable') return false
  if (status !== 'unasked') return true
  if (await requestWorkoutWrite()) return true
  // A cancelled or failed request can leave permission undetermined. Only a
  // recorded refusal is the user's choice to turn saving off on this phone.
  if (workoutWriteStatus() === 'refused') {
    setWorkoutPrefs({ healthWrite: false })
    return false
  }
  throw new Error('Apple Health workout permission request did not complete')
}

export async function removeWorkoutFromHealth(
  healthId: string | null,
  workoutId: string,
): Promise<void> {
  // With no copy on record and saving off, or never allowed, there is nothing
  // of this workout's in Health to find, and nothing to ask HealthKit for.
  if (
    Platform.OS !== 'ios' ||
    (!healthId && (!getWorkoutPrefs().healthWrite || workoutWriteStatus() !== 'allowed'))
  ) {
    return
  }
  try {
    await deleteWorkoutFromHealth(healthId, workoutId)
    // Its energy left the day with it, and the budget should shrink to match.
    // Without a copy on record (a workout discarded before saving) there was
    // nothing in the day to take out.
    if (healthId) requestHealthSync()
  } catch (error) {
    console.warn('[workouts] could not remove from Apple Health', error)
  }
}
