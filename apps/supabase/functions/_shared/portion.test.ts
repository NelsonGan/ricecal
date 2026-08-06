// The portion arithmetic, tested — because it is the one part of the cascade
// whose failures are silent. A serving label read wrong does not throw and does
// not log: it produces a plausible number for the wrong amount of food, and
// lands in someone's diary as a fact.
//
//   deno test --no-lock --allow-env --config scan-meal/deno.json _shared/
//
// The labels below are real: every string in `servingGrams` came out of
// `select label, count(*) from food_servings group by 1 order by 2 desc`, which
// is why the imperial spellings look the way they do.

import { plausibleForGrams, reconcile, servingGrams, servingUnitCount } from './portion.ts'

const eq = (got: unknown, want: unknown, what: string) => {
  if (got !== want) throw new Error(`${what}: expected ${want}, got ${got}`)
}

Deno.test('servingGrams reads a plain weight', () => {
  eq(servingGrams('100 g'), 100, '100 g')
  eq(servingGrams('250g'), 250, 'no space')
  eq(servingGrams('1 kg'), 1000, 'kilograms')
  eq(servingGrams('330 ml'), 330, 'millilitres as grams')
})

Deno.test('servingGrams reads the imperial units the import produced', () => {
  eq(servingGrams('1 ONZ'), 28.4, 'ounce, abbreviated as the source spells it')
  eq(servingGrams('3.0 oz'), 85.1, 'ounces with a decimal')
  eq(servingGrams('8 OZA'), 236.6, 'fluid ounces')
  eq(servingGrams('1.0 fl oz'), 29.6, 'fluid ounces spelled out')
  eq(servingGrams('1.0 lb'), 453.6, 'pounds')
  eq(servingGrams('1/2 lb'), 226.8, 'a fraction of a pound')
})

Deno.test('servingGrams prefers the weight in parentheses to the portion in front of it', () => {
  eq(servingGrams('1 bowl (400 g)'), 400, 'a bowl that says what it holds')
  eq(servingGrams('1 whole chicken (900 g)'), 900, 'a chicken that says what it weighs')
})

Deno.test('servingGrams refuses a volume whose density it does not know', () => {
  // A cup of cooked rice is 200 g, a cup of oil is 218 g and a cup of
  // cornflakes is 30 g. Reading them with any one density would put a
  // confident wrong number where there is an honest null.
  eq(servingGrams('1 cup'), null, 'cups')
  eq(servingGrams('2 Tbsp'), null, 'tablespoons')
  eq(servingGrams('1/4 tsp'), null, 'teaspoons')
  eq(servingGrams('1 PIECE'), null, 'a piece is a count, not a weight')
  eq(servingGrams('Quantity not specified'), null, "the import's own shrug")
  eq(servingGrams(null), null, 'no label at all')
  // A sack of rice and a pinch of salt are both real rows, and dividing by
  // either produces a density that would then be treated as fact.
  eq(servingGrams('5 kg'), null, 'too heavy to be a serving')
  eq(servingGrams('0.5 g'), null, 'too light to be a serving')
  // The unit is whatever text the catalogue put in the label, and it indexes a
  // plain object: `scale['constructor']` is a function, not a weight.
  eq(servingGrams('1 constructor'), null, 'an inherited property is not a unit')
  eq(servingGrams('2 toString'), null, 'nor is that one')
})

Deno.test('servingUnitCount counts only countable units', () => {
  eq(servingUnitCount('10 sticks'), 10, 'ten satay')
  eq(servingUnitCount('3 PIECES'), 3, 'pieces, however the source capitalises them')
  eq(servingUnitCount('100 g'), 1, 'a hundred grams is one serving, not a hundred of anything')
  eq(servingUnitCount('1 cup'), 1, 'a cup is one serving')
  eq(servingUnitCount(null), 1, 'no label')
})

Deno.test('reconcile caps a figure its own weight cannot hold', () => {
  // The satay stick that started all this: 180 kcal in 30 g is 6 kcal/g, which
  // is denser than cheese and about double what grilled chicken can be.
  const stick = reconcile({
    grams: 30,
    kcal: 180,
    carbs_g: null,
    protein_g: null,
    fat_g: null,
  })
  eq(stick.kcal, 180, 'exactly at the ceiling, so left alone')

  const rind = reconcile({ grams: 8, kcal: 160, carbs_g: null, protein_g: null, fat_g: null })
  eq(rind.kcal, 48, 'four pork rinds are not 640 kcal')
})

Deno.test('reconcile never raises a figure', () => {
  // The asymmetry is the point: a number too big for the mass is impossible, a
  // number too small for it usually means the mass was measured against the
  // wrong thing. Nine apple slices arrived with the weight of a whole apple.
  const slice = reconcile({ grams: 160, kcal: 11, carbs_g: null, protein_g: null, fat_g: null })
  eq(slice.kcal, 11, 'left where it was')
})

Deno.test('reconcile prefers macros that fit the mass over a contradicting kcal', () => {
  // 8 g of protein and 2 g of fat is 50 kcal, whatever else was claimed.
  const stick = reconcile({ grams: 30, kcal: 180, carbs_g: 0, protein_g: 8, fat_g: 2 })
  eq(stick.kcal, 50, 'Atwater over assertion')
})

Deno.test('reconcile shrinks macros that outweigh the thing they are in', () => {
  // 30 g of protein in a 30 g stick describes protein isolate, not chicken.
  const impossible = reconcile({ grams: 30, kcal: 400, carbs_g: 0, protein_g: 30, fat_g: 15 })
  if ((impossible.protein_g ?? 0) + (impossible.fat_g ?? 0) > 30) {
    throw new Error('macros still outweigh the unit')
  }
  if (impossible.kcal > 30 * 6) throw new Error('kcal still over the ceiling')
})

Deno.test('reconcile leaves an unweighed part alone', () => {
  const part = { grams: null, kcal: 900, carbs_g: null, protein_g: null, fat_g: null }
  eq(reconcile(part).kcal, 900, 'nothing to check it against')
})

Deno.test('plausibleForGrams judges a catalogue row against a weight', () => {
  eq(plausibleForGrams(36, 30), true, 'a satay stick from the catalogue')
  eq(plausibleForGrams(720, 50), false, 'a 50 g meatball is not 720 kcal')
  eq(plausibleForGrams(0, 30), false, 'a free lunch')
})
