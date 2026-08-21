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

import {
  boundGramsToServing,
  isWholeMealServing,
  namesAPortion,
  namesOneArticle,
  plausibleForGrams,
  reconcile,
  rowIsMeatier,
  servingGrams,
  servingUnitCount,
  unfoldCounts,
} from './portion.ts'

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

Deno.test('isWholeMealServing tells a complete meal from a helping of one food', () => {
  // The labels that cost a plate of Hainanese chicken rice 40 g of phantom
  // protein: the rice component matched "Rice, Chicken (Nasi Ayam) — 1 plate",
  // which is rice with the bird already in it.
  eq(isWholeMealServing('1 plate'), true, 'a plate is a whole meal')
  eq(isWholeMealServing('1 plate (315 g)'), true, 'even when it states its weight')
  eq(isWholeMealServing('1 set'), true, 'a set meal')
  eq(isWholeMealServing('1 bento'), true, 'a bento')
  eq(isWholeMealServing('2 platters'), true, 'plural')

  // A part of a meal is measured in helpings, weights and pieces.
  eq(isWholeMealServing('100 g'), false, 'a weight')
  eq(isWholeMealServing('1 serving (120 g)'), false, 'a helping of one food')
  eq(isWholeMealServing('1 quarter (148 g)'), false, 'a quarter chicken')
  eq(isWholeMealServing('10 sticks'), false, 'satay')
  eq(isWholeMealServing('1 cup'), false, 'a cup')
  eq(isWholeMealServing(null), false, 'no label')
  // A bowl is deliberately not on the list: a bowl of laksa is a whole meal and
  // a bowl of soup beside a rice plate is a part of one.
  eq(isWholeMealServing('1 bowl (400 g)'), false, 'a bowl says nothing either way')
  // Substrings of longer words must not match — "template" holds "plate".
  eq(isWholeMealServing('1 template'), false, 'not a word boundary')
})

Deno.test('rowIsMeatier tells one food from another with the same calories', () => {
  // Every pair here is a real (part, chosen row) off a real scan, with the answer
  // read off the photograph. Both sides may be quoted per serving or per gram — a
  // share of energy is scale free, which is what lets this judge the two thirds of
  // the catalogue that state no weight.
  const fires = (
    rowProtein: number,
    rowKcal: number,
    partProtein: number,
    partKcal: number,
    disputed: number,
  ) =>
    rowIsMeatier(
      { protein: rowProtein, kcal: rowKcal },
      { protein: partProtein, kcal: partKcal },
      disputed,
    )

  // The three the gate exists for. An omelette priced from Canadian bacon, at 78%
  // of the row's energy against 27% of the model's:
  eq(fires(28.3, 145, 14, 210, 25.6), true, 'Canadian bacon is not an omelette')
  // rice priced from rice-with-the-chicken-in-it, which is where this started:
  eq(fires(16.1, 278, 5.5, 286, 8.5), true, 'a plate of chicken rice is not the rice under one')
  // and the one that needed the share test to be WEIGHT FREE. This row states no
  // weight, so it is handed over whole and a plate of steamed rice was charged
  // 27.5 g of protein.
  eq(fires(27.5, 226, 5, 260, 22.5), true, 'a weightless row is judged like any other')

  // ONE DIRECTION ONLY, and this is the safety. A model that over-eggs the protein
  // of real meat is the case the catalogue is here to correct: it claimed 66 g in
  // 220 g of poached chicken and the row's 23 g a serving is the better figure.
  eq(fires(23, 215, 66, 396, -19), false, 'the row claims the smaller share')
  // Nor when the row is right to ADD protein the model left out. Fried rice has
  // oil and egg in it that a model reading a photograph does not count.
  eq(fires(4.6, 177, 4, 234, 4.3), false, 'a fried rice row corrects the model, at 1.5x')
  eq(fires(2.7, 130, 4.4, 260, 1), false, 'plain rice, and the two agree')

  // Grams on the plate, not shares, is the second test. Dark soy really does hold
  // 8 g of protein per 100 g and a model really does report a sauce as zero.
  eq(fires(9.3, 76, 0, 10, 1.6), false, 'a 20 g dip disputes 1.6 g, not worth an argument')
  eq(fires(9.3, 76, 0, 100, 18.6), true, 'the same row over a real portion is another matter')

  // Nothing to compare is not a reason to reject.
  eq(rowIsMeatier(null, { protein: 5, kcal: 260 }, 20), false, 'no row figures')
  eq(rowIsMeatier({ protein: 7, kcal: 121 }, null, 20), false, 'the model said nothing')
  // Nor is a share with no energy behind it. A part priced at nothing would give
  // the row an infinite head start, since zero times any factor is zero.
  eq(fires(7, 121, 5, 0, 20), false, 'a part with no calories is not a comparison')
  eq(fires(7, 0, 5, 260, 20), false, 'nor is a row with none')
})

Deno.test('namesAPortion tells a helping from a measurement', () => {
  eq(namesAPortion('1 serving (120 g)'), true, 'a helping that states its weight')
  eq(namesAPortion('1 quarter (148 g)'), true, 'a quarter chicken')
  eq(namesAPortion('1 bowl'), true, 'a bowl')
  eq(namesAPortion('10 sticks'), true, 'ten satay')
  eq(namesAPortion('1 cup'), true, 'a cup is a portion, even with no weight')
  eq(namesAPortion('1 plate (315 g)'), true, 'a plate')

  // The units a composition table publishes in. These say how much substance
  // there is and nothing about how much of it anybody is served.
  eq(namesAPortion('100 g'), false, 'a bare weight')
  eq(namesAPortion('250g'), false, 'no space')
  eq(namesAPortion('3.0 oz'), false, 'ounces')
  eq(namesAPortion('1.0 fl oz'), false, 'fluid ounces')
  eq(namesAPortion('330 ml'), false, 'millilitres')
  eq(namesAPortion('1/2 lb'), false, 'a fraction of a pound')
  eq(namesAPortion(null), false, 'no label')
})

Deno.test('boundGramsToServing caps a weight the catalogue calls a helping', () => {
  // The measured case: "Ayam Rebus Nasi Ayam — 1 serving (120 g)" against a model
  // that said 220 g, where the photograph holds about 125. Capped at half again a
  // helping, because a restaurant portion is not a composition table's portion.
  eq(boundGramsToServing(220, 120), 180, 'capped at 1.5 servings')
  eq(boundGramsToServing(150, 120), 150, 'inside the cap, left alone')
  eq(boundGramsToServing(180, 120), 180, 'exactly at the cap')

  // Downwards only, like everything else a weight is allowed to do here.
  eq(boundGramsToServing(60, 120), 60, 'a small helping is not raised')

  // The serving weight is taken WHOLE. Divided by how many units it holds — the
  // first shape of this — a row reading "4 pieces (120 g)" cut a 190 g portion of
  // curry prawns to 45 g, because a part is a helping of a food and not one
  // countable item of it.
  eq(boundGramsToServing(190, 120), 180, 'a portion against a four-piece serving')
  eq(boundGramsToServing(30, 300), 30, 'and a countable row simply never fires')

  // Nothing to cap against.
  eq(boundGramsToServing(220, null), 220, 'the row states no weight')
  eq(boundGramsToServing(null, 120), null, 'the model states no weight')
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

// The Korean fried chicken tray, exactly as the model returned it: totals in
// the per-unit fields with the count beside them, so the parts multiplied out
// to 4,568 kcal against its own 1,100-1,250 band for the same photo.
const koreanTray = [
  {
    name: 'fried chicken pieces',
    count: 4,
    grams: 140,
    kcal: 392,
    carbs_g: 18,
    protein_g: 24,
    fat_g: 26,
  },
  {
    name: 'white rice with seaweed',
    count: 1,
    grams: 200,
    kcal: 260,
    carbs_g: 57,
    protein_g: 5,
    fat_g: 1,
  },
  { name: 'potato wedges', count: 6, grams: 150, kcal: 450, carbs_g: 50, protein_g: 6, fat_g: 22 },
  {
    name: 'seasoned vegetable side',
    count: 1,
    grams: 80,
    kcal: 40,
    carbs_g: 6,
    protein_g: 1,
    fat_g: 2,
  },
]

Deno.test('unfoldCounts divides a breakdown whose counts were already applied', () => {
  const fixed = unfoldCounts(koreanTray, 1100, 1250)
  const total = fixed.reduce((sum, c) => sum + c.kcal * c.count, 0)
  if (total < 1100 || total > 1250) throw new Error(`parts now total ${total}, outside the band`)
  eq(fixed[0].kcal, 98, 'one chicken piece')
  eq(fixed[0].grams, 35, 'and what one weighs')
  // 150 g was the bowl of wedges; a wedge is 25 g, which is what the prompt
  // says a wedge is.
  eq(fixed[2].kcal, 75, 'one wedge')
  eq(fixed[2].grams, 25, 'and what one weighs')
  eq(fixed[1].kcal, 260, 'a count of one is left alone')
})

Deno.test('unfoldCounts leaves a breakdown that already adds up', () => {
  // Nasi lemak with squid: three cucumber slices at 7 kcal each, and the parts
  // multiply out to 931 against a 900-960 band. Nothing to repair.
  const nasiLemak = [
    { name: 'cooked rice', count: 1, grams: 200, kcal: 260, carbs_g: 57, protein_g: 5, fat_g: 1 },
    {
      name: 'stir-fried squid',
      count: 1,
      grams: 130,
      kcal: 220,
      carbs_g: 6,
      protein_g: 28,
      fat_g: 8,
    },
    { name: 'cucumber', count: 3, grams: 15, kcal: 7, carbs_g: 1.5, protein_g: 0, fat_g: 0 },
  ]
  eq(unfoldCounts(nasiLemak, 400, 520), nasiLemak, 'unchanged, and the same array')
})

Deno.test('unfoldCounts will not repair what it cannot check', () => {
  // Neither reading lands in the band, so neither is trusted and the guard in
  // the cascade gets the parts exactly as they came.
  eq(unfoldCounts(koreanTray, 100, 200), koreanTray, 'no band either reading fits')
  eq(unfoldCounts(koreanTray, 0, 0), koreanTray, 'no band at all')
  const single = [
    { name: 'rice', count: 1, grams: 200, kcal: 9000, carbs_g: null, protein_g: null, fat_g: null },
  ]
  eq(unfoldCounts(single, 100, 200), single, 'nothing is counted more than once')
})

Deno.test('plausibleForGrams judges a catalogue row against a weight', () => {
  eq(plausibleForGrams(36, 30), true, 'a satay stick from the catalogue')
  eq(plausibleForGrams(720, 50), false, 'a 50 g meatball is not 720 kcal')
  eq(plausibleForGrams(0, 30), false, 'a free lunch')
})

Deno.test('unfoldCounts repairs a plate the fixed ceiling used to let through', () => {
  // The one that got away, off a real diary. A Filet-O-Fish with three nuggets:
  // the nugget line is 84 g and 150 kcal for all three, in fields the prompt
  // defines as one unit's, and the model's own band is the giveaway. Read per
  // unit the parts are 830, half again over the top of it; read as stated they
  // are 530, which is the middle of it.
  //
  // The old test was a ceiling at 1.8x the band's top, so 830 against 1008
  // passed and the meal was logged at 889 kcal.
  const filetOFish = [
    {
      name: 'Filet-O-Fish',
      count: 1,
      grams: 180,
      kcal: 380,
      carbs_g: 29,
      protein_g: 17,
      fat_g: 20,
    },
    {
      name: 'chicken nuggets',
      count: 3,
      grams: 84,
      kcal: 150,
      carbs_g: 10,
      protein_g: 7,
      fat_g: 8,
    },
  ]
  const fixed = unfoldCounts(filetOFish, 500, 560)
  const total = fixed.reduce((sum, c) => sum + c.kcal * c.count, 0)
  if (total < 500 || total > 560) throw new Error(`parts now total ${total}, outside the band`)
  eq(fixed[1].kcal, 50, 'one nugget')
  eq(fixed[1].grams, 28, 'and what one weighs')
  eq(fixed[1].protein_g, 2.3, 'macros come down with it')
  eq(fixed[0].kcal, 380, 'the burger is a count of one and is left alone')
})

Deno.test('unfoldCounts trusts the band over the size of the disagreement', () => {
  // Both halves of the comparison, on the same parts. A band the per-unit
  // reading fits is a breakdown that has not been folded, however far the
  // as-stated reading is from it; a band neither reading fits cannot referee
  // anything, so nothing is touched. The second case is the one a bare "is the
  // per-unit total too big" test gets wrong, because 900 IS too big.
  const wings = [
    { name: 'chicken wing', count: 6, grams: 40, kcal: 110, carbs_g: 2, protein_g: 9, fat_g: 7 },
    { name: 'celery', count: 1, grams: 30, kcal: 5, carbs_g: 1, protein_g: 0, fat_g: 0 },
  ]
  eq(unfoldCounts(wings, 620, 700), wings, 'six wings really are six wings')
  eq(unfoldCounts(wings, 200, 250), wings, 'neither 665 nor 115 fits, so neither is trusted')
})

Deno.test('namesOneArticle tells a whole article from a helping', () => {
  eq(namesOneArticle('1 burger'), true, 'a Filet-O-Fish is 142 g because of what it is')
  eq(namesOneArticle('1.0 sandwich'), true, 'the import writes its counts with a decimal')
  eq(namesOneArticle('1 can'), true, 'and a can holds what it holds')
  eq(namesOneArticle('1 bar'), true, 'so does a bar')

  eq(namesOneArticle('1 serving'), false, 'a helping is whatever was served')
  eq(namesOneArticle('1 bowl (400 g)'), false, 'so is a bowl, however precisely stated')
  eq(namesOneArticle('1 portion (100 g)'), false, 'and a portion')
  // Countable, but the size is whatever was cut, so the catalogue's weight is no
  // better evidence than the model's.
  eq(namesOneArticle('1 piece'), false, 'a piece of what, and cut how')
  eq(namesOneArticle('1.0 fillet'), false, 'a fillet is not a fixed size')

  eq(namesOneArticle('2 bars'), false, 'two of them is not one of them')
  eq(namesOneArticle('100 g'), false, 'a bare measurement names nothing')
  eq(namesOneArticle(null), false, 'and a row may state no portion at all')
})
