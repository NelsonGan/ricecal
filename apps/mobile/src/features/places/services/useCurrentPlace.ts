import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type Coordinate,
  type CurrentPlaceFailure,
  currentCoordinate,
  requestLocationPermission,
} from '@/lib/places'

type CurrentPlaceStatus = 'idle' | 'locating' | 'ready' | CurrentPlaceFailure

/**
 * Where the phone is, for the map screens' blue dot and first frame, and what
 * to offer when it cannot say. Asks the system for permission only through
 * `request()`, never by itself.
 */
export function useCurrentPlace({ active }: { active: boolean }) {
  const [status, setStatus] = useState<CurrentPlaceStatus>('idle')
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null)
  const run = useRef(0)

  const locate = useCallback(async (fresh = false) => {
    const id = ++run.current
    setStatus('locating')
    const located = await currentCoordinate({ fresh })
    if (id !== run.current) return
    if (typeof located === 'string') {
      setStatus(located)
      return
    }
    setCoordinate(located)
    setStatus('ready')
  }, [])

  // `locate` checks the permission again and says what to offer if refused.
  const request = useCallback(async () => {
    await requestLocationPermission()
    return locate()
  }, [locate])

  useEffect(() => {
    if (!active) return undefined
    void locate()
    // Closing drops the answer of a fix still in flight.
    return () => {
      run.current += 1
    }
  }, [active, locate])

  return { status, coordinate, refresh: () => locate(true), request }
}
