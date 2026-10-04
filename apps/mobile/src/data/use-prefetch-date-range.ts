import {
  hashKey,
  onlineManager,
  type QueryClient,
  type QueryKey,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { datesBetween, seedMissing } from './client'

const inFlight = new WeakMap<QueryClient, Map<string, Promise<readonly unknown[]>>>()
const subscribeOnline = (notify: () => void) => onlineManager.subscribe(notify)
const isOnline = () => onlineManager.isOnline()

/** Warm individual dates without persisting a second copy of the range. */
export function usePrefetchDateRange<T>(
  userId: string,
  from: string,
  to: string,
  keyForDate: (userId: string, date: string) => QueryKey,
  fetchRange: (userId: string, from: string, to: string, dates: string[]) => Promise<readonly T[]>,
) {
  const queryClient = useQueryClient()
  const online = useSyncExternalStore(subscribeOnline, isOnline)
  const dates = useMemo(() => datesBetween(from, to), [from, to])

  useEffect(() => {
    if (
      !online ||
      dates.every((date) => queryClient.getQueryData(keyForDate(userId, date)) !== undefined)
    )
      return

    let requests = inFlight.get(queryClient)
    if (!requests) {
      requests = new Map()
      inFlight.set(queryClient, requests)
    }
    const rangeKey = hashKey([keyForDate(userId, from), to])
    let request = requests.get(rangeKey)
    if (!request) {
      const pending = requests
      request = fetchRange(userId, from, to, dates).finally(() => pending.delete(rangeKey))
      requests.set(rangeKey, request)
    }

    let cancelled = false
    request
      .then((values) => {
        if (cancelled) return
        // Another read or an optimistic write may have filled a date while this
        // request was out. Keep that answer, including a measured absence.
        seedMissing(
          queryClient,
          dates.map((date, index) => [keyForDate(userId, date), values[index] as T] as const),
        )
      })
      // A selected day fetches itself if the warm-up fails.
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [userId, from, to, dates, keyForDate, fetchRange, queryClient, online])
}
