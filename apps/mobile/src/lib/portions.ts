/**
 * Serving labels, made fit to read.
 *
 * The catalogue is imported, and an imported serving label is written for a
 * database row rather than for a person: "1 medium paper (8-5/8" dia)", "383
 * GRM", "1.0 cup, loosely packed", "Quantity not specified". Rendered as-is
 * next to a portion these read as gibberish — a user seeing `2 × 1 medium
 * paper 9-5 dia` on their lunch has no idea what the app is claiming.
 *
 * So a label earns its place: the count comes off (the quantity beside it
 * already says how many), the parenthetical measurements and the trailing
 * qualifiers come off, and what is left has to look like something a person
 * would say. Anything else is dropped, and the caller falls back to the plain
 * word for a portion. Dropping a label costs nothing — the calories next to it
 * are what the row is actually for.
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
const MEASURES = new Set(['g', 'kg', 'mg', 'ml', 'l', 'oz', 'fl oz', 'cl', 'lb'])

export function servingUnit(raw: string | null | undefined): string | null {
  const label = (raw ?? '').trim().toLowerCase()
  if (!label || JUNK.has(label)) return null

  // A bare measurement keeps its number and is used as written. Checked before
  // the cleaning below, because every rule down there is about a counted
  // portion and each one damages this shape.
  const measured = label.match(/^([\d.]+)\s*([a-z ]+)$/)
  if (measured && MEASURES.has(measured[2].trim())) {
    return `${measured[1]} ${measured[2].trim()}`
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
 */
export function portionLabel(quantity: number, raw: string | null | undefined, fallback: string) {
  const unit = servingUnit(raw) ?? fallback
  return quantity === 1 ? unit : `${quantity} × ${unit}`
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
