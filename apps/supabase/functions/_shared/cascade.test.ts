// The size decision, tested against the rows that actually caused the bugs.
//
//   deno test --no-lock --allow-env --config scan-meal/deno.json _shared/
//
// `bestFit` is where a component stops being a name and becomes a number, and
// every catalogue row quoted below is a real one — the satay priced by the ten,
// the rice flour that outranks rice, the restaurant portion that is four times
// the plate. Each of these was a wrong entry in someone's diary first.

import { bestFit, priceRow, type SearchRow } from './cascade.ts'

const eq = (got: unknown, want: unknown, what: string) => {
  if (got !== want) throw new Error(`${what}: expected ${want}, got ${got}`)
}
const near = (got: number, want: number, what: string) => {
  if (Math.abs(got - want) > 1) throw new Error(`${what}: expected ~${want}, got ${got}`)
}

/**
 * A catalogue row.
 *
 * `serving_grams` is the weight the CATALOGUE states for its own portion, and
 * it is separate from the label on purpose — that is the whole subject of the
 * last two tests here. Null means the row only ever said its portion in words,
 * which is what every Postgres-era row did.
 */
const row = (
  name: string,
  kcal: number,
  serving_label: string | null,
  serving_grams: number | null = null,
): SearchRow => ({
  id: name,
  name,
  brand: null,
  kcal,
  carbs_g: null,
  protein_g: null,
  fat_g: null,
  fibre_g: null,
  sugar_g: null,
  sodium_mg: null,
  place: null,
  default_serving_id: 'serving',
  serving_label,
  serving_grams,
})

Deno.test('priceRow converts a row priced by weight to the weight asked for', () => {
  const fried = priceRow(row('Chicken, fried', 240, '100 g'), 60)
  near(fried.kcal, 144, '60 g of a 240 kcal/100 g row')
  eq(fried.byWeight, true, 'read by weight')
})

Deno.test('priceRow divides a row priced by the ten', () => {
  const satay = priceRow(row('Chicken Satay (Satay Ayam)', 365, '10 sticks'), 30)
  near(satay.kcal, 36.5, 'one stick out of ten')
  eq(satay.byWeight, false, 'the label gave a count, not a weight')
  eq(satay.units, 10, 'ten to a serving')
})

Deno.test('priceRow leaves a row that is one of the thing alone', () => {
  const egg = priceRow(row('Egg, boiled', 78, '1 egg'), 55)
  eq(egg.kcal, 78, 'one egg costs what the row says')
  eq(egg.units, 1, 'one to a serving')
  eq(egg.byWeight, false, 'not converted, so an entry can point straight at it')
})

Deno.test('bestFit takes the catalogue over an inflated guess', () => {
  // The founding bug. The model said 180 kcal for a 30 g satay stick; the old
  // gate was 0.25x-2x of THAT, so the catalogue's own 36 kcal a stick sat below
  // the floor and four skewers were logged at 720 kcal.
  const fit = bestFit([row('Chicken Satay (Satay Ayam)', 365, '10 sticks')], 30, 65)
  if (!fit) throw new Error('the right row was rejected')
  near(fit.kcal, 36.5, 'priced per stick')
})

Deno.test('bestFit rejects a row that cannot be this food at this weight', () => {
  // 40 g of lettuce matched a 140 kcal row — three and a half calories a gram,
  // which is chips, and fourteen times what the model correctly said a salad
  // costs.
  const fit = bestFit([row('Salad, chef, with dressing', 140, '1 serving')], 40, 10)
  eq(fit, null, 'a salad is not 3.5 kcal/g')
})

Deno.test('bestFit prefers the row nearest the reconciled figure', () => {
  // Search ranks by NAME, so rice flour outranks cooked rice for "white rice".
  const fit = bestFit(
    [row('Rice flour', 578, '1 cup'), row('Rice, white, cooked', 130, '100 g')],
    200,
    260,
  )
  if (!fit) throw new Error('nothing matched')
  eq(fit.row.name, 'Rice, white, cooked', 'the cooked rice, not the flour')
  near(fit.kcal, 260, '200 g at 1.3 kcal/g')
})

Deno.test('bestFit will not price an unpriced part from an absurd row', () => {
  // A part the model named and weighed but did not cost. Falling back to the
  // top hit regardless is how a 50 g meatball became a 720 kcal row.
  eq(
    bestFit([row('Meatballs, party platter', 720, '1 platter')], 50, 0),
    null,
    'fourteen calories a gram',
  )
  const ok = bestFit([row('Meatball, beef', 60, '1 piece')], 50, 0)
  if (!ok) throw new Error('a plausible row should still be taken')
  eq(ok.kcal, 60, 'the top plausible hit')
})

Deno.test('bestFit falls back to the old band when nothing was weighed', () => {
  // No grams: the model's figure is all there is, and the band stays the
  // tighter 0.25x-2x it always was.
  const rows = [row('Sausage, huge', 400, '1 sausage'), row('Sausage, grilled', 90, '1 sausage')]
  const fit = bestFit(rows, null, 80)
  if (!fit) throw new Error('nothing matched')
  eq(fit.row.name, 'Sausage, grilled', 'the one that could be this sausage')
})

Deno.test('bestFit returns nothing rather than the wrong thing', () => {
  eq(bestFit([], 30, 65), null, 'no rows at all')
  eq(bestFit([row('Whole roast chicken', 2228, '1 chicken')], 45, 90), null, 'nothing close')
})

Deno.test('priceRow reads the weight the catalogue STATES, not just the label', () => {
  // The benefit of the move to D1 that went unclaimed for a while. A curated
  // Malaysian dish states its portion in words — "1 plate" — and carries the
  // weight in a column beside it, so reading the label alone answered null and
  // switched the whole weight path off for exactly the rows that had the
  // number. Half a plate of char kuey teow was logged as a whole one.
  const ckt = priceRow(row('Char Kuey Teow', 655, '1 plate', 300), 150)
  near(ckt.kcal, 327.5, 'half of a 300 g plate')
  eq(ckt.byWeight, true, 'the stated weight is a weight')
})

Deno.test('priceRow still falls back to the label when there is no stated weight', () => {
  const fried = priceRow(row('Chicken, fried', 240, '100 g', null), 60)
  near(fried.kcal, 144, 'recovered from the label')
  eq(fried.byWeight, true, 'a label can carry a weight too')

  const plate = priceRow(row('Mystery plate', 500, '1 plate', null), 200)
  eq(plate.byWeight, false, 'no weight anywhere, so the unit count is all there is')
})
