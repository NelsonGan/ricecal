import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { supabase } from '@/lib/supabase'
import { unwrap, unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { toEntry } from './mappers'
import { pendingAsEntry, usePendingSnaps } from './pending-snaps'
import { useUserId } from './session'
import type { DailyNutritionRow, DayLog, Entry, FoodLogRow } from './types'

/**
 * One day: what was eaten, and how much water.
 *
 * Two tables in one request rather than two, because every screen that wants one
 * wants the other, and a day that renders its meals before its water flickers.
 * `food_log_details` has already done the arithmetic — the macros on each row are
 * the dish's, times the portion, times how many — so nothing here multiplies
 * anything.
 */
async function fetchDay(userId: string, date: string): Promise<DayLog> {
  const [entries, water] = await Promise.all([
    supabase
      .from('food_log_details')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', date)
      .order('logged_at'),
    supabase
      .from('daily_logs')
      .select('water_glasses')
      .eq('user_id', userId)
      .eq('log_date', date)
      .maybeSingle(),
  ])

  return {
    date,
    entries: (unwrap(entries) as FoodLogRow[]).map(toEntry),
    // No row means no water logged, not an error: `daily_logs` is written
    // the first time someone taps a glass.
    waterGlasses: unwrapMaybe(water)?.water_glasses ?? 0,
  }
}

export function useDay(date: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.day(userId, date),
    queryFn: () => fetchDay(userId, date),
  })
}

/**
 * The day currently on screen, never undefined — an unlogged day is empty.
 *
 * Snaps still being recognised are merged in here rather than being a second
 * list every screen has to remember to render. They have no row yet, so they
 * cannot come from the query; sorting by time puts each one where it belongs
 * in its meal rather than at the end.
 */
export function useDayLog(date: string): DayLog {
  const { data } = useDay(date)
  const { snaps } = usePendingSnaps()

  return useMemo(() => {
    const base = data ?? { date, entries: [], waterGlasses: 0 }
    const mine = snaps.filter((snap) => snap.logDate === date)
    if (mine.length === 0) return base

    return {
      ...base,
      entries: [...base.entries, ...mine.map(pendingAsEntry)].sort((a, b) =>
        a.loggedAt.localeCompare(b.loggedAt),
      ),
    }
  }, [data, snaps, date])
}

// `usePrefetchDays` used to live here too, warming the days either side of the
// diary's pager so a swipe never landed on one that was still loading. The pager
// went with the diary; `fetchDay` above stays factored out, which is all a future
// one would need to bring it back.

/**
 * Sets the water count for a day.
 *
 * An upsert: the row may not exist, and tapping the fourth glass should not
 * have to know whether the first one created it.
 */
export function useSetWater(date: string) {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (glasses: number) =>
      unwrapOne(
        await supabase
          .from('daily_logs')
          .upsert(
            { user_id: userId, log_date: date, water_glasses: Math.max(0, glasses) },
            { onConflict: 'user_id,log_date' },
          )
          .select('water_glasses')
          .single(),
      ),
    // The tracker is a row of taps. It has to fill under the finger.
    onMutate: async (glasses) => {
      await queryClient.cancelQueries({ queryKey: keys.day(userId, date) })
      const previous = queryClient.getQueryData<DayLog>(keys.day(userId, date))
      if (previous) {
        queryClient.setQueryData(keys.day(userId, date), {
          ...previous,
          waterGlasses: Math.max(0, glasses),
        })
      }
      return { previous }
    },
    onError: (_error, _glasses, context) => {
      if (context?.previous) queryClient.setQueryData(keys.day(userId, date), context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.day(userId, date) }),
  })
}

/**
 * Daily totals across a range, for the charts and the weekly report.
 *
 * `daily_nutrition` only has rows for days with something logged, so a caller
 * that wants a point per day fills the gaps itself — an absent day is a day
 * with nothing in it, which is not the same as a day of zeros that someone
 * recorded.
 */
export function useNutritionRange(from: string, to: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.nutrition(userId, from, to),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('daily_nutrition')
          .select('*')
          .eq('user_id', userId)
          .gte('log_date', from)
          .lte('log_date', to)
          .order('log_date'),
      ) as DailyNutritionRow[],
  })
}

/** Entries of one meal, oldest first. The order the day happened in. */
export function entriesForMeal(day: DayLog, meal: string): Entry[] {
  return day.entries.filter((entry) => entry.meal === meal)
}

/**
 * Consecutive days with at least one entry.
 *
 * The gaps-and-islands arithmetic is in `logging_streak()` rather than here,
 * so the badge on Today and the same number on Me cannot drift apart, and a
 * future reminder job reads it without a client.
 *
 * A run ending yesterday still counts as current — otherwise a 30-day streak
 * reads as zero every morning until breakfast is logged.
 */
export function useStreak(): { current: number; best: number } {
  const userId = useUserId()

  const { data } = useQuery({
    queryKey: keys.streak(userId),
    queryFn: async () => {
      const rows = unwrap(await supabase.rpc('logging_streak'))
      const row = Array.isArray(rows) ? rows[0] : rows
      return {
        current: row?.current_days ?? 0,
        best: row?.best_days ?? 0,
      }
    },
  })

  return data ?? { current: 0, best: 0 }
}
