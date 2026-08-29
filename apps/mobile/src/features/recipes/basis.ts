import type { Food, Macros, RecipeUnit } from '@/data'

/**
 * A catalogue dish, as an ingredient you can weigh.
 *
 * The catalogue quotes its macros per base serving and a recipe needs them per
 * gram, millilitre or piece. The only bridge available is the serving's own
 * label, because that is where the catalogue writes the weight down.
 *
 * Grams rather than counting servings, because a recipe is written in kitchen
 * amounts: "4 × 100 g" is arithmetic the cook does at the till, and a serving
 * label nobody reads multiplied by a number nobody chose is a calorie figure
 * with no way to check it. A weight can be checked against a scale.
 *
 * Most curated local rows are portions rather than measurements, with nothing to
 * divide by, and fall back to `piece`, where one piece is one base serving. That
 * is a different unit rather than a worse answer.
 */

/** How the picker starts an ingredient off, once a dish has been chosen. */
export type IngredientBasis = {
  unit: RecipeUnit
  /** Macros for ONE unit — one gram, one millilitre, one of the thing. */
  perUnit: Macros
  /** What to prefill the amount with: the serving the macros were quoted for. */
  amount: number
}

/**
 * What one of each unit is worth, and which of the two families it belongs to.
 *
 * The same table as `servingGrams` in `functions/_shared/portion.ts`, duplicated
 * rather than shared because the edge functions are Deno and outside the pnpm
 * workspace, so a unit added there has to be added here. The spellings came out
 * of a group-by over `food_servings.label`, which is why `ONZ` and `OZA` are in
 * the list and `millilitre` is not.
 *
 * `oza` is a fluid ounce and `onz` an ounce by weight: 29.6 ml against 28.3 g.
 */
const UNITS: Record<string, { unit: RecipeUnit; scale: number }> = {
  g: { unit: 'g', scale: 1 },
  gm: { unit: 'g', scale: 1 },
  gr: { unit: 'g', scale: 1 },
  grm: { unit: 'g', scale: 1 },
  gram: { unit: 'g', scale: 1 },
  grams: { unit: 'g', scale: 1 },
  kg: { unit: 'g', scale: 1000 },
  oz: { unit: 'g', scale: 28.35 },
  onz: { unit: 'g', scale: 28.35 },
  ounce: { unit: 'g', scale: 28.35 },
  ounces: { unit: 'g', scale: 28.35 },
  lb: { unit: 'g', scale: 453.6 },
  lbs: { unit: 'g', scale: 453.6 },
  pound: { unit: 'g', scale: 453.6 },
  pounds: { unit: 'g', scale: 453.6 },

  ml: { unit: 'ml', scale: 1 },
  l: { unit: 'ml', scale: 1000 },
  litre: { unit: 'ml', scale: 1000 },
  liter: { unit: 'ml', scale: 1000 },
  oza: { unit: 'ml', scale: 29.57 },
}

/** Only the units a bracketed weight is ever written in. */
const BRACKETED = /\(\s*(\d+(?:\.\d+)?)\s*(g|gm|gr|grm|gram|grams|kg|ml|l)\s*\)/

/**
 * A count and a unit and NOTHING ELSE. Anchored on purpose: unanchored it finds
 * the first number-then-word anywhere in the string, which reads "1 medium
 * paper (8-5/8 dia)" as one of something and "1/2 lb" as TWO POUNDS — four
 * times the real weight, silently, in somebody's recipe.
 */
const LEADING = /^\s*(\d+(?:\.\d+)?|\d+\/\d+)\s*(fl\s+)?([a-z]+)\s*$/

/**
 * A weight has to be a plausible serving to be worth dividing by. 3 kg is a
 * sack of rice rather than a portion of it and 0.4 g is a pinch of salt — both
 * are real rows, and either one produces a density that the rest of the recipe
 * then treats as fact. Same bounds as the server's `usableGrams`.
 */
const usable = (amount: number): number | null =>
  Number.isFinite(amount) && amount >= 3 && amount <= 3000 ? Math.round(amount * 10) / 10 : null

/**
 * The measurement inside a serving label, if it has one.
 *
 * A PARENTHESISED measurement wins over a leading one, and that is the whole
 * subtlety here: "1 bowl (400 g)" leads with a count of bowls and states the
 * weight in the brackets, so reading left to right gives 1 gram of soup. The
 * bracket is where the catalogue puts the answer whenever the label also has a
 * portion word in it.
 */
function measurementIn(label: string): { unit: RecipeUnit; amount: number } | null {
  const text = (label ?? '').trim().toLowerCase()
  if (!text) return null

  const bracketed = text.match(BRACKETED)
  if (bracketed) {
    const found = UNITS[bracketed[2]]
    const amount = usable(Number(bracketed[1]) * found.scale)
    return amount === null ? null : { unit: found.unit, amount }
  }

  const lead = text.match(LEADING)
  if (!lead) return null

  // "1.0 fl oz" is a fluid ounce however the rest of it is spelled.
  const key = lead[2] ? 'oza' : lead[3]
  // `hasOwn` rather than a bare index: the unit is whatever text the catalogue
  // put in the label, and `UNITS['constructor']` is a function — truthy, and
  // not a scale. Indexing it would put NaN through every macro on the row.
  if (!Object.hasOwn(UNITS, key)) return null
  const found = UNITS[key]

  const count = lead[1].includes('/')
    ? Number(lead[1].split('/')[0]) / Number(lead[1].split('/')[1])
    : Number(lead[1])

  const amount = usable(count * found.scale)
  return amount === null ? null : { unit: found.unit, amount }
}

/** Four decimals, matching the column. Enough for a gram of anything. */
const per = (total: number, amount: number) => Math.round((total / amount) * 10000) / 10000

export function ingredientBasis(food: Food): IngredientBasis {
  const measurement = measurementIn(food.servingLabel)

  if (!measurement) {
    return { unit: 'piece', perUnit: food.macros, amount: 1 }
  }

  const { unit, amount } = measurement
  return {
    unit,
    perUnit: {
      kcal: per(food.macros.kcal, amount),
      carbs: per(food.macros.carbs, amount),
      protein: per(food.macros.protein, amount),
      fat: per(food.macros.fat, amount),
    },
    // Prefilled with the serving the catalogue quoted, so the row the user
    // tapped and the row that lands in the pot say the same number.
    amount,
  }
}

/** `perUnit` × `amount`, rounded the way the database rounds it. */
export function ingredientTotal(perUnit: Macros, amount: number): Macros {
  return {
    kcal: Math.round(perUnit.kcal * amount),
    carbs: Math.round(perUnit.carbs * amount * 10) / 10,
    protein: Math.round(perUnit.protein * amount * 10) / 10,
    fat: Math.round(perUnit.fat * amount * 10) / 10,
  }
}

/**
 * The pot, and one serving of it, from a staged ingredient list.
 *
 * SUMMED RAW AND ROUNDED ONCE, which is not how it reads and is the whole
 * reason this has a comment. Rounding each line first and adding the rounded
 * figures drifts by up to half a unit per ingredient — and `recipe_details`
 * sums the raw products, so a form that rounded per line would preview a total
 * a few calories away from the one Save commits. The per-line figures are still
 * rounded for DISPLAY, by `ingredientTotal`; they are just not what this adds.
 */
export function potTotals(
  ingredients: readonly { perUnit: Macros; amount: number }[],
  servings: number,
): { total: Macros; perServing: Macros } {
  const total = ingredients.reduce<Macros>(
    (sum, item) => ({
      kcal: sum.kcal + item.perUnit.kcal * item.amount,
      carbs: sum.carbs + item.perUnit.carbs * item.amount,
      protein: sum.protein + item.perUnit.protein * item.amount,
      fat: sum.fat + item.perUnit.fat * item.amount,
    }),
    { kcal: 0, carbs: 0, protein: 0, fat: 0 },
  )

  const divisor = Math.max(servings, 1)
  return {
    total: {
      kcal: Math.round(total.kcal),
      carbs: Math.round(total.carbs * 10) / 10,
      protein: Math.round(total.protein * 10) / 10,
      fat: Math.round(total.fat * 10) / 10,
    },
    perServing: {
      kcal: Math.round(total.kcal / divisor),
      carbs: Math.round((total.carbs / divisor) * 10) / 10,
      protein: Math.round((total.protein / divisor) * 10) / 10,
      fat: Math.round((total.fat / divisor) * 10) / 10,
    },
  }
}
