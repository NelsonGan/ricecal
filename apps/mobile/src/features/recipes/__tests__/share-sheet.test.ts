import { recipeLink } from '@/features/recipes/share'

describe('recipeLink', () => {
  it('uses the website route that hands a shared recipe to the app', () => {
    expect(recipeLink('0123456789abcdef0123456789abcdef')).toBe(
      'https://ricecal.app/r/0123456789abcdef0123456789abcdef',
    )
  })

  it('keeps an unexpected slug inside one path segment', () => {
    expect(recipeLink('family dinner/Friday')).toBe(
      'https://ricecal.app/r/family%20dinner%2FFriday',
    )
  })
})
