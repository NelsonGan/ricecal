import type { Recipe } from '@/data'
import {
  ingredientsInStep,
  matchesFilter,
  normaliseSourceUrl,
  parseMinutes,
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

describe('matchesFilter', () => {
  it('reads quick as prep plus cook, and never guesses an untimed recipe', () => {
    expect(matchesFilter({ ...base, prepMinutes: 10, cookMinutes: 20 }, 'quick')).toBe(true)
    expect(matchesFilter({ ...base, prepMinutes: 10, cookMinutes: 21 }, 'quick')).toBe(false)
    expect(matchesFilter(base, 'quick')).toBe(false)
  })

  it('keeps tags and favourites', () => {
    expect(matchesFilter({ ...base, tags: ['dinner'] }, 'dinner')).toBe(true)
    expect(matchesFilter({ ...base, tags: ['lunch'] }, 'dinner')).toBe(false)
    expect(matchesFilter({ ...base, isFavourite: true }, 'favourites')).toBe(true)
    expect(matchesFilter(base, 'all')).toBe(true)
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
  const pot = [
    { name: 'Chicken thigh' },
    { name: 'Soy sauce' },
    { name: 'Oyster sauce' },
    { name: 'Curry powder' },
  ]

  it('finds a whole name, or its first word when that word means something', () => {
    expect(
      ingredientsInStep('Add the chicken and the curry powder.', pot).map((i) => i.name),
    ).toEqual(['Chicken thigh', 'Curry powder'])
  })

  it('does not match on the generic last word', () => {
    expect(ingredientsInStep('Splash in the soy sauce.', pot).map((i) => i.name)).toEqual([
      'Soy sauce',
    ])
  })
})
