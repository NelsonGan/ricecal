import type { PlanDirection } from './events'

/**
 * The two derived properties more than one call site needs. Both send the fact
 * without the number behind it: how far back a day is rather than which day,
 * and which way the plan runs rather than what anybody weighs.
 */

/**
 * How many days back from today a logged entry counts towards. Anything above
 * 0 is somebody filling in a day they missed, which a timestamp on the event
 * cannot tell you. Compared as calendar dates in the user's own clock, since
 * that is what `selectedDate` is.
 */
export function dateOffset(logDate: string, todayKey: string): number {
  const day = Date.parse(`${logDate}T00:00:00Z`)
  const now = Date.parse(`${todayKey}T00:00:00Z`)
  if (Number.isNaN(day) || Number.isNaN(now)) return 0
  return Math.round((now - day) / 86_400_000)
}

/**
 * What the calorie plan is for, from the two weights that decide it. The sign
 * of the gap is the whole information content as far as a segment is
 * concerned, so sending it means no weight ever leaves the phone.
 *
 * The half-kilo band is not rounding: a target within half a kilo of the
 * current weight is somebody asking to stay where they are.
 */
export function planDirection(weightKg: number, targetWeightKg: number | null): PlanDirection {
  if (targetWeightKg == null) return 'maintain'
  const gap = targetWeightKg - weightKg
  if (Math.abs(gap) < 0.5) return 'maintain'
  return gap < 0 ? 'lose' : 'gain'
}
