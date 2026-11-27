import { toRecipeIngredient } from '@/data/mappers'
import { icons } from '@/ui/icons.generated'
import { ingredientIcon } from '../ingredient-icon'

// The matcher lives in `apps/supabase`, so this is also the proof that the app
// can import it at all: jest and Metro both have to follow the `.ts` paths.
describe('ingredientIcon', () => {
  it('draws a recipe line the way a cook writes it', () => {
    expect(ingredientIcon('2 tbsp oyster sauce')).toEqual({ set: 'food', name: 'oyster-sauce' })
    expect(ingredientIcon('Santan')).toEqual({ set: 'food', name: 'coconut-milk' })
    expect(ingredientIcon('Jasmine rice')).toEqual({ set: 'food', name: 'rice-grains' })
  })

  it('answers nothing rather than a wrong picture', () => {
    expect(ingredientIcon('')).toBeUndefined()
    expect(ingredientIcon('Turmeric leaf')).toBeUndefined()
  })

  it('only ever names a drawing the app ships', () => {
    for (const name of ['Shallots', 'Belacan', 'Chicken stock', 'Star anise', 'Nasi lemak']) {
      const icon = ingredientIcon(name)
      if (!icon) throw new Error(`${name} has no drawing`)
      expect((icons as Record<string, Record<string, unknown>>)[icon.set][icon.name]).toBeDefined()
    }
  })
})

describe('toRecipeIngredient', () => {
  it('carries the drawing for the stored name', () => {
    const row = toRecipeIngredient({
      id: 'a',
      name: 'Lemongrass',
      amount: 2,
      unit: 'piece',
    } as never)
    expect(row.icon).toEqual({ set: 'food', name: 'lemongrass' })
  })
})
