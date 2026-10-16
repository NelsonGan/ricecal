import { forgetHeartOutbox } from '@/data/workout-heart'
import { forgetOutbox } from '@/data/workout-outbox'
import { createJsonStore } from '@/lib/jsonStore'
import { type Action, apply, type LiveWorkout } from './model'

/**
 * The workout being trained. It lives on the phone, in MMKV, per account.
 *
 * ON THE PHONE, NOT THE SERVER, because a gym is where the signal is worst. A
 * set written to Postgres as it was ticked would be a set lost to a basement
 * with no reception, and a logger that waits on a request between sets is one
 * nobody keeps using. So every tick is a synchronous write to local storage,
 * which also survives the app being killed mid-workout: reopening it finds the
 * workout exactly where it was, timer and all, because the timer is a start
 * time rather than a counter.
 *
 * Its other half is the outbox in `data/workout-outbox.ts`, where a finished
 * workout waits if the save could not reach the server.
 *
 * Keyed by account because a shared phone has two people's workouts on it, and
 * the second person to sign in must not find the first one's half-finished
 * session waiting for them.
 */

const store = createJsonStore<LiveWorkout | null>('ricecal-workout', (stored) =>
  stored && typeof stored === 'object' ? (stored as LiveWorkout) : null,
)
const activeKey = (userId: string) => `active:${userId}`

// ---------------------------------------------------------------------------
// The workout in progress.
// ---------------------------------------------------------------------------

export function getActiveWorkout(userId: string): LiveWorkout | null {
  return store.get(activeKey(userId))
}

export function useActiveWorkout(userId: string | null | undefined): LiveWorkout | null {
  return store.useValue(activeKey(userId ?? ''), (workout) => (userId ? workout : null))
}

/**
 * Whether a workout is running, and nothing else: for the tabs layout, which
 * re-rendered the whole navigator on every keystroke in the logger while it
 * read the document itself.
 */
export function useHasActiveWorkout(userId: string | null | undefined): boolean {
  return store.useValue(activeKey(userId ?? ''), (workout) => Boolean(userId) && workout !== null)
}

/**
 * Whether the running workout already has this exercise in it. A boolean for
 * the reason `useHasActiveWorkout` is one: the exercise page stays mounted
 * under the logger.
 */
export function useWorkoutHasExercise(
  userId: string | null | undefined,
  exerciseId: string,
): boolean {
  return store.useValue(
    activeKey(userId ?? ''),
    (workout) =>
      Boolean(userId) &&
      Boolean(workout?.exercises.some((exercise) => exercise.exerciseId === exerciseId)),
  )
}

/** Starts a workout, or replaces the whole document for the moves that are not one action. */
export function startActiveWorkout(userId: string, workout: LiveWorkout): void {
  store.set(activeKey(userId), workout)
}

export function dispatchWorkout(userId: string, action: Action): LiveWorkout | null {
  const current = getActiveWorkout(userId)
  if (!current) return null
  const next = apply(current, action)
  store.set(activeKey(userId), next)
  return next
}

export function clearActiveWorkout(userId: string): void {
  store.set(activeKey(userId), null)
}

// ---------------------------------------------------------------------------
// How the last few workouts ended.
//
// For the Apple Watch, which records a running workout's heart rate in a
// session of its own and has to know, once the workout is gone from the phone,
// whether to save that session or throw it away. Kept on the phone so the
// answer is still there when the watch next hears from it, and so a command
// the watch sent for a workout that has ended is not taken as a new one.
// ---------------------------------------------------------------------------

export type EndedWorkout = { id: string; saved: boolean; at: number }

const ENDED_KEPT = 10
const NO_ENDED: EndedWorkout[] = []
const ended = createJsonStore<EndedWorkout[]>('ricecal-workout-ended', (stored) =>
  Array.isArray(stored) ? (stored as EndedWorkout[]) : NO_ENDED,
)
const endedKey = (userId: string) => `ended:${userId}`

export function getEndedWorkouts(userId: string): EndedWorkout[] {
  return ended.get(endedKey(userId))
}

export function useEndedWorkouts(userId: string | null | undefined): EndedWorkout[] {
  return ended.useValue(endedKey(userId ?? ''), (list) => (userId ? list : NO_ENDED))
}

/** A workout left the phone: saved, or thrown away. */
export function recordEndedWorkout(userId: string, id: string, saved: boolean, at = Date.now()) {
  const list = getEndedWorkouts(userId).filter((entry) => entry.id !== id)
  ended.set(endedKey(userId), [...list, { id, saved, at }].slice(-ENDED_KEPT))
}

/** Everything of one account's training kept on this phone, for deleting the account. */
export function forgetWorkoutsOnPhone(userId: string): void {
  ended.set(endedKey(userId), null)
  clearActiveWorkout(userId)
  forgetOutbox(userId)
  forgetHeartOutbox(userId)
}
