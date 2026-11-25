import type { EntryIngredient } from '@/data/scan'
import { amountIn, partUnit, partUnits, perUnitMl, quantityIn, shownIn, stepIn } from '../partUnits'

/**
 * A plate's part read in kitchen units. The amount is always the stored
 * quantity of the serving; these are the faces it can wear and the arithmetic
 * back to it.
 */

const part = (over: Partial<EntryIngredient> = {}): EntryIngredient => ({
  id: 'soy',
  name: 'dark soy sauce',
  quantity: 2,
  servingLabel: '1 tbsp (15 ml)',
  kcal: 20,
  grams: 36,
  carbs: 3,
  protein: 1.8,
  fat: 0,
  position: 0,
  displayUnit: null,
  ...over,
})

const rice = part({
  id: 'rice',
  name: 'steamed rice',
  quantity: 1,
  servingLabel: 'serving',
  grams: 180,
})

it('reads the millilitres a serving label states', () => {
  expect(perUnitMl(part())).toBe(15)
  expect(perUnitMl(rice)).toBeNull()
})

it('offers weights for a weighed part and volumes only where the label says one', () => {
  expect(partUnits(rice, 'metric')).toEqual(['g'])
  expect(partUnits(rice, 'imperial')).toEqual(['oz', 'g'])
  expect(partUnits(part(), 'metric')).toEqual(['g', 'ml', 'tsp', 'tbsp'])
})

it('leaves out a unit the amount is lost in', () => {
  // Two tablespoons is an eighth of a cup, under the quarter a cup steps by.
  expect(partUnits(part(), 'metric')).not.toContain('cup')
  // Unless it is the one in use.
  expect(partUnits(part({ displayUnit: 'cup' }), 'metric')).toContain('cup')
})

it('does not read a drink weighed in millilitres as grams', () => {
  const tea = part({ servingLabel: 'Regular (350 ml)', quantity: 1, grams: 350 })
  // And not in spoons either: 350 ml is 71 teaspoons, past what a spoon steps to.
  expect(partUnits(tea, 'metric')).toEqual(['ml', 'cup'])
  expect(partUnit(tea, 'metric')).toBe('ml')
})

it('opens on the picked unit, then the serving’s own, then grams', () => {
  expect(partUnit(part({ displayUnit: 'ml' }), 'metric')).toBe('ml')
  expect(partUnit(part(), 'metric')).toBe('tbsp')
  expect(partUnit(rice, 'metric')).toBe('g')
  // A unit the part can no longer be read in falls back rather than lying.
  expect(partUnit(part({ displayUnit: 'oz', grams: null }), 'metric')).toBe('tbsp')
  // Nothing weighed, no volume: the count.
  expect(partUnit(part({ grams: null, servingLabel: 'piece' }), 'metric')).toBeNull()
})

it('converts the amount both ways through the stored quantity', () => {
  expect(shownIn(part(), 'ml')).toBe(30)
  expect(shownIn(part(), 'g')).toBe(36)
  expect(amountIn(part(), 'tbsp')).toBeCloseTo(2.029, 3)
  expect(shownIn(part(), 'tbsp')).toBe(2)
  // 45 ml of a 15 ml serving is three of it.
  expect(quantityIn(part(), 'ml', 45)).toBe(3)
  expect(quantityIn(part({ grams: null }), 'g', 10)).toBeNull()
})

it('steps on the unit’s own marks and both ways from a converted amount', () => {
  const soy = part({ quantity: quantityIn(part(), 'tbsp', 2.5) ?? 0, grams: null })
  expect(shownIn(soy, 'tbsp')).toBe(2.5)
  const less = stepIn(soy, 'tbsp', -1)
  const more = stepIn(soy, 'tbsp', 1)
  expect(less).not.toBeNull()
  expect(more).not.toBeNull()
  expect(amountIn({ ...soy, quantity: less ?? 0 }, 'tbsp')).toBeCloseTo(2, 2)
  expect(amountIn({ ...soy, quantity: more ?? 0 }, 'tbsp')).toBeCloseTo(3, 2)
})

it('stops at a quarter of the part rather than removing it', () => {
  const floor = part({ quantity: 0.25, grams: 4.5 })
  expect(stepIn(floor, 'g', -1)).toBeNull()
  expect(stepIn(rice, 'g', 1)).toBeCloseTo(190 / 180, 4)
})
