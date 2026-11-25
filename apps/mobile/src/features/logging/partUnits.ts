import type { EntryIngredient } from '@/data/scan'
import type { Units } from '@/data/types'
import {
  labelQuantities,
  leadingAmount,
  MEASURES,
  type MeasureUnit,
  roundedFor,
  stepFor,
  steppedTo,
  unitsFor,
} from '@/lib/measures'
import { PART_STEP, perUnitGrams, quantityForGrams } from './parts'

/**
 * The kitchen units a plate's part can be read in, and the arithmetic between
 * them and the quantity the row stores.
 *
 * A part is still `quantity` of its serving, and that is all
 * `set_ingredient_quantity` writes. A unit is a face on it, as grams already
 * were: a weight goes through what one of the part weighs (`grams`), a volume
 * through what its serving label says it holds ("1 tbsp (15 ml)", "Regular
 * (350 ml)"). Nothing crosses between the two, for the reason `lib/measures`
 * gives: a cup of one food is not a cup of another, and a part carries no
 * density beyond what its own label states.
 *
 * Apart from the screens so it can be tested without one.
 */

type Part = Pick<EntryIngredient, 'grams' | 'quantity' | 'servingLabel' | 'displayUnit'>

/** What one of a part holds in millilitres, when its serving label says. */
export function perUnitMl(part: Pick<EntryIngredient, 'servingLabel'>): number | null {
  const ml = labelQuantities(part.servingLabel).ml
  return ml !== undefined && ml > 0 ? ml : null
}

/**
 * Whether the part's weight is really its volume read as grams. The scan and
 * the catalogue count millilitres as grams in their weight columns, so a drink
 * quoted as "Regular (350 ml)" carries 350 "g" too. Read as a weight that is a
 * density of exactly 1, and grams of tea are not something anybody measures.
 * The same rule `foodBasis` applies, and the same exception: a label that says
 * grams itself is believed.
 */
function weightIsVolume(part: Part): boolean {
  const ml = perUnitMl(part)
  if (ml === null || part.grams === null) return false
  if (labelQuantities(part.servingLabel).g !== undefined) return false
  // On the whole amount and with half a gram of slack, because a part drawn
  // before the server has answered carries its grams rounded to the gram: a
  // 330 ml can at a quarter is 82.5 ml and showed 83 "g", which read as a
  // density and flipped the row to grams until the refetch. The same slack
  // keeps a "1 tbsp" of soy sauce stored as 15 g (a US spoon is 14.8 ml) from
  // passing as weighed.
  const volume = ml * part.quantity
  return Math.abs(part.grams - volume) <= Math.max(0.5, volume * 0.005)
}

/**
 * Every unit this part can honestly be read in, in the order the person's unit
 * system lists them, whatever the amount. Empty for a part nobody weighed and
 * whose serving names no volume, which keeps its count.
 */
function candidateUnits(part: Part, units: Units | undefined): MeasureUnit[] {
  const weighed = perUnitGrams(part) !== null && !weightIsVolume(part)
  const holds = perUnitMl(part) !== null
  return unitsFor(units, 'diary').filter((unit) =>
    MEASURES[unit].family === 'weight' ? weighed : holds,
  )
}

/** Whether the amount reads sensibly in a unit, inside what its stepper steps. */
function fits(part: Part, unit: MeasureUnit): boolean {
  const { min, max } = stepFor(unit)
  const amount = amountIn(part, unit)
  return amount >= min - 1e-9 && amount <= max + 1e-9
}

/**
 * The units the "Measure in" list offers: the candidates the amount is not lost
 * in. Two spoons of soy sauce as 0.13 cup is a figure no measuring set has, and
 * its minus would be dead on arrival. The unit in use always stays, so the list
 * never loses its tick.
 */
export function partUnits(part: Part, units: Units | undefined): MeasureUnit[] {
  const current = partUnit(part, units)
  return candidateUnits(part, units).filter((unit) => unit === current || fits(part, unit))
}

/**
 * The unit a part is shown in: the one the person picked, then the one its
 * serving is itself measured in ("1 tbsp (15 ml)" reads as tablespoons, as the
 * food page opens a measured serving), then grams, then the first that fits.
 * Null keeps the count.
 *
 * Chosen from every candidate rather than only those that fit, so a row never
 * jumps to another unit because its amount moved: 2 tbsp typed up to 25 stays
 * in tablespoons.
 */
export function partUnit(part: Part, units: Units | undefined): MeasureUnit | null {
  const options = candidateUnits(part, units)
  if (part.displayUnit && options.includes(part.displayUnit)) return part.displayUnit
  const lead = leadingAmount(part.servingLabel)?.unit
  if (lead && options.includes(lead)) return lead
  if (options.includes('g')) return 'g'
  return options.find((unit) => fits(part, unit)) ?? options[0] ?? null
}

/** What one of the part comes to in this unit's base, grams or millilitres. */
function perUnitIn(part: Part, unit: MeasureUnit): number | null {
  return MEASURES[unit].family === 'weight' ? perUnitGrams(part) : perUnitMl(part)
}

/** The part's amount in a unit, exactly, before any rounding for display. */
export function amountIn(part: Part, unit: MeasureUnit): number {
  const per = perUnitIn(part, unit) ?? 0
  return (part.quantity * per) / MEASURES[unit].size
}

/** The amount as it is worth showing: whole grams, spoons on their quarters. */
export const shownIn = (part: Part, unit: MeasureUnit) => roundedFor(unit, amountIn(part, unit))

/**
 * The quantity that reads as `amount` in this unit, which is what is written.
 * Clamped and rounded exactly as a typed weight is (`quantityForGrams`), so the
 * screen previews the row the server will store.
 */
export function quantityIn(part: Part, unit: MeasureUnit, amount: number): number | null {
  const per = perUnitIn(part, unit)
  if (per === null || !(per > 0)) return null
  return quantityForGrams(amount * MEASURES[unit].size, per)
}

/**
 * Where plus or minus takes a part read in a unit, on the unit's own marks:
 * grams by ten, spoons by a half, cups by a quarter. Null where there is
 * nowhere left to go, which the row shows as a disabled button. The quantity
 * floor is a quarter of one, as it always was, and the minus stops at it rather
 * than removing the part.
 */
export function stepIn(part: Part, unit: MeasureUnit, direction: 1 | -1): number | null {
  const { step, min, max } = stepFor(unit)
  // From the figure on screen, not the exact one: 2½ tbsp stored as a quantity
  // to four places reads back as 2.50003, which has no mark below it but 2½
  // itself, and the minus did nothing.
  const shown = shownIn(part, unit)
  if (direction < 0 && shown <= min + 1e-9) return null
  if (direction > 0 && shown >= max - 1e-9) return null
  const next = Math.min(max, Math.max(min, steppedTo(shown, step, direction)))
  const quantity = quantityIn(part, unit, next)
  if (quantity === null) return null
  // Clamped at both ends, so landing back where it started is the edge.
  if (quantity === part.quantity) return null
  if (direction < 0 && quantity > part.quantity) return null
  if (direction > 0 && quantity < part.quantity) return null
  return Math.max(PART_STEP, quantity)
}
