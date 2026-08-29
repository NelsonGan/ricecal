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
 * The labels under a chart's columns. Each range names its columns differently: a
 * day gets its weekday, a month gets its number, and a seven-day block counted
 * back from today has no name, so it gets an index, which is the one that needs
 * translating and is therefore passed in rather than formatted here.
 *
 * Three letters fit a seventh of the width and not a twelfth, so the year labels
 * every other month rather than shortening the name: "8" for August makes you
 * convert before it tells you where you are.
 *
 * The interval counts back from the newest bucket, so the month on the right is
 * always labelled. That is the one people orient by, and anchoring at the left
 * would drop it half the time.
 */
export function bucketLabels(
  buckets: readonly TrendBucket[],
  range: TrendRange,
  weekLabel: (index: number) => string,
): string[] {
  return buckets.map((bucket, index) => {
    if (range === '7d') return format(parseISO(bucket.end), 'EEE')
    if (range === '1y') {
      const fromEnd = buckets.length - 1 - index
      return fromEnd % MONTH_LABEL_EVERY === 0 ? format(parseISO(bucket.start), 'LLL') : ''
    }
    return weekLabel(index + 1)
  })
}

/** Label every other month. Twelve names do not fit; six do, with room to spare. */
const MONTH_LABEL_EVERY = 2

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
