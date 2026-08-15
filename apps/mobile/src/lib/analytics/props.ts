import type { PlanDirection } from './events'

/**
 * The two derived properties more than one call site needs.
 *
 * Both exist so that a fact about the user reaches Mixpanel WITHOUT the number
 * behind it: how far back a day is rather than which day, and which way the
 * plan runs rather than what anybody weighs.
 */

/**
 * How many days back from today a logged entry counts towards.
 *
 * 0 is the ordinary case, and anything above it is somebody filling in a day
 * they missed — which is the question this property exists to answer, and one
 * that a timestamp on the event cannot answer at all.
 *
 * Compared as calendar dates in the user's own clock, because that is what
 * `selectedDate` is: `YYYY-MM-DD`, produced by `dateKey`, with no time in it.
 */
export function dateOffset(logDate: string, todayKey: string): number {
  const day = Date.parse(`${logDate}T00:00:00Z`)
  const now = Date.parse(`${todayKey}T00:00:00Z`)
  if (Number.isNaN(day) || Number.isNaN(now)) return 0
  return Math.round((now - day) / 86_400_000)
}

/**
 * What the calorie plan is for, from the two weights that decide it.
 *
 * The gap between current and target IS the plan — its sign says lose or gain
 * and equal says neither, which is the invariant the whole budget rests on. So
 * the direction is the entire information content of those two numbers as far
 * as a segment is concerned, and sending it instead of them means no weight
 * ever leaves the phone.
 *
 * The half-kilo band is not a rounding convenience: a target set within half a
 * kilo of the current weight is somebody asking to stay where they are, and
 * calling that "lose" because of a decimal would put them in the wrong cohort.
 */
export function planDirection(weightKg: number, targetWeightKg: number | null): PlanDirection {
  if (targetWeightKg == null) return 'maintain'
  const gap = targetWeightKg - weightKg
  if (Math.abs(gap) < 0.5) return 'maintain'
  return gap < 0 ? 'lose' : 'gain'
}
