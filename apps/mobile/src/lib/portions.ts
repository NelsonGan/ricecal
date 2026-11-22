import { labelAmount, leadingAmount, type MeasureUnit, NUMBER, parseNumber } from './measures'
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

  return readsAsWord(cleaned) ? cleaned : null
}

/**
 * Whether a cleaned label is something a person would say. A leftover digit
 * or inch mark means it is still a measurement ("9-5 dia", "8 onz"), not a
 * unit anybody eats in.
 */
function readsAsWord(text: string): boolean {
  return Boolean(text) && !JUNK.has(text) && text.length <= 18 && !/[\d"']/.test(text)
}

/** The caller's translated ways of saying an amount. See `portionLabel`. */
export type PortionWords = {
  /** "½ serving", "2 servings": the app's own word, counted. */
  servings: (quantity: number) => string
  /** "150 g", "2 tbsp". */
  measured: (amount: number, unit: MeasureUnit) => string
}

/** Words that say "a portion" without saying of what. */
const GENERIC = new Set(['serving', 'servings', 'portion', 'portions'])

/**
 * Sizes, which say nothing on their own once the measurement in their bracket
 * is known: "Regular (350 ml)" is 350 ml, and half of it is 175 ml rather than
 * "0.5 × regular".
 */
const SIZES = new Set(['regular', 'tall', 'grande', 'venti', 'small', 'medium', 'large', 'whole'])

/**
 * The things a portion is counted in, singular and plural. Serving labels are
 * stored in English whatever the app is read in (see `aiLanguage` in common),
 * so this is about the data rather than the interface. Only these are
 * inflected: a word that is not here keeps a "×" rather than being guessed at,
 * which is how "bungkus" would have become "bunguses".
 */
const PLURALS: Record<string, string> = {
  apple: 'apples',
  bag: 'bags',
  ball: 'balls',
  banana: 'bananas',
  bar: 'bars',
  biscuit: 'biscuits',
  bottle: 'bottles',
  bowl: 'bowls',
  box: 'boxes',
  bun: 'buns',
  burger: 'burgers',
  cake: 'cakes',
  can: 'cans',
  carton: 'cartons',
  claypot: 'claypots',
  cob: 'cobs',
  cone: 'cones',
  cookie: 'cookies',
  cracker: 'crackers',
  cup: 'cups',
  donut: 'donuts',
  drumstick: 'drumsticks',
  dumpling: 'dumplings',
  egg: 'eggs',
  fillet: 'fillets',
  fruit: 'fruits',
  glass: 'glasses',
  handful: 'handfuls',
  jar: 'jars',
  leg: 'legs',
  mug: 'mugs',
  muffin: 'muffins',
  nugget: 'nuggets',
  pack: 'packs',
  packet: 'packets',
  patty: 'patties',
  piece: 'pieces',
  plate: 'plates',
  pot: 'pots',
  roll: 'rolls',
  sachet: 'sachets',
  sandwich: 'sandwiches',
  sausage: 'sausages',
  scoop: 'scoops',
  set: 'sets',
  skewer: 'skewers',
  slice: 'slices',
  stick: 'sticks',
  tablespoon: 'tablespoons',
  tart: 'tarts',
  teaspoon: 'teaspoons',
  thigh: 'thighs',
  tub: 'tubs',
  wing: 'wings',
  wrap: 'wraps',
}
const SINGULARS = Object.fromEntries(Object.entries(PLURALS).map(([one, many]) => [many, one]))

/** "whole egg" → "whole eggs" at more than one, or null for a word not listed. */
function inflect(noun: string, amount: number): string | null {
  const words = noun.split(' ')
  const last = words[words.length - 1]
  // `hasOwn`, as `unitOf` does: the word is whatever the import wrote, and
  // `PLURALS['constructor']` is a function.
  const one = Object.hasOwn(PLURALS, last)
    ? last
    : Object.hasOwn(SINGULARS, last)
      ? SINGULARS[last]
      : null
  if (!one) return null
  words[words.length - 1] = amount > 1 ? PLURALS[one] : one
  return words.join(' ')
}

/**
 * A label split into the count it leads with and the thing it counts: "2 eggs"
 * is two of "eggs", "Half" is no count of "half". The noun is null when what is
 * left is a measurement or import junk rather than a word, the same test
 * `servingUnit` makes.
 */
function countedNoun(raw: string): { count: number | null; noun: string | null } {
  const label = raw.trim().toLowerCase()
  // The number the measurement reader takes, so "1 1/2 slices" is one and a
  // half slices rather than one of "1/2 slices".
  const lead = label.match(LEADING_COUNT)
  const count = lead ? parseNumber(lead[1]) : null
  const noun = label
    .slice(lead ? lead[0].length : 0)
    .replace(/\([^)]*\)/g, ' ')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim()
  const usable = !JUNK.has(label) && readsAsWord(noun)
  return { count: count && Number.isFinite(count) ? count : null, noun: usable ? noun : null }
}
const LEADING_COUNT = new RegExp(String.raw`^${NUMBER}\s*`)

/**
 * How much of a dish a diary row was, the way a person would say it: "½ bowl",
 * "2 plates", "150 g", "4 eggs". Null for one plain serving, which is what
 * nearly every row is and so says nothing: "6:18 pm · serving" under a plate
 * that was simply eaten is a word the eye has to read and throw away.
 *
 * - A label that is a measurement reads as an amount of it, multiplied out:
 *   "100 g" at 1.5 is "150 g", "250 ml (250 ml)" is "250 ml".
 * - A portion or a size with a measurement in brackets reads as that
 *   measurement: "1 portion (100 g)" is "100 g", "Regular (350 ml)" is "350 ml".
 * - A thing is counted in quarters, without a "×" where the noun can agree
 *   with the number: "½ bowl", "1½ plates", and "2 eggs" at 2 is "4 eggs".
 * - A bare serving is counted in the caller's word: "½ serving", "2 servings".
 */
export function portionLabel(
  quantity: number,
  raw: string | null | undefined,
  words: PortionWords,
): string | null {
  const label = (raw ?? '').trim()
  const amountOf = (count: number) => roundHalfUp(count * quantity, 2)
  // A tenth of a gram is as fine as a diary row needs: a quarter of 125 g said
  // "31.25 g".
  const measured = ({ count, unit }: { count: number; unit: MeasureUnit }) =>
    words.measured(
      unit === 'g' || unit === 'ml' ? roundHalfUp(count * quantity, 1) : amountOf(count),
      unit,
    )

  const lead = leadingAmount(label)
  if (lead) return measured(lead)

  const { count, noun } = countedNoun(label)
  const brackets = label.match(/\([^)]*\)/g) ?? []
  let bracket: { count: number; unit: MeasureUnit } | null = null
  for (const part of brackets) {
    bracket = labelAmount(part)
    if (bracket) break
  }
  if (bracket && (!noun || GENERIC.has(noun) || SIZES.has(noun))) {
    return measured(bracket)
  }
  if (!noun) return quantity === 1 ? null : words.servings(quantity)
  // "2 servings" is two of them, so its count is multiplied as "2 eggs" is.
  if (GENERIC.has(noun)) {
    const servings = amountOf(count ?? 1)
    return servings === 1 ? null : words.servings(servings)
  }

  const times = formatPortion(quantity)
  if (count === null) {
    // "Plate" is one plate, so two of it are "2 plates" as "1 plate" is.
    const agreed = quantity === 1 ? null : inflect(noun, quantity)
    if (agreed) return `${times} ${agreed}`
    // "Half", "Large": no count to agree with, so the word stands as written.
    return quantity === 1 ? noun : `${times} × ${noun}`
  }
  if (count === 1) {
    const agreed = inflect(noun, quantity)
    if (agreed) return `${times} ${agreed}`
    // Under one, "½ bungkus" reads fine uninflected; over one it needs the ×.
    return quantity <= 1 ? `${times} ${noun}` : `${times} × ${noun}`
  }
  // "2 eggs", "6 inch sub": the count is part of the portion, so it is what
  // gets multiplied, and "2 slice" as the catalogue wrote it agrees as well.
  const total = amountOf(count)
  const agreed = inflect(noun, total)
  if (agreed) return `${formatPortion(total)} ${agreed}`
  return quantity === 1
    ? `${formatPortion(count)} ${noun}`
    : `${times} × ${formatPortion(count)} ${noun}`
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
