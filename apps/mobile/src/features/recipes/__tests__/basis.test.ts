import type { Food } from '@/data'
import { ingredientBasis, ingredientTotal, potTotals } from '../basis'

const food = (servingLabel: string, kcal: number): Food => ({
  id: 'f1',
  name: 'Test',
  place: 'home',
  servingLabel,
  servings: [],
  macros: { kcal, carbs: 0, protein: 0, fat: 0 },
  extras: {},
  verified: false,
})

describe('ingredientBasis', () => {
  it('divides a weighed serving down to one gram', () => {
    expect(ingredientBasis(food('100 g', 195))).toEqual({
      unit: 'g',
      perUnit: { kcal: 1.95, carbs: 0, protein: 0, fat: 0 },
      amount: 100,
    })
  })

  it('reads millilitres as millilitres, not as grams', () => {
    expect(ingredientBasis(food('250 ml', 100)).unit).toBe('ml')
  })

  // "1 bowl (400 g)" leads with a count of bowls. Read left to right that is
  // one gram of soup, and the whole recipe comes out 400 times light.
  it('prefers the measurement in brackets to the count in front of it', () => {
    expect(ingredientBasis(food('1 bowl (400 g)', 800))).toEqual({
      unit: 'g',
      perUnit: { kcal: 2, carbs: 0, protein: 0, fat: 0 },
      amount: 400,
    })
  })

  // Every label here is real: they came out of a group-by over
  // `food_servings.label`, which is why the imperial spellings look like this.
  // The same set the server's `servingGrams` is tested against.
  it('converts the units the imported catalogue actually uses', () => {
    expect(ingredientBasis(food('1 kg', 1640)).amount).toBe(1000)
    expect(ingredientBasis(food('3.0 oz', 170)).amount).toBe(85.1)
    expect(ingredientBasis(food('1 ONZ', 100)).amount).toBe(28.4)
    expect(ingredientBasis(food('1.0 lb', 400)).amount).toBe(453.6)
  })

  // A fluid ounce is a volume — 29.6 ml where an ounce of weight is 28.3 g —
  // and this catalogue writes it both ways.
  it('tells a fluid ounce from an ounce of weight', () => {
    expect(ingredientBasis(food('8 OZA', 100))).toMatchObject({ unit: 'ml', amount: 236.6 })
    expect(ingredientBasis(food('1.0 fl oz', 100))).toMatchObject({ unit: 'ml', amount: 29.6 })
  })

  // Unanchored, the reader finds the first number-then-word anywhere in the
  // string: "1/2 lb" becomes TWO POUNDS, four times the real weight, silently.
  it('reads a fraction as a fraction', () => {
    expect(ingredientBasis(food('1/2 lb', 400)).amount).toBe(226.8)
  })

  // A label with a measurement buried in it is not a measurement of the
  // serving, and reading one out of it is worse than reading none.
  it('refuses a label that is a description with numbers in it', () => {
    expect(ingredientBasis(food('1 medium paper (8-5/8 dia)', 100)).unit).toBe('piece')
    expect(ingredientBasis(food('1.0 cup, loosely packed', 100)).unit).toBe('piece')
  })

  // 3 kg is a sack of rice rather than a portion of it, and 0.4 g is a pinch of
  // salt. Both are real rows, and dividing by either produces a density the
  // rest of the recipe would then treat as fact.
  it('refuses a weight no serving could be', () => {
    expect(ingredientBasis(food('5 kg', 100)).unit).toBe('piece')
    expect(ingredientBasis(food('1 g', 4)).unit).toBe('piece')
  })

  // `UNITS['constructor']` is a function — truthy, and not a scale. Indexed
  // rather than guarded, it puts NaN through every macro on the row.
  it('is not fooled by a label naming a property of Object', () => {
    expect(ingredientBasis(food('100 constructor', 100)).unit).toBe('piece')
    expect(ingredientBasis(food('100 toString', 100)).perUnit.kcal).toBe(100)
  })

  // A portion word with no measurement in it. There is nothing to divide by, so
  // one piece is one serving and the macros carry over untouched.
  it('falls back to counting when the label carries no weight', () => {
    expect(ingredientBasis(food('1 plate', 640))).toEqual({
      unit: 'piece',
      perUnit: { kcal: 640, carbs: 0, protein: 0, fat: 0 },
      amount: 1,
    })
  })

  it('treats a label the import wrote for a spreadsheet as uncountable', () => {
    expect(ingredientBasis(food('Quantity not specified', 100)).unit).toBe('piece')
  })
})

describe('potTotals', () => {
  const beef = { perUnit: { kcal: 1.64, carbs: 0, protein: 0.22, fat: 0.08 }, amount: 1000 }
  const santan = { perUnit: { kcal: 1.95, carbs: 0.03, protein: 0.02, fat: 0.21 }, amount: 400 }

  it('adds the pot up and divides it by how many it feeds', () => {
    const { total, perServing } = potTotals([beef, santan], 6)
    expect(total.kcal).toBe(2420)
    expect(perServing.kcal).toBe(403)
  })

  // The same arithmetic `recipe_details` does. If these two ever disagree, the
  // number the form previews is not the number Save commits.
  it('agrees with the database on a serving of one', () => {
    expect(potTotals([beef], 1).perServing).toEqual(ingredientTotal(beef.perUnit, beef.amount))
  })

  // The view sums the raw products and rounds once. Rounding each line first and
  // adding those drifts, and the drift grows with the ingredient count — five
  // lines each half a calorie out is a pot two calories wrong and a preview that
  // does not match what Save writes.
  it('sums raw and rounds once, the way the view does', () => {
    const lines = Array.from({ length: 8 }, () => ({
      perUnit: { kcal: 1.49, carbs: 0.49, protein: 0.49, fat: 0.49 },
      amount: 1,
    }))
    const raw = lines.reduce((sum, l) => sum + l.perUnit.kcal * l.amount, 0)

    expect(potTotals(lines, 1).total.kcal).toBe(Math.round(raw))
    // What rounding per line first would have produced, so the test fails if
    // somebody puts `ingredientTotal` back in the reducer.
    expect(potTotals(lines, 1).total.kcal).not.toBe(lines.length * Math.round(1.49))
  })

  it('treats an empty pot as an empty pot rather than dividing by nothing', () => {
    expect(potTotals([], 0).perServing.kcal).toBe(0)
  })
})
