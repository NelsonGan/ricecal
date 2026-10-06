import { stagedParts } from '@/features/logging/parts'
import { scalePart } from '../part-scale'
import type { EntryIngredient } from '../scan'

/**
 * The plate editor draws a staged amount itself, then hands the row to the
 * optimistic write. Any figure the two disagree on flickers back for as long as
 * the write takes to land: the weight did, for a second on a real network.
 */

const rice: EntryIngredient = {
  id: 'rice',
  name: 'coconut rice',
  quantity: 1,
  servingLabel: 'plate',
  kcal: 340,
  grams: 200,
  carbs: 60,
  protein: 6,
  fat: 9,
  position: 0,
}

it('moves the weight with the calories and macros', () => {
  expect(scalePart(rice, 1.05)).toEqual({
    ...rice,
    quantity: 1.05,
    kcal: 357,
    grams: 210,
    carbs: 63,
    protein: 6.3,
    fat: 9.5,
  })
})

it('keeps a part nobody weighed unweighed', () => {
  expect(scalePart({ ...rice, grams: null }, 2).grams).toBeNull()
})

it('draws exactly what the editor drew, so nothing moves when the write lands', () => {
  const [staged] = stagedParts([rice], { rice: 1.3 })
  expect(scalePart(rice, 1.3)).toEqual(staged)
})
