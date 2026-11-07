import { addDays } from 'date-fns/addDays'
import { format } from 'date-fns/format'
import { parseISO } from 'date-fns/parseISO'

import { pointNames } from '../axis'

const between = (from: string, to: string) => `${from} to ${to}`
const iso = (date: Date) => format(date, 'yyyy-MM-dd')

/** One-day points ending on `last`, oldest first. */
function days(count: number, last: string) {
  return Array.from({ length: count }, (_, index) => {
    const day = iso(addDays(parseISO(last), index - count + 1))
    return { start: day, end: day }
  })
}

it('dates every day of thirty, and names it in full when read', () => {
  const names = pointNames(days(30, '2026-11-06'), '30d', between)
  expect(names).toHaveLength(30)
  expect(names[29]).toEqual({ label: '6 Nov', title: 'Fri 6 Nov' })
  expect(names[0].label).toBe('8 Oct')
})

it('labels a week of days by weekday', () => {
  const names = pointNames(days(7, '2026-11-06'), '7d', between)
  expect(names.map((name) => name.label)).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  expect(names[6].title).toBe('Fri 6 Nov')
})

it('names a month under the week that holds its first day, and reads a week as its span', () => {
  // Seven-day blocks counted back from 6 November, the oldest starting on
  // the first of December a year before, as `trend_series` cuts them.
  const blocks: { start: string; end: string }[] = []
  let end = parseISO('2026-11-06')
  const from = parseISO('2025-12-01')
  while (end >= from) {
    const start = addDays(end, -6) < from ? from : addDays(end, -6)
    blocks.unshift({ start: iso(start), end: iso(end) })
    end = addDays(start, -1)
  }
  const names = pointNames(blocks, '1y', between)
  const named = names.flatMap((name, index) =>
    name.label ? [[blocks[index].start, name.label]] : [],
  )
  expect(named.map(([, label]) => label)).toEqual([
    'Dec',
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
  ])
  // Each named block holds the first of its month.
  for (const [start, label] of named) {
    const first = blocks.find((block) => block.start === start)
    expect(first && format(parseISO(first.end), 'LLL')).toBe(label)
  }
  expect(names.at(-1)?.title).toBe('31 Oct to 6 Nov')
})
