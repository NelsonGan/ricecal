import { format, parseISO } from 'date-fns'

import type { TrendBucket, TrendRange } from '@/data'

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

/**
 * The labels under a chart's columns.
 *
 * Each range names its columns differently and none of the three is derivable
 * from the others: a day has a weekday initial, a month has a month initial, and
 * a seven-day block counted back from today has no name at all — so it gets a
 * number, which is the one that needs translating and therefore the one passed
 * in rather than formatted here.
 *
 * Initials rather than abbreviations because twelve columns across a phone leave
 * about 24pt each. "Aug" fits and "Sep" does not, which is worse than "A" and
 * "S" — an axis where some labels are truncated reads as broken.
 */
export function bucketLabels(
  buckets: readonly TrendBucket[],
  range: TrendRange,
  weekLabel: (index: number) => string,
): string[] {
  return buckets.map((bucket, index) => {
    if (range === '7d') return format(parseISO(bucket.end), 'EEEEE')
    if (range === '1y') return format(parseISO(bucket.start), 'LLLLL')
    return weekLabel(index + 1)
  })
}

/**
 * Splits a series into fixed-size groups, oldest first.
 *
 * Used twice, both times to fold a chart's columns into a shorter list beside
 * it: the year's twelve months into four quarters, and nothing else — the
 * thirty-day view's weeks are already the buckets. A trailing group shorter than
 * `size` is kept, because a partial quarter is still a quarter that happened.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size))
  }
  return groups
}
