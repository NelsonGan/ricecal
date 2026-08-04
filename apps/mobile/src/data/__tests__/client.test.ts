import { QueryClient } from '@tanstack/react-query'

import { datesBetween, seedMissing } from '../client'

/**
 * The two pieces the week warm-up is built out of.
 *
 * Both fail quietly if they are wrong. A `datesBetween` that drops a day leaves
 * that day unwarmed, which shows up as one cell in seven still flashing a
 * placeholder — indistinguishable from a slow request. And a `seedMissing` that
 * overwrote rather than filled in would land on a glass of water the user had
 * just tapped, undoing the optimistic update under their finger, at whatever
 * moment the range request happened to come back.
 */

describe('datesBetween', () => {
  it('includes both ends', () => {
    expect(datesBetween('2026-03-02', '2026-03-08')).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ])
  })

  it('is a single day when both ends are the same', () => {
    expect(datesBetween('2026-03-02', '2026-03-02')).toEqual(['2026-03-02'])
  })

  /**
   * The week strip clamps its range at today, so the page holding today hands
   * over a `to` earlier than its own Sunday — and a page entirely in the future
   * would hand over one earlier than its Monday. That has to be no days rather
   * than a thrown range.
   */
  it('is empty when the range runs backwards', () => {
    expect(datesBetween('2026-03-08', '2026-03-02')).toEqual([])
  })

  /** Local dates, not UTC: `toISOString` moves the day east of Greenwich. */
  it('crosses a month boundary without losing a day', () => {
    expect(datesBetween('2026-02-27', '2026-03-01')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
    ])
  })
})

describe('seedMissing', () => {
  it('fills in a key that holds nothing', () => {
    const client = new QueryClient()
    seedMissing(client, [[['day', 'u1', '2026-03-02'], { kcal: 400 }]])

    expect(client.getQueryData(['day', 'u1', '2026-03-02'])).toEqual({ kcal: 400 })
  })

  it('leaves a key that already holds something', () => {
    const client = new QueryClient()
    client.setQueryData(['day', 'u1', '2026-03-02'], { kcal: 900 })

    seedMissing(client, [[['day', 'u1', '2026-03-02'], { kcal: 400 }]])

    expect(client.getQueryData(['day', 'u1', '2026-03-02'])).toEqual({ kcal: 900 })
  })

  /**
   * `null` is a real answer for a day with no movement on it, and it has to be
   * written rather than skipped — otherwise every such day stays "not fetched"
   * and the warm-up does nothing for exactly the days it is cheapest on.
   */
  it('seeds null, and then treats that day as known', () => {
    const client = new QueryClient()
    const key = ['activity', 'u1', 'day', '2026-03-02']

    seedMissing(client, [[key, null]])
    expect(client.getQueryData(key)).toBeNull()

    seedMissing(client, [[key, { activeKcal: 300 }]])
    expect(client.getQueryData(key)).toBeNull()
  })
})
