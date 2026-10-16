import { axisTicks } from '@/features/shared/axis'
import { compactVolume, KG_PER_LB, type PeriodTotals, periodsFor } from '../progress'

const month = (week: string, workouts = 0): PeriodTotals => ({
  week,
  workouts,
  durationS: workouts * 3600,
  volumeKg: workouts * 1000,
  sets: workouts * 15,
})

/** `count` months ending in October 2026, every one empty unless `trained` names it. */
function months(count: number, trained: Record<string, number> = {}): PeriodTotals[] {
  const out: PeriodTotals[] = []
  for (let back = count - 1; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(2026, 9 - back, 1))
    const key = date.toISOString().slice(0, 10)
    out.push(month(key, trained[key] ?? 0))
  }
  return out
}

describe('periodsFor', () => {
  it('draws three months as the weeks it is given', () => {
    const weeks = months(13)
    expect(periodsFor('3m', weeks)).toEqual({ rows: weeks, bucket: 'week' })
  })

  it('draws a year as the last twelve months', () => {
    const { rows, bucket } = periodsFor('1y', months(30))
    expect(bucket).toBe('month')
    expect(rows).toHaveLength(12)
    expect(rows[11].week).toBe('2026-10-01')
  })

  it('starts all time at the first month with a workout', () => {
    const { rows, bucket } = periodsFor('all', months(20, { '2025-06-01': 2 }))
    expect(bucket).toBe('month')
    expect(rows[0].week).toBe('2025-06-01')
    expect(rows).toHaveLength(17)
  })

  it('never draws all time as fewer than twelve months', () => {
    const { rows } = periodsFor('all', months(12, { '2026-09-01': 1 }))
    expect(rows).toHaveLength(12)
  })

  it('draws all time in years past two years of months', () => {
    const { rows, bucket } = periodsFor(
      'all',
      months(40, { '2023-07-01': 2, '2023-12-01': 1, '2026-10-01': 3 }),
    )
    expect(bucket).toBe('year')
    expect(rows.map((row) => row.week)).toEqual([
      '2023-01-01',
      '2024-01-01',
      '2025-01-01',
      '2026-01-01',
    ])
    expect(rows[0]).toEqual({
      week: '2023-01-01',
      workouts: 3,
      durationS: 3 * 3600,
      volumeKg: 3000,
      sets: 45,
    })
    expect(rows[3].workouts).toBe(3)
  })
})

describe('axisTicks', () => {
  it('rules a handful of workouts in whole ones', () => {
    expect(axisTicks(3)).toEqual([0, 1, 2, 3])
    expect(axisTicks(1)).toEqual([0, 1])
    expect(axisTicks(7)).toEqual([0, 5, 10])
  })

  it('reaches just past the tallest bar in round steps', () => {
    expect(axisTicks(12_400)).toEqual([0, 5000, 10_000, 15_000])
    expect(axisTicks(260)).toEqual([0, 100, 200, 300])
  })

  it('steps in the unit given, so minutes and pounds come out round', () => {
    // 95 minutes in seconds: steps of 50 minutes.
    expect(axisTicks(95 * 60, 60)).toEqual([0, 3000, 6000])
    const pounds = axisTicks(2000 * KG_PER_LB, KG_PER_LB).map((kg) => Math.round(kg / KG_PER_LB))
    expect(pounds).toEqual([0, 1000, 2000])
  })

  it('draws no scale for nothing', () => {
    expect(axisTicks(0)).toEqual([])
  })
})

describe('compactVolume', () => {
  it('shortens thousands for the scale gutter', () => {
    expect(compactVolume(850, 'kg')).toBe('850')
    expect(compactVolume(2500, 'kg')).toBe('2.5k')
    expect(compactVolume(15_000, 'kg')).toBe('15k')
  })

  it('in the user’s unit', () => {
    expect(compactVolume(1000 * KG_PER_LB, 'lb')).toBe('1k')
  })
})
