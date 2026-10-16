import type { WatchPulse } from '@modules/ricecal-watch'
import { useSyncExternalStore } from 'react'

import { useNow } from './live'

/**
 * The heart rate the watch is streaming, for the logger to show beside its
 * clock. Kept in memory only: it is a glance, and the trace the watch sends at
 * the end is the record.
 */

/** A reading older than this is not "now", and the logger stops showing it. */
const FRESH_MS = 20_000

let latest: (WatchPulse & { receivedAt: number }) | null = null
const listeners = new Set<() => void>()

export function receivePulse(pulse: WatchPulse): void {
  // Timed by the phone's clock on arrival, since the watch's may differ.
  latest = { ...pulse, receivedAt: Date.now() }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The watch's latest reading for this workout, while it is fresh. */
export function useWatchPulse(workoutId: string | null | undefined): number | null {
  const pulse = useSyncExternalStore(subscribe, () => latest)
  const ours = pulse && workoutId && pulse.workoutId === workoutId ? pulse : null
  const now = useNow(5000, ours !== null)
  return ours && now - ours.receivedAt < FRESH_MS ? ours.bpm : null
}
