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

export function servingUnit(raw: string | null | undefined): string | null {
  const label = (raw ?? '').trim().toLowerCase()
  if (!label || JUNK.has(label)) return null

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
