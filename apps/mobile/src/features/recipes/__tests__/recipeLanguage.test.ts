import type { Recipe, RecipeIngredient } from '@/data'
import { toRecipeTranslations } from '@/data/mappers'
import {
  cookingSteps,
  localiseIngredients,
  localiseRecipe,
  shownRecipe,
  translationFor,
} from '../recipeLanguage'

const ZH = {
  name: '炒粿条',
  steps: '把油烧热。\n炒河粉 2 分钟。',
  ingredients: { 'Flat rice noodle': '河粉', Egg: '鸡蛋' },
}

const recipe = {
  id: 'r1',
  name: 'Char kway teow',
  steps: 'Heat the oil.\nFry the noodles for 2 minutes.',
  translations: { 'zh-Hans': ZH },
} as unknown as Recipe

const ingredient = (id: string, name: string) => ({ id, name }) as RecipeIngredient

describe('an imported recipe in the reader language', () => {
  it('is shown translated where the recipe has that language, and English otherwise', () => {
    expect(translationFor(recipe, 'zh-Hans')).toBe(ZH)
    expect(translationFor(recipe, 'th')).toBeUndefined()
    expect(translationFor(recipe, 'en')).toBeUndefined()
    expect(shownRecipe(recipe, 'zh-Hans').name).toBe('炒粿条')
    expect(shownRecipe(recipe, 'th').name).toBe('Char kway teow')
  })

  it('keeps the English for a half the translation does not have', () => {
    const shown = localiseRecipe(recipe, { name: '炒粿条' })
    expect(shown.name).toBe('炒粿条')
    expect(shown.steps).toBe(recipe.steps)
  })

  it('names each ingredient by its English name, so one added since stays English', () => {
    const shown = localiseIngredients(
      [ingredient('a', 'Egg'), ingredient('b', 'Chilli'), ingredient('c', 'Flat rice noodle')],
      ZH,
    )
    expect(shown.map((item) => item.name)).toEqual(['鸡蛋', 'Chilli', '河粉'])
    expect(shown.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('pages a translated method a line a step, beside the English line', () => {
    expect(cookingSteps(recipe.steps, ZH.steps)).toEqual([
      { text: '把油烧热。', english: 'Heat the oil.' },
      { text: '炒河粉 2 分钟。', english: 'Fry the noodles for 2 minutes.' },
    ])
    // A translation that does not line up is matched by its own words.
    expect(cookingSteps(recipe.steps, '把油烧热。')).toEqual([
      { text: '把油烧热。', english: '把油烧热。' },
    ])
    // Switched to English, the same line-a-step pages, so the remembered step
    // is the same instruction in either language.
    expect(
      cookingSteps('Heat the oil. Then stir.\nFry it.', '把油烧热，搅拌。\n炒。', false),
    ).toEqual([
      { text: 'Heat the oil. Then stir.', english: 'Heat the oil. Then stir.' },
      { text: 'Fry it.', english: 'Fry it.' },
    ])
    // No translation: sentences, as cook mode always paged them.
    expect(cookingSteps('Heat the oil. Fry the noodles.', undefined)).toEqual([
      { text: 'Heat the oil.', english: 'Heat the oil.' },
      { text: 'Fry the noodles.', english: 'Fry the noodles.' },
    ])
  })
})

describe('toRecipeTranslations', () => {
  it('keeps the app languages and the text in them', () => {
    expect(
      toRecipeTranslations({
        'zh-Hans': ZH,
        en: { name: 'Char kway teow' },
        xx: { name: 'Unknown' },
        th: { name: '', steps: 4, ingredients: { Egg: 7 } },
        ja: { ingredients: ['卵'] },
      }),
    ).toEqual({ 'zh-Hans': ZH })
  })

  it('is nothing for nothing', () => {
    expect(toRecipeTranslations(null)).toBeUndefined()
    expect(toRecipeTranslations({})).toBeUndefined()
    expect(toRecipeTranslations([])).toBeUndefined()
  })
})
