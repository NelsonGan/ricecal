import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { supabase } from '@/lib/supabase'
import { unwrap, unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { toEntry } from './mappers'
import { pendingAsEntry, usePendingSnaps } from './pending-snaps'
import { useUserId } from './session'
import type { DailyNutritionRow, DayLog, DayMark, DayMarkRow, FoodLogRow } from './types'

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
 * A day, plus whether it is the real one yet.
 *
 * The empty day this hook falls back to is indistinguishable from a day nobody
 * logged anything on, and the screens cannot tell them apart from the shape
 * alone — which is how switching dates came to draw "nothing logged" over every
 * day for as long as its request was out. `isPending` is the one bit that says
 * which of the two this is.
 */
export type DayView = DayLog & { isPending: boolean }

/**
 * The day currently on screen, never undefined — an unlogged day is empty.
 *
 * Snaps still being recognised are merged in here rather than being a second
 * list every screen has to remember to render. They have no row yet, so they
 * cannot come from the query; sorting by time puts each one where it belongs
 * in its meal rather than at the end.
 */
export function useDayLog(date: string): DayView {
  const { data, isPending } = useDay(date)
  const { snaps } = usePendingSnaps()

  return useMemo(() => {
    const base = { ...(data ?? { date, entries: [], waterGlasses: 0 }), isPending }
    const mine = snaps.filter((snap) => snap.logDate === date)
    if (mine.length === 0) return base

    /**
     * A snap whose scan has already landed is dropped here rather than waited
     * for.
     *
     * The client removes its own pending row when the request resolves, but
     * the day can refetch before that — on focus, or when a notification
     * brings the app forward — and for a second or two the meal appeared
     * twice: once as the spinner, once as itself. Recognition writes an entry
     * stamped after the shutter (or after the send), so an unclaimed one of
     * those IS this snap, arriving by another route.
     *
     * Matched on the SOURCE the pending row would become, not on `camera`
     * alone: a typed meal writes `text`, and a pending row that cannot
     * recognise its own arrival sits there until the stale sweep drops it —
     * ninety seconds of a spinner over a meal already on the day.
     */
    const claimed = new Set<string>()
    const landed = (snap: (typeof mine)[number]) => {
      // Parsed, not compared as text. Postgres stamps microseconds and an
      // offset ("...:00.123456+00:00") where `toISOString` writes milliseconds
      // and a Z, so the two strings sort against each other by punctuation
      // once their seconds agree.
      const shutter = Date.parse(snap.loggedAt)
      const wrote = snap.text ? 'text' : 'camera'
      return base.entries.some((entry) => {
        if (entry.source !== wrote || claimed.has(entry.id)) return false
        if (Date.parse(entry.loggedAt) < shutter) return false
        claimed.add(entry.id)
        return true
      })
    }

    const waiting = mine.filter((snap) => snap.status !== 'analysing' || !landed(snap))
    if (waiting.length === 0) return base

    return {
      ...base,
      /**
       * A snap is content, so a day carrying one is never "still loading".
       *
       * The shutter writes its row into MMKV before there is anything to
       * fetch, and a screen that hid the day behind a skeleton until the query
       * answered would take the photograph off the day it was just added to —
       * which is the one moment the user is watching that row.
       */
      isPending: false,
      entries: [...base.entries, ...waiting.map(pendingAsEntry)].sort((a, b) =>
        a.loggedAt.localeCompare(b.loggedAt),
      ),
    }
  }, [data, snaps, date, isPending])
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.day(userId, date) })
      // The water tab counts this glass in its bars, its average and its goal
      // days. Not optimistic, unlike the tracker itself: nothing on Trends is
      // under the finger, so it can wait for the row.
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
    },
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

/**
 * How each day of a week went, for the dots under the strip on Today.
 *
 * Keyed by date so the strip can ask about a day rather than search a list —
 * seven lookups per week, once per swipe.
 *
 * The verdict is not here and is not in the database either. `day_marks`
 * returns what was eaten, the goal in force that day and what movement added
 * to it; whether that reads as under or over is decided where the ring decides
 * it, because the two are on the same screen about the same day and must not
 * disagree.
 */
export function useDayMarks(from: string, to: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.dayMarks(userId, from, to),
    queryFn: async (): Promise<Record<string, DayMark>> => {
      const rows = unwrap(
        await supabase.rpc('day_marks', { p_from: from, p_to: to }),
      ) as DayMarkRow[]

      return Object.fromEntries(
        rows.map((row) => [
          row.at,
          {
            date: row.at,
            entryCount: row.entry_count ?? 0,
            kcal: row.kcal ?? 0,
            // Null where the account had no budget yet — before onboarding ran,
            // or on a day earlier than its first `daily_goals` row. A day with
            // no goal cannot be over or under one, and the strip draws it as a
            // day with nothing logged rather than as a failure.
            goalKcal: row.goal_kcal,
            activeKcal: row.active_kcal ?? 0,
          },
        ]),
      )
    },
  })
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
export function useStreak(): { current: number; best: number; isPending: boolean } {
  const userId = useUserId()

  const { data, isPending } = useQuery({
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

  // Zero is a real answer here — a fresh account has no streak — so the callers
  // are told which zero this is rather than being left to draw "0 day streak"
  // for as long as the request is out.
  return { current: data?.current ?? 0, best: data?.best ?? 0, isPending }
}
