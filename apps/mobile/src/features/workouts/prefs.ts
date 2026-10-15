import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'

/**
 * Workout preferences that belong to the PHONE rather than the account.
 *
 * Saving to Apple Health is a permission this handset granted, and a second
 * phone signed in to the same account has granted nothing; keeping the screen
 * awake is about this screen. Everything that follows the account (the default
 * rest, the reminders) is in `user_settings` instead.
 */

export type WorkoutPrefs = {
  keepAwake: boolean
  healthWrite: boolean
}

const DEFAULTS: WorkoutPrefs = { keepAwake: true, healthWrite: false }

const storage = createMMKV({ id: 'ricecal-workout-prefs' })
const listeners = new Set<() => void>()
let cached: { raw: string | undefined; value: WorkoutPrefs } | null = null

export function getWorkoutPrefs(): WorkoutPrefs {
  const raw = storage.getString('prefs')
  if (cached && cached.raw === raw) return cached.value
  let value = DEFAULTS
  if (raw) {
    try {
      value = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<WorkoutPrefs>) }
    } catch {
      value = DEFAULTS
    }
  }
  cached = { raw, value }
  return value
}

export function setWorkoutPrefs(patch: Partial<WorkoutPrefs>): void {
  storage.set('prefs', JSON.stringify({ ...getWorkoutPrefs(), ...patch }))
  for (const listener of listeners) listener()
}

export function useWorkoutPrefs(): WorkoutPrefs {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, getWorkoutPrefs)
}
