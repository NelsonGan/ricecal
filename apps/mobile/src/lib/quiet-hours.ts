/**
 * The window in which nothing is announced.
 *
 * Its own module, with no imports, for two reasons. It is the only part of the
 * reminder machinery that is arithmetic rather than a call into the OS — so it
 * is the only part worth testing — and importing `expo-notifications` to reach
 * it would drag a native module into a unit test that has no device.
 *
 * Times are wall-clock strings from Postgres (`22:00:00`), interpreted in the
 * user's own timezone. `time` and not `timestamptz` on purpose: "no
 * notifications after 22:00" is a rule about the user's clock, and it stays
 * true when they fly somewhere else.
 */

/** "08:00:00" → { hour: 8, minute: 0 }. Postgres `time` includes seconds. */
export function parseTime(at: string): { hour: number; minute: number } {
  const [hour = '0', minute = '0'] = at.split(':')
  return { hour: Number(hour), minute: Number(minute) }
}

/**
 * Whether a wall-clock time falls inside the quiet window.
 *
 * The window usually wraps midnight — 22:00 to 07:00 — so a plain
 * `from <= t && t < to` comparison is wrong for the common case rather than
 * for the edge one.
 *
 * The start is inside the window and the end is outside it, so a reminder at
 * exactly 07:00 fires and one at exactly 22:00 does not.
 */
export function isQuiet(time: { hour: number; minute: number }, from: string, to: string): boolean {
  const minutes = time.hour * 60 + time.minute
  const start = parseTime(from)
  const end = parseTime(to)
  const startMinutes = start.hour * 60 + start.minute
  const endMinutes = end.hour * 60 + end.minute

  return startMinutes <= endMinutes
    ? minutes >= startMinutes && minutes < endMinutes
    : minutes >= startMinutes || minutes < endMinutes
}
