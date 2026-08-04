import type { DayMark } from '@/data/types'
import { markFor, weekDays, weekStarts } from '../week'

/**
 * The dot under each day of the week strip.
 *
 * Four states, and three of them are about restraint rather than arithmetic:
 * the strip must not call a day missed while its marks are still in flight, must
 * not judge a day the account had no budget on, and must not judge a day that
 * has not happened. Only the fourth compares two numbers — and it compares
 * against `goal + active`, which is the sum the ring on the same screen draws.
 */

const TODAY = '2026-08-04'

const mark = (over: Partial<DayMark> = {}): DayMark => ({
  date: '2026-08-03',
  entryCount: 2,
  kcal: 1800,
  goalKcal: 2000,
  activeKcal: 0,
  ...over,
})

it('gives a week seven days from its Monday', () => {
  expect(weekDays('2026-08-03')).toEqual([
    '2026-08-03',
    '2026-08-04',
    '2026-08-05',
    '2026-08-06',
    '2026-08-07',
    '2026-08-08',
    '2026-08-09',
  ])
})

it('opens on the week containing today, with a year of weeks behind it', () => {
  const weeks = weekStarts(TODAY)

  // Tuesday the 4th; the page it lands on starts on Monday the 3rd.
  expect(weeks.at(-1)).toBe('2026-08-03')
  expect(weeks).toHaveLength(53)
  expect(weeks[0]).toBe('2025-08-04')
  // Oldest first, so "the last page" and "this week" are the same page.
  expect([...weeks].sort()).toEqual(weeks)
})

it('crosses a month boundary without losing a day', () => {
  expect(weekDays('2026-07-27')).toEqual([
    '2026-07-27',
    '2026-07-28',
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
    '2026-08-02',
  ])
})

it('marks a day inside its goal', () => {
  expect(markFor('2026-08-03', mark(), TODAY, true, true)).toBe('under')
})

it('counts a day exactly at goal as under it', () => {
  // The same boundary `trend_series.days_under_goal` uses. Landing on the
  // number is hitting the target, not missing it.
  expect(markFor('2026-08-03', mark({ kcal: 2000 }), TODAY, true, true)).toBe('under')
})

it('marks a day past its goal', () => {
  expect(markFor('2026-08-03', mark({ kcal: 2400 }), TODAY, true, true)).toBe('over')
})

it('lets movement cover the excess, exactly as the ring does', () => {
  const walked = mark({ kcal: 2200, activeKcal: 400 })

  expect(markFor('2026-08-03', walked, TODAY, true, true)).toBe('under')
  // The same day for an account that has turned that off. The ring reads
  // `goal` alone there, and so must the dot.
  expect(markFor('2026-08-03', walked, TODAY, true, false)).toBe('over')
})

it('draws a past day with nothing on it as missed', () => {
  expect(markFor('2026-08-03', mark({ entryCount: 0, kcal: 0 }), TODAY, true, true)).toBe('missed')
  expect(markFor('2026-08-03', undefined, TODAY, true, true)).toBe('missed')
})

it('does not call today missed before anything is logged', () => {
  expect(markFor(TODAY, undefined, TODAY, true, true)).toBeUndefined()
})

it('says nothing about a day that has not happened', () => {
  expect(markFor('2026-08-05', undefined, TODAY, true, true)).toBeUndefined()
})

it('says nothing at all until the marks have arrived', () => {
  // Otherwise the strip paints a week of hollow "you missed this" dots on
  // every launch and fills them in a moment later.
  expect(markFor('2026-08-03', undefined, TODAY, false, true)).toBeUndefined()
})

it('does not judge a day the account had no budget on', () => {
  expect(markFor('2026-08-03', mark({ goalKcal: null }), TODAY, true, true)).toBeUndefined()
})
