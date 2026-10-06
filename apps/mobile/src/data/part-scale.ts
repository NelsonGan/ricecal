import type { EntryIngredient } from './scan'

/** One decimal, which is the resolution the database stores macros at. */
const tenth = (value: number) => Math.round(value * 10) / 10

/**
 * A plate's part at a new amount, everything on the row moved together.
 *
 * One function for both places that draw a part before the server has: the
 * plate editor's staged overlay and the optimistic write behind it. The write
 * used to scale the calories and macros and leave the grams, so the moment it
 * landed the row showed the new calories beside the old weight until the
 * refetch put it right, and a tap on the plus flickered back for a beat.
 *
 * Kept free of anything native so the overlay's tests can import it.
 */
export function scalePart(part: EntryIngredient, quantity: number): EntryIngredient {
  const factor = quantity / Math.max(0.01, part.quantity)
  return {
    ...part,
    quantity,
    kcal: Math.round(part.kcal * factor),
    carbs: tenth(part.carbs * factor),
    protein: tenth(part.protein * factor),
    fat: tenth(part.fat * factor),
    // Null survives the scaling: a part nobody weighed still weighs nothing
    // anybody knows, and "0 g" would be a claim about the food.
    grams: part.grams === null ? null : Math.round(part.grams * factor),
  }
}
