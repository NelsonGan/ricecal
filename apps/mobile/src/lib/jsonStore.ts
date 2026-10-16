import { useCallback, useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'

/**
 * A small JSON store over MMKV, keyed, that React can subscribe to.
 *
 * For state that has to be on the phone the moment it changes, written
 * synchronously and read back after the app is killed: the workout in
 * progress, the finished workouts waiting to be sent, the per-phone workout
 * preferences.
 *
 * Two things it gets right that each hand-rolled copy had to remember:
 *
 *   - The value read back is the value written, the same object, until the
 *     key is written again. Parsing the stored string on every read handed
 *     React a new object tree each time, so nothing under it could ever skip a
 *     render, and `useSyncExternalStore` needs an unchanged snapshot to be the
 *     same object or it loops.
 *   - Listeners are per key, so writing one account's workout does not wake a
 *     screen watching another key.
 *
 * `parse` turns what was stored (or nothing) into a value, once per stored
 * string: defaults, shape checks and migrations belong there.
 */
export function createJsonStore<T>(id: string, parse: (stored: unknown) => T) {
  const storage = createMMKV({ id })
  const listeners = new Map<string, Set<() => void>>()
  const cache = new Map<string, T>()

  function get(key: string): T {
    // Every write in this process goes through `set`, which keeps the cache,
    // so a cached key is not read back from MMKV. React asks for the snapshot
    // several times a render, and the workout in progress is a long string to
    // copy out each time.
    if (cache.has(key)) return cache.get(key) as T
    const raw = storage.getString(key)
    let stored: unknown
    if (raw !== undefined) {
      try {
        stored = JSON.parse(raw)
      } catch {
        stored = undefined
      }
    }
    const value = parse(stored)
    cache.set(key, value)
    return value
  }

  /** Writes `value`, or removes the key for `null`. */
  function set(key: string, value: T | null): void {
    if (value === null) {
      storage.remove(key)
      cache.delete(key)
    } else {
      storage.set(key, JSON.stringify(value))
      cache.set(key, value)
    }
    for (const listener of listeners.get(key) ?? []) listener()
  }

  function subscribe(key: string, listener: () => void): () => void {
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

  /**
   * Subscribes to a key. `select` must return a value that is unchanged when
   * nothing it reads has changed: a field of the stored value, or a boolean.
   */
  function useValue<S>(key: string, select: (value: T) => S): S {
    // A new subscribe function each render made React unsubscribe and
    // subscribe again on every one.
    const subscribeKey = useCallback((listener: () => void) => subscribe(key, listener), [key])
    return useSyncExternalStore(subscribeKey, () => select(get(key)))
  }

  return { get, set, useValue }
}
