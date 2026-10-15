import type { Enums } from '@/lib/database.types'
import { createJsonStore } from '@/lib/jsonStore'

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

const EMPTY: WorkoutDocument[] = []
const store = createJsonStore<WorkoutDocument[]>('ricecal-workout-outbox', (stored) =>
  Array.isArray(stored) ? (stored as WorkoutDocument[]) : EMPTY,
)
const keyFor = (userId: string) => `outbox:${userId}`

export function getOutbox(userId: string): WorkoutDocument[] {
  return store.get(keyFor(userId))
}

function write(userId: string, documents: WorkoutDocument[]): void {
  store.set(keyFor(userId), documents.length ? documents : null)
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
  return store.useValue(keyFor(userId ?? ''), (outbox) => (userId ? outbox : EMPTY))
}
