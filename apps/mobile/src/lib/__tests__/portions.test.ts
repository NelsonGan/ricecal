import {
  eatenQuantity,
  formatPortion,
  type PortionWords,
  portionLabel,
  servingUnit,
} from '@/lib/portions'

/**
 * Serving labels out of the catalogue import.
 *
 * Every string in the "junk" block below is one an actual row carried, and one
 * a user actually saw on their lunch: `2 × 1 medium paper 9-5 dia` next to a
 * spoonful of rice. The rule is that a label has to look like something a
 * person would say, and anything else is dropped rather than dressed up.
 */
describe('servingUnit', () => {
  it('keeps a label that reads as a portion', () => {
    expect(servingUnit('1 plate')).toBe('plate')
    expect(servingUnit('1 bowl')).toBe('bowl')
    // The app's own English word, left for the caller to translate.
    expect(servingUnit('1 serving')).toBeNull()
  })

  it('drops the count, which the quantity beside it already says', () => {
    expect(servingUnit('0.5 box')).toBe('box')
    expect(servingUnit('10 pieces')).toBe('pieces')
  })

  // The number in front of a unit of MEASURE is the portion, not a count of
  // portions. Stripped, "100 g" became "g" under a jar of Marmite on the diary
  // — and per-100g is how most of the imported catalogue quotes itself, so this
  // went from an edge case to the common one when the catalogue grew.
  it('keeps the number when the unit is a measurement', () => {
    expect(servingUnit('100 g')).toBe('100 g')
    expect(servingUnit('30 g')).toBe('30 g')
    expect(servingUnit('250 ml')).toBe('250 ml')
    expect(servingUnit('1.5 oz')).toBe('1.5 oz')
  })

  it('drops preparation detail and parenthetical measurements', () => {
    expect(servingUnit('1.0 cup, loosely packed')).toBe('cup')
    expect(servingUnit('1 medium (3-3/4" long)')).toBe('medium')
  })

  it('refuses import junk outright', () => {
    expect(servingUnit('383 GRM')).toBeNull()
    expect(servingUnit('8 ONZ')).toBeNull()
    expect(servingUnit('Quantity not specified')).toBeNull()
    expect(servingUnit('None')).toBeNull()
    expect(servingUnit('')).toBeNull()
    expect(servingUnit(null)).toBeNull()
  })

  it('refuses anything still carrying a measurement', () => {
    // "1 medium paper (8-5/8" dia)" loses its bracket and keeps a unit; the
    // ones that keep a number are the ones that were never a portion.
    expect(servingUnit('9-5 dia')).toBeNull()
    expect(servingUnit('1 slice 4 x 4 x 1 inch')).toBeNull()
  })
})

// Every case here is a label and quantity real diary rows carry, out of a
// group-by over `food_logs`. The row said "serving" under nearly every meal,
// "0.5 × bowl" for half a bowl, "eggs" for two of them and "ml" for 250 ml.
describe('portionLabel', () => {
  const words: PortionWords = {
    servings: (q) => `${formatPortion(q)} ${q > 1 ? 'servings' : 'serving'}`,
    measured: (amount, unit) => `${amount} ${unit}`,
  }
  const say = (quantity: number, label: string | null) => portionLabel(quantity, label, words)

  it('says nothing for one plain serving', () => {
    expect(say(1, '1 serving')).toBeNull()
    expect(say(1, 'Quantity not specified')).toBeNull()
    expect(say(1, '')).toBeNull()
    expect(say(1, null)).toBeNull()
  })

  it('counts servings in the caller’s word otherwise', () => {
    expect(say(0.5, '1 serving')).toBe('½ serving')
    expect(say(2, '1 serving')).toBe('2 servings')
    expect(say(1.5, 'Quantity not specified')).toBe('1½ servings')
    // A code the import wrote is still a unit it can read.
    expect(say(1.5, '383 GRM')).toBe('574.5 g')
    // Inspects later parentheticals when the first is not a measurement.
    expect(say(1, '1 regular (approx) (350 ml)')).toBe('350 ml')
  })

  it('multiplies a count of servings the label carries', () => {
    expect(say(1, '2 servings')).toBe('2 servings')
    expect(say(2, '0.5 serving')).toBeNull()
    expect(say(1, '0.5 serving')).toBe('½ serving')
  })

  it('counts a thing in quarters, agreeing with the number', () => {
    expect(say(1, '1 plate')).toBe('1 plate')
    expect(say(0.5, '1 bowl')).toBe('½ bowl')
    expect(say(2, '1 piece')).toBe('2 pieces')
    expect(say(1.5, '1 glass (300 ml)')).toBe('1½ glasses')
    expect(say(2, '1 whole egg')).toBe('2 whole eggs')
  })

  it('keeps a × for a word it cannot inflect', () => {
    expect(say(0.5, '1 bungkus')).toBe('½ bungkus')
    expect(say(2, '1 bungkus')).toBe('2 × bungkus')
    expect(say(2, '1 egg without shell (50 g)')).toBe('2 × egg without shell')
  })

  it('keeps a count that is part of the portion, and multiplies it', () => {
    // Stripped of its count, "2 eggs" read "eggs".
    expect(say(1, '2 eggs')).toBe('2 eggs')
    expect(say(2, '2 eggs')).toBe('4 eggs')
    expect(say(0.5, '2 pieces')).toBe('1 piece')
    expect(say(1, '2 slice')).toBe('2 slices')
    expect(say(1, '6 inch sub')).toBe('6 inch sub')
    expect(say(2, '6 inch sub')).toBe('2 × 6 inch sub')
    expect(say(1, '1 1/2 slices')).toBe('1½ slices')
  })

  it('counts a thing written without a count as one of it', () => {
    expect(say(1, 'plate')).toBe('plate')
    expect(say(2, 'plate')).toBe('2 plates')
    // An object's own keys are not words it can inflect.
    expect(say(2, '1 constructor')).toBe('2 × constructor')
  })

  it('says a measurement as an amount, multiplied out', () => {
    expect(say(1.5, '100 g')).toBe('150 g')
    expect(say(2, '15.0g')).toBe('30 g')
    expect(say(0.5, '200 ml')).toBe('100 ml')
    expect(say(2, '1 tbsp')).toBe('2 tbsp')
    expect(say(1, '1 tablespoon (12 g)')).toBe('1 tbsp')
    // These read "ml" and "g".
    expect(say(1, '250 ml (250 ml)')).toBe('250 ml')
    expect(say(1, '25g, 1 sachet')).toBe('25 g')
    // A tenth of a gram, not "31.25 g".
    expect(say(0.25, '125 g')).toBe('31.3 g')
  })

  it('reads a portion or a size by the measurement in its bracket', () => {
    expect(say(1, '1 portion (100 g)')).toBe('100 g')
    expect(say(2, '1 serving (100 g)')).toBe('200 g')
    expect(say(0.5, 'Regular (350 ml)')).toBe('175 ml')
    expect(say(1, '1 whole (118 g)')).toBe('118 g')
    // A thing keeps its name: "1 bowl" says more than 400 g of soup.
    expect(say(1, '1 bowl (400 g)')).toBe('1 bowl')
  })

  it('leaves a word with no count as written', () => {
    expect(say(1, 'Half')).toBe('half')
    expect(say(1, 'Large')).toBe('large')
  })
})

describe('eatenQuantity', () => {
  it('is the entry’s own quantity when nobody left any of the plate', () => {
    expect(eatenQuantity({ quantity: 2 })).toBe(2)
    expect(eatenQuantity({ quantity: 1.25, plateQuantity: 1 })).toBe(1.25)
  })

  it('folds in how much of the plate was eaten', () => {
    expect(eatenQuantity({ quantity: 1, plateQuantity: 0.5 })).toBe(0.5)
    expect(eatenQuantity({ quantity: 2, plateQuantity: 0.75 })).toBe(1.5)
  })

  // What `food_logs.quantity` stores, and what a row prints: never a float
  // dropping, and never outside the column's check.
  it('keeps to hundredths and to the column', () => {
    expect(eatenQuantity({ quantity: 0.1, plateQuantity: 3 })).toBe(0.3)
    expect(eatenQuantity({ quantity: 0.25, plateQuantity: 0.03 })).toBe(0.01)
    expect(eatenQuantity({ quantity: 20, plateQuantity: 20 })).toBe(100)
  })
})

// Stripped of its count, "2 tbsp (32 g)" read "tbsp" beside a stepper at 1,
// which anybody reads as one spoon: half of what was logged.
describe('servingUnit for spoon portions', () => {
  it('keeps a spoon or cup count that is not one', () => {
    expect(servingUnit('2 tbsp (32 g)')).toBe('2 tbsp')
    expect(servingUnit('1/2 cup')).toBe('1/2 cup')
    expect(servingUnit('1 cup, chopped')).toBe('cup')
  })
})
