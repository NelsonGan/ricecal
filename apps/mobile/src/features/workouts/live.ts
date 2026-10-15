import { useCallback, useEffect, useState } from 'react'

import { useSession } from '@/data'
import type { Action, LiveWorkout } from './model'
import { clearActiveWorkout, dispatchWorkout, startActiveWorkout, useActiveWorkout } from './store'

/**
 * The workout in progress, bound to the signed-in account.
 *
 * `useSession` rather than `useUserId`, because the minimised bar that reads
 * this is mounted in the tabs layout and must survive the instant a session
 * ends without throwing.
 */
export function useLiveWorkout() {
  const { userId } = useSession()
  const workout = useActiveWorkout(userId)

  const dispatch = useCallback(
    (action: Action) => (userId ? dispatchWorkout(userId, action) : null),
    [userId],
  )
  /** Replaces the whole document, for the moves that are not one action. */
  const replace = useCallback(
    (next: LiveWorkout) => {
      if (userId) startActiveWorkout(userId, next)
    },
    [userId],
  )
  const clear = useCallback(() => {
    if (userId) clearActiveWorkout(userId)
  }, [userId])

  return { userId, workout, dispatch, replace, clear }
}

/**
 * The time, re-read every `ms`. Clocks on screen are computed from a stored
 * start, never counted, so a phone that slept for an hour wakes up showing the
 * right figure rather than resuming a counter from where it froze.
 */
export function useNow(ms = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms, active])
  return now
}

/** After this long a running workout is probably a forgotten one. */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000
