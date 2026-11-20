import type { Food } from '@/data'
import {
  convertIngredient,
  ingredientOptions,
  ingredientTotal,
  potTotals,
  shownAmount,
  storedFrom,
} from '../basis'

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

const opened = (label: string, kcal: number, units: 'metric' | 'imperial' = 'metric') =>
  ingredientOptions(food(label, kcal), units)

const keys = (label: string, kcal = 100, units: 'metric' | 'imperial' = 'metric') =>
  opened(label, kcal, units).choices.map((c) => c.key)

describe('ingredientOptions', () => {
  it('divides a weighed serving down to one gram', () => {
    const { choices, initial } = opened('100 g', 195)
    expect(initial).toEqual({ key: 'g', amount: 100 })
    expect(choices.find((c) => c.key === 'g')).toMatchObject({
      unit: 'g',
      perUnit: { kcal: 1.95, carbs: 0, protein: 0, fat: 0 },
    })
  })

  it('reads millilitres as millilitres, not as grams', () => {
    expect(opened('250 ml', 100).initial).toEqual({ key: 'ml', amount: 250 })
    expect(keys('250 ml')).toEqual(['ml', 'l', 'tsp', 'tbsp', 'cup'])
  })

  // "1 bowl (400 g)" leads with a count of bowls. Read left to right that is
  // one gram of soup, and the whole recipe comes out 400 times light.
  it('prefers the measurement in brackets to the count in front of it', () => {
    const { choices, initial } = opened('1 bowl (400 g)', 800)
    expect(initial).toEqual({ key: 'g', amount: 400 })
    expect(choices.find((c) => c.key === 'g')?.perUnit.kcal).toBe(2)
    // And the bowl itself is still a way to count it.
    expect(choices.map((c) => c.key)).toContain('piece')
  })

  // Every label here is real: they came out of a group-by over
  // `food_servings.label`, which is why the imperial spellings look like this.
  it('converts the units the imported catalogue actually uses', () => {
    expect(opened('1 kg', 1640).initial).toEqual({ key: 'kg', amount: 1 })
    expect(opened('3.0 oz', 170).initial).toEqual({ key: 'g', amount: 85 })
    expect(opened('3.0 oz', 170, 'imperial').initial).toEqual({ key: 'oz', amount: 3 })
    expect(opened('1 ONZ', 100).initial).toEqual({ key: 'g', amount: 28.3 })
    expect(opened('1.0 lb', 400).initial).toEqual({ key: 'g', amount: 454 })
  })

  // A fluid ounce is a volume, 29.6 ml where an ounce of weight is 28.3 g, and
  // this catalogue writes it both ways.
  it('tells a fluid ounce from an ounce of weight', () => {
    expect(opened('8 OZA', 100).initial).toEqual({ key: 'ml', amount: 237 })
    expect(opened('1.0 fl oz', 100, 'imperial').initial).toEqual({ key: 'floz', amount: 1 })
  })

  // Unanchored, the reader finds the first number-then-word anywhere in the
  // string: "1/2 lb" becomes TWO POUNDS, four times the real weight, silently.
  it('reads a fraction as a fraction', () => {
    expect(opened('1/2 lb', 400).initial).toEqual({ key: 'g', amount: 227 })
  })

  // What this change is for: the catalogue says "2 tbsp" and the cook means two
  // tablespoons, not one piece. Stored in millilitres at the food's own
  // calories per millilitre.
  it('opens a spoon serving on spoons', () => {
    const { choices, initial } = opened('2 Tbsp', 190)
    expect(initial).toEqual({ key: 'tbsp', amount: 2 })
    const tbsp = choices.find((c) => c.key === 'tbsp')
    expect(tbsp?.unit).toBe('ml')
    expect((tbsp?.perUnit.kcal ?? 0) * 29.5736).toBeCloseTo(190, 0)
    // Nothing said what a spoon of it weighs, so grams are not offered.
    expect(choices.map((c) => c.key)).not.toContain('g')
  })

  // Two tablespoons with their weight beside them: still two tablespoons, and
  // not a "piece" of peanut butter.
  it('opens a spoon label with a weight in it on the spoons', () => {
    const pb = ingredientOptions({ ...food('2 tbsp (32 g)', 190), servingGrams: 32 }, 'metric')
    expect(pb.initial).toEqual({ key: 'tbsp', amount: 2 })
    expect(pb.choices.map((c) => c.key)).not.toContain('piece')
    expect(pb.choices.map((c) => c.key)).toContain('g')
  })

  it('reads a prepared cup as the cup it still is', () => {
    expect(opened('1.0 cup, loosely packed', 100).initial).toEqual({ key: 'cup', amount: 1 })
  })

  // A label with a measurement buried in it is not a measurement of the
  // serving, and reading one out of it is worse than reading none.
  it('refuses a label that is a description with numbers in it', () => {
    expect(keys('1 medium paper (8-5/8 dia)')).toEqual(['piece'])
  })

  // 5 kg is a sack of rice rather than a portion of it, and 0.4 g is a pinch of
  // salt. Both are real rows, and dividing by either produces a density the
  // rest of the recipe would then treat as fact.
  it('refuses a weight no serving could be', () => {
    expect(keys('5 kg')).toEqual(['piece'])
    expect(keys('1 g', 4)).toEqual(['piece'])
  })

  // `UNITS['constructor']` is a function, truthy and not a scale. Indexed
  // rather than guarded, it puts NaN through every macro on the row.
  it('is not fooled by a label naming a property of Object', () => {
    expect(keys('100 constructor')).toEqual(['piece'])
    expect(opened('100 toString', 100).choices[0].perUnit.kcal).toBe(100)
  })

  // A portion word with no measurement in it. There is nothing to divide by, so
  // one piece is one serving and the macros carry over untouched.
  it('falls back to counting when the label carries no weight', () => {
    expect(opened('1 plate', 640)).toEqual({
      choices: [
        {
          key: 'piece',
          unit: 'piece',
          perUnit: { kcal: 640, carbs: 0, protein: 0, fat: 0 },
          servings: 1,
        },
      ],
      initial: { key: 'piece', amount: 1 },
    })
  })

  // The curated Malaysian rows: "1 plate" in the label, 300 g in the column.
  it('offers grams for a plate whose weight the catalogue knows', () => {
    const plate = ingredientOptions({ ...food('1 plate', 600), servingGrams: 300 }, 'metric')
    expect(plate.initial).toEqual({ key: 'piece', amount: 1 })
    expect(plate.choices.map((c) => c.key)).toEqual(['g', 'kg', 'piece'])
  })

  // The density case: USDA milk at 100 g with a cup portion of 244 g beside it.
  it('offers spoons for a weighed food whose cup the catalogue measured', () => {
    const milk = ingredientOptions(
      {
        ...food('100 g', 61),
        servingGrams: 100,
        servings: [
          { id: 'a', label: '100 g', factor: 1 },
          { id: 'b', label: '1 cup', factor: 2.44, grams: 244 },
        ],
      },
      'metric',
    )
    expect(milk.choices.map((c) => c.key)).toEqual(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup'])
    const [cup] = milk.choices.filter((c) => c.key === 'cup')
    const [grams] = milk.choices.filter((c) => c.key === 'g')
    // A cup of it is 244 g, whichever unit asks.
    expect(convertIngredient(1, cup, grams)).toBe(244)
    expect(cup.perUnit.kcal * 236.588).toBeCloseTo(61 * 2.44, 0)
  })

  // The sheet opens at one serving of what was tapped, priced the way the row
  // was. The label's "400 g" over a weight column of 350 g priced the bowl at
  // 800 kcal for a row listed at 700.
  it('opens at the calories of the row the user tapped', () => {
    const bowl = ingredientOptions({ ...food('1 bowl (400 g)', 700), servingGrams: 350 }, 'metric')
    expect(bowl.initial).toEqual({ key: 'g', amount: 350 })
    const [grams] = bowl.choices.filter((c) => c.key === 'g')
    expect(Math.round(grams.perUnit.kcal * bowl.initial.amount)).toBe(700)
  })

  // A cup nothing can price (its density dropped) and no piece to fall back
  // on: the sheet opened at "1 g", about one calorie of a 300 kcal serving.
  it('falls back to one piece rather than one gram', () => {
    const cup = ingredientOptions(
      {
        ...food('1 cup', 300),
        servingGrams: 2500,
        servings: [{ id: 'a', label: '1 cup', factor: 1 }],
      },
      'metric',
    )
    expect(cup.initial).toEqual({ key: 'piece', amount: 1 })
  })

  it('treats a label the import wrote for a spreadsheet as uncountable', () => {
    expect(keys('Quantity not specified')).toEqual(['piece'])
  })
})

describe('amounts in a unit', () => {
  it('stores spoons in millilitres and reads them back as spoons', () => {
    expect(storedFrom(2, 'tbsp')).toBe(29.57)
    expect(shownAmount(29.57, 'tbsp')).toBe(2)
    expect(shownAmount(4.93, 'tsp')).toBe(1)
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
