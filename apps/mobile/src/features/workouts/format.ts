import { fromKg, toKg, type WeightUnit } from '@/lib/units'

/**
 * How the Workouts tab writes its numbers.
 *
 * Every weight is stored in kilograms and shown in the user's unit; every
 * distance in metres and shown in kilometres or miles. The conversions round
 * once, at display, so a set typed as 135 lb is saved as 61.23 kg and reads
 * back as 135.
 */

export type DistanceUnit = 'km' | 'mi'
export const distanceUnitFor = (unit: WeightUnit): DistanceUnit => (unit === 'lb' ? 'mi' : 'km')

const M_PER_MI = 1609.344

/** A figure with at most `places` decimals and no trailing zeros: 62.5, 60, 2.25. */
export function trim(value: number, places = 2): string {
  const factor = 10 ** places
  const rounded = Math.round(value * factor) / factor
  return String(rounded)
}

/** A weight in the user's unit, for a field: "62.5". */
export function weightField(kg: number | null, unit: WeightUnit): string {
  if (kg === null) return ''
  // Pounds read to one decimal (a 2.5 lb plate is the smallest anybody loads);
  // kilograms to two, for a 1.25 kg plate.
  return trim(fromKg(kg, unit), unit === 'lb' ? 1 : 2)
}

/**
 * A typed weight back to kilograms, or null when the field is empty or nonsense.
 *
 * Rounded to the two places the database keeps, here rather than at the save:
 * the live record check compares this number with saved bests, and 135 lb
 * unrounded (61.2349) beat last week's 135 lb saved as 61.23, so matching last
 * week's weight earned a trophy the saved workout then did not have.
 */
export function parseWeight(text: string, unit: WeightUnit): number | null {
  const value = parseDecimal(text)
  if (value === null) return null
  return Math.round(toKg(value, unit) * 100) / 100
}

/** "1,234". Whole numbers with the phone's own separators. */
export const whole = (value: number): string => Math.round(value).toLocaleString()

/** A volume in the user's unit: "8,420". The unit is the caller's label. */
export const volume = (kg: number, unit: WeightUnit): string => whole(fromKg(kg, unit))

export function parseDecimal(text: string): number | null {
  const cleaned = text.replace(',', '.').trim()
  if (!cleaned) return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function parseWhole(text: string): number | null {
  const value = parseDecimal(text)
  return value === null ? null : Math.round(value)
}

/** A distance for a field, in km or mi: "5.2". */
export function distanceField(metres: number | null, unit: DistanceUnit): string {
  if (metres === null) return ''
  return trim(unit === 'mi' ? metres / M_PER_MI : metres / 1000, 2)
}

export function parseDistance(text: string, unit: DistanceUnit): number | null {
  const value = parseDecimal(text)
  if (value === null) return null
  return unit === 'mi' ? value * M_PER_MI : value * 1000
}

/** "1:05:09" or "05:09", the clock a running workout shows. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const ss = String(secs).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
  return `${String(minutes).padStart(2, '0')}:${ss}`
}

/** "1:30" for a rest or a set's time: minutes and seconds, no padding on the minutes. */
export function shortClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const ss = String(total % 60).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
  return `${minutes}:${ss}`
}

/**
 * A duration typed on the number pad, the way a microwave reads it: the last
 * two digits are seconds and everything before them minutes, so "130" is 1:30
 * and "4500" is 45:00. A digit string, because that is all the pad can type.
 */
export function digitsToSeconds(digits: string): number | null {
  const clean = digits.replace(/\D/g, '')
  if (!clean) return null
  const value = Number(clean)
  const seconds = value % 100
  const minutes = Math.floor(value / 100)
  return minutes * 60 + Math.min(seconds, 59)
}

export function secondsToDigits(seconds: number | null): string {
  if (seconds === null) return ''
  const minutes = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return minutes > 0 ? `${minutes}${String(secs).padStart(2, '0')}` : String(secs)
}

/** How a duration's digits read while being typed: "130" as "1:30". */
export function digitsClock(digits: string): string {
  const seconds = digitsToSeconds(digits)
  return seconds === null ? '' : shortClock(seconds)
}

/** Hours and minutes as two numbers, for copy like "1 h 12 min". */
export function hoursMinutes(seconds: number): { hours: number; minutes: number } {
  const minutes = Math.round(Math.max(0, seconds) / 60)
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 }
}
