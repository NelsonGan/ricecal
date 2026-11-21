import { inPeriod, isCurrentPeriod, periodRange, shiftPeriod } from '../lib/mapPeriod'

/** The food map's periods: Monday to Sunday weeks, calendar months, and everything. */

describe('map periods', () => {
  it('runs a week Monday to Sunday, like the strip on Today', () => {
    expect(periodRange({ kind: 'week', anchor: '2026-11-21' })).toEqual({
      from: '2026-11-16',
      to: '2026-11-22',
    })
  })

  it('runs a month from its first day to its last', () => {
    expect(periodRange({ kind: 'month', anchor: '2026-02-14' })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
  })

  it('puts an entry in a period by the day it counts towards', () => {
    const november = { kind: 'month', anchor: '2026-11-21' } as const
    expect(inPeriod('2026-11-01', november)).toBe(true)
    expect(inPeriod('2026-10-31', november)).toBe(false)
    expect(inPeriod('1999-01-01', { kind: 'all', anchor: '2026-11-21' })).toBe(true)
  })

  it('steps a period back and forward, and knows the one holding today', () => {
    const week = { kind: 'week', anchor: '2026-11-21' } as const
    expect(shiftPeriod(week, -1).anchor).toBe('2026-11-14')
    expect(shiftPeriod({ kind: 'month', anchor: '2026-01-31' }, 1).anchor).toBe('2026-02-28')
    expect(shiftPeriod({ kind: 'all', anchor: '2026-11-21' }, -1).anchor).toBe('2026-11-21')
    expect(isCurrentPeriod(week, '2026-11-22')).toBe(true)
    expect(isCurrentPeriod(shiftPeriod(week, -1), '2026-11-22')).toBe(false)
  })
})
