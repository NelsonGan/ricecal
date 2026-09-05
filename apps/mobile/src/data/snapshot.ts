/**
 * What an entry has to carry about the food it is.
 *
 * An entry used to be a foreign key and a quantity, with every calorie derived at
 * read time by joining the catalogue. The catalogue is in D1 now and a foreign
 * key cannot cross into another database, so the numbers travel with the entry.
 *
 * Four write paths produce this shape: a dish picked out of search, a recipe, a
 * repeat of an existing entry, and the scan cascade, which builds its own on the
 * server. The three client ones are the builders below.
 *
 * Builders rather than inline literals, because the portion is easy to get wrong:
 * `base` is per one base serving and `servingFactor` scales it, so putting the
 * chosen portion's figures in `base` counts the portion twice, silently.
 */

import type { ExtraNutrients, Food, IconRef, Macros, Place, Recipe } from './types'

export type LogSnapshot = {
  /**
   * Soft references, for provenance only. Nothing joins them, nothing requires
   * them, and a re-snapshot job would be what reads them.
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
 * An id, unless it is one this app invented to fill a route with.
 * `ENTRY_FOOD_ID`, `ENTRY_SERVING_ID` and anything under `packet:` exist so a
 * food with no catalogue row can still be addressed, and mean nothing to anybody
 * else, so this is where they stop.
 */
function catalogueId(id: string | undefined): string | undefined {
  if (!id || id === ENTRY_FOOD_ID || id === ENTRY_SERVING_ID) return undefined
  return packetCode(id) === undefined ? id : undefined
}

/**
 * A dish out of the catalogue, at the portion the user chose. The serving is
 * looked up by id rather than taken on trust, because the id comes off a screen
 * that may have been showing a different food. Falling back to the base serving
 * logs the dish at its quoted size, where a missing factor logs it at nothing.
 */
export function snapshotFromFood(food: Food, servingId?: string): LogSnapshot {
  const serving = food.servings.find((s) => s.id === servingId) ?? food.servings[0]
  return {
    // The placeholders minted for routing — `foodFromEntry`'s, and the scanned
    // packet's — are for a `[id]` segment and a controlled selection, and
    // neither is a catalogue id. `food_id` is a uuid column, so one reaching a
    // write is not a bad reference: it is a 22P02 that fails the save.
    foodId: catalogueId(food.id),
    servingId: catalogueId(serving?.id),
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
 * A pot, at one serving of it. `perServing` is the base and the factor is 1, so
 * the stepper counts servings, which is the unit a recipe is for.
 *
 * No `servingGrams`: the ingredient list's weights sum to what went into the pot
 * rather than what comes out of it, and water boils off.
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
 * What "repeat yesterday" writes: a straight copy of the snapshot rather than
 * anything derived. `Entry.macros` has been through the portion and the quantity
 * and been rounded, so dividing it back out would land a calorie or two off the
 * row being repeated, on the one action whose promise is that it is the same.
 */
export function snapshotFromEntry(entry: {
  foodId?: string
  recipeId?: string
  servingId?: string
  foodName: string
  brand?: string
  icon?: IconRef
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
    // The drawing comes too, and it is the whole reason a repeat is not blank.
    // The photograph cannot: it belongs to the meal that was actually taken,
    // and copying its key would give two rows one object for the retention
    // sweep to delete once. So a plate logged again out of "Past foods" has the
    // drawing where the picture was, which is what a swept row shows anyway.
    icon: entry.icon,
    place: entry.place,
    base: entry.base,
    extras: entry.extras,
    servingLabel: entry.servingLabel,
    servingFactor: entry.servingFactor,
    servingGrams: entry.baseServingGrams,
  }
}

/**
 * An entry as the `Food` the detail screen wants, for an entry with no catalogue
 * row behind it. The other direction from `snapshotFromEntry`, and it exists
 * because `food_id` became nullable: an estimate, a rebuilt plate, a typed meal
 * and a recipe are none of them catalogue rows, and opening one went to
 * `+not-found`, since `undefined` cannot fill a `[id]` segment.
 *
 * The entry holds everything the screen reads off a food except the other
 * portions, so there is exactly one serving here.
 */
export function foodFromEntry(entry: {
  foodId?: string
  foodName: string
  brand?: string
  icon?: IconRef
  place?: Place
  base: Macros
  baseExtras?: ExtraNutrients
  servingId?: string
  servingLabel: string
  servingFactor: number
  baseServingGrams?: number
}): Food {
  return {
    // The screen keys its portion picker off the serving id, so this row needs
    // one even when nothing in a catalogue issued it.
    id: entry.foodId ?? ENTRY_FOOD_ID,
    name: entry.foodName,
    brand: entry.brand,
    icon: entry.icon,
    place: entry.place ?? 'hawker',
    servingLabel: entry.servingLabel,
    servings: [
      {
        id: entry.servingId ?? ENTRY_SERVING_ID,
        label: entry.servingLabel,
        factor: entry.servingFactor,
      },
    ],
    macros: entry.base,
    extras: entry.baseExtras ?? {},
    // Nothing here was published by anybody: these are the scan's own figures,
    // and a verified badge over them would be the app vouching for its guess.
    verified: false,
    servingGrams: entry.baseServingGrams,
  }
}

/**
 * A saved entry's own food, offering the catalogue's other portions.
 *
 * An entry states its own numbers: `base_kcal` and its neighbours are a snapshot
 * and `food_id` is a note about where they came from, so the catalogue row is
 * fetched only for the other portions, which an entry cannot know.
 *
 * The bug it exists to stop: a soy milk logged off its own nutrition panel at
 * 108 kcal opened at 511, priced from an unrelated catalogue row while wearing
 * the entry's own name and photograph. The narrow cause was a `food_id` that did
 * not belong to the entry; the wide one is that any entry whose catalogue row has
 * since been re-costed had the same disagreement.
 *
 * The portion list is adopted only when it still contains the portion this entry
 * was logged at, or the screen falls through to `servings[0]` and reprices the
 * meal on arrival.
 */
export function withCataloguePortions(entry: Food, catalogue: Food | null | undefined): Food {
  const own = entry.servings[0]
  const offered = catalogue?.servings ?? []
  const same = offered.find((option) => option.id === own?.id)
  // Same portion and same size. Agreeing about where this entry sits is what
  // qualifies a row to describe the sizes either side of it; disagreeing means it
  // is describing a different food, or the same one re-cut since. It also catches
  // an entry left inconsistent by the bug above, whose `serving_id` says "large"
  // over a `serving_factor` that was never moved off 1.
  return same && Math.abs(same.factor - (own?.factor ?? 1)) < 1e-6
    ? { ...entry, servings: offered }
    : entry
}

/**
 * The id a route carries for an entry with no catalogue food behind it. A `[id]`
 * segment cannot be empty or `undefined`, and this is deliberately not a
 * plausible id: `useFood` skips it, so anything reaching the catalogue with it is
 * a bug rather than a miss.
 */
export const ENTRY_FOOD_ID = 'entry'

/** The same, for the single portion `foodFromEntry` synthesises. */
export const ENTRY_SERVING_ID = 'entry:base'

/**
 * The id a scanned packet travels under. A packaged product lives in D1's
 * `product` table keyed by the barcode and has no `foods.id`, so the scanner had
 * nothing for the `[id]` segment and the app said "page not found" on a packet it
 * had just identified.
 *
 * Carrying the code makes the detail screen work unchanged: the route is
 * addressable, `useFood` asks the scanner's endpoint, and the answer caches.
 */
const PACKET_PREFIX = 'packet:'

export const packetFoodId = (code: string) => `${PACKET_PREFIX}${code}`

/** The code back out of a route param, or undefined for an ordinary dish. */
export const packetCode = (id: string | undefined) =>
  id?.startsWith(PACKET_PREFIX) ? id.slice(PACKET_PREFIX.length) : undefined

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
