import type { Recipe } from '@/data'
import {
  ingredientsInStep,
  normaliseSourceUrl,
  parseMinutes,
  recipeLog,
  scaleIngredient,
  sourceHost,
  totalMinutes,
} from '../cooking'

const base = {
  tags: [],
  isFavourite: false,
} as unknown as Recipe

describe('totalMinutes', () => {
  it('adds prep and cook, and says nothing when neither was given', () => {
    expect(totalMinutes({ prepMinutes: 20, cookMinutes: 50 })).toBe(70)
    expect(totalMinutes({ cookMinutes: 15 })).toBe(15)
    expect(totalMinutes({})).toBeUndefined()
  })
})

describe('scaleIngredient', () => {
  it('moves the amount with the people being cooked for', () => {
    expect(scaleIngredient({ amount: 600 }, 6, 3).amount).toBe(300)
    expect(scaleIngredient({ amount: 3 }, 4, 6).amount).toBe(4.5)
  })

  it('leaves the row alone at the written servings', () => {
    const item = { amount: 400 }
    expect(scaleIngredient(item, 4, 4)).toBe(item)
  })
})

describe('recipeLog', () => {
  it('logs servings of the pot as a recipe entry on the given day', () => {
    const recipe = {
      ...base,
      id: 'r1',
      name: 'Kari ayam',
      perServing: { kcal: 512, carbs: 30, protein: 17, fat: 8 },
    } as Recipe
    expect(recipeLog(recipe, 2, '2026-11-21')).toEqual(
      expect.objectContaining({
        quantity: 2,
        logDate: '2026-11-21',
        source: 'quickAdd',
        method: 'recipe',
      }),
    )
  })
})

describe('parseMinutes', () => {
  it('reads digits, treats empty as unsaid and clamps to two days', () => {
    expect(parseMinutes('45')).toBe(45)
    expect(parseMinutes('')).toBeNull()
    expect(parseMinutes('99999')).toBe(2880)
  })
})

describe('normaliseSourceUrl', () => {
  it('adds the scheme nobody types', () => {
    expect(normaliseSourceUrl('instagram.com/reel/abc')).toBe('https://instagram.com/reel/abc')
    expect(normaliseSourceUrl(' https://youtu.be/x ')).toBe('https://youtu.be/x')
  })

  it('refuses what the column would refuse', () => {
    expect(normaliseSourceUrl('not a link')).toBeNull()
    expect(normaliseSourceUrl('nan')).toBeNull()
    expect(normaliseSourceUrl('')).toBeNull()
  })

  it('names the site, not the whole address', () => {
    expect(sourceHost('https://www.instagram.com/reel/abc')).toBe('instagram.com')
  })
})

describe('ingredientsInStep', () => {
  const names = (step: string, pot: Array<{ name: string }>) =>
    ingredientsInStep(step, pot).map((item) => item.name)

  it('finds a whole name, and the meat alone for a cut of it', () => {
    const pot = [{ name: 'Chicken thighs' }, { name: 'Curry powder' }, { name: 'Potato' }]
    expect(names('Add the chicken, the curry powder and the potatoes.', pot)).toEqual([
      'Chicken thighs',
      'Curry powder',
      'Potato',
    ])
  })

  it('does not match on one word of a longer name', () => {
    const pot = [
      { name: 'Soy sauce' },
      { name: 'Oyster sauce' },
      { name: 'Rice vinegar' },
      { name: 'Ground pork' },
      { name: 'Ground white pepper' },
    ]
    expect(names('Splash in the soy sauce.', pot)).toEqual(['Soy sauce'])
    expect(names('Cook the rice.', pot)).toEqual([])
    expect(names('Season with ground white pepper.', pot)).toEqual(['Ground white pepper'])
  })

  it('matches whole words, not the inside of one', () => {
    expect(names('Thicken with cornflour.', [{ name: 'Corn' }])).toEqual([])
  })
})
