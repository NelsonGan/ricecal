/**
 * The food map's periods: a week (Monday to Sunday, like the strip on Today),
 * a month, or everything. A period is a kind and a day inside it; `logDate`
 * decides which period an entry is in, since it is the day the meal counts
 * towards rather than the instant, so supper dragged back onto yesterday is
 * on yesterday's week here too.
 */

import { addMonths } from 'date-fns/addMonths'
import { addWeeks } from 'date-fns/addWeeks'
import { endOfMonth } from 'date-fns/endOfMonth'
import { endOfWeek } from 'date-fns/endOfWeek'
import { parseISO } from 'date-fns/parseISO'
import { startOfMonth } from 'date-fns/startOfMonth'
import { startOfWeek } from 'date-fns/startOfWeek'

import { dateKey as key } from '@/data/client'
import { WEEK_STARTS_ON } from '@/features/logging/week'

export type MapPeriod = {
  kind: 'week' | 'month' | 'all'
  /** Any day inside the period, YYYY-MM-DD. Ignored for `all`. */
  anchor: string
}

/** The first and last day of the period, inclusive, or null for all time. */
export function periodRange(period: MapPeriod): { from: string; to: string } | null {
  const day = parseISO(period.anchor)
  if (period.kind === 'week') {
    return {
      from: key(startOfWeek(day, { weekStartsOn: WEEK_STARTS_ON })),
      to: key(endOfWeek(day, { weekStartsOn: WEEK_STARTS_ON })),
    }
  }
  if (period.kind === 'month') return { from: key(startOfMonth(day)), to: key(endOfMonth(day)) }
  return null
}

export function inPeriod(logDate: string, period: MapPeriod): boolean {
  const range = periodRange(period)
  return !range || (logDate >= range.from && logDate <= range.to)
}

/** The period before (-1) or after (+1) this one. */
export function shiftPeriod(period: MapPeriod, step: -1 | 1): MapPeriod {
  if (period.kind === 'all') return period
  const day = parseISO(period.anchor)
  const moved = period.kind === 'week' ? addWeeks(day, step) : addMonths(day, step)
  return { ...period, anchor: key(moved) }
}

/** Whether the period holds `today`, which is as far forward as the arrows go. */
export function isCurrentPeriod(period: MapPeriod, today: string): boolean {
  return inPeriod(today, period)
}
