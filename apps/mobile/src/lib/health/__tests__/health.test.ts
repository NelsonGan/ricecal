import type { ConfigContext, ExpoConfig } from 'expo/config'
import { energyFor, informativeHours } from '../androidHealth'
import { preferredOrigin } from '../connectOrigins'
import { ANDROID_HEALTH_PERMISSIONS } from '../connectPermissions'
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
    const first = await demoHealth.read('2026-03-01', '2026-03-07', {
      withHours: true,
      age: null,
      basalKcal: null,
    })
    const second = await demoHealth.read('2026-03-01', '2026-03-07', {
      withHours: true,
      age: null,
      basalKcal: null,
    })

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
      basalKcal: null,
    })
    const wide = await demoHealth.read('2026-02-01', '2026-03-20', {
      withHours: false,
      age: null,
      basalKcal: null,
    })

    const fromWide = wide.days.find((day) => day.date === '2026-03-05')
    expect(narrow.days).toHaveLength(1)
    expect(fromWide).toEqual(narrow.days[0])
  })

  /** Workout ids are what the upsert deduplicates on, so they must be stable too. */
  it('gives a workout the same external id however it was read', async () => {
    const narrow = await demoHealth.read('2026-03-05', '2026-03-05', {
      withHours: false,
      age: null,
      basalKcal: null,
    })
    const wide = await demoHealth.read('2026-02-01', '2026-03-20', {
      withHours: false,
      age: null,
      basalKcal: null,
    })

    const ids = (workouts: { externalId: string; date: string }[]) =>
      workouts.filter((w) => w.date === '2026-03-05').map((w) => w.externalId)

    expect(ids(wide.workouts)).toEqual(ids(narrow.workouts))
  })

  it('never reports walking energy the day total cannot account for', async () => {
    const { days, workouts } = await demoHealth.read('2026-01-01', '2026-03-31', {
      withHours: false,
      age: null,
      basalKcal: null,
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
      basalKcal: null,
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

/**
 * The config as `expo prebuild` resolves it, for one variant.
 *
 * Read through `app.config.ts` rather than off `app.json`, because the variants
 * are between the two and both of them rebuild `android` by spreading it. A
 * future variant that composed that object rather than spreading it would drop
 * the permissions for the build it applies to and no other, which on the
 * `development` profile means every EAS dev build silently back where this
 * started.
 *
 * `APP_VARIANT` is read at module scope, so the module has to be re-evaluated
 * per variant, and the surrounding value is put back — jest workers share a
 * process across files.
 */
function resolveConfig(variant?: string): ExpoConfig {
  const before = process.env.APP_VARIANT

  if (variant === undefined) delete process.env.APP_VARIANT
  else process.env.APP_VARIANT = variant

  try {
    let resolved: ExpoConfig | undefined
    jest.isolateModules(() => {
      const appConfig = require('../../../../app.config').default as (
        context: ConfigContext,
      ) => ExpoConfig

      resolved = appConfig({
        projectRoot: '',
        staticConfigPath: null,
        packageJsonPath: null,
        config: {},
      })
    })
    return resolved as ExpoConfig
  } finally {
    if (before === undefined) delete process.env.APP_VARIANT
    else process.env.APP_VARIANT = before
  }
}

/** Every variant, named as the thing that builds it. */
const VARIANTS: Array<[string, string | undefined]> = [
  ['the store build', undefined],
  ['the EAS development build', 'development'],
  ['a local simulator build', 'simulator'],
]

describe('the Health Connect manifest declaration', () => {
  /**
   * The manifest is the other half of the Android permission request, and
   * nothing at runtime can tell you it is missing.
   *
   * Android grants only what was DECLARED, and an undeclared health permission
   * is not an error anywhere: the record type is left off the permission sheet,
   * `requestPermission` resolves without it, and `requestAccess` reports a
   * refusal the user was never given the chance to make. Android health sync
   * shipped exactly that way — `app.json` declared CAMERA and RECORD_AUDIO and
   * nothing else, `react-native-health-connect`'s config plugin adds only the
   * rationale intent-filter and the `ViewPermissionUsageActivity` alias, and
   * Health Connect listed the phone it was installed on under "No compatible
   * apps installed".
   *
   * It cannot be a derivation. Expo's config loader transpiles `app.config.ts`
   * and then requires its relative imports through plain Node, which will not
   * load a `.ts` module, so the manifest list has to be literal. This is what
   * makes the second copy safe: adding a record type without declaring its
   * permission fails here rather than on a phone.
   */
  it.each(VARIANTS)('declares every record type the provider reads, for %s', (_name, variant) => {
    const permissions = resolveConfig(variant).android?.permissions ?? []

    expect(permissions).toEqual(expect.arrayContaining(ANDROID_HEALTH_PERMISSIONS))
  })

  /**
   * The reverse, so a record type dropped from the read list takes its
   * permission with it. An app that asks for more health data than it reads is
   * one a reviewer rejects and a user is right to distrust.
   */
  it.each(VARIANTS)(
    'declares no health permission the provider does not read, for %s',
    (_name, variant) => {
      const declared = (resolveConfig(variant).android?.permissions ?? []).filter((permission) =>
        permission.startsWith('android.permission.health.'),
      )

      expect(declared.sort()).toEqual([...ANDROID_HEALTH_PERMISSIONS].sort())
    },
  )
})

/**
 * The three decisions that stop Health Connect lying to the diary.
 *
 * All of them are pure functions of an aggregate's shape, which is the only
 * part of this that can be tested off a phone — and it is the part that was
 * wrong. Each case here is a real reading off a real Samsung account, kept as
 * numbers rather than as prose so that a change which reintroduces the bug
 * fails rather than merely reads differently.
 */
describe('choosing whose numbers to read', () => {
  /**
   * The bug this whole mechanism exists for.
   *
   * The account read 4,675 steps against Samsung Health's own 2,808 for the
   * same day, because a second stream had written the same walk and the
   * aggregate returned the sum. An app the user can open beats the phone's own
   * pedometer, so the total becomes one they can check.
   */
  it('prefers an app the user can open over the phone recording itself', () => {
    expect(preferredOrigin(['android', 'com.sec.android.app.shealth'])).toBe(
      'com.sec.android.app.shealth',
    )
  })

  /** The same, for the synthetic package the platform moved to in June 2026. */
  it('treats a bare token as the platform, whatever it is called', () => {
    expect(preferredOrigin(['stepcounter', 'com.garmin.android.apps.connectmobile'])).toBe(
      'com.garmin.android.apps.connectmobile',
    )
  })

  /**
   * Strava is last among real apps on purpose: it writes GPS activities and
   * nothing else, so reading a day's steps from it would report the ride and
   * none of the walking.
   */
  it('does not let an activities-only app answer for the whole day', () => {
    expect(preferredOrigin(['com.strava', 'com.sec.android.app.shealth'])).toBe(
      'com.sec.android.app.shealth',
    )
  })

  /** Ranked last still means chosen when it is the only thing there. */
  it('reads from the only source there is, however it ranks', () => {
    expect(preferredOrigin(['com.strava'])).toBe('com.strava')
    expect(preferredOrigin(['android'])).toBe('android')
  })

  /**
   * STABILITY, which matters more than which of two equals wins. The rolling
   * window re-reads and overwrites the same seven days on every foreground, so
   * a choice that varied with argument order would rewrite a user's step count
   * to a different number every time they opened the app.
   */
  it('makes the same choice however the platform ordered the list', () => {
    const origins = ['com.acme.tracker', 'com.zeta.tracker']

    expect(preferredOrigin(origins)).toBe(preferredOrigin([...origins].reverse()))
  })

  it('has nothing to choose from an empty list', () => {
    expect(preferredOrigin([])).toBeNull()
  })
})

describe('splitting a day of energy', () => {
  /** A store that measures active energy is believed, and resting is the rest. */
  it('takes a measured active figure and derives resting from the total', () => {
    expect(
      energyFor({ active: 400, total: 1900, measuredBasal: undefined, profileBasal: 1500 }),
    ).toEqual({ activeKcal: 400, restingKcal: 1500 })
  })

  /**
   * The Samsung case, and the reason this function exists. Their store writes
   * the day's total and never the active half, so active came back zero every
   * day and the whole burn was filed as resting — 2,524 kcal of "resting" on a
   * day with two hours of badminton in it.
   */
  it('splits a total-only day rather than calling its movement zero', () => {
    expect(
      energyFor({ active: undefined, total: 2524, measuredBasal: 1434, profileBasal: 1600 }),
    ).toEqual({ activeKcal: 1090, restingKcal: 1434 })
  })

  /** The store's own basal beats the profile's formula, being about this body. */
  it('prefers a measured basal to the profile estimate', () => {
    const withMeasured = energyFor({
      active: undefined,
      total: 2000,
      measuredBasal: 1400,
      profileBasal: 1700,
    })

    expect(withMeasured.activeKcal).toBe(600)
  })

  /** A quiet day whose estimate overshoots reports no movement, never negative. */
  it('never reports negative movement when the basal estimate is high', () => {
    expect(
      energyFor({ active: undefined, total: 1434, measuredBasal: undefined, profileBasal: 1600 }),
    ).toEqual({ activeKcal: 0, restingKcal: 1434 })
  })

  /**
   * A total with nothing to split it by is NOT an active figure. Passing it
   * through would credit the user their whole basal metabolism as exercise, on
   * top of a goal that already contains it.
   */
  it('declines to answer when there is nothing to split a total by', () => {
    expect(
      energyFor({ active: undefined, total: 1900, measuredBasal: undefined, profileBasal: null }),
    ).toEqual({ activeKcal: null, restingKcal: null })
  })

  /**
   * The empty-store case, with the figure a real device actually returned.
   *
   * Probed on a Pixel API 36 emulator whose Health Connect held nothing at all,
   * `BasalMetabolicRate` still answered 1,564.5 kcal — derived rather than
   * measured, and marked as such only by an empty `dataOrigins`. `hasOrigins`
   * is what keeps it out of `measuredBasal`; this asserts what happens if it
   * ever gets through, which is that the day is priced off a number nobody
   * recorded.
   */
  it('would price a day off a derived basal, which is why hasOrigins drops it first', () => {
    const leaked = energyFor({
      active: undefined,
      total: undefined,
      measuredBasal: 1564.5,
      profileBasal: null,
    })

    // No total to split, so nothing is credited as movement either way — but
    // the phantom figure reaches `resting_kcal`, which is the leak.
    expect(leaked).toEqual({ activeKcal: null, restingKcal: 1565 })
  })

  /** And a day nothing wrote at all is unknown rather than a day of rest. */
  it('reports nothing rather than zero when no energy was written', () => {
    expect(
      energyFor({
        active: undefined,
        total: undefined,
        measuredBasal: undefined,
        profileBasal: 1500,
      }),
    ).toEqual({ activeKcal: null, restingKcal: null })
  })
})

describe('whether an hourly chart says anything', () => {
  const day = (steps: number[]) =>
    steps.map((count, hour) => ({
      date: '2026-08-17',
      hour,
      steps: count,
      activeKcal: 0,
      distanceM: null,
    }))

  /**
   * Samsung Health writes ONE record for the whole day. Health Connect divides
   * a record across every bucket it overlaps, so that record arrives as 24
   * identical hours — 2,808 steps became 117 an hour, all night included, and
   * the chart claimed a walk at 3am every morning.
   */
  it('drops a day that is one record divided by twenty-four', () => {
    expect(informativeHours(day(Array(24).fill(117)))).toBe(false)
  })

  /** Integer division leaves a remainder in some buckets. Still no shape. */
  it('drops it despite the rounding remainder', () => {
    expect(informativeHours(day([...Array(20).fill(117), 118, 118, 118, 118]))).toBe(false)
  })

  /** A day somebody actually walked keeps every hour of it. */
  it('keeps a day with a shape', () => {
    expect(informativeHours(day([...Array(20).fill(117), 600, 480, 220, 118]))).toBe(true)
  })

  /**
   * A handful of flat hours is a real reading, not an apportioned one: a
   * record spanning the day would have landed in all of them. Three hours of
   * 30 steps is somebody who took 30 steps three times.
   */
  it('keeps a sparse day even when its hours are equal', () => {
    expect(informativeHours(day([30, 30, 30]))).toBe(true)
  })
})
