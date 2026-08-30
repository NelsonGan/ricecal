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
import { createMMKV } from 'react-native-mmkv'

import type { Entry } from './types'

/**
 * Snaps that have no row yet.
 *
 * A photographed plate becomes a row the instant the shutter fires, and there is
 * nothing to insert until recognition names a dish. So a pending snap lives here
 * and `useDayLog` merges it into its day, which is also what makes a failed snap
 * survivable: it is not in the query cache, so a refetch cannot delete the photo
 * the user is about to fix by hand.
 *
 * Persisted, because the app being gone is when it matters. A user who switched
 * away came back to a day with no sign of the meal they photographed while the
 * scan carried on. The row survives a restart with its spinner and is swept when
 * it is older than any scan can be.
 *
 * The photo behind it is a temporary file the OS may reclaim, so a restored row
 * may have no picture. `ItemRow` falls back to the camera icon.
 */

export type PendingSnap = {
  id: string
  logDate: string
  /** Local `file://` uri. There is no stored key until the upload finishes. */
  photoUri?: string
  /**
   * The meal as the user typed it. A typed meal has no picture to stand in for
   * it, so the words do: an empty row with a spinner reads as the app having lost
   * the meal.
   */
  text?: string
  /**
   * `analysing` is a request in flight in this session, so something will call
   * back. `waiting` is the same scan with nothing holding it: the request timed
   * out, or the app restarted and took the promise with it. The scan is almost
   * certainly still running, so the row keeps its spinner and the day is polled.
   *
   * That distinction fixes two opposite complaints: a scan slower than the 60s
   * request timeout used to be called `failed` and then land its entry anyway,
   * and a scan the app was killed during used to spin until a sweep deleted it.
   *
   * `nofood` is the scan answering that the photo has nothing edible in it, which
   * is a state of the row rather than an entry.
   */
  status: 'analysing' | 'waiting' | 'failed' | 'nofood'
  loggedAt: string
  /**
   * Read back from storage rather than started in this session. The row still
   * says it is working but gets no progress bar: the bar is timed from the
   * shutter, and restarting it at zero for a scan that began two minutes ago
   * would be theatre about a lie.
   */
  restored?: boolean
  /**
   * The app was suspended while this scan was in flight.
   *
   * iOS suspends a backgrounded app within seconds and the request goes with it,
   * so the promise may never settle, while the edge function writes the entry
   * anyway. The row is `analysing` with nothing listening, and that combination
   * is what has to be polled for.
   *
   * This is the bug reported as "the notification said it was done and the row
   * was still spinning": the notice fires 25 seconds after the shutter, tapping
   * it refetches the day once on focus, and a scan landing at 35 seconds missed
   * that one chance because the poll only ran for `waiting` rows. Force quitting
   * fixed it, because a restored row is `waiting`. This flag polls a suspended
   * `analysing` row on the same terms, without taking the progress bar off a scan
   * the user has been watching.
   */
  suspended?: boolean
}

type PendingValue = {
  snaps: PendingSnap[]
  add: (snap: Omit<PendingSnap, 'status' | 'loggedAt'>) => void
  /** The request is gone but the scan may not be. See `status`. */
  detach: (id: string) => void
  fail: (id: string) => void
  /** The scan came back with "there is no food in this photo". */
  noFood: (id: string) => void
  remove: (id: string) => void
}

const PendingContext = createContext<PendingValue | null>(null)

/**
 * How long a scan is given before the row admits defeat. Generously past the
 * slowest the server can produce: the vision call alone allows 25s and retries
 * once. It cannot be the request's timeout, which the platform sets at 60s,
 * because the answer routinely outlives the asking.
 *
 * Reaching it turns the row `failed` rather than deleting it. Deleting left the
 * user with neither a meal nor an error.
 */
const WAIT_MS = 150_000

/**
 * How far back a stored snap is still worth restoring. Anything within the window
 * either landed, in which case `useDayLog` claims the row, or did not, in which
 * case it becomes a failed row the user can act on. A day covers a phone that was
 * off overnight without haunting a diary for a week.
 */
const RESTORE_MS = 24 * 60 * 60 * 1000

/** How often the day is re-asked while a scan is running without us. */
const POLL_MS = 6_000

/**
 * Whether the day has to be polled for a scan nobody is holding.
 *
 * A `waiting` row's promise is definitely gone. An `analysing` row whose app has
 * been suspended since it started is the same thing under a different name: iOS
 * takes the request down with the process while the edge function writes the
 * entry regardless.
 *
 * That second half is the fix for "the notification said it was done and the row
 * was still spinning": coming back refetches the day once, and a scan landing a
 * few seconds later missed the only chance anything had to notice.
 *
 * Exported for its own test: one line, and both halves have been wrong in ways
 * that show up as a spinner rather than an error.
 */
export const needsPolling = (snaps: readonly PendingSnap[]): boolean =>
  snaps.some(
    (snap) => snap.status === 'waiting' || (snap.status === 'analysing' && snap.suspended === true),
  )

const store = createMMKV({ id: 'ricecal-pending-snaps' })
const STORE_KEY = 'snaps'

/**
 * Drop every persisted pending snap, on sign-out, alongside the query cache and
 * the image cache. A pending snap carries a meal's photo key and its day, and
 * this store outlives the process, so the next account on the same phone would
 * otherwise rehydrate the previous person's in-flight meals.
 */
export function clearPendingSnaps(): void {
  try {
    store.remove(STORE_KEY)
  } catch {
    // Nothing to recover: the worst case is the row rehydrates once more and is
    // dropped by the 24h restore window anyway.
  }
}

function readStored(): PendingSnap[] {
  try {
    const raw = store.getString(STORE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // A restored row has no promise behind it any more — the process that was
    // holding it is gone — so anything that thought it was mid-request is
    // moved to `waiting`, where it is polled for rather than waited on.
    return (parsed as PendingSnap[])
      .filter((snap) => snap?.id && Date.parse(snap.loggedAt) > Date.now() - RESTORE_MS)
      .map((snap) => ({
        ...snap,
        status: snap.status === 'analysing' ? 'waiting' : snap.status,
        restored: true,
      }))
  } catch {
    return []
  }
}

export function PendingSnapProvider({ children }: { children: ReactNode }) {
  const [snaps, setSnaps] = useState<PendingSnap[]>(readStored)
  const queryClient = useQueryClient()

  // Written on every change rather than on a timer: the process can be killed
  // between one and the next, and the whole point is surviving that.
  useEffect(() => {
    try {
      store.set(STORE_KEY, JSON.stringify(snaps))
    } catch {
      // A row that cannot be persisted is still a row on screen.
    }
  }, [snaps])

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

  /**
   * The app went to the background with this scan still running.
   *
   * `background` rather than `inactive`: the second is what a permission dialog
   * produces, and the notification prompt fires at the shutter of the first scan
   * an account takes, which would put every first scan on the poll.
   *
   * The row keeps its status, unlike `detach`, which is called when the request
   * has definitely gone. A suspended app often comes back with its promise
   * intact, so all this buys is the poll.
   */
  const suspend = useCallback(() => {
    setSnaps((current) => {
      let changed = false
      const next = current.map((snap) => {
        if (snap.status !== 'analysing' || snap.suspended) return snap
        changed = true
        return { ...snap, suspended: true }
      })
      return changed ? next : current
    })
  }, [])

  /**
   * The request went away; the scan did not. Called when the round trip rejects
   * for a reason that says nothing about whether the meal was recognised: the
   * server writes the entry itself, so an answer is coming and the row's job is
   * to notice it arrive.
   */
  const detach = useCallback((id: string) => {
    setSnaps((current) =>
      current.map((snap) =>
        snap.id === id && snap.status === 'analysing' ? { ...snap, status: 'waiting' } : snap,
      ),
    )
  }, [])

  const noFood = useCallback((id: string) => {
    setSnaps((current) =>
      current.map((snap) => (snap.id === id ? { ...snap, status: 'nofood' } : snap)),
    )
  }, [])

  const remove = useCallback((id: string) => {
    setSnaps((current) => current.filter((snap) => snap.id !== id))
  }, [])

  /**
   * Watch for the scans nobody is holding.
   *
   * iOS suspends an app within seconds of backgrounding and a scan takes twenty,
   * so the request never settles either way while the entry lands a minute later.
   * The same is true of a scan slower than the request timeout, and of one the
   * user force-quit through.
   *
   * With nothing to wait on, the day is asked again every few seconds until the
   * entry appears or the deadline passes. Polling `day` rather than a scan-status
   * endpoint is deliberate: the entry is the answer, and a second way to ask the
   * same question is a second way for the two to disagree.
   *
   * The poll runs for a `waiting` row, and for an `analysing` one whose app has
   * been suspended since it started. See `suspended`.
   */
  const watching = needsPolling(snaps)
  /** Anything at all that has not finished, which is what a return to the app asks about. */
  const unfinished = snaps.some((snap) => snap.status === 'analysing' || snap.status === 'waiting')

  useEffect(() => {
    const tick = () => {
      const deadline = Date.now() - WAIT_MS
      setSnaps((current) => {
        let changed = false
        const next = current.map((snap) => {
          // A row waiting on the USER — failed, or "no food here" — is not
          // overdue; it is unanswered, and timing it out would answer for them.
          if (snap.status !== 'analysing' && snap.status !== 'waiting') return snap
          if (Date.parse(snap.loggedAt) > deadline) return snap
          changed = true
          // Past the deadline it becomes a failed row rather than nothing at all: the photo
          // stays, and so does the chance to log it by hand. Should the entry turn up later
          // anyway, `useDayLog` still claims this row, which is what stops a slow scan
          // showing up as an error message beside the meal it produced.
          return { ...snap, status: 'failed' as const }
        })
        if (changed) queryClient.invalidateQueries({ queryKey: ['day'] })
        return changed ? next : current
      })
      if (watching) queryClient.invalidateQueries({ queryKey: ['day'] })
    }

    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'background') suspend()
      if (state !== 'active') return
      // Coming back to the app asks about every unfinished scan, not only the
      // ones being polled. `staleTime` is thirty seconds and refetch-on-focus
      // fires once, so a day that was refetched a moment before the meal landed
      // would otherwise sit on that answer.
      if (unfinished) queryClient.invalidateQueries({ queryKey: ['day'] })
      tick()
    })
    // Fast while something is genuinely outstanding, idle otherwise: with
    // nothing in `waiting` this is only here to turn a stuck row over to
    // `failed` on time.
    const timer = setInterval(tick, watching ? POLL_MS : 30_000)
    tick()
    return () => {
      listener.remove()
      clearInterval(timer)
    }
  }, [queryClient, watching, unfinished, suspend])

  const value = useMemo(
    () => ({ snaps, add, detach, fail, noFood, remove }),
    [snaps, add, detach, fail, noFood, remove],
  )

  return <PendingContext.Provider value={value}>{children}</PendingContext.Provider>
}

export function usePendingSnaps(): PendingValue {
  const context = useContext(PendingContext)
  if (!context) throw new Error('usePendingSnaps must be used inside <PendingSnapProvider>')
  return context
}

/**
 * A pending snap dressed as an entry, so a meal card renders one row type. The
 * zeroes are load-bearing: every total in the app sums `macros.kcal`, so a guess
 * here would move the ring to a number the user never ate.
 */
export function pendingAsEntry(snap: PendingSnap): Entry {
  return {
    id: snap.id,
    quantity: 1,
    loggedAt: snap.loggedAt,
    logDate: snap.logDate,
    // Which of the two ways this meal was logged, so the row can say the right
    // thing about it and `useDayLog` can tell it apart from the real entry
    // when that arrives.
    source: snap.text ? 'text' : 'camera',
    localPhotoUri: snap.photoUri,
    status: snap.status,
    restored: snap.restored,

    // A typed meal wears its own words until the cascade names it. A snapped
    // one has the photograph, and a name here would be a guess.
    foodName: snap.text ?? '',
    icon: { set: 'system', name: snap.text ? 'sparkle' : 'camera' } as Entry['icon'],
    place: 'home',
    servingLabel: '',
    servingFactor: 1,
    macros: { kcal: 0, carbs: 0, protein: 0, fat: 0 },
    // Zero for the same reason `macros` is: this row is a placeholder for an
    // answer that has not arrived. Nothing repeats a pending snap — the copy
    // path reads real entries — so these are never written anywhere.
    base: { kcal: 0, carbs: 0, protein: 0, fat: 0 },
  }
}
