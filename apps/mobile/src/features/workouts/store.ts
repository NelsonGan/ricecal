import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'

import { forgetOutbox } from '@/data/workout-outbox'
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

const storage = createMMKV({ id: 'ricecal-workout' })
const activeKey = (userId: string) => `active:${userId}`

type Listener = () => void
const listeners = new Map<string, Set<Listener>>()

function subscribe(key: string, listener: Listener): () => void {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(listener)
  return () => {
    set?.delete(listener)
  }
}

function emit(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener()
}

/**
 * Parsed values cached by key, so `useSyncExternalStore` gets the same object
 * back until something is written. Parsing on every read would hand React a
 * new object each render and loop it forever.
 */
const cache = new Map<string, { raw: string | undefined; value: unknown }>()

function read<T>(key: string, fallback: T): T {
  const raw = storage.getString(key)
  const hit = cache.get(key)
  if (hit && hit.raw === raw) return hit.value as T
  let value: T = fallback
  if (raw) {
    try {
      value = JSON.parse(raw) as T
    } catch {
      value = fallback
    }
  }
  cache.set(key, { raw, value })
  return value
}

function write(key: string, value: unknown): void {
  if (value === null || value === undefined) storage.remove(key)
  else storage.set(key, JSON.stringify(value))
  emit(key)
}

// ---------------------------------------------------------------------------
// The workout in progress.
// ---------------------------------------------------------------------------

export function getActiveWorkout(userId: string): LiveWorkout | null {
  return read<LiveWorkout | null>(activeKey(userId), null)
}

export function useActiveWorkout(userId: string | null | undefined): LiveWorkout | null {
  const key = activeKey(userId ?? '')
  return useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => (userId ? getActiveWorkout(userId) : null),
  )
}

/**
 * Whether a workout is running, and nothing else: for the tabs layout, which
 * re-rendered the whole navigator on every keystroke in the logger while it
 * read the document itself.
 */
export function useHasActiveWorkout(userId: string | null | undefined): boolean {
  const key = activeKey(userId ?? '')
  return useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => (userId ? getActiveWorkout(userId) !== null : false),
  )
}

export function startActiveWorkout(userId: string, workout: LiveWorkout): void {
  write(activeKey(userId), workout)
}

export function dispatchWorkout(userId: string, action: Action): LiveWorkout | null {
  const current = getActiveWorkout(userId)
  if (!current) return null
  const next = apply(current, action)
  write(activeKey(userId), next)
  return next
}

/** Replace the whole document, for the moves that are not one action. */
export function replaceActiveWorkout(userId: string, workout: LiveWorkout): void {
  write(activeKey(userId), workout)
}

export function clearActiveWorkout(userId: string): void {
  write(activeKey(userId), null)
}

/** Everything of one account's training kept on this phone, for deleting the account. */
export function forgetWorkoutsOnPhone(userId: string): void {
  clearActiveWorkout(userId)
  forgetOutbox(userId)
}
