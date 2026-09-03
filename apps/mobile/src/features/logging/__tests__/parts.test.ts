import type { EntryIngredient } from '@/data/scan'
import {
  countLabel,
  GRAM_STEP,
  PART_MAX,
  PART_STEP,
  partChanges,
  perUnitGrams,
  quantityForGrams,
  roundedCount,
  stagedParts,
  stepGrams,
  stepPart,
} from '../parts'

/**
 * The staged preview of a scanned plate.
 *
 * Two screens read this — the detail card and the sheet that edits it — and the
 * property worth protecting is that EVERYTHING on a row moves together. A
 * preview that scaled the calories and left the macros or the weight where they
 * were would be a plate disagreeing with its own total until Save, which is the
 * bug the entry-level `coalesce` exists to prevent one layer down.
 */

const part = (over: Partial<EntryIngredient> = {}): EntryIngredient => ({
  id: 'rice',
  name: 'steamed white rice',
  quantity: 1,
  servingLabel: '1 bowl',
  kcal: 200,
  grams: 180,
  carbs: 44,
  protein: 4.2,
  fat: 0.4,
  ...over,
})

it('leaves a part nobody touched exactly as it came', () => {
  const rice = part()
  expect(stagedParts([rice], {})).toEqual([rice])
})

it('leaves a part staged back at its own amount alone', () => {
  const rice = part({ quantity: 1.5 })
  expect(stagedParts([rice], { rice: 1.5 })).toEqual([rice])
})

it('scales the calories, the macros AND the weight together', () => {
  const [half] = stagedParts([part()], { rice: 0.5 })
  expect(half).toMatchObject({ quantity: 0.5, kcal: 100, carbs: 22, protein: 2.1, fat: 0.2 })
  expect(half?.grams).toBe(90)
})

it('keeps a part nobody weighed unweighed', () => {
  const [half] = stagedParts([part({ grams: null })], { rice: 0.5 })
  expect(half?.grams).toBeNull()
})

/**
 * There is no "on its way off" in the overlay any more: a removal is written the
 * moment the swipe asks for it, so the only thing that can be staged against a
 * part is an amount. What is pinned here is that a part nobody touched is handed
 * back UNCHANGED rather than copied, which is what lets a row keep its identity
 * through an edit to the row above it.
 */
it('leaves a part the overlay has never heard of exactly as it was', () => {
  const rice = part()
  const egg = part({ id: 'egg', name: 'fried egg' })
  const staged = stagedParts([rice, egg], { rice: 0.5 })
  expect(staged).toHaveLength(2)
  expect(staged[1]).toBe(egg)
})

it('counts only the parts whose amount actually moved', () => {
  const rice = part()
  const egg = part({ id: 'egg', quantity: 2 })
  // Stepped up and back down again is not a change, and neither is a part the
  // overlay has never heard of.
  expect(partChanges([rice, egg], { rice: 1 })).toEqual([])
  expect(partChanges([rice, egg], { rice: 0.75, egg: 1 }).map((one) => one.id)).toEqual([
    'rice',
    'egg',
  ])
})

it('takes the last quarter of a part off the plate rather than stopping', () => {
  expect(stepPart(PART_STEP, -1)).toBeNull()
  expect(stepPart(0.5, -1)).toBe(PART_STEP)
})

it('steps in quarters and stops at the ceiling', () => {
  expect(stepPart(1, 1)).toBe(1.25)
  expect(stepPart(PART_MAX, 1)).toBe(PART_MAX)
})

/**
 * Editing a part BY WEIGHT, which is a face on the multiplier the row actually
 * stores. The arithmetic is worth pinning down because the two ends of it
 * disagree: grams are what the user reads and types, `quantity` at two decimals
 * is what `set_ingredient_quantity` accepts, and the floor of that range is what
 * turns the minus button into a delete.
 */

it('recovers what one of a part weighs from a row already scaled by its amount', () => {
  // The view multiplies the stored per-unit grams by the quantity, so this
  // divides it back out: 165 g at three quarters is a 220 g unit.
  expect(perUnitGrams({ grams: 165, quantity: 0.75 })).toBe(220)
  expect(perUnitGrams({ grams: null, quantity: 1 })).toBeNull()
  expect(perUnitGrams({ grams: 100, quantity: 0 })).toBeNull()
})

it('turns a weight into a quantity the database can hold', () => {
  expect(quantityForGrams(220, 220)).toBe(1)
  // FOUR decimals is the column, and this is the case the widening was for: at
  // two, 200 g of a 220 g unit was 0.91 and read back as 200.2, and a 230 g part
  // asked for 190 came back as 191. See `quantityForGrams`.
  expect(quantityForGrams(200, 220)).toBe(0.9091)
  expect(Math.round(quantityForGrams(190, 230) * 230)).toBe(190)
  // And is clamped to the range the write function accepts, at both ends.
  expect(quantityForGrams(1, 220)).toBe(PART_STEP)
  expect(quantityForGrams(999_999, 220)).toBe(PART_MAX)
})

it('steps a weight by a round number of grams', () => {
  expect(stepGrams(165, 220, 1)).toBe(165 + GRAM_STEP)
  expect(stepGrams(165, 220, -1)).toBe(165 - GRAM_STEP)
})

it('stops a part at the last quarter rather than shrinking it forever', () => {
  // A quarter of one unit is the floor, because below it there is no quantity
  // left to write — so the step below it is removal, the same answer the
  // multiplier gives.
  const floor = PART_STEP * 220
  expect(stepGrams(floor, 220, -1)).toBeNull()
  expect(stepGrams(floor + GRAM_STEP, 220, -1)).toBe(floor)
})

it('stops a weight at the top of the range', () => {
  expect(stepGrams(PART_MAX * 220, 220, 1)).toBe(PART_MAX * 220)
})

/**
 * The count read back beside the weight.
 *
 * The property under test is that it NEVER moves the amount it describes: the
 * grams a row holds are what the person typed, and this rounds a copy of the
 * multiplier for the line under the field. A test that let the rounding write
 * back would still pass every case below and would break the weight field, so
 * the exactness flag is what each of these actually pins down.
 */
it('says a whole count as itself, with no approximation', () => {
  expect(roundedCount(2)).toEqual({ amount: 2, exact: true })
})

it('says a clean quarter as itself', () => {
  expect(roundedCount(1.25)).toEqual({ amount: 1.25, exact: true })
})

it('rounds a typed weight to the nearest quarter and admits it is not exact', () => {
  // 200 g of something that comes in 180 g pieces: 1.11, which is about one.
  expect(roundedCount(1.11)).toEqual({ amount: 1, exact: false })
  expect(roundedCount(1.22)).toEqual({ amount: 1.25, exact: false })
})

it('never rounds a part down to nothing', () => {
  // The floor is a quarter of one unit, which is where `stepGrams` stops too:
  // below it the row is removed rather than shrunk, so "0" is not an amount
  // this can be asked to show.
  expect(roundedCount(0.1)).toEqual({ amount: 0.25, exact: false })
})

it('does not call a stored quarter approximate over a floating-point hair', () => {
  expect(roundedCount(0.25 * 3).exact).toBe(true)
})

/**
 * The count as a row prints it. `PartLine` puts this in front of a part's name,
 * so what is pinned here is the reading rather than the arithmetic above.
 */
it('prints a whole count as a bare number', () => {
  expect(countLabel(2)).toBe('2')
})

it('prints a quarter as a glyph rather than a decimal', () => {
  expect(countLabel(0.75)).toBe('¾')
  expect(countLabel(1.25)).toBe('1¼')
})

it('marks a count the weight has moved off a quarter with a tilde', () => {
  expect(countLabel(1.11)).toBe('~1')
  expect(countLabel(1.22)).toBe('~1¼')
})
