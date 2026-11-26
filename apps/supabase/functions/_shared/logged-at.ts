/**
 * When a scanned meal was taken, as the app sends it for a meal it could not
 * send at the time: photographed or typed with no connection, and sent from
 * the app's queue once there was one. The entry is stamped with it, so lunch
 * photographed in a car park with no signal is not logged at whatever hour the
 * phone found one.
 *
 * Read defensively. Every older build sends none, and so does every scan sent
 * at the shutter, which is the entry stamped when it is written, as before.
 * Anything that is not a time, lies in the future past a little clock skew, or
 * is older than the app ever keeps a queued meal is dropped rather than
 * failing the scan: a meal is worth more than its minute.
 */

/** How far ahead of the server's clock a phone's may run. */
const SKEW_MS = 5 * 60_000
/** The app keeps a queued meal for a week; a day of slack past that. */
const OLDEST_MS = 8 * 24 * 60 * 60_000

export function readLoggedAt(raw: unknown, now = Date.now()): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null
  const at = Date.parse(raw)
  if (!Number.isFinite(at)) return null
  if (at > now + SKEW_MS || at < now - OLDEST_MS) return null
  return new Date(at).toISOString()
}
