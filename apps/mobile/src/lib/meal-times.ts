/**
 * Reading the wall-clock times reminders are scheduled against.
 *
 * Its own module, with no imports, for two reasons. It is the only part of the
 * reminder machinery that is arithmetic rather than a call into the OS — so it
 * is the only part worth testing — and importing `expo-notifications` to reach
 * it would drag a native module into a unit test that has no device.
 *
 * Times are wall-clock strings from Postgres (`08:00:00`), interpreted in the
 * user's own timezone. `time` and not `timestamptz` on purpose: "breakfast is
 * at eight" is a rule about the user's clock, and it stays true when they fly
 * somewhere else.
 *
 * `isQuiet` used to live here, deciding whether a reminder fell inside a
 * do-not-disturb window. Nothing calls it: the filter silently dropped
 * reminders the user had explicitly asked for — a meal at 22:30 was scheduled,
 * skipped, and never explained — against a window that was not editable
 * anywhere in the app.
 */

/** "08:00:00" → { hour: 8, minute: 0 }. Postgres `time` includes seconds. */
export function parseTime(at: string): { hour: number; minute: number } {
  const [hour = '0', minute = '0'] = at.split(':')
  return { hour: Number(hour), minute: Number(minute) }
}
