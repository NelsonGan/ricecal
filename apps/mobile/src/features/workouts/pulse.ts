import type { WatchPulse } from '@modules/ricecal-watch'
import { useSyncExternalStore } from 'react'

/**
 * The heart rate and energy the watch is streaming, for the logger to show
 * beside its clock. Kept in memory only: they are a glance, and the trace the
 * watch sends at the end is the record.
 */

/** A reading older than this is not "now", and the logger stops showing it. */
const FRESH_MS = 20_000

type Heart = { workoutId: string; bpm: number; receivedAt: number }

let heart: Heart | null = null
/**
 * The watch's energy so far, for the workout it was measured for. Unlike a
 * heart rate it does not go stale: it is a running total, and the last one
 * heard is still the best figure there is while the phone is out of reach.
 */
let energy: { workoutId: string; kcal: number } | null = null
const listeners = new Set<() => void>()
// Wakes the subscribers when the last reading goes stale, so a figure that
// stopped arriving disappears without anything ticking in the meantime.
let staleTimer: ReturnType<typeof setTimeout> | null = null

const notify = () => {
  for (const listener of listeners) listener()
}

export function receivePulse(pulse: WatchPulse): void {
  if (pulse.bpm !== null) {
    // Timed by the phone's clock on arrival, since the watch's may differ.
    heart = { workoutId: pulse.workoutId, bpm: pulse.bpm, receivedAt: Date.now() }
    if (staleTimer) clearTimeout(staleTimer)
    staleTimer = setTimeout(notify, FRESH_MS)
  }
  if (pulse.kcal !== null) energy = { workoutId: pulse.workoutId, kcal: pulse.kcal }
  notify()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const freshHeart = () => (heart && Date.now() - heart.receivedAt < FRESH_MS ? heart : null)

/** The watch's latest reading for this workout, while it is fresh. */
export function useWatchPulse(workoutId: string | null | undefined): number | null {
  const pulse = useSyncExternalStore(subscribe, freshHeart)
  return pulse && workoutId && pulse.workoutId === workoutId ? pulse.bpm : null
}

/**
 * Whether a heart rate is coming in for this workout, for a screen that lays
 * out around it: it re-renders when that changes, not with every reading.
 */
export function useWatchPulsing(workoutId: string | null | undefined): boolean {
  return useSyncExternalStore(subscribe, () =>
    Boolean(workoutId && freshHeart()?.workoutId === workoutId),
  )
}

/** The active energy the watch has measured for this workout so far, if it has said. */
export function useWatchEnergy(workoutId: string | null | undefined): number | null {
  // The number rather than the record, so a reading that only moved the heart
  // rate re-renders nothing here.
  return useSyncExternalStore(subscribe, () =>
    workoutId && energy?.workoutId === workoutId ? energy.kcal : null,
  )
}

/** The same figure outside React, for the save that happens after the logger closes. */
export function watchEnergy(workoutId: string): number | null {
  return energy?.workoutId === workoutId ? energy.kcal : null
}
