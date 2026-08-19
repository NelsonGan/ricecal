import {
  addDays,
  addMonths,
  endOfMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'

import { dateKey } from '@/data/client'
import { WEEK_STARTS_ON } from './week'

/**
 * What a month is, for the calendar view on Today.
 *
 * Apart from the component for the reason `week.ts` is apart from
 * `WeekPicker`: everything here is a pure function of dates, and testing it
 * should not need a device. Imported from the narrow data module rather than
 * the `@/data` barrel, which drags in the notification scheduler and with it a
 * native module Jest has no answer for.
 */

/**
 * How far back the calendar can be paged.
 *
 * A year, which is the same reach the week strip has — and reaching it takes
 * twelve taps here rather than fifty-two swipes, so there is no argument for
 * making the two differ.
 */
export const MONTHS_BACK = 12

/** The first day of the month a date falls in, as `yyyy-MM-dd`. */
export function monthStart(date: string): string {
  return dateKey(startOfMonth(parseISO(date)))
}

/** And the last. */
export function monthEnd(start: string): string {
  return dateKey(endOfMonth(parseISO(start)))
}

/**
 * The month before or after this one, clamped to what the calendar reaches.
 *
 * Null where there is nothing there, which is what the two chevrons read to
 * decide whether they are pressable: a month ahead of the current one has not
 * happened, and one more than a year back is past the point this screen offers.
 * Returning null rather than the same month again is what keeps a dead arrow
 * from looking alive.
 */
export function stepMonth(start: string, by: -1 | 1, today: string): string | null {
  const next = dateKey(by < 0 ? subMonths(parseISO(start), 1) : addMonths(parseISO(start), 1))
  if (next > monthStart(today)) return null
  if (next < monthStart(dateKey(subMonths(parseISO(today), MONTHS_BACK)))) return null
  return next
}

/**
 * One month's grid, as rows of seven.
 *
 * Padded at BOTH ends with nulls: leading, so the 1st sits under its own
 * weekday, and trailing, so the last row has seven slots in it. The trailing
 * half is layout rather than calendar — a row of three cells sharing the width
 * seven were laid out for draws three enormous days — and a whole empty week is
 * never added, so a month ending on a Sunday is exactly its own weeks.
 */
export function monthWeeks(start: string): Array<Array<string | null>> {
  const first = parseISO(start)
  const lead = (first.getDay() - WEEK_STARTS_ON + 7) % 7
  const last = endOfMonth(first).getDate()

  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: last }, (_, i) => dateKey(addDays(first, i))),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7))
}

/**
 * The seven weekday columns of the grid, in the order it draws them.
 *
 * Derived from a real week rather than written out, so a locale that starts its
 * week on Sunday gets its own order for free, and so the letters come from
 * `date-fns` rather than from a list this file would have to keep in step with
 * `WEEK_STARTS_ON`.
 *
 * The key is the weekday's own name because the LABEL is not unique: two of the
 * seven initials are "T" and two are "S".
 */
export function weekdayColumns(
  label: (date: Date) => string,
): Array<{ key: string; label: string }> {
  const monday = startOfWeek(new Date(2026, 0, 5), { weekStartsOn: WEEK_STARTS_ON })
  return Array.from({ length: 7 }, (_, i) => {
    const at = addDays(monday, i)
    return { key: dateKey(at), label: label(at) }
  })
}

/**
 * Which day to select when the calendar moves to another month.
 *
 * The same day of the month where there is one, so paging back from the 27th
 * lands on the 27th and the card under the grid keeps describing a comparable
 * day. Clamped twice: to the month's own length, because the 31st does not
 * exist in June, and to today, because a day that has not happened cannot be
 * selected here any more than it can in the grid.
 */
export function dayInMonth(start: string, selected: string, today: string): string {
  const wanted = parseISO(selected).getDate()
  const last = endOfMonth(parseISO(start)).getDate()
  const at = dateKey(addDays(parseISO(start), Math.min(wanted, last) - 1))
  return at > today ? today : at
}
