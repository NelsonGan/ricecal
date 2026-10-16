import { createJsonStore } from '@/lib/jsonStore'

/**
 * Workout preferences that belong to the PHONE rather than the account.
 *
 * Saving to Apple Health is a permission this handset granted, and a second
 * phone signed in to the same account has granted nothing; keeping the screen
 * awake is about this screen. Everything that follows the account (the default
 * rest, the reminders) is in `user_settings` instead.
 */

type WorkoutPrefs = {
  keepAwake: boolean
  healthWrite: boolean
}

const DEFAULTS: WorkoutPrefs = { keepAwake: true, healthWrite: false }

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
