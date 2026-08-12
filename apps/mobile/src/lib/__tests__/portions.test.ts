import { portionLabel, servingUnit } from '@/lib/portions'

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
    expect(servingUnit('1 serving')).toBe('serving')
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

describe('portionLabel', () => {
  it('says nothing about the count at one', () => {
    expect(portionLabel(1, '1 plate', 'serving')).toBe('plate')
  })

  it('multiplies above and below one', () => {
    expect(portionLabel(2, '1 plate', 'serving')).toBe('2 × plate')
    expect(portionLabel(0.5, '1 bowl', 'serving')).toBe('0.5 × bowl')
  })

  it('falls back to the caller’s word when the label is unusable', () => {
    expect(portionLabel(2, '383 GRM', 'serving')).toBe('2 × serving')
  })
})
