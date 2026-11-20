import type { LocalDate } from './types'

/**
 * The instants a read covers. Both providers ask their store for exactly this,
 * and the sync tells the server the same bounds when it reconciles the
 * workouts it read, so the three must not drift apart.
 */

/** Local midnight at the start of a `yyyy-MM-dd`. */
export function startOf(date: LocalDate): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

/** Local midnight at the END of a `yyyy-MM-dd`: the first instant of the next day. */
export function endOf(date: LocalDate): Date {
  const at = startOf(date)
  at.setDate(at.getDate() + 1)
  return at
}
