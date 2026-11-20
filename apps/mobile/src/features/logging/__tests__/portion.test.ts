import {
  canSwitch,
  openingPortion,
  portionChips,
  portionControl,
  quantityFor,
  rememberedPortion,
  switchedQuantity,
} from '../portion'

const plate = { id: 'f:plate', label: '1 plate (350 g)', factor: 1 }
const large = { id: 'f:large', label: 'Large', factor: 1.5 }
const grams = { id: 'measure:g', label: '100 g', factor: 0.286 }
const tbsp = { id: 'measure:tbsp', label: '1 tbsp', factor: 0.05 }

describe('portionControl', () => {
  it('counts portions in quarters, as before', () => {
    expect(portionControl(plate, 1.5)).toEqual({
      unit: null,
      shown: 1.5,
      step: 0.25,
      min: 0.25,
      max: 20,
    })
  })

  it('counts a "100 g" portion in grams', () => {
    expect(portionControl(grams, 1.55)).toMatchObject({ unit: 'g', shown: 155, step: 10 })
    expect(quantityFor(grams, 155)).toBe(1.55)
  })

  it('counts spoons by the half', () => {
    expect(portionControl(tbsp, 2)).toMatchObject({ unit: 'tbsp', shown: 2, step: 0.5 })
  })
})

describe('switchedQuantity', () => {
  // Picking "Large" means a large one of however many there were.
  it('keeps the count between two portions', () => {
    expect(switchedQuantity(plate, 2, large)).toBe(2)
  })

  // Picking "g" asks what the plate is in grams. One gram would reprice a
  // lunch to three calories under the user's finger.
  it('keeps the amount eaten when a unit is picked', () => {
    // One 350 g plate at factor 0.286 per hundred grams: 350 g.
    expect(portionControl(grams, switchedQuantity(plate, 1, grams)).shown).toBe(350)
  })

  it('keeps the amount eaten on the way back to a portion', () => {
    // 440 g of a 350 g plate is within 5% of a plate and a quarter.
    expect(switchedQuantity(grams, 4.4, plate)).toBe(1.25)
    // 150 g is not near a quarter, so it stays the share it is.
    expect(switchedQuantity(grams, 1.5, plate)).toBe(0.43)
  })

  // Two stored factors, each rounded to three places, made 1½ cups 24¼ tbsp.
  it('converts exactly between two units of one family', () => {
    const cup = { id: 'measure:cup', label: '1 cup', factor: 0.676 }
    const spoon = { id: 'measure:tbsp', label: '1 tbsp', factor: 0.042 }
    expect(switchedQuantity(cup, 1.25, spoon)).toBe(20)
    // 1½ cups is 24 tbsp, past the 20 a spoon control steps to: not offered.
    expect(canSwitch(cup, 1.5, spoon)).toBe(false)
  })

  it('rounds spoons to a quarter when converting into them', () => {
    // 100 g at 0.286 is 0.286 base servings, which is 5.72 tablespoons.
    expect(switchedQuantity(grams, 1, tbsp)).toBe(5.75)
  })
})

describe('portionChips', () => {
  const servings = [plate, large, grams, tbsp, { id: 'measure:oz', label: '1 oz', factor: 0.081 }]

  it('splits portions from units, and keeps ounces off a metric phone', () => {
    const chips = portionChips(servings, 'metric', plate.id)
    expect(chips.portions.map((s) => s.id)).toEqual([plate.id, large.id])
    expect(chips.measures.map((m) => m.unit)).toEqual(['g', 'tbsp'])
  })

  // An entry logged in ounces on somebody else's phone keeps its chip.
  it('always shows the unit in use', () => {
    expect(portionChips(servings, 'metric', 'measure:oz').measures.map((m) => m.unit)).toContain(
      'oz',
    )
  })

  it('puts ounces first for somebody who chose imperial', () => {
    expect(portionChips(servings, 'imperial', plate.id).measures[0].unit).toBe('oz')
  })
})

// What was eaten never shrinks to fit a unit. Six kilograms is 400 tbsp, past
// the quantity column's 100, so that chip is off rather than quietly a third.
describe('canSwitch', () => {
  const pot = { id: 'f:pot', label: '1 pot (2.5 kg)', factor: 1 }
  const potGrams = { id: 'measure:g', label: '100 g', factor: 0.04 }
  const potTbsp = { id: 'measure:tbsp', label: '1 tbsp', factor: 0.006 }

  it('keeps every gram of half a pot', () => {
    expect(portionControl(potGrams, switchedQuantity(pot, 0.5, potGrams)).shown).toBe(1250)
  })

  // 20 is the ceiling every store build steps to: three pots in grams is 75 of
  // "100 g", which an older app would cut to 20 on its first tap.
  it('refuses a switch past the ceiling older builds can step', () => {
    expect(canSwitch(pot, 3, potGrams)).toBe(false)
  })

  it('refuses a unit that cannot hold the amount', () => {
    expect(canSwitch(pot, 3, potTbsp)).toBe(false)
    expect(canSwitch(pot, 0.01, potTbsp)).toBe(true)
  })

  it('always allows a switch between two portions, which keeps the count', () => {
    expect(canSwitch(pot, 50, { label: 'Large', factor: 1.5 })).toBe(true)
  })
})

describe('openingPortion', () => {
  const pb = [
    { id: 'pb:base', label: '2 tbsp (32 g)', factor: 1 },
    { id: 'measure:tbsp', label: '1 tbsp', factor: 0.5 },
  ]

  // "1" over "2 tbsp" reads as one of something and means two.
  it('opens a spoon serving on the spoons', () => {
    expect(openingPortion(pb, '2 tbsp (32 g)', 'metric')).toEqual({
      id: 'measure:tbsp',
      quantity: 2,
    })
  })

  it('leaves a dish whose serving is a thing on that thing', () => {
    expect(
      openingPortion([{ id: 'p', label: '1 plate', factor: 1 }], '1 plate', 'metric'),
    ).toBeNull()
  })

  // A 250 ml "cup" is 1.06 US cups: opening on that would be stranger.
  it('stays on the serving when the measure would not land on a quarter', () => {
    const tea = [
      { id: 't:cup', label: '1 cup (250 ml)', factor: 1 },
      { id: 'measure:cup', label: '1 cup', factor: 0.946 },
    ]
    expect(openingPortion(tea, '1 cup (250 ml)', 'metric')).toBeNull()
  })
})

// Two tablespoons as cups is 0.125, stored as 0.13: 4% more than was eaten.
it('refuses a unit whose stored amount would move the calories', () => {
  const pbBase = { label: '2 tbsp (32 g)', factor: 1 }
  expect(canSwitch(pbBase, 1, { label: '1 cup', factor: 7.393 })).toBe(false)
  expect(canSwitch(pbBase, 1, { label: '1 tsp', factor: 0.167 })).toBe(true)
})

// Logged in spoons once, opened in spoons again: people eat the same thing the
// same way.
describe('rememberedPortion', () => {
  const servings = [{ id: 'pb:base' }, { id: 'measure:tbsp' }]

  it('opens on the portion this food was last logged at', () => {
    const recent = [
      { foodId: 'other', servingId: 'x', quantity: 3 },
      { foodId: 'pb', servingId: 'measure:tbsp', quantity: 1.5 },
      { foodId: 'pb', servingId: 'pb:base', quantity: 1 },
    ]
    expect(rememberedPortion('pb', servings, recent)).toEqual({ id: 'measure:tbsp', quantity: 1.5 })
  })

  it('ignores a portion the dish no longer offers, and a plate broken into parts', () => {
    expect(
      rememberedPortion('pb', servings, [{ foodId: 'pb', servingId: 'gone', quantity: 2 }]),
    ).toBeNull()
    expect(
      rememberedPortion('pb', servings, [
        { foodId: 'pb', servingId: 'pb:base', quantity: 2, ingredientCount: 3 },
      ]),
    ).toBeNull()
  })
})

// A "3 oz" serving on a metric phone opens on the serving, as the recipe picker
// opens it in grams: ounces are not on that person's list.
it("does not open on a unit the person's system leaves out", () => {
  const steak = [
    { id: 's:base', label: '3 oz', factor: 1 },
    { id: 'measure:oz', label: '1 oz', factor: 0.333 },
  ]
  expect(openingPortion(steak, '3 oz', 'metric')).toBeNull()
  expect(openingPortion(steak, '3 oz', 'imperial')).toEqual({ id: 'measure:oz', quantity: 3 })
})

// 420 g of a 350 g plate is 1.2 plates. At a 5% snap it became 1.25, which the
// 2.5% guard then refused, so the plate could not be picked back at all.
it('lets a plate be picked back from grams at its exact share', () => {
  const grams = { id: 'measure:g', label: '100 g', factor: 0.2857 }
  const plate = { id: 'p', label: '1 plate', factor: 1 }
  expect(switchedQuantity(grams, 4.2, plate)).toBe(1.2)
  expect(canSwitch(grams, 4.2, plate)).toBe(true)
})
