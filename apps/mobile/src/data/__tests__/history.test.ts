import { mealPage, waterPage, weightPage } from '../history'
import type { Entry } from '../types'

/**
 * History: the entries behind the Trends charts, a page at a time.
 *
 * Each way this goes wrong reads as data rather than as an error. A meal page
 * cut halfway through a day prints that day's total short, a weight page that
 * forgets its extra row calls its last reading the first ever, and a water day
 * judged against today's goal turns last month's good days into short ones.
 */

const meal = (id: string, logDate: string, kcal = 500): Entry => ({
  id,
  quantity: 1,
  loggedAt: `${logDate}T08:00:00.000Z`,
  logDate,
  source: 'search',
  foodName: id,
  place: 'hawker',
  servingLabel: '1 plate',
  servingFactor: 1,
  macros: { kcal, carbs: 60, protein: 20, fat: 20 },
  base: { kcal, carbs: 60, protein: 20, fat: 20 },
})

describe('mealPage', () => {
  it('groups meals into days and totals each one', () => {
    const page = mealPage([
      meal('a', '2026-10-13', 600),
      meal('b', '2026-10-13', 120),
      meal('c', '2026-10-12', 700),
    ])
    expect(page.items.map((day) => [day.date, day.kcal, day.entries.length])).toEqual([
      ['2026-10-13', 720, 2],
      ['2026-10-12', 700, 1],
    ])
    expect(page.next).toBeNull()
  })

  it('drops the oldest day of a full page and starts the next page on it', () => {
    // The fourth row is the start of the 11th, and the rest of the 11th is
    // past the limit. Showing it would total the 11th from one meal.
    const page = mealPage(
      [
        meal('a', '2026-10-13'),
        meal('b', '2026-10-12'),
        meal('c', '2026-10-12'),
        meal('d', '2026-10-11'),
      ],
      4,
    )
    expect(page.items.map((day) => day.date)).toEqual(['2026-10-13', '2026-10-12'])
    expect(page.next).toBe('2026-10-11')
  })

  it('keeps a single day that fills a page, and moves on past it', () => {
    // Asking for the same day again would return the same page forever.
    const page = mealPage([meal('a', '2026-10-13'), meal('b', '2026-10-13')], 2)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.entries).toHaveLength(2)
    expect(page.next).toBe('2026-10-12')
  })

  it('has no next page when the diary is empty', () => {
    expect(mealPage([])).toEqual({ items: [], next: null })
  })
})

describe('waterPage', () => {
  const goals = [
    { effective_from: '2026-10-10', water_ml: 2500 },
    { effective_from: '2026-09-01', water_ml: 2000 },
  ]

  it('judges each day against the goal in force that day', () => {
    const page = waterPage(
      [
        { log_date: '2026-10-12', water_ml: 2200 },
        { log_date: '2026-10-09', water_ml: 2200 },
      ],
      goals,
    )
    expect(page.items.map((day) => day.goal)).toEqual([2500, 2000])
  })

  it('falls back to the default goal before the first one was set', () => {
    const page = waterPage([{ log_date: '2026-08-01', water_ml: 900 }], goals)
    expect(page.items[0]?.goal).toBe(2000)
  })

  it('drops a month a full page only reached partway into', () => {
    // September's average would otherwise be taken over the two days that
    // happened to fit, and printed beside the month as if it were all of it.
    const page = waterPage(
      [
        { log_date: '2026-10-02', water_ml: 1000 },
        { log_date: '2026-10-01', water_ml: 1000 },
        { log_date: '2026-09-30', water_ml: 3000 },
      ],
      goals,
      3,
    )
    expect(page.items.map((day) => day.date)).toEqual(['2026-10-02', '2026-10-01'])
    expect(page.next).toBe('2026-09-30')
  })

  it('pages from the day before a page that is all one month', () => {
    const page = waterPage(
      [
        { log_date: '2026-10-12', water_ml: 1000 },
        { log_date: '2026-10-01', water_ml: 1000 },
      ],
      goals,
      2,
    )
    expect(page.next).toBe('2026-09-30')
  })
})

describe('weightPage', () => {
  const reading = (date: string, kg: number) => ({ date, kg, provider: null })

  it('gives the last reading on a page its change from the extra row', () => {
    const page = weightPage(
      [reading('2026-10-13', 74.3), reading('2026-10-11', 74.6), reading('2026-10-09', 74.8)],
      2,
    )
    expect(page.items).toHaveLength(2)
    expect(page.items[1]?.change).toBeCloseTo(-0.2)
    // The extra row is shown on the next page rather than skipped.
    expect(page.next).toBe('2026-10-09')
  })

  it('drops a month a full page only reached partway into, keeping every change', () => {
    const page = weightPage(
      [reading('2026-10-03', 74.0), reading('2026-10-01', 74.4), reading('2026-09-29', 74.6)],
      2,
    )
    expect(page.items.map((item) => item.date)).toEqual(['2026-10-03', '2026-10-01'])
    expect(page.items[1]?.change).toBeCloseTo(-0.2)
    expect(page.next).toBe('2026-09-29')
  })

  it('calls only the oldest reading on the account the first', () => {
    const page = weightPage([reading('2026-10-13', 74.3), reading('2026-10-11', 74.6)])
    expect(page.items.map((item) => item.change)).toEqual([expect.closeTo(-0.3), null])
    expect(page.next).toBeNull()
  })
})
