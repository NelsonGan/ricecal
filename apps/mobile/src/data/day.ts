import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { supabase } from '@/lib/supabase'
import { WATER_MAX_ML } from '@/lib/water'
import { datesBetween, seedMissing, unwrap, unwrapMaybe } from './client'
import { keys } from './keys'
import { toEntry, toIcon } from './mappers'
import { pendingAsEntry, usePendingSnaps } from './pending-snaps'
import { useUserId } from './session'
import type {
  DailyNutritionRow,
  DayLog,
  DayMark,
  DayMarkRow,
  DayPlate,
  DayPlateRow,
  EntrySource,
  EntryStatus,
  FoodLogRow,
} from './types'

/**
 * One day: what was eaten, and how much water. Two tables in one request, because
 * every screen that wants one wants the other and a day that renders its meals
 * before its water flickers. `food_log_details` has done the arithmetic.
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
      .select('water_ml')
      .eq('user_id', userId)
      .eq('log_date', date)
      .maybeSingle(),
  ])

  return {
    date,
    entries: (unwrap(entries) as FoodLogRow[]).map(toEntry),
    // No row means no water logged, not an error: `daily_logs` is written
    // the first time somebody records a drink.
    waterMl: unwrapMaybe(water)?.water_ml ?? 0,
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
 * A day, plus whether it is the real one yet. The empty day this falls back to is
 * indistinguishable from a day nobody logged anything on, which is how switching
 * dates drew "nothing logged" for as long as the request was out. `isPending`
 * says which of the two it is.
 *
 * `isPaused` is the half that matters offline: a query with no cached day is held
 * rather than sent, so `isPending` stays true and a screen reading it as "an
 * answer is coming" draws a skeleton nothing will replace.
 */
export type DayView = DayLog & { isPending: boolean; isPaused: boolean }

/**
 * The pending rows whose meal has not turned up yet.
 *
 * The client removes its own pending row when the request resolves, but the day
 * can refetch first, and for a second the meal appeared twice. Recognition writes
 * an entry stamped after the shutter, so an unclaimed one of those is this snap
 * arriving by another route.
 *
 * Matched on the source the pending row would become rather than `camera` alone,
 * since a typed meal writes `text`.
 *
 * Every row about a scan gets to notice its arrival, not only the one still
 * holding a request: reconciling `analysing` alone is how a slow scan became an
 * error message beside the meal it produced.
 *
 * `nofood` is left out. It is a finished scan that wrote nothing, so it has no
 * entry to find, and letting it claim the next camera row would delete the
 * user's answer along with somebody else's meal.
 *
 * Exported for its own test: four lines, every one of which has been wrong in
 * ways that read as a caching bug.
 */
export function unclaimedSnaps<S extends { loggedAt: string; text?: string; status: EntryStatus }>(
  snaps: S[],
  entries: Array<{ id: string; source: EntrySource; loggedAt: string }>,
): S[] {
  const claimed = new Set<string>()
  const landed = (snap: S) => {
    // Parsed, not compared as text. Postgres stamps microseconds and an offset
    // ("...:00.123456+00:00") where `toISOString` writes milliseconds and a Z,
    // so the two strings sort against each other by punctuation once their
    // seconds agree.
    const shutter = Date.parse(snap.loggedAt)
    const wrote = snap.text ? 'text' : 'camera'
    return entries.some((entry) => {
      if (entry.source !== wrote || claimed.has(entry.id)) return false
      if (Date.parse(entry.loggedAt) < shutter) return false
      claimed.add(entry.id)
      return true
    })
  }
  return snaps.filter((snap) => snap.status === 'nofood' || !landed(snap))
}

/**
 * The day currently on screen, never undefined. An unlogged day is empty.
 *
 * Snaps still being recognised are merged in rather than being a second list
 * every screen has to remember to render. They have no row yet, so sorting by
 * time puts each where it belongs rather than at the end.
 */
export function useDayLog(date: string): DayView {
  const { data, isPending, isPaused } = useDay(date)
  const { snaps, remove } = usePendingSnaps()

  const view = useMemo((): DayView & { settled: string[] } => {
    const base = {
      ...(data ?? { date, entries: [], waterMl: 0 }),
      isPending,
      isPaused,
      settled: [],
    }
    const mine = snaps.filter((snap) => snap.logDate === date)
    if (mine.length === 0) return base

    const unresolved = unclaimedSnaps(mine, base.entries)
    /**
     * A row whose meal turned up is done rather than merely hidden. Claiming it
     * only kept it out of this list, which is enough for a snap the client
     * resolved itself; a snap nobody was holding sat in storage until it aged
     * out, invisible and claiming an entry, and reappeared if that meal was
     * deleted.
     */
    const settled = mine.filter((snap) => !unresolved.includes(snap)).map((snap) => snap.id)

    if (unresolved.length === 0) return { ...base, settled }

    return {
      ...base,
      settled,
      /**
       * A snap is content, so a day carrying one is never "still loading". The
       * shutter writes its row into MMKV before there is anything to fetch, and a
       * skeleton would take the photograph off the day it was just added to.
       *
       * `isPaused` goes with it: a day with a snap has something to draw whether
       * or not the query behind it can run.
       */
      isPending: false,
      isPaused: false,
      entries: [...base.entries, ...unresolved.map(pendingAsEntry)].sort((a, b) =>
        a.loggedAt.localeCompare(b.loggedAt),
      ),
    }
  }, [data, snaps, date, isPending, isPaused])

  // Swept after render rather than during it: `remove` sets state on another
  // provider, and the list this hook returns is already correct without it.
  // Joined into one string so the effect fires on the CONTENTS changing rather
  // than on a fresh array every render.
  const settledIds = view.settled.join(',')
  useEffect(() => {
    if (!settledIds) return
    for (const id of settledIds.split(',')) remove(id)
  }, [settledIds, remove])

  return view
}

/**
 * Every day in a range, in one request per table: the same two selects `fetchDay`
 * makes with `gte`/`lte` where it has `eq`, so seven days cost what one costs.
 *
 * Days with nothing on them are in the result as empty days, because the point of
 * the warm-up is that the screen never has to wait to find out.
 */
async function fetchDays(userId: string, from: string, to: string): Promise<DayLog[]> {
  const [entries, water] = await Promise.all([
    supabase
      .from('food_log_details')
      .select('*')
      .eq('user_id', userId)
      .gte('log_date', from)
      .lte('log_date', to)
      .order('logged_at'),
    supabase
      .from('daily_logs')
      .select('log_date, water_ml')
      .eq('user_id', userId)
      .gte('log_date', from)
      .lte('log_date', to),
  ])

  const millilitres = new Map(
    (unwrap(water) as { log_date: string; water_ml: number }[]).map((row) => [
      row.log_date,
      row.water_ml,
    ]),
  )

  const days = new Map<string, DayLog>(
    datesBetween(from, to).map((date) => [
      date,
      { date, entries: [], waterMl: millilitres.get(date) ?? 0 },
    ]),
  )

  // Bucketed on the MAPPED entry rather than on the row. Every column of a view
  // is typed nullable — see the data README — so `row.log_date` is `string |
  // null` here, and `toEntry` is the one place allowed to coalesce it.
  for (const entry of (unwrap(entries) as FoodLogRow[]).map(toEntry)) {
    days.get(entry.logDate)?.entries.push(entry)
  }

  return [...days.values()]
}

/**
 * Warms a week of the strip, so picking a day in it draws that day at once.
 *
 * Today already refuses to draw a day it has not got, but a placeholder is still
 * a swap, and on a tap that resolves in a few hundred milliseconds the screen
 * changes twice. The only version with no swap is one where the day is already
 * cached, and a week is the set of days one screen can reach.
 *
 * Fetched imperatively rather than through `useQuery`, which would be a second
 * persisted copy of every entry in the week. A failure is silent: this is a
 * warm-up, and the day the user picks fetches itself.
 */
export function usePrefetchDays(from: string, to: string) {
  const userId = useUserId()
  const queryClient = useQueryClient()

  useEffect(() => {
    const dates = datesBetween(from, to)
    // Nothing missing, nothing to do. This is the common case after the first
    // visit, and it is what keeps a week the user pages back and forth over
    // from re-requesting itself on every render.
    if (dates.every((date) => queryClient.getQueryData(keys.day(userId, date)) !== undefined)) {
      return
    }

    let cancelled = false
    fetchDays(userId, from, to)
      .then((days) => {
        if (cancelled) return
        seedMissing(
          queryClient,
          days.map((day) => [keys.day(userId, day.date), day] as const),
        )
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [userId, from, to, queryClient])
}

/**
 * Records a drink: adds millilitres to a day, or takes them back.
 *
 * An RPC rather than an upsert. Glasses were set, because the tracker knew it
 * wanted four; millilitres are added, and a read plus a write here loses one of
 * two overlapping taps, which on a row of quick-add buttons is the ordinary case.
 *
 * A negative amount is an undo, and the server clamps at zero rather than
 * raising: somebody pressing undo has already made their only mistake.
 */
export function useAddWater(date: string) {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ml: number) => addWater(ml, date),
    // The tank has to move under the finger, so the day is patched before the
    // request leaves, clamped exactly where the server clamps. `add_water`
    // returns the new total and writing it back would be a race: two taps in
    // flight resolve in whatever order the network hands them back.
    onMutate: async (ml) => {
      await queryClient.cancelQueries({ queryKey: keys.day(userId, date) })
      const previous = queryClient.getQueryData<DayLog>(keys.day(userId, date))
      if (previous) {
        queryClient.setQueryData(keys.day(userId, date), {
          ...previous,
          waterMl: Math.min(WATER_MAX_ML, Math.max(0, previous.waterMl + ml)),
        })
      }
      return { previous }
    },
    onError: (_error, _ml, context) => {
      if (context?.previous) queryClient.setQueryData(keys.day(userId, date), context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.day(userId, date) })
      // The water tab counts this drink in its bars, its average and its goal
      // days. Not optimistic, unlike the tank itself: nothing on Trends is
      // under the finger, so it can wait for the row.
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
    },
  })
}

/** The one call. Shared so the two hooks around it cannot pass different arguments. */
async function addWater(ml: number, date: string) {
  const { data, error } = await supabase.rpc('add_water', { p_ml: ml, p_date: date })
  if (error) throw error
  return data
}

/**
 * The same drink, from a widget, with the day travelling in the variables.
 *
 * A hook of its own rather than a parameter on `useAddWater`: that one is bound
 * to the day on screen and patches it optimistically, where this drains a queue
 * of taps from hours ago across several days with nothing on screen, so binding
 * it to a date would mean a hook per queued drink.
 *
 * See `features/widgets/WidgetSync.tsx` for who calls it and when.
 */
export function useAddQueuedWater() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ml, date }: { ml: number; date: string }) => addWater(ml, date),
    onSuccess: (_data, { date }) => {
      queryClient.invalidateQueries({ queryKey: keys.day(userId, date) })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
    },
  })
}

/**
 * Daily totals across a range, for the charts and the weekly report.
 * `daily_nutrition` only has rows for days with something logged, so a caller
 * that wants a point per day fills the gaps itself: an absent day is not the same
 * as a day of zeros somebody recorded.
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
 * How each day of a week went, for the dots under the strip on Today. Keyed by
 * date so the strip asks about a day rather than searching a list.
 *
 * The verdict is neither here nor in the database. `day_marks` returns what was
 * eaten, the goal in force and what movement added; whether that reads as under
 * or over is decided where the ring decides it, since the two are on the same
 * screen about the same day.
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
 * The dish drawn in each day's cell on the month calendar. Keyed by date like
 * `useDayMarks`, so a cell asks about its own day.
 *
 * A day with nothing logged is absent rather than present and empty, which is
 * what `day_plates` returns: the dot already says a day was missed.
 */
export function useDayPlates(from: string, to: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.dayPlates(userId, from, to),
    queryFn: async (): Promise<Record<string, DayPlate>> => {
      const rows = unwrap(
        await supabase.rpc('day_plates', { p_from: from, p_to: to }),
      ) as DayPlateRow[]

      return Object.fromEntries(
        rows.map((row) => [
          row.at,
          {
            date: row.at,
            name: row.food_name ?? '',
            icon: toIcon(row.icon_set, row.icon_name),
            photoPath: row.photo_path ?? undefined,
          },
        ]),
      )
    },
  })
}

/**
 * Consecutive days with at least one entry. The gaps-and-islands arithmetic is in
 * `logging_streak()`, so the badge on Today and the same number on Me cannot
 * drift apart and a reminder job can read it without a client.
 *
 * A run ending yesterday still counts as current, or a 30-day streak would read
 * as zero every morning until breakfast is logged.
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
