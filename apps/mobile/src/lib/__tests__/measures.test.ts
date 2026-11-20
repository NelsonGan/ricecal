import {
  foodBasis,
  labelAmount,
  labelQuantities,
  MEASURE_ID,
  measureOf,
  measurePortions,
  roundedFor,
  steppedTo,
  unitFactor,
  unitsFor,
} from '@/lib/measures'

const serving = (label: string, factor = 1, grams?: number) => ({
  id: label,
  label,
  factor,
  ...(grams === undefined ? {} : { grams }),
})

describe('labelAmount', () => {
  it('reads the spoons and cups the catalogue writes', () => {
    expect(labelAmount('2 Tbsp')).toEqual({ unit: 'tbsp', count: 2 })
    expect(labelAmount('1/4 tsp')).toEqual({ unit: 'tsp', count: 0.25 })
    expect(labelAmount('1 1/2 cups')).toEqual({ unit: 'cup', count: 1.5 })
    expect(labelAmount('1.0 fl oz')).toEqual({ unit: 'floz', count: 1 })
    expect(labelAmount('8 OZA')).toEqual({ unit: 'floz', count: 8 })
    expect(labelAmount('3.0 oz')).toEqual({ unit: 'oz', count: 3 })
  })

  // "1 bowl (400 g)" leads with a count of bowls. Read left to right that is
  // one gram of soup.
  it('prefers the measurement in brackets to the count in front of it', () => {
    expect(labelAmount('1 bowl (400 g)')).toEqual({ unit: 'g', count: 400 })
    expect(labelAmount('Regular (350 ml)')).toEqual({ unit: 'ml', count: 350 })
  })

  it('refuses a description with numbers in it', () => {
    expect(labelAmount('1 medium paper (8-5/8 dia)')).toBeNull()
    expect(labelAmount('1 plate')).toBeNull()
    expect(labelAmount('1 cupcake')).toBeNull()
    expect(labelAmount('100 constructor')).toBeNull()
    expect(labelAmount('1.0 cup, chopped')).toBeNull()
  })
})

describe('labelQuantities', () => {
  // The label that carries a whole density on its own.
  it('reads both halves of "2 tbsp (32 g)"', () => {
    const found = labelQuantities('2 tbsp (32 g)')
    expect(found.g).toBe(32)
    expect(found.ml).toBeCloseTo(29.57, 1)
  })

  it('reads a prepared portion as the amount it still is', () => {
    expect(labelQuantities('1.0 cup, chopped').ml).toBeCloseTo(236.6, 1)
  })

  // Both halves are one volume, so there is no density in it.
  it('reads a bare oz beside millilitres as fluid ounces', () => {
    expect(labelQuantities('12 oz (355 ml)')).toEqual({ ml: 355 })
    expect(labelQuantities('355 ml (12 oz)')).toEqual({ ml: expect.closeTo(354.9, 1) })
    expect(labelQuantities('8 oz (227 g)').g).toBe(227)
  })

  // A weight beside a volume is the density itself, not a second volume.
  it('keeps an oz that disagrees with the volume beside it a weight', () => {
    const found = labelQuantities('1/4 cup (1 oz)')
    expect(found.g).toBeCloseTo(28.35, 1)
    expect(found.ml).toBeCloseTo(59.15, 1)
    expect(labelQuantities('1 cup (4 oz)').g).toBeCloseTo(113.4, 1)
  })
})

describe('foodBasis', () => {
  it('takes the weight column over a weight read out of a label', () => {
    expect(foodBasis({ servingGrams: 350, servings: [serving('1 plate')] })).toEqual({ grams: 350 })
  })

  // The case the whole module is for: USDA milk, per 100 g, with a cup beside
  // it at 244 g. A cup of milk is then worth 2.44 base servings, and a
  // tablespoon a sixteenth of that.
  it('works out a density from a cup portion beside a 100 g base', () => {
    const basis = foodBasis({
      servingGrams: 100,
      servings: [serving('100 g'), serving('1 cup', 2.44, 244)],
    })
    expect(basis.grams).toBe(100)
    expect((basis.grams ?? 0) / (basis.ml ?? 1)).toBeCloseTo(1.031, 2)
  })

  // A drink quoted per glass in ml: spoons and cups are arithmetic, grams are
  // not offered because nothing said what a millilitre of it weighs.
  it('offers volume and no weight for a drink measured only in ml', () => {
    expect(foodBasis({ servings: [serving('Regular (350 ml)')] })).toEqual({ ml: 350 })
  })

  // A plate of nasi lemak has a weight and no volume. A cup of it means
  // nothing, so no cup is offered.
  it('offers no volume for a dish nobody measured by volume', () => {
    expect(foodBasis({ servingGrams: 300, servings: [serving('1 plate')] }).ml).toBeUndefined()
  })

  // The trap a saved entry sets: its `servingLabel` is the portion CHOSEN. Read
  // as the base, a plate logged as one tablespoon would make the whole plate a
  // tablespoon. The portion's factor says what it is a fraction of.
  it('reads a chosen portion against its own factor', () => {
    const basis = foodBasis({ servingGrams: 300, servings: [serving('1 tbsp', 0.05)] })
    expect(basis.ml).toBeCloseTo(295.7, 0)
  })

  it('drops a volume whose density no food has', () => {
    // A tablespoon at three times a 100 g base is 300 g in 15 ml: 20 g/ml.
    expect(
      foodBasis({ servingGrams: 100, servings: [serving('100 g'), serving('1 tbsp', 3)] }).ml,
    ).toBeUndefined()
  })
})

describe('measurePortions', () => {
  const milk = [serving('100 g'), serving('1 cup', 2.44, 244)]
  const basis = foodBasis({ servingGrams: 100, servings: milk })

  // "100 g" and "1 cup" are already there, with the catalogue's own factors,
  // and an entry logged against either must still find it.
  it('adds the units the catalogue does not already list', () => {
    const added = measurePortions(milk, basis)
    expect(added.map((s) => s.id)).toEqual([
      `${MEASURE_ID}oz`,
      `${MEASURE_ID}ml`,
      `${MEASURE_ID}tsp`,
      `${MEASURE_ID}tbsp`,
      `${MEASURE_ID}floz`,
    ])
    expect(added.find((s) => s.id === `${MEASURE_ID}tbsp`)).toEqual({
      id: `${MEASURE_ID}tbsp`,
      label: '1 tbsp',
      factor: 0.153,
    })
  })

  // `numeric(6, 3)`: a one-gram portion of a 300 g plate would round to a
  // tenth light, so grams go by the hundred and the quantity carries the rest.
  it('measures grams by the hundred, so the factor survives its column', () => {
    const [grams] = measurePortions([serving('1 plate')], { grams: 300 })
    expect(grams).toEqual({ id: `${MEASURE_ID}g`, label: '100 g', factor: 0.333 })
  })

  // A teaspoon of a 2 L bottle is 0.00246 of it, which `numeric(6, 3)` stores
  // as 0.002, 19% light. A unit the column cannot price is not offered.
  it('drops a unit whose factor the column would round by more than 2%', () => {
    const units = measurePortions([serving('1 bottle (2 L)')], { ml: 2000 }).map((s) => s.id)
    expect(units).not.toContain(`${MEASURE_ID}tsp`)
    expect(units).not.toContain(`${MEASURE_ID}tbsp`)
    expect(units).toContain(`${MEASURE_ID}cup`)
    expect(units).toContain(`${MEASURE_ID}ml`)
  })

  it('offers nothing for a dish with no weight and no volume', () => {
    expect(measurePortions([serving('1 plate')], {})).toEqual([])
  })
})

describe('measureOf', () => {
  it('recognises a portion that is nothing but a unit', () => {
    expect(measureOf('100 g')).toEqual({ unit: 'g', block: 100 })
    expect(measureOf('1 tbsp')).toEqual({ unit: 'tbsp', block: 1 })
    expect(measureOf('1.0 cup')).toEqual({ unit: 'cup', block: 1 })
    expect(measureOf('1 fl oz')).toEqual({ unit: 'floz', block: 1 })
  })

  // These are portions that happen to be measured, and they count as portions:
  // "2 × 2 tbsp (32 g)" is the honest reading.
  it('leaves a portion with a count or a weight in it alone', () => {
    expect(measureOf('2 tbsp (32 g)')).toBeNull()
    expect(measureOf('250 ml')).toBeNull()
    expect(measureOf('1 plate')).toBeNull()
  })
})

describe('unitFactor and unitsFor', () => {
  it('prices a unit in base servings', () => {
    expect(unitFactor('tbsp', { ml: 100 })).toBeCloseTo(0.1479, 4)
    expect(unitFactor('g', { ml: 100 })).toBeNull()
  })

  it('offers ounces only to somebody who chose imperial', () => {
    expect(unitsFor('metric', 'diary')).not.toContain('oz')
    expect(unitsFor('imperial', 'diary')[0]).toBe('oz')
  })
})

describe('roundedFor', () => {
  it('lands spoons on a quarter when one is near, and grams on whole grams', () => {
    expect(roundedFor('tbsp', 2.24)).toBe(2.25)
    // A quarter 6% away would change what was eaten, not how it is written.
    expect(roundedFor('tbsp', 2.13)).toBe(2.13)
    expect(roundedFor('cup', 0.6)).toBe(0.6)
    expect(roundedFor('g', 349.6)).toBe(350)
    expect(roundedFor('cup', 0.05)).toBe(0.05)
  })
})

describe('steppedTo', () => {
  // 100 g of milk is 0.41 cup. Adding a quarter from there walked 0.66, 0.91,
  // 1.16: never a mark on a measuring cup.
  it('lands an off-grid amount on the next mark', () => {
    expect(steppedTo(0.41, 0.25, 1)).toBe(0.5)
    expect(steppedTo(0.41, 0.25, -1)).toBe(0.25)
    expect(steppedTo(155, 10, 1)).toBe(160)
  })

  it('moves an on-grid amount by one step', () => {
    expect(steppedTo(0.5, 0.25, 1)).toBe(0.75)
    expect(steppedTo(350, 10, -1)).toBe(340)
  })
})

// The catalogue and the scan count millilitres as grams in their weight
// columns, so a drink's 350 there is its 350 ml again, not a measured density.
it('does not take a weight column equal to the volume as a density', () => {
  expect(foodBasis({ servingGrams: 350, servings: [serving('Regular (350 ml)')] })).toEqual({
    ml: 350,
  })
  // A label that says grams is believed.
  expect(foodBasis({ servings: [serving('1 cup (237 g)')] }).grams).toBe(237)
})

it('keeps a decimal on small gram amounts, where a whole gram is coarse', () => {
  expect(roundedFor('g', 10.5)).toBe(10.5)
  expect(roundedFor('g', 52.4)).toBe(52)
})
