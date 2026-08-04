import { addDays, parseISO, startOfWeek, subWeeks } from 'date-fns'

import { dateKey } from '@/data/client'
import type { DayMark } from '@/data/types'
import type { DateStripMark } from '@/ui'

/**
 * What a week is, and how a day in one is judged.
 *
 * Apart from `WeekPicker` so it can be tested without a device: the component
 * is a pager and a query, and everything below is a pure function of dates and
 * numbers. Imported from the narrow data modules rather than the `@/data`
 * barrel, which drags in the notification scheduler and with it a native module
 * Jest has no answer for.
 */

/**
 * How far back the strip can be swiped.
 *
 * A year, which is what the health backfill reads and about as far as an
 * account is likely to go. It is a page count rather than a fetch: a week is
 * queried when it scrolls into view, so the fifty-second one costs nothing
 * until somebody goes looking for it.
 */
export const WEEKS_BACK = 52

/** Monday. The strip reads M T W T F S S, which is how the week is written here. */
export const WEEK_STARTS_ON = 1

/** The seven dates of the week beginning on `start`, as `yyyy-MM-dd`. */
export function weekDays(start: string): string[] {
  const monday = parseISO(start)
  return Array.from({ length: 7 }, (_, i) => dateKey(addDays(monday, i)))
}

/**
 * Every page of the pager: a year of Mondays, oldest first.
 *
 * Oldest first so the current week is the LAST page and swiping right goes back
 * in time — the direction a calendar is read, and the direction the page the
 * strip opens on has to be reachable from.
 */
export function weekStarts(today: string): string[] {
  const current = startOfWeek(parseISO(today), { weekStartsOn: WEEK_STARTS_ON })
  return Array.from({ length: WEEKS_BACK + 1 }, (_, i) =>
    dateKey(subWeeks(current, WEEKS_BACK - i)),
  )
}

/**
 * Which dot a day gets.
 *
 * The order matters more than the arithmetic. A day still ahead makes no claim;
 * a day whose marks have not arrived makes no claim either, because the
 * alternative is a row of hollow dots that fills in a moment later and reads as
 * a week of failures. Only then does an empty PAST day become `missed`.
 *
 * The budget is `goal + active` and not the goal alone — the same sum the ring
 * on this screen draws, and for the same reason: movement extends the budget.
 * A day where a long walk covered the excess is not an over-goal day, and
 * saying so under a ring that says otherwise would make the screen argue with
 * itself.
 */
export function markFor(
  date: string,
  mark: DayMark | undefined,
  today: string,
  ready: boolean,
  extendsBudget: boolean,
): DateStripMark | undefined {
  if (date > today || !ready) return undefined
  if (!mark || mark.entryCount === 0) return date < today ? 'missed' : undefined
  // No budget was in force that day — before onboarding computed one, or before
  // the account existed. Nothing to be over or under, so the day says only that
  // it was logged.
  if (mark.goalKcal === null) return undefined

  return mark.kcal <= mark.goalKcal + (extendsBudget ? mark.activeKcal : 0) ? 'under' : 'over'
}
