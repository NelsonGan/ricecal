import { fromKg, type WeightUnit } from '@/lib/units'

/**
 * The workout progress page's range: which bars it draws and how a scale
 * labels them. Here rather than in the screen so it can be tested.
 */

/** One bar's totals: a week, a month or a year, named by its first day. */
export type PeriodTotals = {
  week: string
  workouts: number
  durationS: number
  volumeKg: number
  sets: number
}

/**
 * How far back the bars go. Three months is free and drawn in weeks; a year
 * and all time are Pro and drawn in months, since a year of weeks is 52 bars
 * too thin to tap. All time past two years is drawn in years, for the same
 * reason.
 */
export type ProgressRange = '3m' | '1y' | 'all'
export const PROGRESS_RANGES: readonly ProgressRange[] = ['3m', '1y', 'all']
export const PROGRESS_RANGE_KEY = {
  '3m': 'workouts:stats.range.3m',
  '1y': 'workouts:stats.range.1y',
  all: 'workouts:stats.range.all',
} as const satisfies Record<ProgressRange, string>
/** Thirteen weeks is three months, this week included. */
export const FREE_WEEKS = 13

/** What one bar is: a Monday's week, a month, or a year. */
export type Bucket = 'week' | 'month' | 'year'

/**
 * The bars a range draws. Weeks as they come; the last twelve months for a
 * year; and for all time every month from the first one with a workout (never
 * fewer than twelve), or whole years once that is more than two years of bars.
 */
export function periodsFor(
  range: ProgressRange,
  rows: readonly PeriodTotals[],
): { rows: PeriodTotals[]; bucket: Bucket } {
  if (range === '3m') return { rows: [...rows], bucket: 'week' }
  if (range === '1y') return { rows: rows.slice(-12), bucket: 'month' }
  const first = rows.findIndex((row) => row.workouts > 0)
  const from = first === -1 ? rows.length - 12 : Math.min(first, rows.length - 12)
  const months = rows.slice(Math.max(0, from))
  if (months.length <= 24) return { rows: months, bucket: 'month' }
  const years = new Map<string, PeriodTotals>()
  for (const month of months) {
    const year = `${month.week.slice(0, 4)}-01-01`
    const sum = years.get(year) ?? { week: year, workouts: 0, durationS: 0, volumeKg: 0, sets: 0 }
    years.set(year, {
      week: year,
      workouts: sum.workouts + month.workouts,
      durationS: sum.durationS + month.durationS,
      volumeKg: sum.volumeKg + month.volumeKg,
      sets: sum.sets + month.sets,
    })
  }
  return { rows: [...years.values()], bucket: 'year' }
}

/** Kilograms in a pound, so a scale in pounds steps in whole pounds. */
export const KG_PER_LB = 1 / fromKg(1, 'lb')

/** "12k", "850": a volume short enough for the scale's gutter, in the user's unit. */
export function compactVolume(kg: number, unit: WeightUnit): string {
  const value = fromKg(kg, unit)
  if (value >= 10000) return `${Math.round(value / 1000)}k`
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`
  return String(Math.round(value))
}
