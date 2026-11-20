import { leadingAmount, type MeasureUnit, measureOf } from './measures'
import { roundHalfUp } from './nutrition'

/**
 * Serving labels, made fit to read. An imported label is written for a database
 * row rather than a person: "1 medium paper (8-5/8" dia)", "383 GRM", "Quantity
 * not specified". Rendered as they are, a user sees `2 × 1 medium paper 9-5 dia`
 * on their lunch.
 *
 * So a label earns its place: the count comes off, since the quantity beside it
 * says how many, along with the parenthetical measurements and the trailing
 * qualifiers, and what is left has to look like something a person would say.
 * Anything else is dropped and the caller falls back to the plain word.
 */

/** Unit codes from the import that mean nothing outside a spreadsheet. */
const JUNK = new Set([
  'grm',
  'gm',
  'gms',
  'onz',
  'ozs',
  'wgt',
  'ea',
  'unit',
  'units',
  'none',
  'quantity not specified',
  'not specified',
])

/**
 * Units where the number in front is the MEASUREMENT, not a count.
 *
 * "1 plate" is one of a thing and the quantity beside it already says how many,
 * so the count comes off. "100 g" is not one hundred of anything — the number
 * IS the portion, and stripping it leaves "g", which is what a diary row was
 * showing under a jar of Marmite.
 *
 * The distinction only became load-bearing when the catalogue grew: a per-100g
 * label is how most of a composition table and nearly all of the barcode layer
 * quote themselves, where the curated local dishes say "1 bungkus".
 */
const BARE_MEASURES = new Set(['g', 'kg', 'mg', 'ml', 'l', 'oz', 'fl oz', 'cl', 'lb'])

/** Units whose count is part of what a portion is: two spoons, half a cup. */
const KITCHEN = new Set<MeasureUnit>(['tsp', 'tbsp', 'cup', 'floz'])

export function servingUnit(raw: string | null | undefined): string | null {
  const label = (raw ?? '').trim().toLowerCase()
  if (!label || JUNK.has(label)) return null
  // "1 serving" is the app's own word, written in English as data by a recipe,
  // a scan and an entry's base portion. Null hands it to the caller's
  // translated word, so a Japanese diary does not say "serving".
  if (/^(1\s+)?servings?$/.test(label)) return null

  // A bare measurement keeps its number and is used as written. Checked before
  // the cleaning below, because every rule down there is about a counted
  // portion and each one damages this shape.
  const measured = label.match(/^([\d.]+)\s*([a-z ]+)$/)
  if (measured && BARE_MEASURES.has(measured[2].trim())) {
    return `${measured[1]} ${measured[2].trim()}`
  }

  // "2 tbsp (32 g)" is a portion of two spoons, and stripped of its count it
  // read "tbsp" beside a stepper saying 1: one spoon, to anybody reading it,
  // and half what was logged. A spoon or cup count stays when it is not one.
  const lead = leadingAmount(label)
  if (lead && lead.count !== 1 && KITCHEN.has(lead.unit)) {
    const counted = label.split(/[(,]/)[0].trim()
    if (counted.length <= 18) return counted
  }

  const cleaned = label
    // "(8-5/8" dia)", "(includes foods for USDA's ...)" — measurement detail.
    .replace(/\([^)]*\)/g, ' ')
    // "1.0 cup, loosely packed" — everything after the comma is preparation.
    .split(',')[0]
    // "1 plate", "0.5 box", "10 PIECES": the count belongs to `quantity`.
    .replace(/^[\d./]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()

  // A leftover digit or inch mark means what remains is still a measurement
  // ("9-5 dia", "8 onz"), not a unit anybody eats in.
  if (!cleaned || JUNK.has(cleaned) || cleaned.length > 18 || /[\d"']/.test(cleaned)) return null
  return cleaned
}

/**
 * "2 × plate", "plate". The multiplier is dropped at one, where it says
 * nothing, and the label falls back to the caller's word for a portion.
 *
 * A portion that is a unit ("100 g", "1 tbsp") is an AMOUNT rather than a count
 * of portions, and reads as one: "150 g", "2 tbsp", where it used to say
 * "1.5 × 100 g". `measured` is the caller's translated way of saying it; without
 * one the label is used as written.
 */
export function portionLabel(
  quantity: number,
  raw: string | null | undefined,
  fallback: string,
  measured?: (amount: number, unit: MeasureUnit) => string,
) {
  const measure = measured ? measureOf(raw) : null
  if (measure && measured) return measured(roundHalfUp(quantity * measure.block, 2), measure.unit)
  const unit = servingUnit(raw) ?? fallback
  return quantity === 1 ? unit : `${quantity} × ${unit}`
}

/**
 * How much of its own dish an entry amounts to, with the share of the plate that
 * was eaten folded in. It is what the row reads as, and what logging it again
 * copies: half a plate yesterday is half a plate today, not a whole one.
 *
 * `plateQuantity` is 1 wherever there is no plate, so this is `quantity` for
 * every entry nobody has halved. Rounded to what `food_logs.quantity` stores,
 * which also keeps `0.1 × 3` from printing as 0.30000000000000004, and kept
 * inside the column's check.
 */
export function eatenQuantity(entry: { quantity: number; plateQuantity?: number }) {
  const eaten = roundHalfUp(entry.quantity * (entry.plateQuantity ?? 1), 2)
  return Math.min(100, Math.max(0.01, eaten))
}

/**
 * "boiled egg" → "Boiled Egg".
 *
 * Ingredient names come from a vision model writing lower-case notes to
 * itself, and they end up as list items next to catalogue names that are
 * capitalised — so a plate read as "Boiled Egg, white rice, sambal", three
 * things of the same kind typeset as if they were not. Words that are already
 * capitalised or all-caps are left alone, so "Nasi Lemak" and "KFC" survive.
 */
export function titleCase(value: string): string {
  return value.replace(/\b[a-z][a-z']*/g, (word) => word[0].toUpperCase() + word.slice(1))
}

const VULGAR: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' }

/**
 * Renders 1.5 as "1½".
 *
 * The design system leads with everyday serving units — half a plate, one and a
 * half bowls — and "1.5 plates" reads like a spreadsheet. Falls back to a plain
 * number for anything that is not a clean quarter.
 *
 * Here rather than in `Stepper`, which is where it was written, because a
 * scanned plate now says the same kind of quantity in front of every part it
 * broke into — see `PartLine`. Two renderings of "1¼" free to drift apart is the
 * thing the portion stepper's own comment argues against.
 */
export function formatPortion(value: number) {
  const whole = Math.floor(value)
  const glyph = VULGAR[(value - whole).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')]
  if (!glyph) return String(Number(value.toFixed(2)))
  return whole === 0 ? glyph : `${whole}${glyph}`
}
