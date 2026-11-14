import { createJsonStore } from '@/lib/jsonStore'

/**
 * Workout preferences that belong to the PHONE rather than the account.
 *
 * Saving to Apple Health is a permission this handset granted, and a second
 * phone signed in to the same account has granted nothing; keeping the screen
 * awake is about this screen, and the finish sound about this speaker. Everything that follows the account (the default
 * rest, the reminders) is in `user_settings` instead.
 */

type WorkoutPrefs = {
  keepAwake: boolean
  healthWrite: boolean
  /** The logger's heart rate and burn, shown in full rather than as one line. */
  bodyFiguresOpen: boolean
  /** The ding when a workout is saved. A speaker is this phone's. */
  finishSound: boolean
}

// Saving to Health is on from the start, and its permission is asked for at
// the first save rather than behind a switch few people found. See `health.ts`.
const DEFAULTS: WorkoutPrefs = {
  keepAwake: true,
  healthWrite: true,
  bodyFiguresOpen: false,
  finishSound: true,
}

const store = createJsonStore<WorkoutPrefs>('ricecal-workout-prefs', (stored) =>
  stored && typeof stored === 'object'
    ? { ...DEFAULTS, ...(stored as Partial<WorkoutPrefs>) }
    : DEFAULTS,
)

export function getWorkoutPrefs(): WorkoutPrefs {
  return store.get('prefs')
}

export function setWorkoutPrefs(patch: Partial<WorkoutPrefs>): void {
  store.set('prefs', { ...getWorkoutPrefs(), ...patch })
}

export function useWorkoutPrefs(): WorkoutPrefs {
  return store.useValue('prefs', (prefs) => prefs)
}
