// The one thing standing between a model's answer and an `icon_name` column.
//
//   deno test --no-lock --allow-env --config scan-meal/deno.json _shared/
//
// This failure is silent in the worst way: `icon_name` is free text (only the
// SET is an enum), so an invented name inserts happily and renders a blank
// square forever. Nothing throws, nothing logs, and the row looks like every
// other row that simply has no drawing.

import { guessIcon, ICON_INSTRUCTION, ICON_LIST, resolveIcon } from './icons.ts'

const eq = (got: unknown, want: unknown, what: string) => {
  if (got !== want) throw new Error(`${what}: expected ${want}, got ${got}`)
}

Deno.test('resolveIcon answers with the set a name belongs to', () => {
  eq(resolveIcon('nasi-lemak')?.set, 'dishes', 'a dish')
  eq(resolveIcon('nasi-lemak')?.name, 'nasi-lemak', 'and its name')
  eq(resolveIcon('coconut')?.set, 'food', 'an ingredient')
})

// A model shown hyphenated slugs still answers in title case often enough that
// throwing those away would lose real answers to a formatting habit.
Deno.test('resolveIcon reads a name the model wrote its own way', () => {
  for (const raw of ['Nasi Lemak', ' nasi lemak ', 'NASI_LEMAK']) {
    eq(resolveIcon(raw)?.name, 'nasi-lemak', `"${raw}"`)
  }
})

// THE assertion. Everything that is not an icon we have has to come back as
// nothing, because nothing is a state the app already draws correctly.
Deno.test('resolveIcon refuses anything that is not a drawing we have', () => {
  for (const raw of ['ramen', 'a plate of nasi lemak', '', '   ', null, undefined, 42, {}, []]) {
    eq(resolveIcon(raw), null, `${JSON.stringify(raw)} must not resolve`)
  }
})

// The utensils, the dietary badges and the nutrient markers live in the same
// set as the food. A model handed those picks one: told to illustrate a plate
// of rice it has no reason to prefer "plate-rice" over "portion-plate".
Deno.test('the offered list is food and not the kitchen it was cooked in', () => {
  for (const name of ['wok', 'vegan', 'kcal-tag', 'kitchen-scale', 'empty-plate']) {
    eq(resolveIcon(name), null, `${name} is not a meal`)
  }
  for (const name of ['nasi-lemak', 'teh-tarik', 'canned-drink', 'cooking-pot']) {
    if (!resolveIcon(name)) throw new Error(`${name} should be offerable`)
  }
})

// The list is pasted into a prompt verbatim, so its shape is its contract: a
// stray quote or newline in there is a malformed instruction.
Deno.test('the prompt list is a plain comma-separated run of slugs', () => {
  const names = ICON_LIST.split(', ')
  if (names.length < 150) throw new Error(`only ${names.length} icons offered`)
  for (const name of names) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`"${name}" is not a slug`)
    if (!resolveIcon(name)) throw new Error(`"${name}" is offered but does not resolve`)
  }
  if (!ICON_INSTRUCTION.includes(ICON_LIST)) throw new Error('the instruction lost the list')
})

// The backstop for the model answering null, or answering a spelling we do not
// carry. Our slugs have one spelling of each dish and the world has several.
Deno.test('guessIcon reads a dish out of its own name', () => {
  eq(guessIcon('Nasi lemak')?.name, 'nasi-lemak', 'an exact slug')
  // Punctuation is a separator like any other, so the brackets do not stop
  // `roti` and `canai` from being two shared words.
  eq(guessIcon('Roti canai (kosong)')?.name, 'roti-canai', 'punctuation')
  // Two shared words, which is what the threshold is for: `char` and `teow`.
  eq(guessIcon('Char kway teow')?.name, 'char-kuey-teow', 'a near-miss spelling')
  eq(guessIcon('Roti canai')?.name, 'roti-canai', 'two words, exact')
})

// THE assertion, and the reason the threshold is two rather than one. A single
// shared word is a coincidence: putting a plate of chicken rice beside
// somebody's chicken soup is worse than the plain pot they would get instead.
Deno.test('guessIcon holds out for two shared words', () => {
  eq(guessIcon('Chicken soup'), null, 'one word is a coincidence')
  eq(guessIcon('Rice'), null, 'a single word cannot reach the threshold')
  eq(guessIcon('Dinner'), null, 'nothing to match')
  eq(guessIcon(''), null, 'empty')
  eq(guessIcon(null), null, 'not a string')
})

// The excluded drawings stay excluded however the name is spelled, since the
// fallback reads the same map the prompt is built from.
Deno.test('guessIcon cannot reach a drawing that is not a meal', () => {
  eq(guessIcon('kitchen scale'), null, 'not offerable')
  eq(guessIcon('empty plate'), null, 'not offerable')
})
