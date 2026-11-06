import { format, parseISO } from 'date-fns'

import { TREND_GRAIN, type TrendBucket, type TrendRange } from '@/data/types'
import { datePattern } from '@/lib/dates'

/**
 * The heading over every chart, one key per range.
 *
 * A map rather than `t(\`range.span${range}\`)`. The template would type-check
 * — the three keys all exist — but it defeats the point of the typed bundle:
 * renaming one of them stops being a compile error and starts being a screen
 * that says `range.span30d`.
 */
export const SPAN_KEY = {
  '7d': 'progress:range.span7d',
  '30d': 'progress:range.span30d',
  '1y': 'progress:range.span1y',
} as const satisfies Record<TrendRange, string>

/** What the axis and the readout call one point. */
export type PointName = {
  /** Under the point. Blank where the axis has no room for it. */
  label: string
  /** Over the point when it is read, which names it in full. */
  title: string
}

/**
 * The names of a chart's points, by the range's grain (`TREND_GRAIN`).
 *
 * A week of days is labelled by weekday, which all seven fit. Thirty days are
 * dated ("6 Nov"), and `AxisLabels` keeps as many as fit, counting back from
 * today so the newest is always named. A year of weeks names the month under
 * the first week of it, since nobody orients by "the week of 13 April".
 *
 * `between` words a week's span ("2 Nov to 8 Nov"), which is a sentence and
 * so comes from the translations rather than from here.
 */
export function pointNames(
  buckets: readonly Pick<TrendBucket, 'start' | 'end'>[],
  range: TrendRange,
  between: (from: string, to: string) => string,
): PointName[] {
  const grain = TREND_GRAIN[range]
  const day = (date: string, pattern: Parameters<typeof datePattern>[0]) =>
    format(parseISO(date), datePattern(pattern))
  return buckets.map((bucket, index) => {
    if (grain === 'day') {
      return {
        label: range === '7d' ? format(parseISO(bucket.end), 'EEE') : day(bucket.end, 'dayMonth'),
        title: day(bucket.end, 'weekdayDayMonth'),
      }
    }
    if (grain === 'week') {
      // Named for the month whose first day falls in it. Blocks are counted
      // back from today rather than starting on a weekday, so the first is
      // wherever in the block it lands, and no block of seven holds two.
      const end = parseISO(bucket.end)
      const first = new Date(end.getFullYear(), end.getMonth(), 1)
      return {
        label: first >= parseISO(bucket.start) ? format(first, datePattern('month')) : '',
        title: between(day(bucket.start, 'dayMonth'), day(bucket.end, 'dayMonth')),
      }
    }
    const fromEnd = buckets.length - 1 - index
    return {
      label: fromEnd % MONTH_LABEL_EVERY === 0 ? format(parseISO(bucket.start), 'LLL') : '',
      title: format(parseISO(bucket.start), 'LLLL'),
    }
  })
}

/** Label every other month. Twelve names do not fit; six do, with room to spare. */
const MONTH_LABEL_EVERY = 2
