import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { parseISO, subDays } from 'date-fns'
import { useEffect, useMemo } from 'react'

import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { DEFAULT_WATER_ML } from '@/lib/water'
import { dateKey, unwrap } from './client'
import { keys } from './keys'
import { toEntry } from './mappers'
import { useUserId } from './session'
import type { Entry, FoodLogRow } from './types'

type HealthProvider = Database['public']['Enums']['health_provider']

/**
 * History: every entry behind the Trends charts, newest first, as a list a
 * person can read back like a statement.
 *
 * Three readers over tables the app already reads, and no new function on the
 * server. Each metric is stored at a different grain, and the list keeps that
 * grain rather than inventing one: a meal is a row, water is one total per day
 * (`add_water` adds to it, so there are no separate drinks to list), and a
 * weigh-in is one reading per day.
 *
 * Keyed under the `trends` prefix on purpose. Every write that moves a chart
 * already invalidates `trendsAll`, and the list is the same facts, so a meal,
 * a drink or a weigh-in refreshes it without another line in every mutation.
 */

export type HistoryMetric = 'calories' | 'water' | 'weight'

/** One diary day of meals, complete, and what it came to. */
export type MealDay = { date: string; kcal: number; entries: Entry[] }

/** One day's water, against the goal that applied that day. */
export type WaterDay = { date: string; ml: number; goal: number }

/**
 * One weigh-in, with how far it moved from the reading before it. Null for the
 * oldest reading on the account, which has nothing to be compared with.
 */
export type WeightReading = {
  date: string
  kg: number
  change: number | null
  /** Null is a reading the user typed. See `weight_logs.provider`. */
  provider: HealthProvider | null
}

/**
 * Rows a meal page asks for. A page always ends on a whole day (see
 * `fetchMealPage`), so this is a ceiling rather than a page size: about a
 * fortnight of an ordinary diary.
 */
const MEAL_ROWS = 60
/** Days of water or readings of weight per page. A month either way. */
const DAY_ROWS = 31

/** `yyyy-MM-dd`, the day before. */
const dayBefore = (date: string) => dateKey(subDays(parseISO(date), 1))

type Page<T> = { items: T[]; next: string | null }

/**
 * A page of meals, newest first, as whole days.
 *
 * Paged by day rather than by row, because every day header carries the day's
 * total and a page that stopped halfway through a Tuesday would print the wrong
 * one until the next page landed. So a full page drops its oldest day and the
 * next page starts on it. The one exception is a single day with more rows than
 * a page, which is kept as far as it goes rather than asked for forever.
 *
 * Exported for its test, with the limit as an argument so the test does not
 * have to build sixty meals to reach it.
 */
export function mealPage(rows: readonly Entry[], limit = MEAL_ROWS): Page<MealDay> {
  const full = rows.length >= limit
  const oldest = rows.at(-1)?.logDate ?? null
  const oneDay = full && rows[0]?.logDate === oldest

  const kept = full && !oneDay ? rows.filter((entry) => entry.logDate !== oldest) : rows
  const days: MealDay[] = []
  for (const entry of kept) {
    const day = days.at(-1)
    if (day?.date === entry.logDate) {
      day.entries.push(entry)
      day.kcal += entry.macros.kcal
    } else {
      days.push({ date: entry.logDate, kcal: entry.macros.kcal, entries: [entry] })
    }
  }

  return {
    items: days,
    next: !full || !oldest ? null : oneDay ? dayBefore(oldest) : oldest,
  }
}

async function fetchMealPage(userId: string, through: string | null): Promise<Page<MealDay>> {
  let request = supabase
    .from('food_log_details')
    .select('*')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .order('logged_at', { ascending: false })
    .limit(MEAL_ROWS)
  if (through) request = request.lte('log_date', through)

  return mealPage((unwrap(await request) as FoodLogRow[]).map(toEntry))
}

/**
 * A page of water days, each against its own goal.
 *
 * The goal is looked up per day because `daily_goals` is effective-dated: a goal
 * raised last week must not turn last month's good days into short ones. The
 * table holds a row per change, so all of it is a handful of rows. `goals` is
 * newest first, as the query orders it.
 */
export function waterPage(
  rows: readonly { log_date: string; water_ml: number }[],
  goals: readonly { effective_from: string; water_ml: number }[],
  limit = DAY_ROWS,
): Page<WaterDay> {
  return {
    items: rows.map((row) => ({
      date: row.log_date,
      ml: row.water_ml,
      goal: goals.find((goal) => goal.effective_from <= row.log_date)?.water_ml ?? DEFAULT_WATER_ML,
    })),
    next: rows.length >= limit ? dayBefore(rows[rows.length - 1].log_date) : null,
  }
}

/** How long the goal history is reused across water pages before it is asked for again. */
const GOALS_FRESH_MS = 60_000

async function fetchWaterPage(
  userId: string,
  through: string | null,
  queryClient: QueryClient,
): Promise<Page<WaterDay>> {
  let request = supabase
    .from('daily_logs')
    .select('log_date, water_ml')
    .eq('user_id', userId)
    .gt('water_ml', 0)
    .order('log_date', { ascending: false })
    .limit(DAY_ROWS)
  if (through) request = request.lte('log_date', through)

  // Read once and shared by every page, rather than once a page: the goals are
  // the same rows whichever month is being read. Under the history key, so the
  // invalidation that refetches the pages refetches these first.
  const [days, goals] = await Promise.all([
    request,
    queryClient.fetchQuery({
      queryKey: [...keys.history(userId, 'water'), 'goals'],
      staleTime: GOALS_FRESH_MS,
      queryFn: async () =>
        unwrap(
          await supabase
            .from('daily_goals')
            .select('effective_from, water_ml')
            .eq('user_id', userId)
            .order('effective_from', { ascending: false }),
        ),
    }),
  ])

  return waterPage(unwrap(days), goals)
}

/**
 * A page of weigh-ins, each against the one before it.
 *
 * Asked for with one row more than the page shows, so the last reading on it
 * can say how far it moved. Without it every page would end on a reading with
 * no change beside it, which reads as the first one ever.
 */
export function weightPage(
  rows: readonly Omit<WeightReading, 'change'>[],
  limit = DAY_ROWS,
): Page<WeightReading> {
  return {
    items: rows.slice(0, limit).map((row, index) => {
      const before = rows[index + 1]
      return { ...row, change: before ? row.kg - before.kg : null }
    }),
    next: rows.length > limit ? rows[limit].date : null,
  }
}

async function fetchWeightPage(
  userId: string,
  through: string | null,
): Promise<Page<WeightReading>> {
  let request = supabase
    .from('weight_logs')
    .select('measured_on, weight_kg, provider')
    .eq('user_id', userId)
    .order('measured_on', { ascending: false })
    .limit(DAY_ROWS + 1)
  if (through) request = request.lte('measured_on', through)

  return weightPage(
    unwrap(await request).map((row) => ({
      date: row.measured_on,
      // `numeric`, so a string over the wire. See `num` in `trends.ts`.
      kg: Number(row.weight_kg),
      provider: row.provider,
    })),
  )
}

const FETCHERS = {
  calories: fetchMealPage,
  water: fetchWaterPage,
  weight: fetchWeightPage,
} as const satisfies Record<
  HistoryMetric,
  (user: string, through: string | null, queryClient: QueryClient) => Promise<Page<unknown>>
>

type ItemOf = { calories: MealDay; water: WaterDay; weight: WeightReading }

/**
 * One metric's history, a page at a time.
 *
 * The Trends card reads the first page and the History screen reads them all,
 * through the same key, so "See all" opens on rows that are already there.
 */
export function useHistory<M extends HistoryMetric>(metric: M) {
  const userId = useUserId()
  const queryClient = useQueryClient()

  const query = useInfiniteQuery({
    queryKey: keys.history(userId, metric),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      (
        FETCHERS[metric] as (
          user: string,
          through: string | null,
          client: QueryClient,
        ) => Promise<Page<ItemOf[M]>>
      )(userId, pageParam, queryClient),
    getNextPageParam: (page) => page.next ?? undefined,
  })

  // Kept stable between renders, so the screen's grouping is only redone when
  // a page actually arrives.
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])

  return {
    ...query,
    items,
    /**
     * Nothing to show and nothing coming: the first page failed, or it is
     * paused offline with nothing cached. A paused query stays `isPending`
     * forever, so a skeleton drawn off `isPending` alone would never go.
     */
    unavailable: items.length === 0 && (query.isError || query.isPaused),
  }
}

/**
 * Drops every page but the first, for all three metrics, when the History
 * screen closes.
 *
 * An infinite query refetches every page it holds, in order, whenever it is
 * invalidated. Scroll a year back once and every meal logged afterwards would
 * re-read that year behind the Trends card, which only ever shows a handful of
 * rows.
 */
export function useTrimHistoryOnLeave() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  useEffect(
    () => () => {
      for (const metric of Object.keys(FETCHERS) as HistoryMetric[]) {
        const queryKey = keys.history(userId, metric)
        // Cancelled first and trimmed after. A next page still in flight
        // resolves onto every page it started from, so trimming under it was
        // undone the moment it landed.
        void queryClient
          .cancelQueries({ queryKey, exact: true })
          .then(() =>
            queryClient.setQueryData<InfiniteData<unknown, string | null>>(queryKey, (data) =>
              data && data.pages.length > 1
                ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
                : data,
            ),
          )
      }
    },
    [queryClient, userId],
  )
}
