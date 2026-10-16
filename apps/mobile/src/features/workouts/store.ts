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

/** Everything of one account's training kept on this phone, for deleting the account. */
export function forgetWorkoutsOnPhone(userId: string): void {
  clearActiveWorkout(userId)
  forgetOutbox(userId)
}
