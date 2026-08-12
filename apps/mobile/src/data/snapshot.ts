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
 * An id, unless it is one this app invented to fill a route with.
 *
 * There are three of those — `ENTRY_FOOD_ID`, `ENTRY_SERVING_ID` and anything
 * under `packet:` — and they exist so a food with no catalogue row behind it
 * can still be addressed and selected. None of them means anything to anybody
 * else, so this is where they stop.
 */
function catalogueId(id: string | undefined): string | undefined {
  if (!id || id === ENTRY_FOOD_ID || id === ENTRY_SERVING_ID) return undefined
  return packetCode(id) === undefined ? id : undefined
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

/**
 * An entry as the `Food` the detail screen wants, for an entry that has no
 * catalogue row behind it.
 *
 * This is the OTHER direction from `snapshotFromEntry`, and it exists because
 * `food_id` became nullable and null became ordinary. A tier-4 estimate, a
 * tier-5 archetype, a plate rebuilt from its own parts, a typed meal and a
 * recipe are none of them catalogue rows — which is most of what a scan
 * produces — and the detail screen was written when every entry had a food
 * behind it. Opening one of those went to `+not-found`, because
 * `router.push({ params: { id: undefined } })` cannot fill a `[id]` segment.
 *
 * The entry already holds everything the screen reads off a food: the numbers
 * per base serving, the portion, the name, the drawing. The one thing it cannot
 * hold is the OTHER portions — a catalogue food offers "half plate", "large",
 * and an entry knows only the size it was logged at. So there is exactly one
 * serving here, which is the honest answer: the stepper still changes how many,
 * and the portion picker has nothing to pick between.
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
 * A saved entry's own food, offering the catalogue's OTHER portions.
 *
 * An entry states its own numbers. `base_kcal` and its neighbours are a
 * SNAPSHOT and `food_id` is only a note about where they came from, so the
 * catalogue row is not what prices the detail screen — it is fetched for one
 * thing, the other portions, which an entry cannot know because it only ever
 * held the size it was logged at.
 *
 * Read the other way round, this is the bug it exists to stop. A soy milk
 * logged off its own nutrition panel at 108 kcal opened at 511, priced from an
 * unrelated catalogue row while wearing the entry's own name and photograph,
 * and the day went on showing the 108 the row actually holds. The narrow cause
 * was a `food_id` that reached the route without belonging to the entry; the
 * wide one is that ANY entry whose catalogue row has since been re-costed had
 * the same disagreement, quietly and with no bad id involved.
 *
 * The portion list is adopted only when it still contains the portion this
 * entry was logged at. A row that has been re-cut since — or was never this
 * entry's row at all — would otherwise drop that portion off the picker, and
 * the screen would fall through to `servings[0]` and reprice the meal on
 * arrival, which is the same failure wearing a different hat.
 */
export function withCataloguePortions(entry: Food, catalogue: Food | null | undefined): Food {
  const own = entry.servings[0]
  const offered = catalogue?.servings ?? []
  const same = offered.find((option) => option.id === own?.id)
  // Same portion AND same size. Agreeing about where this entry sits is what
  // qualifies a row to describe the sizes either side of it; disagreeing means
  // it is describing a different food, or the same one re-cut since — and also
  // catches an entry left inconsistent by the bug above, whose `serving_id`
  // says "large" over a `serving_factor` that was never moved off 1.
  return same && Math.abs(same.factor - (own?.factor ?? 1)) < 1e-6
    ? { ...entry, servings: offered }
    : entry
}

/**
 * The id a route carries for an entry with no catalogue food behind it.
 *
 * A `[id]` segment cannot be empty and cannot be `undefined`, so an entry that
 * points at nothing still needs something to put there. It is deliberately not
 * a plausible id: `useFood` skips it, and anything that reaches the catalogue
 * with it would be a bug rather than a miss.
 */
export const ENTRY_FOOD_ID = 'entry'

/** The same, for the single portion `foodFromEntry` synthesises. */
export const ENTRY_SERVING_ID = 'entry:base'

/**
 * The id a SCANNED PACKET travels under, for the same reason and with a
 * different answer behind it.
 *
 * A packaged product lives in D1's `product` table, keyed by the barcode. It
 * has no `foods.id` and never will — the barcode IS its key — so the scanner
 * had nothing to put in the `[id]` segment and the app said "page not found"
 * on a packet it had just identified correctly.
 *
 * Carrying the code instead makes the food detail screen work unchanged: the
 * route is addressable, `useFood` knows to ask the scanner's endpoint rather
 * than the catalogue's, and the answer caches under the packet like any other
 * dish, so backing out and opening it again is free.
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
