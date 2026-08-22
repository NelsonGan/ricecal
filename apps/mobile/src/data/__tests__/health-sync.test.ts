import { sessionBatches } from '@/data/health-sync'
import type { WorkoutReading } from '@/lib/health'

/**
 * What the sync is allowed to write over.
 *
 * The rolling window re-reads the same seven days on every foreground, so every
 * column in a session row is rewritten several times a week. A provider that
 * stops being able to answer therefore does not merely fail: it erases. That is
 * not hypothetical, and it is the whole reason these rows are assembled by a
 * function with a test rather than inline at the call site.
 */

const workout = (over: Partial<WorkoutReading> = {}): WorkoutReading => ({
  externalId: 'workout-1',
  date: '2026-08-22',
  kind: 'basketball',
  kindLabel: null,
  startedAt: '2026-08-22T09:52:49+08:00',
  endedAt: '2026-08-22T11:51:47+08:00',
  durationS: 7138,
  activeKcal: 720,
  distanceM: 2607,
  avgHr: 141,
  maxHr: 183,
  elevationM: null,
  hrZones: { easy: 600, steady: 2400, hard: 3200, peak: 900 },
  sourceName: 'Fitness',
  ...over,
})

const only = (workouts: WorkoutReading[]) => {
  const batches = sessionBatches('user-1', 'apple_health', workouts)
  expect(batches).toHaveLength(1)
  return batches[0][0]
}

describe('assembling session rows', () => {
  it('writes the heart rate it read', () => {
    const row = only([workout()])

    expect(row.avg_hr).toBe(141)
    expect(row.max_hr).toBe(183)
    expect(row.hr_zones).toEqual({ easy: 600, steady: 2400, hard: 3200, peak: 900 })
  })

  /**
   * THE property. A session whose pulse could not be read carries no heart
   * columns at all, so the upsert never names them and Postgres leaves the last
   * good reading where it is.
   *
   * A null in any of the three would have been written, which is what happened:
   * one release that could not associate heart-rate samples with a workout took
   * a fortnight of averages and zone charts out of the database, a day at a
   * time, while every other figure on the screen stayed correct.
   */
  it('leaves the heart columns out when there was no reading', () => {
    const row = only([workout({ avgHr: null, maxHr: null, hrZones: null })])

    expect(row).not.toHaveProperty('avg_hr')
    expect(row).not.toHaveProperty('max_hr')
    expect(row).not.toHaveProperty('hr_zones')
    // Everything else is still written, because everything else was still read.
    expect(row.active_kcal).toBe(720)
    expect(row.distance_m).toBe(2607)
  })

  /**
   * The bands are their own question. A writer that sends one average per
   * session has a real average and nothing to divide into four, and the screen
   * has copy for exactly that state.
   */
  it('keeps an average that came without bands, without clearing the bands', () => {
    const row = only([workout({ hrZones: null })])

    expect(row.avg_hr).toBe(141)
    expect(row).not.toHaveProperty('hr_zones')
  })

  /**
   * PostgREST builds its column list from the payload and rejects a batch whose
   * objects disagree about their keys, so a mixed window has to go out as more
   * than one request. Uniformity inside each batch is the thing that makes the
   * omission above safe to do at all.
   */
  it('splits a mixed window into batches that each agree about their columns', () => {
    const batches = sessionBatches('user-1', 'apple_health', [
      workout({ externalId: 'a' }),
      workout({ externalId: 'b', avgHr: null, maxHr: null, hrZones: null }),
      workout({ externalId: 'c' }),
    ])

    expect(batches).toHaveLength(2)
    for (const batch of batches) {
      const shapes = new Set(batch.map((row) => Object.keys(row).sort().join(',')))
      expect(shapes.size).toBe(1)
    }
    // And nothing is dropped on the way.
    expect(
      batches
        .flat()
        .map((row) => row.external_id)
        .sort(),
    ).toEqual(['a', 'b', 'c'])
  })

  it('has nothing to send for a window with no workouts in it', () => {
    expect(sessionBatches('user-1', 'apple_health', [])).toEqual([])
  })
})
