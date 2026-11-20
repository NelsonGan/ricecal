import type { Food, Macros, RecipeUnit, Units } from '@/data'
import {
  BASE_UNIT,
  foodBasis,
  labelAmount,
  leadingAmount,
  MEASURES,
  type MeasureUnit,
  roundedFor,
  unitFactor,
  unitsFor,
} from '@/lib/measures'

/**
 * A catalogue dish, as an ingredient you can measure.
 *
 * The catalogue quotes its macros per base serving and a recipe needs them per
 * gram, millilitre or piece. The bridge is what the catalogue says a serving
 * weighs or holds: its weight column, its label, and the spoon and cup portions
 * beside it (`foodBasis`).
 *
 * Kitchen amounts rather than counting servings, because a recipe is written
 * in them: "4 × 100 g" is arithmetic the cook does at the till, and a serving
 * label nobody reads multiplied by a number nobody chose is a calorie figure
 * with no way to check it. A weight or a spoon can be checked.
 *
 * Most curated local rows are portions with a weight beside them ("1 plate",
 * 300 g) and offer pieces and grams. A row with neither falls back to `piece`,
 * where one piece is one base serving. That is a different unit rather than a
 * worse answer.
 */

/** A unit a picker offers: a kitchen unit, or a count of the catalogue's portion. */
export type IngredientKey = MeasureUnit | 'piece'

export type IngredientChoice = {
  key: IngredientKey
  /** The family it is stored in. A spoon is stored in ml, an ounce in grams. */
  unit: RecipeUnit
  /** Per one STORED unit: one gram, one millilitre, one piece. */
  perUnit: Macros
  /** How many of the dish's base servings one of this unit is, for converting. */
  servings: number
}

/** What one of a choice holds in its stored unit: 14.79 ml for a tablespoon. */
export const sizeOf = (key: IngredientKey) => (key === 'piece' ? 1 : MEASURES[key].size)

/** A unit's family as the column spells it. */
export const storedUnit = (key: IngredientKey): RecipeUnit =>
  key === 'piece' ? 'piece' : BASE_UNIT[MEASURES[key].family]

/**
 * The display unit a row is written with: none for the stored units themselves
 * (g, ml, pieces), so a row moved back to grams is exactly what a build that
 * predates display units writes. The one rule, used by every writer.
 */
export const displayUnitFor = (key: IngredientKey): MeasureUnit | undefined =>
  key === 'piece' || key === 'g' || key === 'ml' ? undefined : key

/** The unit a stored row reads in, given its display unit. */
export const keyOf = (unit: RecipeUnit, displayUnit?: MeasureUnit): IngredientKey =>
  displayUnit ?? unit

/** The amount as the cook reads it, from the amount as it is stored. */
export const shownAmount = (amount: number, key: IngredientKey) =>
  Math.round((amount / sizeOf(key)) * 100) / 100

/** The amount to store, from the amount as the cook typed it. */
export const storedFrom = (shown: number, key: IngredientKey) =>
  Math.round(shown * sizeOf(key) * 100) / 100

/** The units a stored row can be shown in without repricing it: its own family. */
export function sameFamily(key: IngredientKey, units: Units | undefined): IngredientKey[] {
  if (key === 'piece') return ['piece']
  const family = MEASURES[key].family
  const offered = unitsFor(units, 'recipe').filter((unit) => MEASURES[unit].family === family)
  return offered.includes(key) ? offered : [...offered, key]
}

/**
 * Every unit a catalogue dish can go into a pot in, and the amount the picker
 * opens at.
 *
 * Weights wherever something says what a serving weighs, and spoons, cups and
 * millilitres wherever something says how much one holds: see `foodBasis`,
 * which is also why a dish with neither offers only pieces. The density is
 * baked into the per-unit figures here, once, because that is the only moment
 * the food is in hand: two tablespoons of peanut butter are stored as 29.57 ml
 * at peanut butter's calories per millilitre, and the row never needs the food
 * again.
 *
 * Pieces are offered when the base serving is a thing ("1 plate", "1 bowl
 * (400 g)") rather than a bare measure, since "2 × 100 g" is not a count anyone
 * keeps.
 *
 * The picker opens on the measure the catalogue quoted, in the cook's own unit
 * where the label is in one ("3 oz" to somebody on imperial, "2 tbsp"), so the
 * calories on the row they tapped are the calories they see.
 */
export function ingredientOptions(
  food: Food,
  units: Units | undefined,
): { choices: IngredientChoice[]; initial: { key: IngredientKey; amount: number } } {
  // A catalogue food, so `servingLabel` IS the base serving's (unlike an entry's,
  // which is the portion chosen). Read as one when the list does not carry it.
  const hasBase = food.servings.some((s) => s.factor === 1)
  const basis = foodBasis({
    servingGrams: food.servingGrams,
    servings: hasBase ? food.servings : [{ label: food.servingLabel, factor: 1 }, ...food.servings],
  })
  const per = (amount: number): Macros => ({
    kcal: Math.round((food.macros.kcal / amount) * 10000) / 10000,
    carbs: Math.round((food.macros.carbs / amount) * 10000) / 10000,
    protein: Math.round((food.macros.protein / amount) * 10000) / 10000,
    fat: Math.round((food.macros.fat / amount) * 10000) / 10000,
  })

  const choices: IngredientChoice[] = []
  for (const key of unitsFor(units, 'recipe')) {
    const amount = MEASURES[key].family === 'weight' ? basis.grams : basis.ml
    if (amount) {
      choices.push({
        key,
        unit: storedUnit(key),
        perUnit: per(amount),
        servings: unitFactor(key, basis) ?? MEASURES[key].size / amount,
      })
    }
  }
  // The measure the label LEADS with is how the cook thinks of it: "2 tbsp
  // (32 g)" is two tablespoons, and "1.0 cup, loosely packed" one cup. A
  // bracketed weight answers otherwise ("1 bowl (400 g)" is 400 g), and a label
  // with no measure at all is a thing to count.
  const leading = leadingAmount(food.servingLabel)
  const stated = leading ?? labelAmount(food.servingLabel)
  const isThing = !leading && (!stated || /\(/.test(food.servingLabel))
  if (isThing || choices.length === 0) {
    choices.push({ key: 'piece', unit: 'piece', perUnit: food.macros, servings: 1 })
  }

  // The unit the picker opens in: the label's own when it is one we offer
  // ("2 tbsp", "1 bowl (400 g)"), else its family's everyday unit (an ounce on a
  // metric phone opens in grams), else a piece.
  const offered = (key: IngredientKey) => choices.find((c) => c.key === key)
  const opening =
    (stated && offered(stated.unit)) ||
    (stated && !isThing && offered(BASE_UNIT[MEASURES[stated.unit].family])) ||
    offered('piece')
  if (!opening) {
    // A label in a unit nothing can price (a cup whose density was dropped)
    // and no piece offered: one piece is the whole serving, which is the row
    // the user tapped, where opening on the first unit put "1 g" in the field.
    const piece: IngredientChoice = {
      key: 'piece',
      unit: 'piece',
      perUnit: food.macros,
      servings: 1,
    }
    return { choices: [...choices, piece], initial: { key: 'piece', amount: 1 } }
  }
  // At exactly one base serving, in that unit, so the calories in the sheet are
  // the calories on the row the user tapped. Read off the label's own number,
  // "1 bowl (400 g)" over a weight column of 350 g would price 400 g at 2 kcal
  // a gram: 800 for a bowl listed at 700.
  return {
    choices,
    initial: {
      key: opening.key,
      amount: roundedFor(opening.key === 'piece' ? 'cup' : opening.key, 1 / opening.servings),
    },
  }
}

/**
 * The same amount of the food in another unit, for a picker that changed unit
 * after something was typed: 400 g of milk is 1.64 cups, not 400 of them.
 * Rounded to what the new unit is worth showing.
 */
export function convertIngredient(
  amount: number,
  from: Pick<IngredientChoice, 'key' | 'servings'>,
  to: Pick<IngredientChoice, 'key' | 'servings'>,
): number {
  const raw = (amount * from.servings) / to.servings
  // A piece lands on quarters like a spoon does: "1½ pieces".
  return roundedFor(to.key === 'piece' ? 'cup' : to.key, raw)
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
