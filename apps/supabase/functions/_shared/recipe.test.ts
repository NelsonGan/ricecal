// The recipe model calls' shaping, tested — for the reason portion.test.ts
// gives about the cascade: these failures are silent. A misplaced decimal in a
// per-unit figure does not throw and does not log, it prices the wrong amount
// of food and writes it into somebody's recipe, where every future log of that
// dish inherits it.
//
//   deno test --no-lock --allow-env --config scan-meal/deno.json _shared/
//
// The reviewer half is tested for one property only, and it is the one that
// matters: nothing but an explicit `approved: true` may come back approved.

import { type DraftIngredient, reviewRecipe, reviewUserMessage, toIngredientRow } from './recipe.ts'

const eq = (got: unknown, want: unknown, what: string) => {
  if (got !== want) throw new Error(`${what}: expected ${want}, got ${got}`)
}

const draft = (over: Partial<DraftIngredient> = {}): DraftIngredient => ({
  name: 'Beef shin',
  amount: 1000,
  unit: 'g',
  kcal: 1640,
  carbs_g: 0,
  protein_g: 220,
  fat_g: 80,
  ...over,
})

Deno.test('toIngredientRow divides the total by the amount', () => {
  const row = toIngredientRow(draft(), 0)
  eq(row.kcal_per_unit, 1.64, 'kcal a gram')
  eq(row.protein_g_per_unit, 0.22, 'protein a gram')
  eq(row.fat_g_per_unit, 0.08, 'fat a gram')
  eq(row.carbs_g_per_unit, 0, 'carbs a gram')
  eq(row.amount, 1000, 'the amount is carried through unchanged')
  eq(row.position, 0, 'and so is the position')
})

// The round trip is the whole contract: per-unit times amount has to give back
// what the model said the ingredient costs, or the pot totals drift from the
// figures the model was looking at.
Deno.test('toIngredientRow round-trips back to the total it came from', () => {
  for (const [amount, kcal] of [
    [1000, 1640],
    [400, 780],
    [60, 340],
    [2, 5],
    [150, 210],
  ] as const) {
    const row = toIngredientRow(draft({ amount, kcal }), 0)
    const back = Math.round(row.kcal_per_unit * amount)
    if (Math.abs(back - kcal) > 1) {
      throw new Error(`${amount} at ${kcal} kcal came back as ${back}`)
    }
  }
})

// Four decimals is what the column holds. A single gram of an ingredient
// counted in pieces — one turmeric leaf at 2.5 kcal — must not round to zero,
// and a whole kilo must not round away a tenth of a calorie either.
Deno.test('toIngredientRow keeps a usable figure at both ends of the range', () => {
  eq(
    toIngredientRow(draft({ amount: 2, unit: 'piece', kcal: 5 }), 0).kcal_per_unit,
    2.5,
    'per leaf',
  )
  const gram = toIngredientRow(draft({ amount: 1000, kcal: 1 }), 0).kcal_per_unit
  if (gram <= 0) throw new Error(`a kilo at 1 kcal rounded to ${gram} a gram`)
})

// The reviewer reads the WORDS. It is deciding whether this is a recipe and
// whether it is fit to publish, and a calorie figure in front of it is a figure
// it will find fault with — which is what made the gate reject real cooking.
Deno.test('reviewUserMessage shows the reviewer the recipe and none of its arithmetic', () => {
  const message = reviewUserMessage({
    name: 'Kuah kacang',
    servings: 8,
    steps: 'Toast the peanuts.',
    ingredients: [{ name: 'Peanuts', amount: 500, unit: 'g' }],
  })
  for (const needle of ['Kuah kacang', 'Feeds: 8', 'Peanuts, 500 g', 'Toast the peanuts.']) {
    if (!message.includes(needle)) throw new Error(`the reviewer never sees ${needle}`)
  }
  if (/kcal/i.test(message)) throw new Error(`the reviewer was shown calories: ${message}`)
})

// THE assertion. A gate that can be talked into approving is not a gate, and
// the shapes below are what a bad model call actually returns: an empty object,
// a string, a truthy-but-not-true value.
Deno.test('reviewRecipe approves on an explicit true and on nothing else', async () => {
  const recipe = {
    name: 'x',
    servings: 1,
    steps: '',
    ingredients: [],
  }

  for (const answer of [{}, { approved: 'yes' }, { approved: 1 }, { approved: null }, null]) {
    const verdict = await reviewRecipe(recipe, { review: answer })
    eq(verdict.approved, false, `${JSON.stringify(answer)} must not approve`)
  }

  eq((await reviewRecipe(recipe, { review: { approved: true } })).approved, true, 'an explicit yes')
})

// A failure is not a rejection: the caller turns a throw into "still pending",
// which leaves the recipe public and unlisted rather than telling its author it
// was turned down by a reviewer that never read it.
Deno.test('reviewRecipe throws rather than answering when the call fails', async () => {
  try {
    await reviewRecipe({ name: 'x', servings: 1, steps: '', ingredients: [] }, { fail: 'review' })
  } catch {
    return
  }
  throw new Error('a failed review returned a verdict')
})
