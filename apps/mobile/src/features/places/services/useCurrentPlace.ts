import { useCallback, useEffect, useRef, useState } from 'react'

import type { Coordinate, PlaceResult } from '@/lib/places'
import {
  type CurrentPlaceFailure,
  requestLocationPermission,
  resolveCurrentPlace,
} from '@/lib/places'

export type CurrentPlaceStatus = 'idle' | 'locating' | 'ready' | CurrentPlaceFailure

/**
 * The picker's "Current location" row: where the phone is, what the spot is
 * called, and what to offer when it cannot say. Asks the system for permission
 * only through `request()`, never by itself.
 */
export function useCurrentPlace({ active }: { active: boolean }) {
  const [status, setStatus] = useState<CurrentPlaceStatus>('idle')
  const [place, setPlace] = useState<PlaceResult | null>(null)
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null)
  const run = useRef(0)

  const locate = useCallback(async (fresh = false) => {
    const id = ++run.current
    setStatus('locating')
    const resolved = await resolveCurrentPlace({ fresh })
    if (id !== run.current) return
    if (typeof resolved === 'string') {
      setStatus(resolved)
      return
    }
    setPlace(resolved.place)
    setCoordinate(resolved.coordinate)
    setStatus('ready')
  }, [])

  const request = useCallback(async () => {
    const permission = await requestLocationPermission()
    if (permission.status === 'granted') return locate()
    setStatus(
      permission.status === 'unavailable'
        ? 'unavailable'
        : permission.canAskAgain
          ? 'ask'
          : 'blocked',
    )
  }, [locate])

  useEffect(() => {
    if (!active) return undefined
    void locate()
    // Closing drops the answer of a fix still in flight.
    return () => {
      run.current += 1
    }
  }, [active, locate])

  return { status, place, coordinate, refresh: () => locate(true), request }
}
