import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { AppState } from 'react-native'

import type { Entry, Meal } from './types'

/**
 * Snaps that have no row yet.
 *
 * A photographed plate becomes a row the instant the shutter fires, but there
 * is nothing to insert until recognition names a dish — `food_logs.food_id` is
 * not null, and inventing a placeholder dish to satisfy it would put rubbish
 * in the catalogue.
 *
 * So a pending snap lives here, in memory, and `useDayLog` merges it into the
 * day it belongs to. That is also what makes a FAILED snap survivable: it is
 * not in the query cache, so a refetch cannot quietly delete the photo the
 * user is about to fix by hand.
 *
 * Deliberately not persisted. The photo behind it is a temporary file that the
 * OS may reclaim, so a pending snap restored after a force-quit would be a row
 * pointing at nothing.
 */

export type PendingSnap = {
  id: string
  meal: Meal
  logDate: string
  /** Local `file://` uri. There is no stored key until the upload finishes. */
  photoUri?: string
  status: 'analysing' | 'failed'
  loggedAt: string
}

type PendingValue = {
  snaps: PendingSnap[]
  add: (snap: Omit<PendingSnap, 'status' | 'loggedAt'>) => void
  fail: (id: string) => void
  remove: (id: string) => void
}

const PendingContext = createContext<PendingValue | null>(null)

export function PendingSnapProvider({ children }: { children: ReactNode }) {
  const [snaps, setSnaps] = useState<PendingSnap[]>([])
  const queryClient = useQueryClient()

  const add = useCallback((snap: Omit<PendingSnap, 'status' | 'loggedAt'>) => {
    setSnaps((current) => [
      ...current,
      { ...snap, status: 'analysing', loggedAt: new Date().toISOString() },
    ])
  }, [])

  const fail = useCallback((id: string) => {
    setSnaps((current) =>
      current.map((snap) => (snap.id === id ? { ...snap, status: 'failed' } : snap)),
    )
  }, [])

  const remove = useCallback((id: string) => {
    setSnaps((current) => current.filter((snap) => snap.id !== id))
  }, [])

  /**
   * Clear out snaps the app slept through.
   *
   * iOS suspends an app within seconds of it going to the background, and a
   * scan takes twenty. The request that was in flight never settles — not as
   * success, not as failure — so the row that was waiting on it waits forever,
   * and on the server the entry it was waiting for landed minutes ago. On the
   * way back in, anything older than the longest a scan can take is assumed to
   * have finished without us and the day is asked again.
   *
   * The window is generous on purpose: dropping a snap that is still genuinely
   * running would take its photo with it.
   */
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      const cutoff = Date.now() - 90_000
      setSnaps((current) => {
        const kept = current.filter(
          (snap) => snap.status === 'failed' || Date.parse(snap.loggedAt) > cutoff,
        )
        if (kept.length !== current.length) {
          queryClient.invalidateQueries({ queryKey: ['day'] })
        }
        return kept
      })
    })
    return () => listener.remove()
  }, [queryClient])

  const value = useMemo(() => ({ snaps, add, fail, remove }), [snaps, add, fail, remove])

  return <PendingContext.Provider value={value}>{children}</PendingContext.Provider>
}

export function usePendingSnaps(): PendingValue {
  const context = useContext(PendingContext)
  if (!context) throw new Error('usePendingSnaps must be used inside <PendingSnapProvider>')
  return context
}

/**
 * A pending snap dressed as an entry, so a meal card can render one row type.
 *
 * The zeroes are load-bearing: an entry that has not been recognised has no
 * calories, and every total in the app sums `macros.kcal`. A guess here would
 * move the ring to a number the user never ate.
 */
export function pendingAsEntry(snap: PendingSnap): Entry {
  return {
    id: snap.id,
    meal: snap.meal,
    quantity: 1,
    loggedAt: snap.loggedAt,
    logDate: snap.logDate,
    source: 'camera',
    localPhotoUri: snap.photoUri,
    status: snap.status,

    foodId: '',
    foodName: '',
    icon: { set: 'system', name: 'camera' } as Entry['icon'],
    place: 'home',
    servingId: '',
    servingLabel: '',
    servingFactor: 1,
    macros: { kcal: 0, carbs: 0, protein: 0, fat: 0 },
    isEstimate: false,
    isArchetype: false,
  }
}
