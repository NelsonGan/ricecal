import type { Units } from '@/data/types'

/**
 * Kitchen units: grams and millilitres, and the spoons, cups and ounces people
 * actually measure with.
 *
 * WEIGHT AND VOLUME ARE TWO FAMILIES, and crossing between them needs the food.
 * A cup of cooked rice is about 200 g, a cup of oil 218 g and a cup of cornflakes
 * 30 g, so "1 cup" means nothing until something has said what this food weighs
 * by the cup. The catalogue often has: a USDA row quotes "1 cup" or "1 tbsp" as a
 * portion, and that portion's factor against a base serving of known weight IS
 * the density. Where nothing says, the other family is simply not offered. An
 * honest "grams only" beats a confident wrong number, which is the reason the
 * scan pipeline does not read cups or spoons at all.
 *
 * Inside one family a conversion is arithmetic and is always offered: 15 ml is
 * a tablespoon of anything.
 *
 * US customary sizes, because that is what the catalogue's spoon and cup rows
 * were measured in. Converting a USDA "1 cup" with a 250 ml cup would put every
 * density derived from one 5% out.
 */
export type MeasureUnit = 'g' | 'kg' | 'oz' | 'lb' | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'floz'
export type MeasureFamily = 'weight' | 'volume'

/** Grams for a weight, millilitres for a volume: what one of the unit holds. */
export const MEASURES: Record<MeasureUnit, { family: MeasureFamily; size: number }> = {
  g: { family: 'weight', size: 1 },
  kg: { family: 'weight', size: 1000 },
  oz: { family: 'weight', size: 28.3495 },
  lb: { family: 'weight', size: 453.592 },
  ml: { family: 'volume', size: 1 },
  l: { family: 'volume', size: 1000 },
  tsp: { family: 'volume', size: 4.92892 },
  tbsp: { family: 'volume', size: 14.7868 },
  cup: { family: 'volume', size: 236.588 },
  floz: { family: 'volume', size: 29.5735 },
}

export const isMeasureUnit = (value: unknown): value is MeasureUnit =>
  typeof value === 'string' && Object.hasOwn(MEASURES, value)

/** The unit a family is stored in: `recipe_ingredients.unit`'s `g` and `ml`. */
export const BASE_UNIT = { weight: 'g', volume: 'ml' } as const

/**
 * Which units a picker offers, in order. The imperial ones are offered to the
 * people who chose imperial, and to nobody else: a row of eleven chips is a
 * row nobody reads, and grams and spoons are what this app's kitchens use.
 * Grams and millilitres stay on the imperial list, since a packet says them.
 */
export function unitsFor(units: Units | undefined, context: 'diary' | 'recipe'): MeasureUnit[] {
  const imperial = units === 'imperial'
  if (context === 'diary') {
    // No kilograms, litres or pounds: nobody eats a kilogram of anything, and
    // the stepper already moves grams by ten.
    return imperial
      ? ['oz', 'g', 'floz', 'ml', 'tsp', 'tbsp', 'cup']
      : ['g', 'ml', 'tsp', 'tbsp', 'cup']
  }
  return imperial
    ? ['oz', 'lb', 'g', 'kg', 'floz', 'ml', 'l', 'tsp', 'tbsp', 'cup']
    : ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup']
}

/**
 * Every spelling the catalogue writes a unit in. The odd ones came out of a
 * group-by over `food_serving.label`: `ONZ` is an ounce of weight and `OZA` a
 * fluid ounce, which is a volume, 29.6 ml against 28.3 g.
 */
const SPELLINGS: Record<string, MeasureUnit> = {
  g: 'g',
  gm: 'g',
  gr: 'g',
  grm: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  oz: 'oz',
  onz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  ml: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  tsp: 'tsp',
  tsps: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  tbs: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  cup: 'cup',
  cups: 'cup',
  oza: 'floz',
  floz: 'floz',
}

const NUMBER = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`
// "fl oz", "fl. oz", "fluid ounces" are one unit, so they are matched as one
// before the single word, or "fl oz" would read as a weight ounce.
const UNIT = String.raw`(fl\.?\s*oz|fluid\s+ounces?|[a-z]+)`

/** "1 1/2", "1/4", "2.5" as a number. */
function parseNumber(text: string): number {
  const parts = text.trim().split(/\s+/)
  return parts.reduce((sum, part) => {
    if (!part.includes('/')) return sum + Number(part)
    const [top, bottom] = part.split('/').map(Number)
    return sum + top / bottom
  }, 0)
}

function unitOf(word: string): MeasureUnit | null {
  const key = word.replace(/[.\s]/g, '').replace(/^fluidounces?$/, 'floz')
  // `hasOwn` rather than a bare index: the word is whatever the catalogue put in
  // the label, and `SPELLINGS['constructor']` is a function.
  return Object.hasOwn(SPELLINGS, key) ? SPELLINGS[key] : null
}

export type LabelAmount = { unit: MeasureUnit; count: number }

const BRACKETED = new RegExp(String.raw`\(\s*${NUMBER}\s*${UNIT}\s*\)`)
const LEADING = new RegExp(String.raw`^${NUMBER}\s*${UNIT}$`)
// A unit straight after the number and then anything, for the loose reading.
// Still anchored at the start: unanchored it found "1/2 lb" in the middle of a
// label and called it two pounds.
const LEADING_LOOSE = new RegExp(String.raw`^${NUMBER}\s*${UNIT}(?=$|[\s,(])`)

function amountFrom(match: RegExpMatchArray | null): LabelAmount | null {
  if (!match) return null
  const unit = unitOf(match[2])
  if (!unit) return null
  const count = parseNumber(match[1])
  return Number.isFinite(count) && count > 0 ? { unit, count } : null
}

/**
 * The measurement a serving label states, as the label says it: "2 Tbsp" is two
 * tablespoons, "1 bowl (400 g)" is 400 grams.
 *
 * A PARENTHESISED measurement wins over a leading one. "1 bowl (400 g)" leads
 * with a count of bowls and states the weight in the brackets, so reading left
 * to right gives one gram of soup.
 *
 * The leading form is anchored and needs a real unit straight after the number,
 * because unanchored it found the first number-then-word anywhere: "1 medium
 * paper (8-5/8 dia)" was one of something and "1/2 lb" was two pounds.
 */
export function labelAmount(label: string | null | undefined): LabelAmount | null {
  const text = (label ?? '').trim().toLowerCase()
  if (!text) return null
  return amountFrom(text.match(BRACKETED)) ?? amountFrom(text.match(LEADING))
}

/**
 * The measurement a label LEADS with, qualifiers and all: "1.0 cup, loosely
 * packed" is one cup. For the amount a picker opens at, never for a density.
 */
export function leadingAmount(label: string | null | undefined): LabelAmount | null {
  return amountFrom((label ?? '').trim().toLowerCase().match(LEADING_LOOSE))
}

/**
 * Everything a label measures, in grams and millilitres, for working out a
 * density. Looser than `labelAmount` on purpose: "1.0 cup, chopped" still says
 * how much one portion holds, and "2 tbsp (32 g)" says both halves of the
 * density in one label.
 */
export function labelQuantities(label: string | null | undefined): { g?: number; ml?: number } {
  const text = (label ?? '').trim().toLowerCase()
  const found: { g?: number; ml?: number } = {}
  for (const amount of [amountFrom(text.match(BRACKETED)), amountFrom(text.match(LEADING_LOOSE))]) {
    if (!amount) continue
    const { family, size } = MEASURES[amount.unit]
    const key = family === 'weight' ? 'g' : 'ml'
    found[key] ??= amount.count * size
  }
  return found
}

/**
 * What one base serving of a food weighs and holds, when anything says.
 *
 * Every portion is read and divided by its factor, the base included (its
 * factor is 1). The catalogue's own weight column wins over a weight read out
 * of a label. The portions are what make this worth doing: the base is often
 * "100 g" while the cup and the spoon sit beside it, and a "1 cup" portion at
 * factor 2.44 on a 100 g base says a cup weighs 244 g, which is milk's density
 * and exactly what the catalogue measured.
 *
 * Not `servingLabel`, which on a saved entry is the portion that was CHOSEN:
 * read as the base, an entry logged as "1 tbsp" of a 350 g plate would make the
 * whole plate a tablespoon.
 *
 * A base serving has to be a plausible portion, 3 g to 3 kg (the server's
 * `usableGrams` bounds): 5 kg is a sack of rice rather than a helping of it and
 * 0.4 g is a pinch of salt, and dividing by either makes a density out of the
 * catalogue's rounding. A density outside 0.05 to 3 g/ml is a portion
 * describing some other form of the food, or an import typo, and the volume is
 * dropped rather than trusted.
 */
export type FoodBasis = { grams?: number; ml?: number }

type Portion = { label: string; factor: number; grams?: number }

const sane = (value: number, low: number, high: number) =>
  Number.isFinite(value) && value >= low && value <= high

export function foodBasis(food: {
  servingGrams?: number
  servingMl?: number
  servings: readonly Portion[]
}): FoodBasis {
  const basis: FoodBasis = {}
  // Whether the weight came from a weight column rather than a label that says
  // grams. The catalogue and the scan count millilitres as grams in those
  // columns, so a drink's 350 there may be its 350 ml again. See below.
  let gramsFromColumn = false
  if (food.servingGrams !== undefined && sane(food.servingGrams, 3, 3000)) {
    basis.grams = food.servingGrams
    gramsFromColumn = true
  }
  // An entry's own record of its volume, kept because the label that said it
  // is gone once the entry moves to another portion.
  if (food.servingMl !== undefined && sane(food.servingMl, 3, 3000)) {
    basis.ml = food.servingMl
  }

  // The base first, so a portion only fills in what the base did not say.
  const portions = [...food.servings].sort(
    (a, b) => Number(b.factor === 1) - Number(a.factor === 1),
  )
  for (const portion of portions) {
    if (!(portion.factor > 0)) continue
    const stated = labelQuantities(portion.label)
    const grams = portion.grams ?? stated.g
    if (basis.grams === undefined && grams !== undefined && sane(grams / portion.factor, 3, 3000)) {
      basis.grams = grams / portion.factor
      gramsFromColumn = portion.grams !== undefined
    }
    // Under 2 ml is a pinch, and dividing by a pinch makes a density out of the
    // catalogue's rounding.
    const ml = stated.ml
    if (
      basis.ml === undefined &&
      ml !== undefined &&
      ml >= 2 &&
      sane(ml / portion.factor, 3, 3000)
    ) {
      basis.ml = ml / portion.factor
    }
  }

  // A weight column equal to the volume is the volume read as grams, not a
  // measured density of exactly 1: it would offer grams for a drink and price
  // a spoon of oil as water. Grams are dropped unless a label actually said
  // them. Water loses a gram option it barely needed.
  if (
    gramsFromColumn &&
    basis.grams !== undefined &&
    basis.ml !== undefined &&
    Math.abs(basis.grams / basis.ml - 1) < 0.005
  ) {
    delete basis.grams
  }

  if (
    basis.grams !== undefined &&
    basis.ml !== undefined &&
    !sane(basis.grams / basis.ml, 0.05, 3)
  ) {
    delete basis.ml
  }
  return basis
}

/** What one of `unit` costs in base servings of a food, or null where nothing says. */
export function unitFactor(unit: MeasureUnit, basis: FoodBasis): number | null {
  const { family, size } = MEASURES[unit]
  const per = family === 'weight' ? basis.grams : basis.ml
  return per ? size / per : null
}

// ---------------------------------------------------------------------------
// A measure as a diary portion.
// ---------------------------------------------------------------------------

/**
 * The prefix on a portion this app made out of a unit rather than read out of
 * the catalogue. It is written to `food_logs.serving_id`, which is soft text, so
 * a reopened entry knows which chip it was.
 */
export const MEASURE_ID = 'measure:'

/**
 * How many of a unit one portion of it counts, and the label that says so.
 *
 * Grams and millilitres go by the hundred because `food_logs.serving_factor` is
 * `numeric(6, 3)`: a one-gram portion of a 300 g plate is 0.00333, which the
 * column rounds to 0.003, and every gram logged would be a tenth light. A
 * hundred grams is 0.333 and the quantity's two decimals carry the single
 * grams. Everything else is one of itself, which reads as itself: "1 tbsp".
 *
 * The labels are canonical English because they are data, like every other
 * serving label. The screens translate them through `measureOf`.
 */
const BLOCK: Partial<Record<MeasureUnit, number>> = { g: 100, ml: 100 }
const SYMBOL: Record<MeasureUnit, string> = {
  g: 'g',
  kg: 'kg',
  oz: 'oz',
  lb: 'lb',
  ml: 'ml',
  l: 'l',
  tsp: 'tsp',
  tbsp: 'tbsp',
  cup: 'cup',
  floz: 'fl oz',
}

export const blockOf = (unit: MeasureUnit) => BLOCK[unit] ?? 1

export const measureLabel = (unit: MeasureUnit) => `${blockOf(unit)} ${SYMBOL[unit]}`

/**
 * The unit a portion label is, when it is nothing but one of them: "100 g",
 * "1 tbsp", "1.0 cup". Then the quantity beside it is an amount of that unit
 * rather than a count of portions, and the screens say "150 g" instead of
 * "1.5 × 100 g". A catalogue row's own "100 g" reads the same way, which is the
 * point: a per-100 g food is weighed in grams.
 *
 * "2 tbsp (32 g)" is not one: it is a portion that happens to be two spoons.
 */
export function measureOf(
  label: string | null | undefined,
): { unit: MeasureUnit; block: number } | null {
  const text = (label ?? '').trim().toLowerCase()
  const match = text.match(/^(\d+(?:\.0+)?)\s*(g|ml|oz|fl oz|tsp|tbsp|cup)$/)
  if (!match) return null
  const unit = unitOf(match[2])
  if (!unit) return null
  return Number(match[1]) === blockOf(unit) ? { unit, block: blockOf(unit) } : null
}

/** The column's precision, so a factor compares equal to the one read back. */
const round3 = (value: number) => Math.round(value * 1000) / 1000

/**
 * The portions a food can be measured in, beside the ones the catalogue lists.
 *
 * A unit the catalogue already lists as a bare measure ("100 g", "1 cup") is
 * not added twice: its own row is kept, factor and id and all, so an entry that
 * was logged against it still finds it.
 */
export function measurePortions<T extends { id: string; label: string; factor: number }>(
  servings: readonly T[],
  basis: FoodBasis,
): Array<{ id: string; label: string; factor: number }> {
  const listed = new Set(
    servings.flatMap((s) => {
      const measure = measureOf(s.label)
      return measure ? [measure.unit] : []
    }),
  )
  const ids = new Set(servings.map((s) => s.id))

  return (Object.keys(MEASURES) as MeasureUnit[]).flatMap((unit) => {
    if (listed.has(unit) || ids.has(`${MEASURE_ID}${unit}`)) return []
    // Only the units a diary portion can be. Kilograms, litres and pounds are
    // recipe amounts.
    if (unit === 'kg' || unit === 'l' || unit === 'lb') return []
    const one = unitFactor(unit, basis)
    if (one === null) return []
    const exact = one * blockOf(unit)
    const factor = round3(exact)
    // `numeric(6, 3)`: over 999 will not store, and a factor the column would
    // round by more than 2% is a unit that would log the wrong calories. A
    // teaspoon of a 2 L bottle is 0.00246 of it, stored as 0.002, 19% light.
    // That unit is not offered; the bottle still has millilitres and cups.
    if (factor < 0.001 || factor > 999 || Math.abs(factor - exact) > exact * 0.02) return []
    return [{ id: `${MEASURE_ID}${unit}`, label: measureLabel(unit), factor }]
  })
}

// ---------------------------------------------------------------------------
// Amounts on screen.
// ---------------------------------------------------------------------------

/**
 * How a stepper moves in each unit. Grams by ten, as a plate's parts do; spoons
 * by halves and cups by quarters, as a measuring set does. The ceilings keep
 * `food_logs.quantity` inside its check of 100.
 */
export function stepFor(unit: MeasureUnit): { step: number; min: number; max: number } {
  // Every ceiling keeps a diary quantity at 20 or under. The column takes 100,
  // but every build already in a store steps a portion between a quarter and
  // twenty and clamps to that on its first tap: an entry of 30 tbsp opened on
  // one would be cut to 20 the moment its minus was pressed. 20 of "100 g" is
  // 2 kg, more than anybody eats of one food.
  switch (unit) {
    case 'g':
    case 'ml':
      return { step: 10, min: 1, max: 2000 }
    case 'kg':
    case 'l':
      return { step: 0.1, min: 0.01, max: 20 }
    case 'cup':
    case 'lb':
      return { step: 0.25, min: 0.25, max: 20 }
    default:
      return { step: 0.5, min: 0.25, max: 20 }
  }
}

/**
 * An amount as it is worth showing in a unit. Grams and millilitres are whole,
 * spoons and cups land on a quarter when one is near enough (what a measuring
 * set has), and the large units keep two decimals.
 *
 * Only for an amount the app CONVERTED, never for one somebody typed: typing
 * 1.3 cups must leave 1.3 cups.
 */
export function roundedFor(unit: MeasureUnit, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  switch (unit) {
    case 'g':
    case 'ml':
      // Whole from 50 up, where a gram is under 2% of the amount. Below it a
      // whole gram is too coarse: 10.5 g rounded to 11 is 5% more food.
      return amount >= 50 ? Math.round(amount) : Math.round(amount * 10) / 10
    case 'kg':
    case 'l':
      return Math.round(amount * 100) / 100
    default: {
      // A quarter when one is within 2%, which is closer than anybody fills a
      // measuring cup. Otherwise the exact figure: snapping 0.6 cup to a half
      // would take a sixth off what was eaten just for changing the unit.
      const quarter = Math.round(amount * 4) / 4
      return quarter > 0 && Math.abs(quarter - amount) <= amount * 0.02
        ? quarter
        : Math.round(amount * 100) / 100
    }
  }
}

/**
 * Where a tap of plus or minus lands, on the unit's own grid. A converted
 * amount is usually off it: 100 g of milk is 0.41 cup, and adding a quarter
 * from there gave 0.66, 0.91, 1.16, none of them on a measuring cup. The first
 * tap now lands on the next mark (0.5) and the rest follow the marks.
 */
export function steppedTo(current: number, step: number, direction: 1 | -1): number {
  const marks = current / step
  const onGrid = Math.abs(marks - Math.round(marks)) < 1e-6
  const next = onGrid
    ? Math.round(marks) + direction
    : direction > 0
      ? Math.ceil(marks)
      : Math.floor(marks)
  return Math.round(next * step * 10000) / 10000
}

/** An amount in one unit, said in another of the same family. */
export function convert(amount: number, from: MeasureUnit, to: MeasureUnit): number {
  return (amount * MEASURES[from].size) / MEASURES[to].size
}

/** "2", "1.5", "0.33": a figure for a measured amount, without float noise. */
export function amountText(amount: number): string {
  return String(Number(amount.toFixed(2)))
}
