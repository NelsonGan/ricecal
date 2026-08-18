import type { EntryIngredient } from '@/data/scan'

/**
 * Staged changes to a scanned plate's parts, and the arithmetic that previews
 * them.
 *
 * Apart from the screens so it can be tested without a device, and shared
 * because two of them read it: the detail screen prices the entry from the
 * staged plate, and the sheet that edits the plate has to show the same rows
 * before either has been written. Imported from the narrow data module rather
 * than the `@/data` barrel, and as a TYPE, so nothing here pulls a native module
 * into a test.
 */

/**
 * What has been staged against a plate: the amount a part was moved to, `null`
 * for one on its way off, and nothing at all for a part nobody touched.
 *
 * An overlay on the fetched list rather than a copy of it, so a refetch landing
 * mid-edit cannot silently drop a staged change — and so "stepped up and back
 * down again" is not a change at all.
 */
export type PartEdits = Record<string, number | null>

/** One decimal, which is the resolution the database stores grams at. */
const tenth = (value: number) => Math.round(value * 10) / 10

/**
 * The plate as a screen shows it: what the scan found, with the staged changes
 * laid over it.
 *
 * EVERYTHING on a row scales with its amount, not only the calories. The card's
 * total and the entry's macros are a sum of these, so moving kcal alone would
 * show a plate that disagreed with its own total right up until Save — the same
 * reasoning as the optimistic patch in `useUpdateIngredient`, applied to an edit
 * that has not been sent yet. The weight moves too: half a portion still reading
 * 180 g is a preview of a row the server will not write.
 */
export function stagedParts(
  ingredients: readonly EntryIngredient[],
  edits: PartEdits,
): EntryIngredient[] {
  return ingredients.flatMap((ingredient) => {
    const staged = edits[ingredient.id]
    if (staged === null) return []
    if (staged === undefined || staged === ingredient.quantity) return [ingredient]

    const factor = staged / Math.max(0.01, ingredient.quantity)
    return [
      {
        ...ingredient,
        quantity: staged,
        kcal: Math.round(ingredient.kcal * factor),
        carbs: tenth(ingredient.carbs * factor),
        protein: tenth(ingredient.protein * factor),
        fat: tenth(ingredient.fat * factor),
        // Null survives the scaling: a part nobody weighed still weighs nothing
        // anybody knows, and "0 g" would be a claim about the food.
        grams: ingredient.grams === null ? null : Math.round(ingredient.grams * factor),
      },
    ]
  })
}

/**
 * The parts whose staged amount actually differs from what is on the server.
 *
 * What Save iterates, and what makes the button an honest answer to "is there
 * anything here to write": an amount stepped up and back down again leaves an
 * entry in the overlay and nothing to send.
 */
export function partChanges(
  ingredients: readonly EntryIngredient[],
  edits: PartEdits,
): EntryIngredient[] {
  return ingredients.filter((ingredient) => {
    const staged = edits[ingredient.id]
    return staged === null || (staged !== undefined && staged !== ingredient.quantity)
  })
}

/**
 * Quarters, whatever the part is sitting at.
 *
 * This used to step in whole units for a counted part and quarters only below
 * one, on the reasoning that a quarter of a satay skewer is not a thing anyone
 * put on a plate. True of skewers, and wrong about everything else the scan
 * decomposes: a scoop of rice, a ladle of curry and a piece of fried chicken are
 * all "× 1" and all routinely eaten by half. Under the old rule the only way
 * down from 1 was to 0.25, and there was no way at all to say "a bit more than
 * one" — the step you needed depended on where you already were, which is not
 * something a pair of buttons can explain.
 */
export const PART_STEP = 0.25
export const PART_MAX = 10

/**
 * How much a part moves per tap once it is being edited BY WEIGHT.
 *
 * Ten grams, flat, rather than a fraction of the portion. A proportional step
 * reads as arbitrary — "why did that go up by 37" — where a round number in the
 * unit on screen is a thing you can count in.
 */
export const GRAM_STEP = 10

/**
 * What ONE of a part weighs, recovered from a row that has already been scaled.
 *
 * `food_log_ingredients.grams` is stored per unit and the view multiplies it by
 * the quantity, so this divides it back out. `null` for a part nobody weighed,
 * which is the whole reason the amount controls have a second shape.
 */
export function perUnitGrams(ingredient: Pick<EntryIngredient, 'grams' | 'quantity'>) {
  if (ingredient.grams === null || ingredient.quantity <= 0) return null
  return ingredient.grams / ingredient.quantity
}

/**
 * The quantity that weighs about this much, which is what actually gets written.
 *
 * GRAMS ARE A FACE ON A MULTIPLIER. `set_ingredient_quantity` takes a quantity
 * and `food_log_ingredients.quantity` is `numeric(6, 2)`, so the finest weight
 * the row can express is a hundredth of one unit — a gram or two on a typical
 * portion. Ask for 200 g of something that comes in 220 g units and the row
 * settles at 202; the number on screen is always what the row actually weighs
 * rather than what was asked for, which is the honest way round.
 *
 * Clamped to the range the function accepts. The floor is why the minus button
 * removes a part rather than shrinking it forever: below a quarter of one unit
 * there is no quantity left to write.
 */
export function quantityForGrams(grams: number, perUnit: number): number {
  const raw = grams / perUnit
  const clamped = Math.min(PART_MAX, Math.max(PART_STEP, raw))
  return Math.round(clamped * 100) / 100
}

/**
 * Where the minus and plus buttons take a part being edited by weight, and
 * `null` is off the plate.
 *
 * Stepping stops where `PART_STEP` does, for the reason above: a part cannot
 * weigh less than a quarter of one of itself, so the step below that is removal
 * — which is the same answer the multiplier gives, said in grams.
 */
export function stepGrams(grams: number, perUnit: number, direction: 1 | -1): number | null {
  const floor = PART_STEP * perUnit
  const next = grams + direction * GRAM_STEP
  if (direction === -1 && next < floor) return null
  return Math.min(PART_MAX * perUnit, Math.max(floor, next))
}

/**
 * Where the minus button takes a part, and `null` is off the plate.
 *
 * At the smallest amount the minus removes the row. A quarter of a thing and
 * "there wasn't any" are different answers, and only one of them used to be
 * reachable — the stepper simply stopped, with nothing to say the row could go.
 */
export function stepPart(quantity: number, direction: 1 | -1): number | null {
  if (direction === -1 && quantity <= PART_STEP) return null
  // Clamped rather than refused at the ends: a value that lands back on the one
  // it started from is not a change, which `partChanges` already works out.
  return Math.min(PART_MAX, Math.max(PART_STEP, quantity + direction * PART_STEP))
}
