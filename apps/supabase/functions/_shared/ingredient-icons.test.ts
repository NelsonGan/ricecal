// deno test --no-lock --allow-env --config scan-meal/deno.json _shared/ingredient-icons.test.ts

import { assertEquals as eq } from 'jsr:@std/assert@1'
import { iconFor } from './icon-match.ts'
import { ICON_NAMES } from './icons.generated.ts'
import { INGREDIENT_DRAWINGS, ingredientIconFor, RECIPE_TABLE } from './ingredient-icons.ts'

const drawn = (name: string) => ingredientIconFor(name)?.name ?? null

// A name that names no file inserts nowhere and fails nothing: it is a line
// that renders blank for ever. So every key and every answer has to be a file.
Deno.test('every recipe drawing is a file in food, and every phrase names one', () => {
  const food = new Set<string>(ICON_NAMES.food)
  for (const icon of Object.keys(INGREDIENT_DRAWINGS)) {
    if (!food.has(icon)) throw new Error(`${icon} is not in assets/icons/food`)
  }
  const known = new Set<string>(Object.values(ICON_NAMES).flat())
  for (const [phrase, icon] of Object.entries(RECIPE_TABLE)) {
    if (icon !== null && !known.has(icon)) throw new Error(`"${phrase}" -> "${icon}"`)
  }
})

// Phrases are matched against a normalised name, so one with a capital, an
// accent or punctuation in it could never match anything.
Deno.test('every phrase is already in the form it is matched in', () => {
  for (const phrase of Object.keys(RECIPE_TABLE)) {
    if (!/^[a-z0-9]+( [a-z0-9]+)*$/.test(phrase)) throw new Error(`"${phrase}" can never match`)
  }
})

// Each drawing is reached by at least its own name, or it is a file nothing
// draws.
Deno.test('every recipe drawing is reached by at least one phrase', () => {
  for (const icon of Object.keys(INGREDIENT_DRAWINGS)) {
    const reached = INGREDIENT_DRAWINGS[icon].some((phrase) => drawn(phrase) === icon)
    if (!reached) throw new Error(`no phrase draws ${icon}`)
  }
})

Deno.test('a recipe line reads the way a cook writes it', () => {
  eq(drawn('2 tbsp oyster sauce'), 'oyster-sauce')
  eq(drawn('Light soy sauce'), 'soy-sauce')
  eq(drawn('Dark soy sauce'), 'dark-soy-sauce')
  eq(drawn('3 cloves garlic, minced'), 'garlic')
  eq(drawn('Shallots, sliced'), 'shallots')
  eq(drawn('Bawang merah'), 'shallots')
  eq(drawn('Spring onions, chopped'), 'spring-onion')
  eq(drawn('Chicken thighs, boneless'), 'chicken-thigh')
  eq(drawn('Chicken'), 'whole-chicken')
  eq(drawn('Coconut milk (santan)'), 'coconut-milk')
  eq(drawn('Santan'), 'coconut-milk')
  eq(drawn('Lemongrass stalks, bruised'), 'lemongrass')
  eq(drawn('Belacan'), 'belacan')
  eq(drawn('Star anise'), 'star-anise')
  eq(drawn('Chicken stock'), 'broth-carton')
  eq(drawn('Chicken stock cube'), 'stock-cube')
  eq(drawn('Eggs'), 'eggs')
  eq(drawn('Egg yolks'), 'egg-yolk')
  eq(drawn('Water'), 'water-glass')
  eq(drawn('Salt'), 'salt-shaker')
  eq(drawn('Ground black pepper'), 'black-peppercorns')
  eq(drawn('Red pepper, diced'), 'bell-pepper')
  eq(drawn('Turmeric powder'), 'turmeric-powder')
  eq(drawn('Fresh turmeric'), 'turmeric-root')
  eq(drawn('Turmeric leaf'), null)
  eq(drawn('Beef shin'), 'beef-cubes')
  eq(drawn('Coconut milk, thick'), 'coconut-milk')
  eq(drawn('Kerisik'), 'coconut-flakes')
  eq(drawn('Rempah paste'), 'curry-paste')
})

// The longer phrase decides, whichever table it came from.
Deno.test('the more specific phrase wins', () => {
  eq(drawn('Sweet chilli sauce'), 'sweet-chilli-sauce')
  eq(drawn('Chilli sauce'), 'chilli-sauce')
  eq(drawn('Dried chillies'), 'dried-chilli')
  eq(drawn('Red chillies'), 'chilli')
  eq(drawn('Brown sugar'), 'brown-sugar')
  eq(drawn('Palm sugar'), 'gula-melaka')
  eq(drawn('Olive oil'), 'olive-oil')
  eq(drawn('Vegetable oil'), 'cooking-oil')
  eq(drawn('Rice flour'), 'rice-flour')
  eq(drawn('Glutinous rice flour'), 'glutinous-rice-flour')
  eq(drawn('Jasmine rice'), 'rice-grains')
  eq(drawn('Cooked rice'), 'rice-bowl')
  eq(drawn('Coconut cream'), 'coconut-cream')
  eq(drawn('Coconut'), 'coconut')
})

// A flavour does not outrank what it flavours, as in the catalogue.
Deno.test('a weak word still goes last', () => {
  eq(drawn('Honey'), 'honey')
  eq(drawn('Sugar'), 'white-sugar')
  eq(drawn('Chocolate chips'), 'chocolate-chips')
})

// Catalogue names picked into a pot keep the catalogue's reading where the
// recipe table has nothing to add.
Deno.test('anything the recipe table does not know falls back to iconFor', () => {
  eq(drawn('Nasi lemak'), 'nasi-lemak')
  eq(drawn('Tempeh'), 'tempeh')
  eq(drawn('Kellogg s Corn Flakes'), iconFor('Kellogg s Corn Flakes')?.name ?? null)
  eq(drawn('炒饭'), iconFor('炒饭')?.name ?? null)
  eq(drawn(''), null)
})

// The catalogue's own matcher is untouched: a scan of "Turkey sandwich" still
// draws what it drew before this table existed.
Deno.test('iconFor is not changed by the recipe table', () => {
  eq(iconFor('Turkey')?.name, 'grilled-chicken')
  eq(iconFor('Salmon')?.name, 'fish')
  eq(iconFor('Rice')?.name, 'rice-bowl')
})
