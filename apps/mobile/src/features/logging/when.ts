import { format, isToday, isYesterday, parseISO, subDays } from 'date-fns'

import { dateKey } from '@/data/client'
import { datePattern } from '@/lib/dates'

/**
 * WHEN an entry happened, and the two columns that say so.
 *
 * `food_logs` keeps them apart on purpose — see the header of `30_food_logs.sql`.
 * `log_date` is which day the entry counts towards, a calendar fact about the
 * user's own day; `logged_at` is the instant, which is what orders the rows
 * inside it and prints "8:20 am" on each one.
 *
 * They can disagree, and ordinarily do: a meal logged this afternoon against
 * yesterday's strip is filed on yesterday with this afternoon's timestamp. So
 * the screen reads the DAY off `log_date` and the TIME off `logged_at`, which is
 * exactly what the diary already shows, and writing the two back together is
 * what makes the timestamp agree with the day it is filed under.
 *
 * Apart from the screens so it can be tested without a device, and imported from
 * the narrow data module rather than the `@/data` barrel — which drags in the
 * notification scheduler and with it a native module Jest has no answer for.
 */

/**
 * A time of day as the sheet asks for it.
 *
 * Twelve-hour, because that is how the diary prints it and an hour field
 * accepting 20 would be a different control from the one the row reads back.
 */
export type Clock = { hour: number; minute: number; period: 'am' | 'pm' }

/** The clock face of an instant, read in the phone's own timezone. */
export function clockOf(iso: string): Clock {
  const at = new Date(iso)
  const hours = at.getHours()
  return {
    hour: hours % 12 === 0 ? 12 : hours % 12,
    minute: at.getMinutes(),
    period: hours < 12 ? 'am' : 'pm',
  }
}

/** Twenty-four hour, which is what a `Date` wants. Midnight is 12am, noon 12pm. */
function hours24({ hour, period }: Clock): number {
  const twelve = hour % 12
  return period === 'am' ? twelve : twelve + 12
}

/**
 * The instant a day and a clock face name, as an ISO string.
 *
 * Through the local `Date` constructor rather than by pasting the two together,
 * because `logged_at` is a `timestamptz` and the offset is the whole point:
 * "8:20 am" means 8:20 where the phone is, and a string assembled by hand would
 * file it at 8:20 UTC — which for Malaysia is the previous afternoon.
 */
export function instantOn(date: string, clock: Clock): string {
  const day = parseISO(date)
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hours24(clock),
    clock.minute,
    0,
    0,
  ).toISOString()
}

/**
 * Whether two clock faces are the same MINUTE.
 *
 * What the change detection compares, and it cannot compare the ISO strings:
 * `instantOn` writes whole seconds while Postgres hands back microseconds, so a
 * `logged_at` nobody touched would read as an edit and every Save would rewrite
 * it — moving the row inside its own day by however many seconds the original
 * carried.
 */
export function sameClock(a: Clock, b: Clock): boolean {
  return a.hour === b.hour && a.minute === b.minute && a.period === b.period
}

/**
 * "8:20 am". The same shape `formatTime` prints on a diary row, off a clock face
 * rather than off an instant — so the picker can read its own value back without
 * building a `Date` on every flick of a wheel.
 *
 * There is no `validClock` beside it any more, and its absence is the point of
 * the picker: an hour and a minute typed into text fields could be empty, or 0,
 * or 99, so everything downstream had to be guarded against a half-finished
 * answer. A wheel has no invalid position.
 */
export function clockLabel({ hour, minute, period }: Clock): string {
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`
}

/**
 * How a day is named on screen: the two everybody thinks of by name, and a date
 * for the rest.
 *
 * The copy comes in rather than being translated here, the same way every
 * component in `src/ui` takes its labels — this is a pure function of two dates.
 */
export function dayLabel(
  date: string,
  today: string,
  labels: { today: string; yesterday: string },
): string {
  if (date === today) return labels.today
  if (date === dateKey(subDays(parseISO(today), 1))) return labels.yesterday
  // The year only when it is not this one. On a diary that mostly looks at the
  // last few weeks it is four characters of noise, and on the one entry from
  // last December it is the whole answer.
  const pattern = date.slice(0, 4) === today.slice(0, 4) ? 'EEE d MMM' : 'EEE d MMM yyyy'
  return format(parseISO(date), pattern)
}

/**
 * How far back the day wheel reaches.
 *
 * A year, which is what the health backfill reads and about as far as an account
 * is likely to go. It is a row count rather than a fetch: every day in it is a
 * `Text` in a scroll view and costs nothing until somebody spins down to it.
 */
export const DAYS_BACK = 365

/**
 * "Today, 8:20 am" / "Yesterday, 1:15 pm" / "17 Aug, 8:20 am".
 *
 * Named days rather than "2 hours ago" for the reason written beside
 * `common:date`: an elapsed phrase is one the reader has to convert, and a meal
 * at 11pm last night is both "9 hours ago" and yesterday, which is the word
 * somebody scanning their own diary is looking for.
 *
 * Exported for its own test. The named days are the part worth pinning: they
 * are calendar comparisons rather than arithmetic on elapsed hours, and getting
 * that wrong reads as the app being confused about what day it is.
 */
export function whenLabel(iso: string, named: { today: string; yesterday: string }): string {
  const at = parseISO(iso)
  const time = format(at, datePattern('time')).toLowerCase()
  const day = isToday(at)
    ? named.today
    : isYesterday(at)
      ? named.yesterday
      : format(at, datePattern('dayMonth'))
  return `${day}, ${time}`
}
