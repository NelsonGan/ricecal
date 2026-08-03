import { eachDay } from './apple'
import type {
  AccessResult,
  ActivityDayReading,
  Availability,
  HealthProvider,
  HealthReading,
  HourReading,
  LocalDate,
  WorkoutReading,
} from './types'

/**
 * A health store that is not one: plausible movement, generated on the device.
 *
 * WHY THIS EXISTS AND IS NOT A TEST FIXTURE
 *
 * The iOS Simulator has no Health app and `HKHealthStore.isHealthDataAvailable()`
 * returns false there, so the entire Activity feature — six screens, a budget
 * that moves, three charts — is unreachable on the only device most of this was
 * built on. A demo provider is the difference between a feature that can be
 * looked at and one that can only be described.
 *
 * It is a `health_provider` enum value rather than a flag for a reason worth
 * keeping: a demo row is found, counted and deleted by exactly the same queries
 * as a real one, so disconnecting works, the charts work, and nothing
 * downstream has a branch in it. The one thing that differs is a badge on the
 * Activity screen saying the numbers are made up.
 *
 * WHY IT IS DETERMINISTIC
 *
 * The sync re-reads a rolling window on every foreground. A generator using
 * `Math.random()` would rewrite Tuesday's steps every thirty seconds, the
 * charts would twitch, and the one property this feature has to demonstrate —
 * that syncing twice changes nothing — would be the one it visibly lacked.
 * Everything below is a pure function of the date, so re-reading a day returns
 * the day.
 */

/**
 * A small integer hash of a string, uniformly-ish spread.
 *
 * FNV-1a. Chosen because it is eight lines and has no state; the quality bar is
 * "two consecutive dates do not look related", not cryptography.
 */
function hash(seed: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    value ^= seed.charCodeAt(i)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value
}

/** A stable pseudo-random in [0, 1) for a (date, channel) pair. */
const roll = (date: LocalDate, channel: string): number => hash(`${date}:${channel}`) / 0x100000000

/** `min`..`max` inclusive, stable for the pair. */
const pick = (date: LocalDate, channel: string, min: number, max: number): number =>
  min + Math.floor(roll(date, channel) * (max - min + 1))

const isWeekend = (date: LocalDate): boolean => {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  return day === 0 || day === 6
}

/**
 * The generated shape of a week.
 *
 * Weekends drop by roughly half, which is the observation the steps screen's
 * footnote makes — and the footnote had to be true of the demo data or the
 * screen would read as a lie on the one device it can be seen on.
 */
function stepsFor(date: LocalDate): number {
  const base = isWeekend(date)
    ? pick(date, 'steps-we', 2600, 5400)
    : pick(date, 'steps', 5200, 9600)
  return base
}

/**
 * Which workouts a day has.
 *
 * About two days in five, and never more than two, weighted so a run is the
 * common case and badminton is the evening one. The distribution is arbitrary;
 * what matters is that it is stable and that some days have nothing, because a
 * history list where every day is identical demonstrates nothing about a
 * history list.
 */
type DemoWorkout = {
  kind: string
  startHour: number
  startMinute: number
  minutes: number
  kcal: number
  distanceM: number | null
  avgHr: number
  maxHr: number
}

function workoutsFor(date: LocalDate): DemoWorkout[] {
  const out: DemoWorkout[] = []
  const dice = roll(date, 'workout')

  if (dice < 0.42) {
    const runs = dice < 0.24
    if (runs) {
      const minutes = pick(date, 'run-min', 22, 46)
      // ~6:40/km, wandering a little. Distance derived from the duration rather
      // than rolled separately, so the pace on the detail screen is a pace.
      const paceS = pick(date, 'run-pace', 350, 430)
      out.push({
        kind: 'run',
        startHour: pick(date, 'run-h', 6, 7),
        startMinute: pick(date, 'run-m', 0, 55),
        minutes,
        kcal: Math.round(minutes * pick(date, 'run-rate', 7, 9)),
        distanceM: Math.round((minutes * 60 * 1000) / paceS),
        avgHr: pick(date, 'run-hr', 138, 158),
        maxHr: pick(date, 'run-hrmax', 165, 182),
      })
    } else {
      const minutes = pick(date, 'walk-min', 18, 40)
      out.push({
        kind: 'walk',
        startHour: pick(date, 'walk-h', 17, 19),
        startMinute: pick(date, 'walk-m', 0, 55),
        minutes,
        kcal: Math.round(minutes * 3.4),
        distanceM: Math.round(minutes * 78),
        avgHr: pick(date, 'walk-hr', 96, 112),
        maxHr: pick(date, 'walk-hrmax', 118, 132),
      })
    }
  }

  if (roll(date, 'badminton') < 0.3) {
    const minutes = pick(date, 'bad-min', 40, 75)
    out.push({
      kind: 'badminton',
      startHour: pick(date, 'bad-h', 20, 21),
      startMinute: pick(date, 'bad-m', 0, 45),
      minutes,
      kcal: Math.round(minutes * pick(date, 'bad-rate', 5, 7)),
      distanceM: null,
      avgHr: pick(date, 'bad-hr', 126, 148),
      maxHr: pick(date, 'bad-hrmax', 155, 175),
    })
  }

  return out
}

/**
 * How a day's steps are spread across its hours.
 *
 * Weighted by a Malaysian office day rather than uniformly: a walk to breakfast,
 * a lunch peak, a mid-afternoon errand, an evening spike. The design's copy for
 * this screen — "busiest hour was 3pm, likely your walk to the mamak" — is
 * derived from the data, so the data has to have a busiest hour worth naming.
 */
const HOUR_WEIGHTS: readonly number[] = [
  0, 0, 0, 0, 0, 1, 4, 7, 6, 4, 5, 6, 9, 7, 5, 10, 6, 7, 9, 8, 6, 4, 2, 1,
]

const WEIGHT_TOTAL = HOUR_WEIGHTS.reduce((sum, w) => sum + w, 0)

function hoursFor(date: LocalDate, steps: number, distanceM: number): HourReading[] {
  const out: HourReading[] = []
  for (let hour = 0; hour < 24; hour++) {
    const weight = HOUR_WEIGHTS[hour]
    if (weight === 0) continue
    // Jittered per hour so the chart is not the same silhouette every day, and
    // seeded on the hour so it is the same silhouette on the same day.
    const jitter = 0.7 + roll(date, `h${hour}`) * 0.6
    const share = (weight / WEIGHT_TOTAL) * jitter
    const stepped = Math.round(steps * share)
    if (stepped <= 0) continue
    out.push({
      date,
      hour,
      steps: stepped,
      activeKcal: Math.round(stepped * 0.04),
      distanceM: Math.round(distanceM * share),
    })
  }
  return out
}

export const demoHealth: HealthProvider = {
  id: 'demo',

  // Always. It is generated locally and needs nothing from the platform, which
  // is the entire point of it.
  async isAvailable(): Promise<Availability> {
    return { ok: true }
  },

  async requestAccess(): Promise<AccessResult> {
    return { granted: true, permissions: ['demo'] }
  },

  async read(from, to, { withHours }): Promise<HealthReading> {
    const days: ActivityDayReading[] = []
    const workouts: WorkoutReading[] = []
    const hours: HourReading[] = []

    const dates = eachDay(from, to)
    // The hourly breakdown is only kept for the recent past — the same window
    // the real providers are asked for — so a long backfill does not generate
    // ten thousand rows nothing draws.
    const hourlyFrom = dates.length > 31 ? dates[dates.length - 31] : dates[0]

    for (const date of dates) {
      const steps = stepsFor(date)
      // 0.72 m a step, which is a shortish adult stride and makes 8,400 steps
      // about 6 km — the figure the design's steps screen shows.
      const distanceM = Math.round(steps * 0.72)

      const dayWorkouts = workoutsFor(date)
      const workoutKcal = dayWorkouts.reduce((sum, w) => sum + w.kcal, 0)
      const workoutMinutes = dayWorkouts.reduce((sum, w) => sum + w.minutes, 0)

      // Active energy is the walking plus the sessions, not a separate roll:
      // the "where the burn comes from" split subtracts one from the other, and
      // two independent numbers would let walking come out negative.
      const walkingKcal = Math.round(steps * 0.035)

      days.push({
        date,
        activeKcal: walkingKcal + workoutKcal,
        restingKcal: pick(date, 'resting', 1460, 1580),
        steps,
        distanceM,
        exerciseMinutes: workoutMinutes + pick(date, 'ex-extra', 0, 14),
        standHours: pick(date, 'stand', 7, 13),
        flights: pick(date, 'flights', 0, 12),
        // The demo has ring goals where Apple's binding does not, because the
        // screens need something to draw a ring against and a demo that shows
        // the fallback path would be demonstrating the wrong thing.
        moveGoalKcal: 400,
        exerciseGoalMin: 45,
        standGoalHr: 12,
      })

      for (const [index, workout] of dayWorkouts.entries()) {
        const started = new Date(
          Number(date.slice(0, 4)),
          Number(date.slice(5, 7)) - 1,
          Number(date.slice(8, 10)),
          workout.startHour,
          workout.startMinute,
        )
        const ended = new Date(started.getTime() + workout.minutes * 60_000)

        workouts.push({
          // Stable across syncs, which is what makes the upsert idempotent and
          // is the property this provider exists to let anyone verify.
          externalId: `demo-${date}-${index}`,
          date,
          kind: workout.kind,
          kindLabel: null,
          startedAt: started.toISOString(),
          endedAt: ended.toISOString(),
          durationS: workout.minutes * 60,
          activeKcal: workout.kcal,
          distanceM: workout.distanceM,
          avgHr: workout.avgHr,
          maxHr: workout.maxHr,
          elevationM: workout.distanceM ? pick(date, `elev${index}`, 4, 48) : null,
          hrZones: zonesFor(date, index, workout),
          sourceName: 'RiceCal demo',
        })
      }

      if (withHours && date >= hourlyFrom) {
        hours.push(...hoursFor(date, steps, distanceM))
      }
    }

    return { days, workouts, hours, deviceName: 'Demo watch' }
  },
}

/**
 * A believable zone split for a generated session.
 *
 * Shaped by intensity rather than rolled flat: a run spends most of its time in
 * Steady with a Hard tail, a walk barely leaves Easy, and badminton is spiky.
 * The four bands sum to the duration, which the detail screen relies on when it
 * draws them as shares of one bar.
 */
function zonesFor(date: LocalDate, index: number, workout: DemoWorkout) {
  const total = workout.minutes * 60
  const shape =
    workout.kind === 'walk'
      ? [0.72, 0.24, 0.04, 0]
      : workout.kind === 'badminton'
        ? [0.18, 0.42, 0.31, 0.09]
        : [0.16, 0.46, 0.3, 0.08]

  // A little seeded drift so two runs are not the same picture.
  const drift = (roll(date, `z${index}`) - 0.5) * 0.12
  const easy = Math.max(0, Math.round(total * (shape[0] + drift)))
  const steady = Math.round(total * shape[1])
  const hard = Math.round(total * shape[2])
  return { easy, steady, hard, peak: Math.max(0, total - easy - steady - hard) }
}
