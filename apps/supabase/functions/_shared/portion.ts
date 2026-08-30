// Mass, and what it is worth in calories.
//
// Sized on the model's kcal alone, one bad guess became a bad entry: a satay
// stick came back at 180 kcal, which put the acceptance band at 45-360 and
// excluded the catalogue's own 36 kcal a stick, so four skewers were logged at
// 720 instead of 150.
//
// So the model is asked for grams, and mass buys three checks calories cannot:
//
//   1. Energy density. 180 kcal in 30 g is 6 kcal/g, denser than cheese.
//   2. Mass conservation. The macro grams of one unit cannot outweigh the unit,
//      and a cooked food is mostly water.
//   3. Conversion. A row that states its own weight knows its density exactly.
//
// The model says what and how much; the catalogue says what that is worth.

const MASS_UNITS: Record<string, number> = {
  g: 1,
  gm: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  // Millilitres as grams: see the header.
  ml: 1,
  l: 1000,
  litre: 1000,
  liter: 1000,
  oz: 28.35,
  // The import's own abbreviations. ONZ is an ounce by weight; OZA is a
  // fluid ounce, which is 29.6 ml and so 29.6 g of anything drinkable.
  onz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  oza: 29.57,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
}

/**
 * What one serving of a catalogue row weighs, when the label says so. Three
 * shapes cover most of the import: a pure weight, a weight in parentheses after
 * a human portion ("1 bowl (400 g)"), and an imperial unit.
 *
 * Millilitres are read as grams: wrong for oil and syrup, right for everything a
 * Malaysian drinks.
 *
 * Cups and spoons are not read. A cup of cooked rice is 200 g, a cup of oil
 * 218 g and a cup of cornflakes 30 g, so any single density is a confident,
 * precisely wrong number where there is an honest null.
 */
export function servingGrams(label: string | null | undefined): number | null {
  const text = (label ?? '').trim()
  if (!text) return null

  // "1 bowl (400 g)" — the parenthesised weight is the whole answer, and it
  // wins over the leading count, which is a bowl and not a number of grams.
  const paren = text.match(/\(\s*(\d+(?:\.\d+)?)\s*(g|gm|gr|gram|grams|kg|ml|l)\s*\)/i)
  if (paren) {
    const grams = Number(paren[1]) * (MASS_UNITS[paren[2].toLowerCase()] ?? 0)
    return usableGrams(grams)
  }

  // "100 g", "3.0 oz", "1/2 lb", "8 OZA". A fluid ounce is written both ways
  // here and is a volume: 29.6 ml where an ounce of weight is 28.3 g.
  const lead = text.match(/^\s*(\d+(?:\.\d+)?|\d+\/\d+)\s*(fl\s+)?([a-z]+)\s*$/i)
  if (!lead) return null
  const unit = lead[2] ? 'oza' : lead[3].toLowerCase()
  // `hasOwn` rather than a bare index: the unit is whatever text the catalogue
  // put in the label, and `MASS_UNITS['constructor']` is a function — truthy, and
  // not a number of grams.
  if (!Object.hasOwn(MASS_UNITS, unit)) return null
  const factor = MASS_UNITS[unit]
  const count = lead[1].includes('/')
    ? Number(lead[1].split('/')[0]) / Number(lead[1].split('/')[1])
    : Number(lead[1])
  return usableGrams(count * factor)
}

/**
 * A weight has to be a plausible serving to be worth using. 3 kg is a sack of
 * rice rather than a portion of it, and 0.4 g is a pinch of salt — both are
 * real rows, and dividing by either produces a density that would then be
 * treated as fact.
 */
const usableGrams = (grams: number): number | null =>
  Number.isFinite(grams) && grams >= 3 && grams <= 3000 ? Math.round(grams * 10) / 10 : null

/**
 * Does this row's portion name a whole meal rather than a helping of one food?
 * A plate, a set, a bento: right for the dish tier and wrong for a part of a
 * breakdown, where charging one component for a whole plate counts twice.
 *
 * A label alone is weak evidence, since a composition table states a household
 * portion of one food as "1 plate" too, so read `componentCandidates`, the only
 * caller. The label settles it only where there is no weight to take a helping
 * from.
 *
 * "Bowl" is absent: a bowl of laksa is a whole meal, and a bowl of soup beside a
 * rice plate is part of one.
 */
const WHOLE_MEAL_SERVING = /\b(plates?|sets?|meals?|platters?|combos?|bentos?)\b/i

export const isWholeMealServing = (label: string | null | undefined): boolean =>
  WHOLE_MEAL_SERVING.test(label ?? '')

/**
 * Does this label name a helping, or merely state a measurement? "1 serving
 * (120 g)" and "1 bowl" name a portion somebody is served; "100 g" and "3.0 oz"
 * are the units a composition table publishes in.
 *
 * The distinction earns its keep in `boundGramsToServing`, which trusts the
 * first kind about size and has no business trusting the second.
 */
export const namesAPortion = (label: string | null | undefined): boolean => {
  const text = (label ?? '').trim()
  if (!text) return false
  // The one shape that is a bare measurement: a number and a unit of mass or
  // volume, and nothing else. Anything with a word in it that is not such a unit
  // ("serving", "quarter", "plate", "cup") is naming a portion.
  const bare = text.match(/^\s*(\d+(?:\.\d+)?|\d+\/\d+)\s*(fl\s+)?([a-z]+)\s*$/i)
  if (!bare) return true
  return !(bare[2] || Object.hasOwn(MASS_UNITS, bare[3].toLowerCase()))
}

/**
 * Does this label name exactly one whole article of a food, rather than a
 * helping of one?
 *
 * A helping varies and `boundGramsToServing` allows for that. An article does
 * not: a Filet-O-Fish is 142 g, and nobody is served 1.27 of one, so a row that
 * names one and states its weight has the exact answer a photograph can only
 * guess at. A photographed one was matched to the catalogue's own 330 kcal row
 * and then priced by weight at a guessed 180 g, for 418. The helping cap did not
 * save it, because 1.27x is inside the half again it allows.
 *
 * The list is short and only holds things that come in one piece of a size the
 * food decides. `piece`, `slice`, `fillet` and `steak` are countable but their
 * size is whatever was cut; `serving` and `portion` are helpings wearing a
 * countable word.
 *
 * The leading `1` is required: `servingUnitCount` does not read "2 bars", so
 * treating it as one article would charge for half the food.
 */
const ONE_ARTICLE =
  /^1(?:\.0+)?\s+(burger|sandwich|wrap|bun|roll|bar|can|bottle|packet|sachet|pouch|tub|jar|cone|egg|pie|pizza|muffin|doughnut|donut|cookie|biscuit)s?\b/i

export const namesOneArticle = (label: string | null | undefined): boolean =>
  ONE_ARTICLE.test((label ?? '').trim())

/**
 * How much a part may weigh when the catalogue names a helping of that food.
 *
 * The model's weight is still a guess, and for meat it is the guess that costs
 * the most: on a photographed Hainanese chicken rice every density was right and
 * a 17 g protein overcount was one number, 220 g of poached chicken where the
 * picture holds about 125. The row that priced it, "Ayam Rebus Nasi Ayam, 1
 * serving (120 g)", had already said what one helping weighs.
 *
 * A cap rather than a clamp, at half again the stated helping: a restaurant
 * portion is not a composition table's, so this catches an answer wrong by a
 * factor rather than arbitrating a generous plate. Downwards only.
 *
 * The row's serving weight is taken whole rather than divided by how many units
 * it holds. A part is a helping of a food, not one item of it, and dividing "4
 * pieces (120 g)" cut a 190 g portion of curry prawns to 45 g.
 */
export const PORTION_OVER_SERVING = 1.5

export function boundGramsToServing(
  grams: number | null,
  /** What one serving of the row weighs, when it names a helping and states one. */
  servingGrams: number | null,
): number | null {
  if (!grams || !servingGrams || servingGrams <= 0) return grams
  const ceiling = servingGrams * PORTION_OVER_SERVING
  return grams > ceiling ? Math.round(ceiling) : grams
}

/**
 * How many of the thing one serving of a catalogue row holds. "10 sticks" is ten
 * satay; "1 cup" and "100 g" are one serving of something measured, so only
 * countable units are read this way. Wrong in the other direction, this would
 * divide a row's calories by a hundred.
 */
const COUNTABLE =
  /^(\d+(?:\.\d+)?)\s*(sticks?|skewers?|pieces?|pcs|slices?|wings?|balls?|eggs?|rolls?|cubes?|nuggets?|dumplings?|prawns?|drumsticks?|fillets?|cakes?|puffs?|buns?)\b/i

export const servingUnitCount = (label: string | null): number => {
  const match = (label ?? '').trim().match(COUNTABLE)
  const count = match ? Number(match[1]) : 1
  return Number.isFinite(count) && count >= 1 && count <= 50 ? count : 1
}

/**
 * The energy a gram of food can hold. The floor is a clear broth or a leaf. The
 * ceiling is not 9, because a component of a photographed meal is not a spoon of
 * oil: the densest parts of a plate are peanuts (5.9), crackling, crisps and
 * chocolate (5.4). Six is the far side of all of them, so it only fires on an
 * answer that is wrong rather than one that is rich.
 */
export const MIN_KCAL_PER_G = 0.1
export const MAX_KCAL_PER_G = 6

/** Atwater: what these macros are worth, in calories. */
export const atwaterKcal = (carbs: number, protein: number, fat: number): number =>
  carbs * 4 + protein * 4 + fat * 9

export type Sized = {
  /** Grams of ONE unit, as the model reported it. Null when it did not. */
  grams: number | null
  kcal: number
  carbs_g: number | null
  protein_g: number | null
  fat_g: number | null
}

/**
 * One part's figures, made to agree with its own weight. Arithmetic over numbers
 * the model has already given, on two constraints.
 *
 * Mass conservation: the macro grams cannot outweigh the thing, and for a cooked
 * food they cannot come close, since 60-75% of grilled chicken is water. A model
 * answering 30 g of protein for a 30 g satay stick has described protein
 * isolate, and the giveaway is the arithmetic rather than anything about satay.
 *
 * Atwater: given macros that fit the mass, 4/4/9 is a better figure than the
 * model's own kcal, because the macros are checkable and the kcal is not.
 *
 * The clamp at the end is the backstop for a part with no macros at all, which
 * is most of them: 160 kcal cannot live in an 8 g pork rind.
 */
export function reconcile(part: Sized): Sized {
  const grams = part.grams
  if (!grams || grams <= 0) return part

  let carbs = part.carbs_g
  let protein = part.protein_g
  let fat = part.fat_g

  // Dry matter, when the model gave enough of it to add up. A partial answer
  // (fat alone) cannot be weighed against the total, so it is left alone.
  if (carbs !== null && protein !== null && fat !== null) {
    const dry = carbs + protein + fat
    // 95% rather than 100%: a dried, fried or sugared food can be nearly all
    // dry matter, and the aim is to catch the answer that is impossible, not
    // to argue about the last few percent of a prawn cracker.
    const ceiling = grams * 0.95
    if (dry > ceiling && dry > 0) {
      const shrink = ceiling / dry
      carbs = Math.round(carbs * shrink * 10) / 10
      protein = Math.round(protein * shrink * 10) / 10
      fat = Math.round(fat * shrink * 10) / 10
    }
  }

  let kcal = part.kcal
  const fromMacros =
    carbs !== null && protein !== null && fat !== null ? atwaterKcal(carbs, protein, fat) : 0
  // A quarter out is the same tolerance tier 4 already applies to a model's
  // nutrition answer; past that the two figures are not two readings of one
  // meal, and the mass-constrained one is the one to keep.
  if (fromMacros > 0 && (kcal <= 0 || Math.abs(fromMacros - kcal) / Math.max(kcal, 1) > 0.25)) {
    kcal = Math.round(fromMacros)
  }

  // Downwards only. A number too big for the mass is impossible, while a number
  // too small is usually a mass measured against the wrong thing: nine apple
  // slices came back carrying the whole apple's weight, and a floor lifted a
  // slice from 11 kcal to 20, enough to let a 30 g snack bag pass for one.
  const ceiling = grams * MAX_KCAL_PER_G
  if (kcal > ceiling) kcal = Math.round(ceiling)

  return { grams, kcal: Math.round(kcal), carbs_g: carbs, protein_g: protein, fat_g: fat }
}

/**
 * The counted-twice repair.
 *
 * A component states what one of it weighs and costs, so the plate is the sum of
 * `kcal * count`. Models routinely answer with the total instead and set the
 * count beside it: a Korean chicken set came back with 150 g of potato wedges at
 * count 6, where 150 g is the bowl, and the parts multiplied out to 4,568 kcal
 * against the model's own 1,100-1,250 band for the same photo.
 *
 * The band makes it fixable rather than merely detectable. Two readings are
 * available and here they are far apart: per unit 4,568, as stated 1,142, which
 * is inside the band. When the arithmetic disagrees that sharply and the other
 * reading agrees that well, the counts have already been applied, so everything
 * is divided back down to one. That is also what makes the breakdown editable.
 *
 * Both tests matter: without the first a plate that genuinely multiplies gets
 * quartered, and without the second a wrong band halves a correct breakdown.
 */
export function unfoldCounts<T extends Sized & { count: number }>(
  components: T[],
  kcalLow: number,
  kcalHigh: number,
): T[] {
  if (kcalHigh <= 0 || !components.some((c) => c.count > 1)) return components

  const perUnit = components.reduce((sum, c) => sum + c.kcal * c.count, 0)
  const asStated = components.reduce((sum, c) => sum + c.kcal, 0)

  // Which reading did the model use? The prompt asks it to put the sum of
  // (kcal x count) between the bounds, so the reading that lands in the band is
  // the one it was working from.
  //
  // This replaced a fixed ceiling that could not see it: a Filet-O-Fish with
  // three nuggets came back per unit at 830 and as stated at 530 against a
  // 500-560 band, and a ceiling of 1.8x the top let 830 through.
  //
  // The slack is small and identical on both sides, because the question is
  // which reading fits rather than how loose a band may be.
  const fitsBand = (total: number) => total >= kcalLow * 0.9 && total <= kcalHigh * 1.1
  if (fitsBand(perUnit) || !fitsBand(asStated)) return components

  const share = (value: number | null, count: number): number | null =>
    value === null ? null : Math.round((value / count) * 10) / 10

  return components.map((c) => {
    if (c.count <= 1) return c
    const grams = c.grams === null ? null : Math.round(c.grams / c.count)
    return {
      ...c,
      // A part divided below a gram is a rounding artefact, not a portion.
      grams: grams !== null && grams >= 1 ? grams : null,
      kcal: Math.round(c.kcal / c.count),
      carbs_g: share(c.carbs_g, c.count),
      protein_g: share(c.protein_g, c.count),
      fat_g: share(c.fat_g, c.count),
    }
  })
}

/**
 * Is `kcal` a believable price for `grams` of food? Gates a catalogue row before
 * its figure is trusted over the model's. Wider than `reconcile` clamps to,
 * because this judges a real measurement of a real portion and only asks whether
 * the row can be describing food of this size at all.
 */
export const plausibleForGrams = (kcal: number, grams: number): boolean =>
  kcal > 0 && grams > 0 && kcal / grams >= MIN_KCAL_PER_G && kcal / grams <= 9

/**
 * How much of a food's energy comes from protein, which is what "what is this
 * made of" has to mean once the two sides may disagree about calories per gram.
 * As densities, an omelette and Canadian bacon look like an argument about
 * portion size; as shares they are 27% and 78%.
 */
export const proteinShare = (proteinG: number, kcal: number): number =>
  kcal > 0 ? (proteinG * 4) / kcal : 0

/**
 * Is this catalogue row describing a far more protein-heavy food than the part?
 *
 * Rows are ranked by name and chosen by calories, and neither tells one food
 * from another of the same energy density. A part the model called a "pan-fried
 * omelette" was priced from "Canadian bacon, cooked, pan-fried" at 28.3 g of
 * protein per 100 g, because the calories fit to three percent. A part named
 * "steamed white rice" was charged 27.5 g of protein.
 *
 * Nothing else in the cascade can see this. Every other gate is a calorie gate,
 * and Atwater only confirms the model's own arithmetic. Protein and carbohydrate
 * are both four calories a gram, so trading one for the other is free, which is
 * why the calories stayed broadly right while the macros drifted.
 *
 * A share of energy is scale free, so the two thirds of this catalogue that
 * state no weight are judged like the rest.
 *
 * One direction only: it fires when the row claims the larger share, never the
 * model, because a model over-egging the protein of real meat is the case the
 * catalogue exists to correct. Against eleven real (part, row) pairs it agrees
 * with the photograph nine times.
 *
 * `disputed` is in grams on the plate. A 20 g dip of dark soy really does hold
 * 8 g of protein per 100 g and a model really does report a sauce as zero, so
 * the share test alone rejects a row that is right; the dip disputes 1.6 g and
 * the omelette disputes 25.
 *
 * Two and a half is measured. `pnpm bench:photos --repeat=3` over eleven plates:
 * at 2.5x the protein bias is +22% and the mean error 31%, and at 2.0x protein
 * is no better while everything else is worse.
 */
export function rowIsMeatier(
  /** The row's protein and energy. Per serving or per gram — a share is scale free. */
  row: { protein: number; kcal: number } | null,
  /** What the model said ONE unit of the part holds. */
  part: { protein: number; kcal: number } | null,
  /** Grams of protein this row would put on the plate OVER the model's claim. */
  disputed: number,
): boolean {
  if (!row || !part) return false
  // Neither share means anything without energy behind it: a part priced at
  // nothing gives every protein-bearing row an infinite head start. Nothing to
  // compare is not a reason to reject.
  if (row.kcal <= 0 || part.kcal <= 0) return false
  if (proteinShare(row.protein, row.kcal) <= proteinShare(part.protein, part.kcal) * 2.5) {
    return false
  }
  return disputed >= 4
}

/**
 * The Atwater-consistent macro split for a figure with no macros behind it: half
 * the calories from carbohydrate, a fifth from protein, the rest fat, which is
 * roughly a plate of rice with something on it.
 */
export const defaultMacros = (kcal: number) => ({
  carbs: Math.round((kcal * 0.5) / 4),
  protein: Math.round((kcal * 0.2) / 4),
  fat: Math.round((kcal * 0.3) / 9),
})
