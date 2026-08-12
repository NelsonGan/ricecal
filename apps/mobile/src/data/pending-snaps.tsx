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
 * A photographed plate becomes a row the instant the shutter fires, but there
 * is nothing to insert until recognition names a dish — `food_logs.food_id` is
 * not null, and inventing a placeholder dish to satisfy it would put rubbish
 * in the catalogue.
 *
 * So a pending snap lives here and `useDayLog` merges it into the day it
 * belongs to. That is also what makes a FAILED snap survivable: it is not in
 * the query cache, so a refetch cannot quietly delete the photo the user is
 * about to fix by hand.
 *
 * PERSISTED, because the app being gone is exactly when it matters. A user who
 * snaps a plate and switches away — or gets killed by the OS, which is what
 * happens to a backgrounded app — came back to a day with no sign of the meal
 * they just photographed, while the scan carried on and landed a minute later.
 * The row now survives the restart with its spinner, and is swept when it is
 * older than any scan can be.
 *
 * The photo behind it is a temporary file that the OS may reclaim, so a
 * restored row may have no picture. `ItemRow` falls back to the camera icon,
 * which is the honest version of "the plate is being read" anyway.
 */

export type PendingSnap = {
  id: string
  logDate: string
  /** Local `file://` uri. There is no stored key until the upload finishes. */
  photoUri?: string
  /**
   * The meal as the user typed it, when they typed it instead of photographing
   * it. The row is the same row for the same reason — there is no `food_id`
   * yet — but a typed meal has no picture to stand in for it, so the words do:
   * "Nasi lemak with fried chicken" reads as the meal being counted, where an
   * empty row with a spinner reads as the app having lost it.
   */
  text?: string
  /**
   * `analysing` is a request in flight IN THIS SESSION — something will call
   * back. `waiting` is the same scan with nothing left holding it: the request
   * timed out, or the app restarted and took the promise with it. The scan
   * itself is almost certainly still running on the server, so the row keeps
   * its spinner and the day is polled until the entry shows up.
   *
   * That distinction is the whole fix for two complaints that look opposite.
   * A scan slower than the platform's 60s request timeout used to reject, be
   * called `failed`, and then have its entry land anyway a few seconds later —
   * the user got an error message AND the meal. And a scan the app was killed
   * during used to spin until a sweep silently deleted the row, which is the
   * same failure wearing patience.
   *
   * `nofood` is the scan answering that the photo has nothing edible in it. It
   * is a state of the row rather than an entry, because no entry was written:
   * the user dismisses it and the row goes.
   */
  status: 'analysing' | 'waiting' | 'failed' | 'nofood'
  loggedAt: string
  /**
   * Read back from storage rather than started in this session.
   *
   * The row still says it is working, but it does not get the progress bar:
   * the bar is theatre timed from the shutter, and restarting it at zero for a
   * scan that began two minutes ago would be theatre about a lie.
   */
  restored?: boolean
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
 * How long a scan is given before the row admits defeat.
 *
 * Generously past the slowest one the server can produce: the vision call alone
 * allows 25s and retries once, and the cascade below it makes catalogue and
 * estimate calls of its own. The platform gives up on the REQUEST at 60s, which
 * is why this number cannot be the request's timeout — the answer routinely
 * outlives the asking.
 *
 * Reaching it turns the row `failed` rather than deleting it. Deleting was the
 * old behaviour and it is the one outcome with no story: the user photographed
 * a plate, watched a spinner, and then had neither a meal nor an error.
 */
const WAIT_MS = 150_000

/**
 * How far back a stored snap is still worth restoring.
 *
 * Anything within this window either landed — in which case `useDayLog` claims
 * the row the moment the day loads and it disappears — or did not, in which
 * case it becomes a failed row the user can act on. A day is long enough to
 * cover a phone that was off overnight, and short enough that an unanswered
 * row does not haunt a diary for a week.
 */
const RESTORE_MS = 24 * 60 * 60 * 1000

/** How often the day is re-asked while a scan is running without us. */
const POLL_MS = 6_000

const store = createMMKV({ id: 'ricecal-pending-snaps' })
const STORE_KEY = 'snaps'

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
   * The request went away; the scan did not.
   *
   * Called when the round trip rejects for a reason that says nothing about
   * whether the meal was recognised — a timeout, a dropped connection, an app
   * that got suspended mid-flight. The server writes the entry itself as
   * `service_role`, so there is a real answer coming whatever happened to the
   * asking, and the row's job now is to notice it arrive.
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
   * iOS suspends an app within seconds of it going to the background, and a
   * scan takes twenty; the request that was in flight then never settles — not
   * as success, not as failure — while on the server the entry it was waiting
   * for lands a minute later. The same is true of a scan slower than the
   * platform's request timeout, and of one the user force-quit through.
   *
   * There is nothing to wait ON in any of those, so the day is asked again
   * instead, every few seconds, until either the entry appears — `useDayLog`
   * claims the row and it disappears — or the deadline passes and the row says
   * plainly that it could not be read. Polling `day` and not some scan-status
   * endpoint is deliberate: the entry IS the answer, the day query already
   * fetches it, and a second way to ask the same question is a second way for
   * the two to disagree.
   *
   * The poll only runs while a row is in `waiting`. A request still in flight
   * will call back on its own, and asking the server about work we are already
   * holding a promise for is traffic that buys nothing.
   */
  const watching = snaps.some((snap) => snap.status === 'waiting')

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
          // Past the deadline it becomes a failed row rather than nothing at
          // all: the photo stays, and so does the chance to log it by hand.
          // Should the entry turn up later anyway, `useDayLog` still claims
          // this row — a failed snap is reconciled against the day exactly
          // like a waiting one, which is what stops a slow scan showing up as
          // an error message beside the meal it produced.
          return { ...snap, status: 'failed' as const }
        })
        if (changed) queryClient.invalidateQueries({ queryKey: ['day'] })
        return changed ? next : current
      })
      if (watching) queryClient.invalidateQueries({ queryKey: ['day'] })
    }

    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick()
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
  }, [queryClient, watching])

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
 * A pending snap dressed as an entry, so a meal card can render one row type.
 *
 * The zeroes are load-bearing: an entry that has not been recognised has no
 * calories, and every total in the app sums `macros.kcal`. A guess here would
 * move the ring to a number the user never ate.
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
