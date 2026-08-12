/**
 * What an entry has to carry about the food it is.
 *
 * An entry used to be a foreign key and a quantity: `food_id`, `serving_id`,
 * and every calorie derived at read time by joining the catalogue. The
 * catalogue is in Cloudflare D1 now — see `functions/_shared/catalogue.ts` for
 * why — and a foreign key cannot cross into another database, so the numbers
 * travel with the entry instead.
 *
 * That makes this the shape every write path has to produce, and there are four
 * of them: a dish picked out of search, a recipe, a repeat of an existing
 * entry, and the scan cascade (which builds its own, on the server). The three
 * client ones are the builders below.
 *
 * WHY BUILDERS RATHER THAN THREE INLINE OBJECT LITERALS
 *
 * The portion is the part that is easy to get wrong. `base` is per ONE base
 * serving and `servingFactor` scales it, so a snapshot that puts the chosen
 * portion's figures in `base` AND keeps its factor counts the portion twice —
 * silently, and only on the portions that are not 1.0. Each builder below is
 * one place where that is decided, and `entryTotals` in `lib/nutrition.ts` is
 * the client's copy of the arithmetic that reads it back.
 */

import type { ExtraNutrients, Food, IconRef, Macros, Place, Recipe } from './types'

export type LogSnapshot = {
  /**
   * Soft references, for provenance only. Nothing joins them, nothing requires
   * them, and a re-snapshot job would be what reads them — see the header of
   * `schemas/30_food_logs.sql`.
   */
  foodId?: string
  servingId?: string
  recipeId?: string

  name: string
  brand?: string
  /** The FOOD's own drawing, which the user's own icon overrides. */
  icon?: IconRef
  place?: Place

  /** Per one base serving. Multiplied by the factor and the quantity on read. */
  base: Macros
  extras?: ExtraNutrients
  servingLabel: string
  servingFactor: number
  /** What one base serving weighs, when anything knows. */
  servingGrams?: number
}

/**
 * A dish out of the catalogue, at the portion the user chose.
 *
 * The serving is looked up by id rather than taken on trust, because the id
 * comes off a screen that may have been showing a different food a moment ago.
 * Falling back to the base serving is the safe direction: a factor of 1 logs
 * the dish at its quoted size, where a missing factor would log it at nothing.
 */
export function snapshotFromFood(food: Food, servingId?: string): LogSnapshot {
  const serving = food.servings.find((s) => s.id === servingId) ?? food.servings[0]
  return {
    foodId: food.id,
    servingId: serving?.id,
    name: food.name,
    brand: food.brand,
    icon: food.icon,
    place: food.place,
    base: food.macros,
    extras: food.extras,
    servingLabel: serving?.label ?? food.servingLabel,
    servingFactor: serving?.factor ?? 1,
    servingGrams: food.servingGrams,
  }
}

/**
 * A pot, at one serving of it.
 *
 * `perServing` is the base here and the factor is 1, so the stepper beside the
 * entry counts SERVINGS — which is the unit a recipe is for. The detail screen
 * offers half, one, two and the whole pot as quantities against that, which is
 * why none of them is a serving row: they were four `food_servings` on the
 * mirror once, and the mirror is gone.
 *
 * No `servingGrams`. A recipe is measured in servings, and while the ingredient
 * list has weights in it, their sum is the raw weight of what went into the pot
 * rather than what comes out of it — water boils off, and quoting the input as
 * the output would put a number on the row that is wrong in one direction for
 * every cooked dish.
 */
export function snapshotFromRecipe(recipe: Recipe): LogSnapshot {
  return {
    recipeId: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    base: recipe.perServing,
    servingLabel: '1 serving',
    servingFactor: 1,
  }
}

/**
 * The same thing again: what "repeat yesterday" writes.
 *
 * A straight copy of the snapshot rather than anything derived. `Entry.macros`
 * has already been through the portion and the quantity and been rounded, so
 * dividing it back out to a base would land a calorie or two off the row being
 * repeated — a difference nobody could account for, on the one action whose
 * whole promise is that it is the same.
 */
export function snapshotFromEntry(entry: {
  foodId?: string
  recipeId?: string
  servingId?: string
  foodName: string
  brand?: string
  place?: Place
  base: Macros
  extras?: ExtraNutrients
  servingLabel: string
  servingFactor: number
  baseServingGrams?: number
}): LogSnapshot {
  return {
    foodId: entry.foodId,
    servingId: entry.servingId,
    recipeId: entry.recipeId,
    name: entry.foodName,
    brand: entry.brand,
    place: entry.place,
    base: entry.base,
    extras: entry.extras,
    servingLabel: entry.servingLabel,
    servingFactor: entry.servingFactor,
    servingGrams: entry.baseServingGrams,
  }
}

/** The snapshot as `food_logs` columns. One place, so the names cannot drift. */
export function snapshotColumns(snapshot: LogSnapshot) {
  return {
    food_id: snapshot.foodId ?? null,
    serving_id: snapshot.servingId ?? null,
    recipe_id: snapshot.recipeId ?? null,
    item_name: snapshot.name,
    item_brand: snapshot.brand ?? null,
    item_icon_set: snapshot.icon?.set ?? null,
    item_icon_name: snapshot.icon?.name ?? null,
    item_place: snapshot.place ?? null,
    base_kcal: Math.round(snapshot.base.kcal),
    base_carbs_g: snapshot.base.carbs,
    base_protein_g: snapshot.base.protein,
    base_fat_g: snapshot.base.fat,
    base_fibre_g: snapshot.extras?.fibre ?? null,
    base_sugar_g: snapshot.extras?.sugar ?? null,
    base_sodium_mg: snapshot.extras?.sodium ?? null,
    serving_label: snapshot.servingLabel,
    serving_factor: snapshot.servingFactor,
    serving_grams: snapshot.servingGrams ?? null,
  }
}
