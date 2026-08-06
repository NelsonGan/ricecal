// Mass, and what it is worth in calories.
//
// The cascade used to size a plate with one number: the model's kcal for one
// unit of each part. That number is the single worst thing a vision model
// produces, and everything downstream was anchored to it — the acceptance band
// for a catalogue row was ±(0.25x…2x) of it, so a bad guess did not merely
// price the part badly, it REJECTED the catalogue row that would have
// corrected it. Measured against real photos: a chicken satay stick came back
// at 180 kcal, which put the acceptance band at 45-360 and so excluded the
// catalogue's "Chicken Satay (Satay Ayam) — 365 kcal per 10 sticks" at 36 kcal
// a stick; four skewers were then logged at 720 kcal instead of 150. A slice of
// lap cheong came back at 217. Both are the same mistake: a piece priced as a
// portion, with nothing in the loop that knows how big a piece is.
//
// So the model is asked for GRAMS as well, and this file is what grams are for.
// Mass is the thing a picture actually carries — a stick of satay is 30 g of
// chicken whatever the model thinks it costs — and it buys three checks that
// calories alone cannot:
//
//   1. Energy density. 180 kcal in 30 g is 6 kcal/g, which is denser than
//      cheese; the figure refutes itself without knowing anything about satay.
//   2. Mass conservation. The macro grams of one unit cannot outweigh the unit.
//      A cooked food is mostly water, so they cannot even come close.
//   3. Conversion. A catalogue row that states its own weight ("100 g",
//      "3.0 oz", "1 bowl (400 g)") knows its density exactly, and 30 g of the
//      thing it describes is arithmetic rather than a second opinion.
//
// The division of labour that falls out of it is the one the rest of the
// cascade already believes in: the model says WHAT and HOW MUCH, the catalogue
// says what that is worth.

/**
 * What one serving of a catalogue row weighs, when the label says so.
 *
 * Three shapes cover most of what the import produced: a pure weight ("100 g",
 * the single commonest label in the table), a weight in parentheses after a
 * human portion ("1 bowl (400 g)"), and an imperial unit ("3.0 oz", "1.0 lb").
 *
 * Volumes in millilitres are read as grams. That is wrong for oil and for
 * syrup and right for everything a Malaysian drinks, which is what the ml
 * labels in this catalogue are.
 *
 * CUPS AND SPOONS ARE DELIBERATELY NOT READ. They are 20,000 and 22,000 rows
 * respectively, so the temptation is real — but a cup of cooked rice is 200 g,
 * a cup of oil is 218 g, and a cup of cornflakes is 30 g. Reading them with any
 * single density would put a confident, precisely wrong number where there is
 * currently an honest null, and null has somewhere to go: the per-unit path
 * below handles it exactly as it did before grams existed.
 */
export function servingGrams(label: string | null | undefined): number | null {
  const text = (label ?? '').trim()
  if (!text) return null

  const scale: Record<string, number> = {
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

  // "1 bowl (400 g)" — the parenthesised weight is the whole answer, and it
  // wins over the leading count, which is a bowl and not a number of grams.
  const paren = text.match(/\(\s*(\d+(?:\.\d+)?)\s*(g|gm|gr|gram|grams|kg|ml|l)\s*\)/i)
  if (paren) {
    const grams = Number(paren[1]) * (scale[paren[2].toLowerCase()] ?? 0)
    return usableGrams(grams)
  }

  // "100 g", "3.0 oz", "1/2 lb", "8 OZA". A fluid ounce is written both ways in
  // this catalogue — "1.0 fl oz" and "8 OZA" — and it is a measure of volume:
  // 29.6 ml where an ounce of weight is 28.3 g. Four percent, and cheaper to
  // get right than to explain.
  const lead = text.match(/^\s*(\d+(?:\.\d+)?|\d+\/\d+)\s*(fl\s+)?([a-z]+)\s*$/i)
  if (!lead) return null
  const unit = lead[2] ? 'oza' : lead[3].toLowerCase()
  // `hasOwn` rather than a bare index: the unit is whatever text the catalogue
  // put in the label, and `scale['constructor']` is a function — truthy, and
  // not a number of grams.
  if (!Object.hasOwn(scale, unit)) return null
  const factor = scale[unit]
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
 * How many of the thing one serving of a catalogue row holds.
 *
 * "10 sticks" is ten satay; "1 cup" and "100 g" are one serving of something
 * measured, not ten of it, so only countable units are read this way. Getting
 * this wrong in the other direction would divide a row's calories by a hundred.
 */
const COUNTABLE =
  /^(\d+(?:\.\d+)?)\s*(sticks?|skewers?|pieces?|pcs|slices?|wings?|balls?|eggs?|rolls?|cubes?|nuggets?|dumplings?|prawns?|drumsticks?|fillets?|cakes?|puffs?|buns?)\b/i

export const servingUnitCount = (label: string | null): number => {
  const match = (label ?? '').trim().match(COUNTABLE)
  const count = match ? Number(match[1]) : 1
  return Number.isFinite(count) && count >= 1 && count <= 50 ? count : 1
}

/**
 * The energy a gram of food can hold.
 *
 * The floor is a clear broth or a leaf. The ceiling is not 9 — pure fat is 9
 * and butter is 7.2 — but a component of a photographed meal is not a spoon of
 * oil: the densest things that show up as parts of a plate are peanuts (5.9),
 * pork crackling (5.4), crisps (5.4) and chocolate (5.4). Six is the far side
 * of all of them, which makes it a bound that only ever fires on an answer that
 * is wrong rather than on one that is merely rich.
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
 * One part's figures, made to agree with its own weight.
 *
 * Nothing here consults the catalogue or the network — it is arithmetic over
 * numbers the model has already given, and it exists because those numbers
 * routinely contradict each other in a direction that is expensive. Two
 * constraints do the work:
 *
 * MASS CONSERVATION. Carbohydrate, protein and fat are matter. Their grams
 * cannot add up to more than the thing weighs, and for a cooked food they
 * cannot come close — 60-75% of a piece of grilled chicken is water. A model
 * that answers 30 g of protein for a 30 g satay stick has described a stick of
 * protein isolate, and the giveaway is in the arithmetic rather than in
 * anything you have to know about satay.
 *
 * ATWATER. Given macros that fit the mass, 4/4/9 is what they are worth, and
 * it is a better figure than the model's own kcal for exactly the reason the
 * macros are checkable and the kcal is not.
 *
 * The clamp at the end is the backstop for a part with no macros at all, which
 * is most of them: whatever else is true, 160 kcal cannot live in an 8 g pork
 * rind.
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

  // Downwards only, and that asymmetry is deliberate. A weight is evidence
  // about how much a figure CAN be, and the clamp is trustworthy in exactly
  // one direction: a number too big for the mass is impossible, while a number
  // too small for it is usually a mass that was measured against the wrong
  // thing. Raising a figure to meet a floor did real damage — nine apple
  // slices came back with the weight of the whole apple attached, and the
  // floor lifted a slice from 11 kcal to 20, which was enough to let a
  // packaged apple-snack row at 30 kcal a bag pass for one of them.
  const ceiling = grams * MAX_KCAL_PER_G
  if (kcal > ceiling) kcal = Math.round(ceiling)

  return { grams, kcal: Math.round(kcal), carbs_g: carbs, protein_g: protein, fat_g: fat }
}

/**
 * Is `kcal` a believable price for `grams` of food? Used to gate a catalogue
 * row before its figure is trusted over the model's.
 *
 * Wider on both sides than `reconcile` clamps to, deliberately. This judges a
 * row the catalogue actually holds — a real measurement of a real portion —
 * and the question is only whether the row can be describing food of this
 * size at all. Anything inside is preferred to a model's opinion.
 */
export const plausibleForGrams = (kcal: number, grams: number): boolean =>
  kcal > 0 && grams > 0 && kcal / grams >= MIN_KCAL_PER_G && kcal / grams <= 9

/**
 * The Atwater-consistent macro split for a figure with no macros behind it.
 * Half the calories from carbohydrate, a fifth from protein, the rest fat —
 * which is roughly a plate of rice with something on it, and is what the
 * cascade has always fallen back to.
 */
export const defaultMacros = (kcal: number) => ({
  carbs: Math.round((kcal * 0.5) / 4),
  protein: Math.round((kcal * 0.2) / 4),
  fat: Math.round((kcal * 0.3) / 9),
})
