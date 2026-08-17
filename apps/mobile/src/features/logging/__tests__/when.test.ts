import { clockLabel, clockOf, dayLabel, instantOn, sameClock } from '../when'

/**
 * The day and the time an entry was eaten.
 *
 * Two columns, one question, and the reading of them has to survive a round
 * trip: `logged_at` is a `timestamptz`, so an hour typed on a phone in Kuala
 * Lumpur and read back has been through UTC and out again. Everything here is a
 * pure function of a date string and a clock face, which is why it can be tested
 * without a device — and why it is tested at all: the failure mode is an entry
 * quietly filed eight hours away from where somebody put it.
 */

const LABELS = { today: 'Today', yesterday: 'Yesterday' }

it('reads a clock face back off the instant it named', () => {
  const clock = { hour: 8, minute: 20, period: 'am' } as const
  expect(clockOf(instantOn('2026-08-17', clock))).toEqual(clock)
})

it('keeps the day it was told, not the UTC one', () => {
  // 11pm local is the next day in UTC anywhere east of it, which is the whole
  // reason `instantOn` goes through the local Date constructor.
  const late = instantOn('2026-08-17', { hour: 11, minute: 45, period: 'pm' })
  expect(new Date(late).getDate()).toBe(17)
  expect(clockOf(late)).toEqual({ hour: 11, minute: 45, period: 'pm' })
})

it('puts twelve at both ends of the day where a clock does', () => {
  const midnight = instantOn('2026-08-17', { hour: 12, minute: 5, period: 'am' })
  const noon = instantOn('2026-08-17', { hour: 12, minute: 5, period: 'pm' })
  expect(new Date(midnight).getHours()).toBe(0)
  expect(new Date(noon).getHours()).toBe(12)
  expect(clockOf(midnight)).toEqual({ hour: 12, minute: 5, period: 'am' })
})

it('compares two clock faces by the minute', () => {
  const eight = { hour: 8, minute: 20, period: 'am' } as const
  expect(sameClock(eight, { ...eight })).toBe(true)
  expect(sameClock(eight, { ...eight, minute: 21 })).toBe(false)
  expect(sameClock(eight, { ...eight, period: 'pm' })).toBe(false)
})

it('pads the minute and nothing else', () => {
  // The one place a clock face is turned into words without going through a
  // `Date`, so that the picker can label itself on every flick of a wheel.
  expect(clockLabel({ hour: 8, minute: 5, period: 'am' })).toBe('8:05 am')
  expect(clockLabel({ hour: 12, minute: 0, period: 'pm' })).toBe('12:00 pm')
})

it('names the two days everybody thinks of by name, and dates the rest', () => {
  expect(dayLabel('2026-08-17', '2026-08-17', LABELS)).toBe('Today')
  expect(dayLabel('2026-08-16', '2026-08-17', LABELS)).toBe('Yesterday')
  // This year loses the year, which is four characters of noise on a diary that
  // mostly looks at the last few weeks.
  expect(dayLabel('2026-07-04', '2026-08-17', LABELS)).toBe('Sat 4 Jul')
  expect(dayLabel('2025-12-31', '2026-08-17', LABELS)).toBe('Wed 31 Dec 2025')
})
