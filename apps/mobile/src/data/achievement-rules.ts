import { addDays, getDay, parseISO, subDays } from 'date-fns'

import { dateKey } from './client'
import type { Achievement, AchievementRule, DayLog, Entry, Targets } from './types'

/**
 * What earns a badge.
 *
 * Every rule is a measurement over what the user has actually logged, not a
 * flag someone sets. That is the difference between an achievement and a
 * sticker: the panel cannot show a badge the logs do not support, and a badge
 * cannot be missed because nothing remembered to award it.
 *
 * These run on the client, over rows read from Postgres. `user_achievements`
 * exists for the day a server-side job writes them — clients have no write
 * grant on it, deliberately, because a badge you can grant yourself is not an
 * achievement. Until that job exists, deriving them is what keeps the panel
 * honest; the arithmetic below is what the job will run.
 */

export type AchievementInput = {
  /** Days keyed by yyyy-MM-dd. Only days with something in them need be present. */
  days: Record<string, DayLog>
  todayKey: string
  targets: Targets | null
  /** Total kilometres across every recorded workout. */
  totalDistanceKm: number
}

const hasEntries = (day: DayLog | undefined): day is DayLog => Boolean(day?.entries.length)

/**
 * Days logged in an unbroken run ending today.
 *
 * Today not being logged yet does not break the streak — it is still early.
 * The database's `logging_streak()` accepts a run ending yesterday for exactly
 * the same reason, and this is its client-side twin for the badge rules.
 */
export function currentStreak(days: Record<string, DayLog>, todayKey: string): number {
  const today = parseISO(todayKey)
  let streak = 0
  let cursor = hasEntries(days[todayKey]) ? 0 : 1

  while (hasEntries(days[dateKey(subDays(today, cursor))])) {
    streak++
    cursor++
  }

  return streak
}

/** The longest run in the window, today's included. */
export function bestStreak(days: Record<string, DayLog>): number {
  const logged = Object.keys(days)
    .filter((key) => hasEntries(days[key]))
    .sort()

  let best = 0
  let run = 0
  let previous: string | undefined

  for (const key of logged) {
    run = previous && dateKey(subDays(parseISO(key), 1)) === previous ? run + 1 : 1
    best = Math.max(best, run)
    previous = key
  }

  return best
}

function allEntries(days: Record<string, DayLog>): Entry[] {
  return Object.values(days).flatMap((day) => day.entries)
}

function loggedDays(days: Record<string, DayLog>): DayLog[] {
  return Object.values(days)
    .filter((day) => day.entries.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Mornings with something logged before 8am. */
function earlyMornings(days: Record<string, DayLog>): number {
  return loggedDays(days).filter((day) =>
    day.entries.some((entry) => parseISO(entry.loggedAt).getHours() < 8),
  ).length
}

/** Weekends where both days were logged. */
function fullWeekends(days: Record<string, DayLog>): number {
  return loggedDays(days).filter((day) => {
    const date = parseISO(day.date)
    if (getDay(date) !== 6) return false
    return hasEntries(days[dateKey(addDays(date, 1))])
  }).length
}

const dayProtein = (day: DayLog) =>
  day.entries.reduce((total, entry) => total + entry.macros.protein, 0)

const dayKcal = (day: DayLog) => day.entries.reduce((total, entry) => total + entry.macros.kcal, 0)

function proteinDays(days: Record<string, DayLog>, targets: Targets | null): number {
  if (!targets || targets.protein <= 0) return 0
  return loggedDays(days).filter((day) => dayProtein(day) >= targets.protein).length
}

/**
 * Weeks where all seven days were logged and none went over budget.
 *
 * Generous about how much was eaten — under the target is the bar, not a
 * narrow band — because the badge should reward finishing the week, not
 * hitting a number to the calorie.
 */
function perfectWeeks(days: Record<string, DayLog>, targets: Targets | null): number {
  if (!targets || targets.kcal <= 0) return 0
  const within = (day: DayLog) => day.entries.length > 0 && dayKcal(day) <= targets.kcal

  let weeks = 0
  let run = 0
  let previous: string | undefined

  for (const day of loggedDays(days)) {
    const consecutive = previous && dateKey(subDays(parseISO(day.date), 1)) === previous
    run = consecutive && within(day) ? run + 1 : within(day) ? 1 : 0
    previous = day.date
    if (run > 0 && run % 7 === 0) weeks++
  }

  return weeks
}

/**
 * How much of each badge's unit the user has.
 *
 * `rules` comes from the `achievements` table — icon, tone and order are the
 * database's to decide, and the arithmetic is this file's.
 */
export function measure(input: AchievementInput): Record<string, number> {
  const { days, todayKey, targets, totalDistanceKm } = input
  const best = Math.max(currentStreak(days, todayKey), bestStreak(days))

  return {
    // Streak badges measure the best run, not the current one: a badge earned
    // in March is not un-earned by a quiet week in April.
    sevenDays: best,
    thirtyDays: best,
    protein: proteinDays(days, targets),
    eightGlasses: Math.max(0, ...Object.values(days).map((day) => day.waterGlasses), 0),
    photoPro: allEntries(days).filter((entry) => entry.photoPath || entry.localPhotoUri).length,
    earlyBird: earlyMornings(days),
    // Two days of one weekend, so the qualifier reads "2 days" rather than
    // "1 weekend" for something the user experienced as a Saturday and a Sunday.
    weekend: fullWeekends(days) > 0 ? 2 : 0,
    marathon: Math.round(totalDistanceKm),
    perfectWeek: perfectWeeks(days, targets),
  }
}

/** Every badge, earned or not, with how far along it is. */
export function evaluateAchievements(
  rules: readonly AchievementRule[],
  input: AchievementInput,
): Achievement[] {
  const values = measure(input)

  return rules.map((rule) => {
    const value = values[rule.labelKey] ?? 0
    return {
      ...rule,
      value,
      earned: value >= rule.goal,
      progress: rule.goal <= 0 ? 0 : Math.min(1, value / rule.goal),
    }
  })
}

/**
 * How much of its unit each badge takes, and what that unit is.
 *
 * Not in the database: the catalogue table is presentation — icon, tone,
 * order — and encoding "log seven days in a row" as data would mean an
 * expression language and an evaluator to read it.
 */
export const BADGE_GOALS: Record<string, { goal: number; unit: AchievementRule['unit'] }> = {
  sevenDays: { goal: 7, unit: 'days' },
  protein: { goal: 5, unit: 'days' },
  eightGlasses: { goal: 8, unit: 'glasses' },
  photoPro: { goal: 10, unit: 'photos' },
  earlyBird: { goal: 5, unit: 'days' },
  weekend: { goal: 2, unit: 'days' },
  thirtyDays: { goal: 30, unit: 'days' },
  marathon: { goal: 42, unit: 'km' },
  perfectWeek: { goal: 1, unit: 'weeks' },
}
