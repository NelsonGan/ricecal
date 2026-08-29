import { foldToDishes } from '../foods'
import type { Entry } from '../types'

/**
 * "My foods": the diary read as a list of foods rather than as a list of meals.
 *
 * Every way this fold can be wrong shows up as a LIST and never as an error.
 * Fold too hard and a 60 kcal packet of soy milk hides behind the 511 kcal
 * hawker one it shares a name with, offering the wrong calories under the right
 * word. Fold too little and the tab is the diary again: three weeks of the same
 * breakfast, in order, which is the screen the user just came from.
 */

const entry = (over: Partial<Entry> & Pick<Entry, 'id' | 'foodName'>): Entry => ({
  quantity: 1,
  loggedAt: '2026-08-29T08:00:00.000Z',
  logDate: '2026-08-29',
  source: 'search',
  place: 'hawker',
  servingLabel: '1 plate',
  servingFactor: 1,
  macros: { kcal: 600, carbs: 70, protein: 20, fat: 25 },
  base: { kcal: 600, carbs: 70, protein: 20, fat: 25 },
  ...over,
})

it('keeps the most recent of a dish and drops the rest', () => {
  // Newest first, which is how the query orders them: the survivor carries the
  // portion and the picture the user last accepted.
  const folded = foldToDishes(
    [
      entry({ id: 'c', foodName: 'Nasi lemak', photoPath: 'meals/u/today.jpg' }),
      entry({ id: 'b', foodName: 'Nasi lemak', photoPath: 'meals/u/yesterday.jpg' }),
      entry({ id: 'a', foodName: 'Nasi lemak' }),
    ],
    50,
  )
  expect(folded.map((one) => one.id)).toEqual(['c'])
  expect(folded[0]?.photoPath).toBe('meals/u/today.jpg')
})

it('folds on the name whatever case it was written in', () => {
  // The same dish reaches the diary from search, a scan and a typed sentence,
  // each with its own idea of capitals.
  const folded = foldToDishes(
    [
      entry({ id: 'b', foodName: 'Char kuey teow' }),
      entry({ id: 'a', foodName: 'char kuey teow' }),
    ],
    50,
  )
  expect(folded).toHaveLength(1)
})

it('keeps two foods that share a name but not their calories', () => {
  // A packaged soy milk and a hawker one are different foods, and folding them
  // would offer one of them under the other's figure.
  const folded = foldToDishes(
    [
      entry({ id: 'b', foodName: 'Soy milk', base: { kcal: 108, carbs: 12, protein: 6, fat: 4 } }),
      entry({
        id: 'a',
        foodName: 'Soy milk',
        base: { kcal: 511, carbs: 60, protein: 20, fat: 20 },
      }),
    ],
    50,
  )
  expect(folded).toHaveLength(2)
})

it('keeps two portions of one dish apart', () => {
  const folded = foldToDishes(
    [
      entry({ id: 'b', foodName: 'Kopi', servingLabel: '1 cup' }),
      entry({ id: 'a', foodName: 'Kopi', servingLabel: '1 large cup' }),
    ],
    50,
  )
  expect(folded).toHaveLength(2)
})

it('leaves out a row with no dish name on it yet', () => {
  // A scan writes its entry before it has a name in one case: nothing to offer,
  // and nothing to fold every other nameless row against either.
  expect(foldToDishes([entry({ id: 'a', foodName: '   ' })], 50)).toEqual([])
})

it('stops at the number it is asked for, counting folded rows', () => {
  const many = Array.from({ length: 20 }, (_, index) =>
    entry({ id: `e${index}`, foodName: `Dish ${index % 4}` }),
  )
  expect(foldToDishes(many, 3)).toHaveLength(3)
})
