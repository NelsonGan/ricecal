import { useQuery } from '@tanstack/react-query'

import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { unwrap } from './client'
import { keys } from './keys'
import { useUserId } from './session'
import type { TrendBucket, TrendRange, TrendSummary } from './types'

type SeriesRow = Database['public']['Functions']['trend_series']['Returns'][number]
type SummaryRow = Database['public']['Functions']['trend_summary']['Returns'][number]

/**
 * A `numeric` column, as a number or as nothing.
 *
 * PostgREST sends `numeric` as a STRING — it is arbitrary precision and a JSON
 * number is not — while `integer` arrives as a number. The generated types call
 * both of them `number`, so every average on these rows has to be converted
 * here or it reaches a chart as `"68.60"`, which renders, sorts like a word and
 * fails silently the first time something subtracts it.
 */
const num = (value: number | null): number | null => (value === null ? null : Number(value))

/**
 * The same, where absent means zero rather than unknown.
 *
 * Every count, and every water figure. A day nobody logged water on is a day of
 * no water, not a day whose water is a mystery — which is the one place these
 * two helpers must not be swapped, because `null` calories mean the opposite.
 */
const orZero = (value: number | null): number => (value === null ? 0 : Number(value))

function toBucket(row: SeriesRow): TrendBucket {
  return {
    start: row.bucket_start,
    end: row.bucket_end,
    days: orZero(row.days),

    kcal: num(row.kcal_avg),
    carbs: num(row.carbs_g_avg),
    protein: num(row.protein_g_avg),
    fat: num(row.fat_g_avg),
    daysLogged: orZero(row.days_logged),
    kcalGoal: num(row.kcal_goal),
    daysUnderGoal: orZero(row.days_under_goal),

    water: orZero(row.water_avg),
    waterTotal: orZero(row.water_total),
    waterBest: orZero(row.water_best),
    waterGoalDays: orZero(row.water_goal_days),
    waterHabitDays: orZero(row.water_habit_days),
    waterLoggedDays: orZero(row.water_logged_days),
    waterGoal: orZero(row.water_goal),

    weight: num(row.weight_last),
    weightAvg: num(row.weight_avg),
    weightMin: num(row.weight_min),
    weighIns: orZero(row.weigh_ins),
  }
}

function toSummary(row: SummaryRow): TrendSummary {
  return {
    from: row.from_date,
    to: row.to_date,
    days: orZero(row.days),

    kcal: num(row.kcal_avg),
    carbs: num(row.carbs_g_avg),
    protein: num(row.protein_g_avg),
    fat: num(row.fat_g_avg),
    daysLogged: orZero(row.days_logged),
    kcalGoal: num(row.kcal_goal),
    daysUnderGoal: orZero(row.days_under_goal),

    water: orZero(row.water_avg),
    waterTotal: orZero(row.water_total),
    waterBest: orZero(row.water_best),
    waterGoalDays: orZero(row.water_goal_days),
    waterHabitDays: orZero(row.water_habit_days),
    waterLoggedDays: orZero(row.water_logged_days),
    waterGoal: orZero(row.water_goal),

    weightBefore: num(row.weight_before),
    weightFirst: num(row.weight_first),
    weightLast: num(row.weight_last),
    weightAvg: num(row.weight_avg),
    weightPeak: num(row.weight_peak),
    weightPeakOn: row.weight_peak_on,
    weighIns: orZero(row.weigh_ins),
  }
}

/**
 * The columns of whichever chart is on screen.
 *
 * One row per column — a day on `7d`, a seven-day block on `30d`, a calendar
 * month on `1y` — and each row carries the calorie, water AND weight numbers.
 * That is deliberate: the three tabs are three readings of one range, so
 * switching between them must not go back to the server. Only the range switch
 * does.
 */
export function useTrendSeries(range: TrendRange) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.trendSeries(userId, range),
    queryFn: async (): Promise<TrendBucket[]> =>
      (unwrap(await supabase.rpc('trend_series', { p_range: range })) as SeriesRow[]).map(toBucket),
  })
}

/**
 * The same range as one row: the three metric tiles, and each chart's footnote.
 *
 * Not folded out of `useTrendSeries` in the client. A range average has to
 * weight each bucket by the days actually logged in it, and on `30d` the oldest
 * block is two days rather than seven — an average of the five bucket averages
 * is a different, wrong number.
 */
export function useTrendSummary(range: TrendRange) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.trendSummary(userId, range),
    queryFn: async (): Promise<TrendSummary | null> => {
      const rows = unwrap(await supabase.rpc('trend_summary', { p_range: range })) as SummaryRow[]
      const row = rows[0]
      return row ? toSummary(row) : null
    },
  })
}
