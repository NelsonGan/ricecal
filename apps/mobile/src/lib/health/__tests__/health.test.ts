import { demoHealth } from '../demo'
import { estimatedMaxHr, hrZonesFromSamples } from '../hrZones'
import { asWorkoutKind, fromAppleWorkoutType, fromConnectExerciseType } from '../kinds'

/**
 * The arithmetic behind movement, tested where it is pure.
 *
 * Everything here is a function of its arguments — no store, no network, no
 * clock — which is exactly the part that a simulator cannot prove and a
 * screenshot cannot either.
 */

describe('the demo provider', () => {
  /**
   * THE property the sync design rests on.
   *
   * The incremental pass re-reads a rolling window on every foreground and
   * upserts it. If reading the same day twice produced different numbers, every
   * chart would twitch and "syncing twice changes nothing" — the thing the
   * demo provider exists to let anyone verify — would be the one thing it
   * visibly failed to do.
   */
  it('returns identical data when the same range is read twice', async () => {
    const first = await demoHealth.read('2026-03-01', '2026-03-07', { withHours: true, age: null })
    const second = await demoHealth.read('2026-03-01', '2026-03-07', { withHours: true, age: null })

    expect(second).toEqual(first)
  })

  /**
   * The same day read inside a WIDER window must be the same day.
   *
   * This is the case a naive generator gets wrong: seeding from an index into
   * the range rather than from the date makes every day shift when the window
   * moves, and the backfill and the incremental pass then disagree about
   * yesterday. The two are chunked differently, so they really do read the same
   * date through different ranges.
   */
  it('generates a day from its date, not from its position in the range', async () => {
    const narrow = await demoHealth.read('2026-03-05', '2026-03-05', {
      withHours: false,
      age: null,
    })
    const wide = await demoHealth.read('2026-02-01', '2026-03-20', { withHours: false, age: null })

    const fromWide = wide.days.find((day) => day.date === '2026-03-05')
    expect(narrow.days).toHaveLength(1)
    expect(fromWide).toEqual(narrow.days[0])
  })

  /** Workout ids are what the upsert deduplicates on, so they must be stable too. */
  it('gives a workout the same external id however it was read', async () => {
    const narrow = await demoHealth.read('2026-03-05', '2026-03-05', {
      withHours: false,
      age: null,
    })
    const wide = await demoHealth.read('2026-02-01', '2026-03-20', { withHours: false, age: null })

    const ids = (workouts: { externalId: string; date: string }[]) =>
      workouts.filter((w) => w.date === '2026-03-05').map((w) => w.externalId)

    expect(ids(wide.workouts)).toEqual(ids(narrow.workouts))
  })

  it('never reports walking energy the day total cannot account for', async () => {
    const { days, workouts } = await demoHealth.read('2026-01-01', '2026-03-31', {
      withHours: false,
      age: null,
    })

    for (const day of days) {
      const sessionKcal = workouts
        .filter((workout) => workout.date === day.date)
        .reduce((sum, workout) => sum + workout.activeKcal, 0)

      // `activity_summary` derives walking as active minus sessions and clamps
      // it at zero. The clamp is a guard against providers that disagree with
      // themselves; generated data has no excuse to need it.
      expect(day.activeKcal).toBeGreaterThanOrEqual(sessionKcal)
    }
  })

  it('keeps every generated figure inside the column checks the schema declares', async () => {
    const { days, hours } = await demoHealth.read('2026-01-01', '2026-01-31', {
      withHours: true,
      age: null,
    })

    for (const day of days) {
      expect(day.activeKcal).toBeGreaterThanOrEqual(0)
      expect(day.activeKcal).toBeLessThanOrEqual(20000)
      expect(day.steps).toBeGreaterThanOrEqual(0)
      expect(day.steps).toBeLessThanOrEqual(200000)
      // `stand_hours smallint check (stand_hours between 0 and 24)`
      expect(day.standHours).not.toBeNull()
      expect(day.standHours as number).toBeGreaterThanOrEqual(0)
      expect(day.standHours as number).toBeLessThanOrEqual(24)
      expect(day.exerciseMinutes as number).toBeLessThanOrEqual(1440)
    }

    for (const hour of hours) {
      expect(hour.hour).toBeGreaterThanOrEqual(0)
      expect(hour.hour).toBeLessThanOrEqual(23)
    }
  })
})

describe('heart rate zones', () => {
  const samples = (bpm: number[], stepMs = 30_000) =>
    bpm.map((value, index) => ({ bpm: value, at: index * stepMs }))

  /**
   * A session with a handful of readings has no shape to band. Strava writing
   * one average per session is the real case, and drawing four bars off it
   * would be inventing a workout's texture.
   */
  it('declines to band a session with too few readings', () => {
    expect(hrZonesFromSamples(samples([120, 130, 140]))).toBeNull()
  })

  it('bands by share of an age-estimated maximum', () => {
    // Tanaka at 40: 208 - 0.7*40 = 180. Easy < 108, steady < 126, hard < 153.
    const zones = hrZonesFromSamples(samples(Array(20).fill(100)), 40)
    expect(zones).not.toBeNull()
    expect(zones?.steady).toBe(0)
    expect(zones?.hard).toBe(0)
    expect(zones?.peak).toBe(0)
    expect(zones?.easy).toBeGreaterThan(0)
  })

  it('puts a hard effort in the hard band rather than the easy one', () => {
    const zones = hrZonesFromSamples(samples(Array(20).fill(140)), 40)
    expect(zones?.hard).toBeGreaterThan(0)
    expect(zones?.easy).toBe(0)
  })

  /**
   * The bands move with the user, which is the whole reason `read` carries an
   * age at all.
   *
   * Nothing passed one for a long time — `hrZonesFromSamples(beats)` in both
   * providers, with only these tests ever supplying the argument — so every
   * session on every account was banded against a 40-year-old. 156 bpm is 83% of
   * a 29-year-old's estimated maximum (188) and 87% of a 40-year-old's (180),
   * and the Hard / Peak boundary sits at 85%: the same run came back "mostly
   * Peak" for a user who was working hard, but not that hard.
   */
  it('bands the same session differently for different ages', () => {
    const beats = samples(Array(20).fill(156))

    expect(hrZonesFromSamples(beats, 29)?.hard).toBeGreaterThan(0)
    expect(hrZonesFromSamples(beats, 29)?.peak).toBe(0)

    expect(hrZonesFromSamples(beats, 40)?.peak).toBeGreaterThan(0)
    expect(hrZonesFromSamples(beats, 40)?.hard).toBe(0)
  })

  /**
   * A missing birth date is null, NEVER zero.
   *
   * `ageFrom` returns 0 for a profile with no birth date, and 0 through Tanaka
   * is a maximum of 208 — a ceiling nobody reaches, so every band would collapse
   * into Easy and a genuinely hard session would report no effort at all.
   * `health-sync` converts the absent date to null for this reason; this pins
   * the difference the two produce.
   */
  it('treats an unknown age as unknown rather than as zero', () => {
    expect(estimatedMaxHr(null)).toBe(estimatedMaxHr(40))
    expect(estimatedMaxHr(0)).toBe(208)

    const beats = samples(Array(20).fill(160))
    expect(hrZonesFromSamples(beats, null)?.peak).toBeGreaterThan(0)
    // The trap: banded against 208, a 160 bpm effort reads as merely steady.
    expect(hrZonesFromSamples(beats, 0)?.peak).toBe(0)
  })

  /**
   * A watch that stopped recording mid-session must not donate the whole gap to
   * whichever band the last beat happened to be in.
   */
  it('caps the time credited to a single reading', () => {
    const wide = [
      ...Array.from({ length: 10 }, (_, i) => ({ bpm: 100, at: i * 1000 })),
      // An hour later, one more beat.
      { bpm: 100, at: 3_600_000 },
    ]
    const zones = hrZonesFromSamples(wide, 40)
    // Ten seconds of readings plus at most two minutes for the gap and two
    // for the tail — nowhere near the hour the timestamps span.
    expect(zones?.easy).toBeLessThanOrEqual(60 * 5)
  })
})

describe('workout kinds', () => {
  it('falls back to `other` rather than failing on a type nobody has mapped', () => {
    expect(asWorkoutKind('kabaddi')).toBe('other')
    expect(fromAppleWorkoutType(9999)).toBe('other')
    expect(fromConnectExerciseType(9999)).toBe('other')
  })

  /**
   * The two stores number their types differently, and mixing the tables is the
   * bug that turns a badminton game into something else when somebody changes
   * phone. 11 is `crossTraining` on Apple and `BOXING` on Health Connect.
   */
  it('reads the same number differently per provider', () => {
    expect(fromAppleWorkoutType(11)).toBe('hiit')
    expect(fromConnectExerciseType(11)).toBe('martialArts')
    expect(fromAppleWorkoutType(37)).toBe('run')
    expect(fromConnectExerciseType(37)).toBe('hike')
  })

  it('maps badminton on both platforms, because it is the sport here', () => {
    expect(fromAppleWorkoutType(4)).toBe('badminton')
    expect(fromConnectExerciseType(2)).toBe('badminton')
  })
})
