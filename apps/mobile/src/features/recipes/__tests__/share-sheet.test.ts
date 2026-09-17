import { recipeLink } from '@/features/recipes/share'

describe('recipeLink', () => {
  it('uses the website route that hands a shared recipe to the app', () => {
    expect(recipeLink('family-rendang-deadbeef')).toBe(
      'https://ricecal.app/r/family-rendang-deadbeef',
    )
  })

  it('keeps an unexpected slug inside one path segment', () => {
    expect(recipeLink('family dinner/Friday')).toBe(
      'https://ricecal.app/r/family%20dinner%2FFriday',
    )
  })
})
