import type { EntryIngredient } from '@/data/scan'
import { PART_MAX, PART_STEP, partChanges, stagedParts, stepPart } from '../parts'

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

it('drops a part on its way off the plate', () => {
  expect(stagedParts([part(), part({ id: 'egg', name: 'fried egg' })], { rice: null })).toEqual([
    part({ id: 'egg', name: 'fried egg' }),
  ])
})

it('counts only the parts whose amount actually moved', () => {
  const rice = part()
  const egg = part({ id: 'egg', quantity: 2 })
  // Stepped up and back down again is not a change, and neither is a part the
  // overlay has never heard of.
  expect(partChanges([rice, egg], { rice: 1 })).toEqual([])
  expect(partChanges([rice, egg], { rice: 0.75, egg: null }).map((one) => one.id)).toEqual([
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
