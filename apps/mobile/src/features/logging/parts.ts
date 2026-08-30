import type { EntryIngredient } from '@/data/scan'
import { formatPortion } from '@/lib/portions'

/**
 * Staged changes to a scanned plate's parts, and the arithmetic that previews
 * them.
 *
 * Apart from the screens so it can be tested without a device, and shared
 * because the detail screen and the sheet that edits the plate have to show the
 * same rows before either has been written. Imported as a type from the narrow
 * data module, so nothing here pulls a native module into a test.
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
 * Everything on a row scales, not only the calories. The card's total is a sum
 * of these, so moving kcal alone would show a plate disagreeing with its own
 * total until Save, and half a portion still reading 180 g would be a preview of
 * a row the server will not write.
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
 * Whole units above one was the old rule, on the reasoning that nobody eats a
 * quarter of a satay skewer. True of skewers and wrong about the scoop of rice,
 * the ladle of curry and the piece of chicken, which are all "× 1" and all
 * routinely eaten by half. It also left no way to say "a bit more than one".
 */
export const PART_STEP = 0.25
export const PART_MAX = 10

/**
 * How much a part moves per tap when it is edited by weight. Ten grams flat
 * rather than a fraction of the portion, which reads as arbitrary: "why did
 * that go up by 37".
 */
export const GRAM_STEP = 10

/**
 * What one of a part weighs, recovered from a row that has already been scaled.
 * `food_log_ingredients.grams` is stored per unit and the view multiplies by
 * the quantity, so this divides it back out. `null` for a part nobody weighed,
 * which is why the amount controls have a second shape.
 */
export function perUnitGrams(ingredient: Pick<EntryIngredient, 'grams' | 'quantity'>) {
  if (ingredient.grams === null || ingredient.quantity <= 0) return null
  return ingredient.grams / ingredient.quantity
}

/**
 * The quantity that weighs about this much, which is what actually gets written.
 *
 * Grams are a face on a multiplier: `set_ingredient_quantity` takes a quantity
 * and `food_log_ingredients.quantity` is `numeric(6, 2)`, so the finest weight
 * a row can express is a hundredth of a unit. Ask for 200 g of something that
 * comes in 220 g units and the row settles at 202, and the screen shows what the
 * row weighs rather than what was asked for.
 *
 * Clamped to the range the function accepts. The floor is why the minus button
 * removes a part rather than shrinking it forever.
 */
export function quantityForGrams(grams: number, perUnit: number): number {
  const raw = grams / perUnit
  const clamped = Math.min(PART_MAX, Math.max(PART_STEP, raw))
  return Math.round(clamped * 100) / 100
}

/**
 * Where the minus and plus buttons take a part edited by weight; `null` is off
 * the plate. Stepping stops where `PART_STEP` does, so the step below a quarter
 * of a unit is removal, which is the multiplier's answer said in grams.
 */
export function stepGrams(grams: number, perUnit: number, direction: 1 | -1): number | null {
  const floor = PART_STEP * perUnit
  const next = grams + direction * GRAM_STEP
  if (direction === -1 && next < floor) return null
  return Math.min(PART_MAX * perUnit, Math.max(floor, next))
}

/**
 * Where the minus button takes a part; `null` is off the plate. At the smallest
 * amount it removes the row: a quarter of a thing and "there wasn't any" are
 * different answers, and the stepper used to simply stop at the first.
 */
export function stepPart(quantity: number, direction: 1 | -1): number | null {
  if (direction === -1 && quantity <= PART_STEP) return null
  // Clamped rather than refused at the ends: a value that lands back on the one
  // it started from is not a change, which `partChanges` already works out.
  return Math.min(PART_MAX, Math.max(PART_STEP, quantity + direction * PART_STEP))
}

/**
 * How many of a part its weight comes to, said in quarters.
 *
 * Read only: the stored quantity stays exactly what the weight divides out to,
 * and this rounds a copy for the line that reads it back. Typing 200 has to
 * leave the row weighing 200, and the quarter answers the other question, which
 * is whether that is about one piece or two.
 *
 * Rounding the stored amount would cost the weight its resolution: a 180 g part
 * could only be 45, 90, 135, 180 or 225 g, and `GRAM_STEP` would be a no-op.
 *
 * `exact` is false where the two readings have parted company, which is what
 * the "~" on screen is for. A scan lands on whole counts, so only a hand-typed
 * weight says "~2".
 */
export function roundedCount(quantity: number): { amount: number; exact: boolean } {
  const amount = Math.max(PART_STEP, Math.round(quantity / PART_STEP) * PART_STEP)
  // Half of the hundredth `food_log_ingredients.quantity` stores, so a row that
  // IS a clean quarter is never called approximate by a floating-point hair.
  return { amount, exact: Math.abs(amount - quantity) < 0.005 }
}

/**
 * The count as a row prints it: "1", "¾", "~1¼". The "~" and the quarter glyphs
 * are symbols rather than copy, which is why they live here rather than in
 * `en/logging.ts`, as `formatPortion`'s fractions do. The × that follows on
 * screen stays in the screens because it is set smaller and needs its own run.
 */
export const countLabel = (quantity: number): string => {
  const { amount, exact } = roundedCount(quantity)
  return `${exact ? '' : '~'}${formatPortion(amount)}`
}
