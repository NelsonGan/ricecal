import type { Units } from '@/data'

/**
 * Kilograms are what the database stores, and pounds are what half the people
 * reading this screen own a scale for.
 *
 * The conversion lives here rather than in each panel because it has to be
 * SYMMETRIC: the sheet takes pounds in and must write back the kilograms it came
 * from, or a weigh-in that is opened and saved unchanged drifts by a gram every
 * time. One pair of functions, one constant, no rounding in between — the
 * rounding happens once, at the point of display.
 */
const LB_PER_KG = 2.2046226218

export type WeightUnit = 'kg' | 'lb'

/**
 * The unit's symbol, as a copy key.
 *
 * A map rather than `t(\`common:unit.${unit}\`)`: the assembled key type-checks
 * and then renames silently, which is the one failure the typed bundle exists to
 * prevent. The symbols themselves live in `common` because they are units, not
 * something this screen owns.
 */
export const UNIT_KEY = { kg: 'common:unit.kg', lb: 'common:unit.lb' } as const satisfies Record<
  WeightUnit,
  string
>

/** `user_settings.units` is the preference; this is the half of it weight uses. */
export const unitFor = (units: Units | undefined): WeightUnit =>
  units === 'imperial' ? 'lb' : 'kg'

export const fromKg = (kg: number, unit: WeightUnit) => (unit === 'lb' ? kg * LB_PER_KG : kg)

export const toKg = (value: number, unit: WeightUnit) => (unit === 'lb' ? value / LB_PER_KG : value)

/** One decimal, which is the precision a bathroom scale reports in either unit. */
export const showWeight = (kg: number, unit: WeightUnit) => fromKg(kg, unit).toFixed(1)

/**
 * A CHANGE in weight, signed, with a real minus sign.
 *
 * U+2212 rather than a hyphen: at display sizes a hyphen next to Baloo 2's
 * numerals reads as a dash between two figures rather than as a sign.
 */
export const showChange = (kgDelta: number, unit: WeightUnit) => {
  // Converted BEFORE the "did it move" test, not after. Measuring it in
  // kilograms and printing in pounds disagree in the gap between them: 0.04 kg
  // is a tenth of a pound, so the sign vanished from a figure that still
  // rendered as "0.1".
  const shown = fromKg(kgDelta, unit)
  const value = Math.abs(shown).toFixed(1)
  if (Math.abs(shown) < 0.05) return '0.0'
  return shown > 0 ? `+${value}` : `−${value}`
}
