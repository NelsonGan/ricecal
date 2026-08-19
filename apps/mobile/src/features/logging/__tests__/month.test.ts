import { dayInMonth, MONTHS_BACK, monthEnd, monthStart, monthWeeks, stepMonth } from '../month'

/**
 * The month grid on Today.
 *
 * The arithmetic here is all edges: a month that starts on a Sunday, one that
 * ends on a Sunday, February, the 31st of a month that has thirty days, and the
 * two ends of what the calendar reaches. Each of those is a grid drawn wrong in
 * a way that is obvious on screen and invisible in a diff.
 */

const TODAY = '2026-08-19'

it('bounds a month', () => {
  expect(monthStart('2026-08-19')).toBe('2026-08-01')
  expect(monthEnd('2026-08-01')).toBe('2026-08-31')
  // The one month whose length is not a constant.
  expect(monthEnd('2028-02-01')).toBe('2028-02-29')
})

it('lays a month out under M T W T F S S', () => {
  // August 2026 begins on a Saturday, so five slots pass before the 1st.
  const weeks = monthWeeks('2026-08-01')
  expect(weeks[0]).toEqual([null, null, null, null, null, '2026-08-01', '2026-08-02'])
  expect(weeks[1][0]).toBe('2026-08-03')
})

it('pads the last row so its days are the width of every other day', () => {
  for (const start of ['2026-08-01', '2026-02-01', '2026-11-01']) {
    for (const week of monthWeeks(start)) expect(week).toHaveLength(7)
  }
})

it('adds no empty week to a month that fills its own', () => {
  // February 2027 starts on a Monday and has 28 days: exactly four rows.
  expect(monthWeeks('2027-02-01')).toHaveLength(4)
})

it('will not page past today', () => {
  expect(stepMonth('2026-08-01', 1, TODAY)).toBeNull()
  expect(stepMonth('2026-07-01', 1, TODAY)).toBe('2026-08-01')
})

it('will not page back further than the calendar reaches', () => {
  const oldest = stepMonth('2025-09-01', -1, TODAY)
  expect(oldest).toBe('2025-08-01')
  expect(stepMonth(oldest as string, -1, TODAY)).toBeNull()
  // Which is a year, spelled the way the constant spells it.
  expect(MONTHS_BACK).toBe(12)
})

it('keeps the day of the month when the month changes', () => {
  expect(dayInMonth('2026-07-01', '2026-08-19', TODAY)).toBe('2026-07-19')
})

it('clamps to the month it lands in, and never to a day still ahead', () => {
  // The 31st does not exist in June.
  expect(dayInMonth('2026-06-01', '2026-05-31', TODAY)).toBe('2026-06-30')
  // And stepping forward into this month lands on today rather than past it.
  expect(dayInMonth('2026-08-01', '2026-07-28', TODAY)).toBe(TODAY)
})
