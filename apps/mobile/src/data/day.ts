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
 * A day, plus whether it is the real one yet.
 *
 * The empty day this hook falls back to is indistinguishable from a day nobody
 * logged anything on, and the screens cannot tell them apart from the shape
 * alone — which is how switching dates came to draw "nothing logged" over every
 * day for as long as its request was out. `isPending` is the one bit that says
 * which of the two this is.
 */
/**
 * `isPaused` is the other half of that bit, and it is the half that matters
 * offline: a query with no cached day is held rather than sent, so `isPending`
 * stays true for as long as the phone has no connection. A
 * screen that reads pending as "an answer is coming" draws a skeleton nothing
 * is ever going to replace.
 */
export type DayView = DayLog & { isPending: boolean; isPaused: boolean }

/**
 * The pending rows whose meal has NOT turned up yet.
 *
 * The client removes its own pending row when the request resolves, but the day
 * can refetch before that — on focus, or when a notification brings the app
 * forward — and for a second or two the meal appeared twice: once as the
 * spinner, once as itself. Recognition writes an entry stamped after the shutter
 * (or after the send), so an unclaimed one of those IS this snap, arriving by
 * another route.
 *
 * Matched on the SOURCE the pending row would become, not on `camera` alone: a
 * typed meal writes `text`, and a pending row that cannot recognise its own
 * arrival sits there over a meal already on the day.
 *
 * EVERY row about a scan gets to notice its arrival, not just the one still
 * holding a request. Reconciling `analysing` alone is exactly how a slow scan
 * became an error message beside the meal it produced: the platform gives up on
 * a request at 60s, the row went `failed`, the entry landed five seconds later,
 * and nothing afterwards was ever going to connect the two.
 *
 * `nofood` is the one status left out, and it is not an unfinished scan: it is a
 * finished one that wrote nothing, so it has no entry of its own to find, and
 * letting it claim the next camera row would delete the user's answer along with
 * somebody else's meal.
 *
 * Exported for its own test. The rule is four lines and every one of them has
 * been wrong at some point, in ways that read as a caching bug.
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
 * The day currently on screen, never undefined — an unlogged day is empty.
 *
 * Snaps still being recognised are merged in here rather than being a second
 * list every screen has to remember to render. They have no row yet, so they
 * cannot come from the query; sorting by time puts each one where it belongs
 * in its meal rather than at the end.
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
     * A row whose meal turned up is DONE, not merely hidden.
     *
     * Claiming it only kept it out of this list, and for a snap the client
     * resolved itself that is enough — the request already removed it. But a
     * snap nobody was holding (killed app, timed-out request) has nothing else
     * to take it out of storage, so it sat there until it aged out, invisible
     * and claiming an entry. Delete that meal later and it reappears: a "could
     * not read the plate" row for a plate that was read, on a day the user has
     * just tidied.
     */
    const settled = mine.filter((snap) => !unresolved.includes(snap)).map((snap) => snap.id)

    if (unresolved.length === 0) return { ...base, settled }

    return {
      ...base,
      settled,
      /**
       * A snap is content, so a day carrying one is never "still loading".
       *
       * The shutter writes its row into MMKV before there is anything to
       * fetch, and a screen that hid the day behind a skeleton until the query
       * answered would take the photograph off the day it was just added to —
       * which is the one moment the user is watching that row.
       *
       * `isPaused` goes with it, and for the same reason: a day with a snap on
       * it has something to draw, whether or not the query behind it can run.
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
 * Every day in a range, in one request per table.
 *
 * The same two selects `fetchDay` makes, with `gte`/`lte` where it has `eq` —
 * so seven days cost what one costs. That is the whole reason warming a week is
 * affordable: asked a day at a time it would be fourteen requests to save one.
 *
 * Days with nothing on them are in the result, as empty days. They have to be:
 * the point of the warm-up is that the screen never has to wait to find out,
 * and "no rows came back for Tuesday" is the answer, not a gap.
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
 * `usePrefetchDays` used to live here, warming the days either side of the
 * diary's pager; the pager went with the diary and this is the same idea against
 * the week strip, which can put any of seven days on Today with one tap.
 *
 * WHY THIS RATHER THAN A BETTER PLACEHOLDER
 *
 * Today already refuses to draw a day it has not got — that is what stopped the
 * strip announcing every unfetched day as a day nobody ate on. But a placeholder
 * is still a swap, and on a tap that resolves in a few hundred milliseconds the
 * screen changes twice: to the skeleton, and back. The only version of this with
 * no swap in it is one where the day is already in the cache when it is asked
 * for, and a week is exactly the set of days one screen can reach.
 *
 * Fetched imperatively rather than through `useQuery`, because a query of its
 * own would be a SECOND persisted copy of every entry in the week — the range's
 * and the seven days' — for a value nothing reads after it has been spread out.
 * A failure is deliberately silent: this is a warm-up, and the day the user
 * actually picks fetches itself.
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
 * AN RPC RATHER THAN AN UPSERT, and the difference is why this hook changed
 * shape with the column. Glasses were SET — the tracker knew it wanted four, so
 * it could write four — while millilitres are ADDED, and a read here plus a
 * write here loses one of two taps that overlap. Quick-add is a row of buttons
 * people drum on, so that is the ordinary case rather than the unlucky one;
 * `add_water` does the read and the write in one statement.
 *
 * A negative amount is an undo. The server clamps at zero rather than raising,
 * because somebody pressing undo has already made their only mistake.
 */
export function useAddWater(date: string) {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ml: number) => {
      const { data, error } = await supabase.rpc('add_water', { p_ml: ml, p_date: date })
      if (error) throw error
      return data
    },
    // The tank has to move under the finger, so the day is patched before the
    // request leaves. Clamped exactly where the server clamps, which is what
    // lets the answer be THROWN AWAY: `add_water` returns the day's new total,
    // and writing it here would be a race for nothing. Two taps in flight
    // resolve in whatever order the network hands them back, so the older
    // answer can land last and take the newer drink off the screen until the
    // refetch below puts it back.
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
 * The dish drawn in each day's cell on the month calendar.
 *
 * Keyed by date like `useDayMarks`, so a cell asks about its own day rather
 * than searching a list — thirty-one lookups per month, once per swipe.
 *
 * A day with nothing logged is ABSENT from the map rather than present and
 * empty, which is what `day_plates` returns: the dot already says a day was
 * missed, and a second way of saying it here would be a picture of nothing.
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
