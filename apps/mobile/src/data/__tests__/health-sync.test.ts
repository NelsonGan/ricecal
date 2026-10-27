import { dayBatches, healthSyncChunks, sessionBatches } from '@/data/health-sync'
import type { ActivityDayReading, WorkoutReading } from '@/lib/health'

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

describe('hourly retention during backfill', () => {
  it('keeps recent foreground reads unchanged', () => {
    expect(healthSyncChunks('2026-09-26', '2026-10-03', '2026-09-03')).toEqual([
      { from: '2026-09-26', to: '2026-10-03', withHours: true },
    ])
  })

  it('splits at the cutoff without losing a day of totals, workouts or weigh-ins', () => {
    expect(healthSyncChunks('2026-08-01', '2026-10-03', '2026-09-03')).toEqual([
      { from: '2026-08-01', to: '2026-08-30', withHours: false },
      { from: '2026-08-31', to: '2026-09-02', withHours: false },
      { from: '2026-09-03', to: '2026-10-02', withHours: true },
      { from: '2026-10-03', to: '2026-10-03', withHours: true },
    ])
  })

  it('does not read any hours for entirely historical ranges', () => {
    expect(healthSyncChunks('2026-01-01', '2026-01-31', '2026-09-03')).toEqual([
      { from: '2026-01-01', to: '2026-01-30', withHours: false },
      { from: '2026-01-31', to: '2026-01-31', withHours: false },
    ])
  })

  it('includes the cutoff day and uses calendar days across a daylight-saving change', () => {
    expect(healthSyncChunks('2026-03-01', '2026-03-31', '2026-03-08')).toEqual([
      { from: '2026-03-01', to: '2026-03-07', withHours: false },
      { from: '2026-03-08', to: '2026-03-31', withHours: true },
    ])
  })
})

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

/**
 * What the database refuses. Every reading goes out in one upsert, so a single
 * value outside a column's check fails the whole request, and the sync stops
 * there: one impossible day kept a Health Connect account from saving any day
 * at all for three weeks, and one workout longer than a day kept an iPhone from
 * saving any workout, hourly shape or weigh-in after it.
 */
describe('values the table would refuse', () => {
  const day = (over: Partial<ActivityDayReading> = {}): ActivityDayReading => ({
    date: '2026-10-26',
    activeKcal: 480,
    restingKcal: 1600,
    steps: 9000,
    distanceM: 6500,
    exerciseMinutes: 35,
    standHours: 10,
    flights: 4,
    moveGoalKcal: 500,
    exerciseGoalMin: 30,
    standGoalHr: 12,
    ...over,
  })

  /**
   * Left out rather than written as null, by the same rule as a heart rate that
   * could not be read: the upsert never names the column, so a figure stored by
   * an earlier good read stays.
   */
  it('leaves out an impossible figure and keeps the rest of the day', () => {
    const batches = dayBatches('user-1', 'health_connect', [
      day({ activeKcal: 48_000, restingKcal: -3, flights: 9000 }),
      day({ date: '2026-10-25' }),
      day({ date: '2026-10-24', activeKcal: Number.NaN, restingKcal: 1500, flights: 3000 }),
    ])

    const rows = batches.flat()
    const bad = rows.find((row) => row.log_date === '2026-10-26')
    const good = rows.find((row) => row.log_date === '2026-10-25')
    expect(bad).not.toHaveProperty('active_kcal')
    expect(bad).not.toHaveProperty('resting_kcal')
    expect(bad).not.toHaveProperty('flights')
    expect(bad?.steps).toBe(9000)
    expect(bad?.distance_m).toBe(6500)
    expect(good?.active_kcal).toBe(480)
    expect(rows.find((row) => row.log_date === '2026-10-24')).not.toHaveProperty('active_kcal')
    // Three days missing different columns go out as three requests, each of
    // which agrees about its columns.
    expect(batches).toHaveLength(3)
    for (const batch of batches) {
      expect(new Set(batch.map((row) => Object.keys(row).join(','))).size).toBe(1)
    }
  })

  it('still writes a figure that was not read as null', () => {
    const [[row]] = dayBatches('user-1', 'health_connect', [day({ standHours: null })])

    expect(row).toHaveProperty('stand_hours', null)
  })

  it('leaves out a day whose step count cannot be true', () => {
    const rows = dayBatches('user-1', 'health_connect', [
      day({ steps: 250_000 }),
      day({ date: '2026-10-25' }),
    ]).flat()

    expect(rows.map((row) => row.log_date)).toEqual(['2026-10-25'])
  })

  it('leaves out a workout longer than a day and keeps the others', () => {
    const rows = sessionBatches('user-1', 'apple_health', [
      workout({ externalId: 'forgotten', durationS: 3 * 86_400 }),
      workout({ externalId: 'run' }),
    ]).flat()

    expect(rows.map((row) => row.external_id)).toEqual(['run'])
  })

  it('leaves out a workout whose energy cannot be true', () => {
    const rows = sessionBatches('user-1', 'apple_health', [
      workout({ externalId: 'a', activeKcal: 25_000 }),
      workout({ externalId: 'b', activeKcal: Number.NaN }),
      workout({ externalId: 'c' }),
    ]).flat()

    expect(rows.map((row) => row.external_id)).toEqual(['c'])
  })

  it('leaves out an impossible distance, climb or pulse', () => {
    const row = only([workout({ distanceM: 5_000_000, elevationM: -900, maxHr: 300 })])

    expect(row).not.toHaveProperty('distance_m')
    expect(row).not.toHaveProperty('elevation_m')
    expect(row).not.toHaveProperty('avg_hr')
    expect(row).not.toHaveProperty('max_hr')
    expect(row.active_kcal).toBe(720)
  })

  it('shortens a label longer than the column holds', () => {
    const row = only([workout({ kindLabel: 'x'.repeat(200), sourceName: 'y'.repeat(130) })])

    expect(row.kind_label).toHaveLength(120)
    expect(row.source_name).toHaveLength(120)
  })

  it('never cuts a label through the middle of an emoji', () => {
    const row = only([workout({ kindLabel: `${'x'.repeat(119)}🏸 badminton` })])

    expect(row.kind_label).toBe(`${'x'.repeat(119)}🏸`)
    expect(JSON.stringify(row.kind_label)).not.toMatch(/\\ud83c/)
  })
})
