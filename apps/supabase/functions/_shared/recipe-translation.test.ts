// An imported recipe in the reader's language: which languages are asked for,
// what the model is shown, and what of its answer is kept.
//
//   deno test --no-lock --allow-env --config scan-meal/deno.json _shared/

import { assertEquals } from 'jsr:@std/assert@1'
import {
  shapeTranslation,
  type TranslationSource,
  translateUserMessage,
  translationLanguage,
  translationSource,
} from './recipe-translation.ts'

const SOURCE: TranslationSource = {
  name: 'Char kway teow',
  steps: 'Heat the oil.\nFry the noodles for 2 minutes.',
  ingredients: ['Flat rice noodle', 'Egg'],
}

Deno.test('English, a missing language and an unknown one are answered in English', () => {
  assertEquals(translationLanguage('en'), null)
  assertEquals(translationLanguage(undefined), null)
  assertEquals(translationLanguage('xx'), null)
  assertEquals(translationLanguage('__proto__'), null)
  assertEquals(translationLanguage('zh-Hans'), 'zh-Hans')
  assertEquals(translationLanguage('th'), 'th')
})

Deno.test('the cached draft is read as its own words', () => {
  assertEquals(
    translationSource({
      name: ' Char kway teow ',
      steps: SOURCE.steps,
      ingredients: [{ name: 'Flat rice noodle', amount: 400 }, { name: 'Egg' }, { amount: 1 }],
    }),
    SOURCE,
  )
  assertEquals(translationSource({ name: '' }), null)
})

Deno.test('the model is shown each step and ingredient numbered, inside the fence', () => {
  const message = translateUserMessage(SOURCE, 'zh-Hans')
  assertEquals(message.split('\n'), [
    'Translate into Simplified Chinese (简体中文).',
    '-----BEGIN RECIPE-----',
    'Name: Char kway teow',
    'Ingredients:',
    '1. Flat rice noodle',
    '2. Egg',
    'Method:',
    '1. Heat the oil.',
    '2. Fry the noodles for 2 minutes.',
    '-----END RECIPE-----',
  ])
})

Deno.test('a full answer becomes the name, the method a line a step, and names by English', () => {
  assertEquals(
    shapeTranslation(
      { name: '炒粿条', steps: ['把油烧热。', '炒河粉 2 分钟。'], ingredients: ['河粉', '鸡蛋'] },
      SOURCE,
    ),
    {
      name: '炒粿条',
      steps: '把油烧热。\n炒河粉 2 分钟。',
      ingredients: { 'Flat rice noodle': '河粉', Egg: '鸡蛋' },
    },
  )
})

Deno.test('an answer missing any part is no translation, so the next import asks again', () => {
  const full = { name: '炒粿条', steps: ['把油烧热。', '炒河粉。'], ingredients: ['河粉', '鸡蛋'] }
  assertEquals(shapeTranslation({ ...full, steps: ['把油烧热。'] }, SOURCE), null)
  assertEquals(shapeTranslation({ ...full, ingredients: ['河粉'] }, SOURCE), null)
  assertEquals(shapeTranslation({ ...full, ingredients: ['河粉', ''] }, SOURCE), null)
  assertEquals(shapeTranslation({ ...full, name: '' }, SOURCE), null)
  assertEquals(shapeTranslation({ ...full, steps: undefined }, SOURCE), null)
})

Deno.test('a recipe with no method needs none translated', () => {
  assertEquals(
    shapeTranslation({ name: '炒粿条', ingredients: ['河粉', '鸡蛋'] }, { ...SOURCE, steps: null }),
    { name: '炒粿条', ingredients: { 'Flat rice noodle': '河粉', Egg: '鸡蛋' } },
  )
})

Deno.test('every line comes back on one line, without the number it was shown with', () => {
  assertEquals(
    shapeTranslation(
      {
        name: '炒粿条\n(Char kway teow)',
        steps: ['1. 把油\n烧热。', '2、炒河粉。'],
        ingredients: ['1. 河粉', '2) 鸡蛋'],
      },
      SOURCE,
    ),
    {
      name: '炒粿条 (Char kway teow)',
      steps: '把油 烧热。\n炒河粉。',
      ingredients: { 'Flat rice noodle': '河粉', Egg: '鸡蛋' },
    },
  )
})

Deno.test('an answer with nothing usable is no translation', () => {
  assertEquals(shapeTranslation({}, SOURCE), null)
  assertEquals(shapeTranslation('炒粿条', SOURCE), null)
})
