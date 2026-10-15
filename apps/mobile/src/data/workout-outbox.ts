import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'

import type { Enums } from '@/lib/database.types'

/**
 * Finished workouts that have not reached the server yet.
 *
 * Finishing a workout tries `save_workout` once. A gym basement with no signal
 * is the ordinary place for that to fail, and a finished workout must not be
 * lost to it, so the document waits here, on the phone, and `useWorkoutOutbox`
 * sends it the next time the app is in front of somebody with a connection.
 * The id was minted on the phone when the workout started, so a document that
 * arrives twice (sent, then the reply lost) is still one workout.
 *
 * Per account, for the reason the live workout is: a shared phone must not
 * post one person's workout into another's history.
 */

/** The document `save_workout` takes, as the logger builds it. */
export type WorkoutDocument = {
  id: string
  name: string
  notes: string | null
  started_at: string
  ended_at: string
  log_date: string
  routine_id: string | null
  kcal: number | null
  health_workout_id: string | null
  exercises: {
    exercise_id: string
    exercise_name: string
    tracking: Enums<'exercise_tracking'>
    superset: number | null
    rest_s: number | null
    notes: string | null
    sets: {
      kind: Enums<'workout_set_kind'>
      weight_kg: number | null
      reps: number | null
      duration_s: number | null
      distance_m: number | null
      rpe: number | null
    }[]
  }[]
}

const storage = createMMKV({ id: 'ricecal-workout-outbox' })
const keyFor = (userId: string) => `outbox:${userId}`

const listeners = new Set<() => void>()
const cache = new Map<string, { raw: string | undefined; value: WorkoutDocument[] }>()
const EMPTY: WorkoutDocument[] = []

export function getOutbox(userId: string): WorkoutDocument[] {
  const raw = storage.getString(keyFor(userId))
  const hit = cache.get(userId)
  if (hit && hit.raw === raw) return hit.value
  let value = EMPTY
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) value = parsed as WorkoutDocument[]
    } catch {
      value = EMPTY
    }
  }
  cache.set(userId, { raw, value })
  return value
}

function write(userId: string, documents: WorkoutDocument[]): void {
  if (documents.length) storage.set(keyFor(userId), JSON.stringify(documents))
  else storage.remove(keyFor(userId))
  for (const listener of listeners) listener()
}

/** Queue a document, replacing an earlier queued copy of the same workout. */
export function enqueueWorkout(userId: string, document: WorkoutDocument): void {
  write(userId, [...getOutbox(userId).filter((queued) => queued.id !== document.id), document])
}

/**
 * Remove a workout from the outbox. With `sent`, only if the queued copy is
 * still that one: a newer copy queued while it was in flight stays.
 */
export function dequeueWorkout(userId: string, id: string, sent?: WorkoutDocument): void {
  const outbox = getOutbox(userId)
  const sentJson = sent ? JSON.stringify(sent) : null
  const rest = outbox.filter(
    (queued) => queued.id !== id || (sentJson !== null && JSON.stringify(queued) !== sentJson),
  )
  if (rest.length !== outbox.length) write(userId, rest)
}

/** Drop an account's queue, when the account itself is deleted. */
export function forgetOutbox(userId: string): void {
  write(userId, [])
}

export function useOutbox(userId: string | null | undefined): WorkoutDocument[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => (userId ? getOutbox(userId) : EMPTY),
  )
}
