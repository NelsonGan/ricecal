import { differenceInMinutes, parseISO } from 'date-fns'

/**
 * The number formats the Activity tab uses, in one place.
 *
 * Not in `@/ui` and not in `lib/nutrition.ts`: every one of these is a decision
 * about how movement reads, and several of them are decisions about when NOT to
 * show a figure. A helper that returns null is doing as much work as one that
 * returns a string.
 */

/** "5.1 km" from metres. Below a kilometre, metres — "0.4 km" reads as nothing. */
export function distance(metres: number | null): string | null {
  if (metres == null || metres <= 0) return null
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(1)} km`
}

/** "34 min", "1h 12m". Minutes up to an hour, then both. */
export function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** "34:12" — the clock face on a workout's detail screen. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * "6:42" per kilometre.
 *
 * Null under 100 m or 30 s, where the arithmetic produces a confident and
 * absurd figure — a watch that recorded two samples of a walk to the car should
 * not report a 2:04 marathon pace.
 */
export function pace(seconds: number, metres: number | null): string | null {
  if (metres == null || metres < 100 || seconds < 30) return null
  const perKm = seconds / (metres / 1000)
  const minutes = Math.floor(perKm / 60)
  const secs = Math.round(perKm % 60)
  // 59.6 seconds rounds to 60, and "6:60 /km" is not a pace.
  if (secs === 60) return `${minutes + 1}:00`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

/** "14.2" km/h, for the kinds where a pace would be unreadable. */
export function speed(seconds: number, metres: number | null): string | null {
  if (metres == null || metres < 100 || seconds < 30) return null
  return ((metres / 1000 / seconds) * 3600).toFixed(1)
}

/** "3pm", "9am" — labels on the hourly axis. */
export function hourLabel(hour: number): string {
  if (hour === 0) return '12am'
  if (hour === 12) return '12pm'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

/**
 * How long ago the last sync was, as the key and count `t` needs.
 *
 * Returns the key rather than the string so the caller keeps the typed bundle —
 * assembling `activity:today.synced${unit}` here would type-check and then
 * silently render a key after a rename.
 */
export function syncedAgo(at: string | null): {
  key: 'syncedJustNow' | 'syncedMinutes' | 'syncedHours' | 'syncedDays' | 'syncedNever'
  count: number
} {
  if (!at) return { key: 'syncedNever', count: 0 }

  const minutes = differenceInMinutes(new Date(), parseISO(at))
  if (minutes < 2) return { key: 'syncedJustNow', count: 0 }
  if (minutes < 60) return { key: 'syncedMinutes', count: minutes }
  if (minutes < 60 * 24) return { key: 'syncedHours', count: Math.floor(minutes / 60) }
  return { key: 'syncedDays', count: Math.floor(minutes / (60 * 24)) }
}

/** A whole number with thousands separators. The default across the tab. */
export const count = (value: number): string => Math.round(value).toLocaleString()
