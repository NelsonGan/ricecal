import { useQuery } from '@tanstack/react-query'

import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { unwrap } from './client'
import { keys } from './keys'
import { toIcon } from './mappers'
import { useUserId } from './session'
import type { ReviewBucket, ReviewKind, ReviewMeal, ReviewPeriod, ReviewSummary } from './types'

type PeriodRow = Database['public']['Functions']['review_periods']['Returns'][number]
type SummaryRow = Database['public']['Functions']['review_summary']['Returns'][number]
type SeriesRow = Database['public']['Functions']['review_series']['Returns'][number]
type MealRow = Database['public']['Functions']['review_meals']['Returns'][number]

/**
 * A `numeric` column, as a number or as nothing.
 *
 * The same conversion `trends.ts` opens with, and for the same reason:
 * PostgREST sends `numeric` as a STRING because it is arbitrary precision and a
 * JSON number is not, while the generated types call it `number`. Left alone,
 * an average reaches a chart as `"1962"` — which renders, sorts like a word,
 * and fails silently the first time something subtracts it.
 */
const num = (value: number | null): number | null => (value === null ? null : Number(value))

/** The same, where absent means zero rather than unknown: every count. */
const orZero = (value: number | null): number => (value === null ? 0 : Number(value))

function toPeriod(row: PeriodRow): ReviewPeriod {
  return {
    kind: row.kind as ReviewKind,
    start: row.starts_on,
    end: row.ends_on,
    days: orZero(row.days),
    daysLogged: orZero(row.days_logged),

    kcal: num(row.kcal_avg),
    weightChange: num(row.weight_change),
    // A `numeric[]` arrives as an array of strings for the reason above, and
    // its nulls are the sparkline's gaps — so this maps rather than coalesces.
    marks: (row.marks ?? []).map((mark) => num(mark as number | null)),
  }
}

function toSummary(row: SummaryRow): ReviewSummary {
  return {
    kind: row.kind as ReviewKind,
    start: row.starts_on,
    end: row.ends_on,
    days: orZero(row.days),
    daysLogged: orZero(row.days_logged),
    daysUnderGoal: orZero(row.days_under_goal),
    streakDays: orZero(row.streak_days),

    kcal: num(row.kcal_avg),
    kcalGoal: num(row.kcal_goal),
    carbs: num(row.carbs_g_avg),
    protein: num(row.protein_g_avg),
    fat: num(row.fat_g_avg),
    lightestOn: row.lightest_on,
    lightestKcal: num(row.lightest_kcal),
    heaviestOn: row.heaviest_on,
    heaviestKcal: num(row.heaviest_kcal),

    water: orZero(row.water_avg),
    waterGoalDays: orZero(row.water_goal_days),

    weightLast: num(row.weight_last),
    weightChange: num(row.weight_change),
    weighIns: orZero(row.weigh_ins),

    activeDays: orZero(row.active_days),
    activeKcal: num(row.active_kcal_avg),
    steps: num(row.steps_avg),
    stepGoalDays: orZero(row.step_goal_days),
    stepGoal: num(row.step_goal),
    distanceM: orZero(row.distance_total_m),
    exerciseMinutes: orZero(row.exercise_min_total),
    sessions: orZero(row.sessions),
  }
}

function toBucket(row: SeriesRow): ReviewBucket {
  return {
    start: row.bucket_start,
    daysLogged: orZero(row.days_logged),

    kcal: num(row.kcal_avg),
    carbs: num(row.carbs_g_avg),
    protein: num(row.protein_g_avg),
    fat: num(row.fat_g_avg),
    weight: num(row.weight_last),
    steps: num(row.steps_avg),
  }
}

function toMeal(row: MealRow): ReviewMeal {
  return {
    name: row.name,
    icon: toIcon(row.icon_set, row.icon_name),
    kcal: orZero(row.kcal_avg),
    carbs: orZero(row.carbs_g_avg),
    protein: orZero(row.protein_g_avg),
    fat: orZero(row.fat_g_avg),
  }
}

/**
 * Every finished week or month in the window, newest first.
 *
 * Read by two screens and cached under one key, which is the point: the list
 * draws these rows, and a story opened from it draws the same rows again as the
 * bars of its comparison chart and resolves `week-latest` against the first of
 * them. One request serves all three uses, and the two that follow are instant.
 */
export function useReviewPeriods(kind: ReviewKind) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.reviewPeriods(userId, kind),
    queryFn: async (): Promise<ReviewPeriod[]> =>
      (unwrap(await supabase.rpc('review_periods', { p_kind: kind })) as PeriodRow[]).map(toPeriod),
  })
}

/**
 * One period folded to the figures its story puts in headlines.
 *
 * Separate from the series below rather than derived from it, for the reason
 * `trend_summary` is separate: an average over a period has to be weighted by
 * the days that actually have food in them, and an average of the column
 * averages is a different, wrong number as soon as one column is short — which
 * every monthly review's first and last week is.
 */
export function useReviewSummary(kind: ReviewKind, start: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.reviewSummary(userId, kind, start),
    // No period, no request. The story screen has to call its hooks before it
    // knows whether the id in the route parsed, so an unreadable link would
    // otherwise ask the server for the review of an empty date.
    enabled: start.length > 0,
    queryFn: async (): Promise<ReviewSummary | null> => {
      const rows = unwrap(
        await supabase.rpc('review_summary', { p_kind: kind, p_start: start }),
      ) as SummaryRow[]
      const row = rows[0]
      return row ? toSummary(row) : null
    },
  })
}

/** The columns of the charts inside a story: a day of a week, a week of a month. */
export function useReviewSeries(kind: ReviewKind, start: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.reviewSeries(userId, kind, start),
    enabled: start.length > 0,
    queryFn: async (): Promise<ReviewBucket[]> =>
      (
        unwrap(await supabase.rpc('review_series', { p_kind: kind, p_start: start })) as SeriesRow[]
      ).map(toBucket),
  })
}

/** How many dishes the food step lists. Five fill the card without scrolling it. */
const MEALS_SHOWN = 5

/** The period's biggest plates, heaviest first. */
export function useReviewMeals(kind: ReviewKind, start: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.reviewMeals(userId, kind, start),
    enabled: start.length > 0,
    queryFn: async (): Promise<ReviewMeal[]> =>
      (
        unwrap(
          await supabase.rpc('review_meals', {
            p_kind: kind,
            p_start: start,
            p_limit: MEALS_SHOWN,
          }),
        ) as MealRow[]
      ).map(toMeal),
  })
}
