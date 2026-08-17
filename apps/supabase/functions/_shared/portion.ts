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
 * CUPS AND SPOONS ARE DELIBERATELY NOT READ. Between them they are over 9,000
 * of the catalogue's 70,000 portions, so the temptation is real — but a cup of
 * cooked rice is 200 g, a cup of oil is 218 g, and a cup of cornflakes is 30 g.
 * Reading them with any single density would put a confident, precisely wrong
 * number where there is currently an honest null, and null has somewhere to go:
 * the per-unit path below handles it exactly as it did before grams existed.
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

  // "100 g", "3.0 oz", "1/2 lb", "8 OZA". A fluid ounce is written both ways in
  // this catalogue — "1.0 fl oz" and "8 OZA" — and it is a measure of volume:
  // 29.6 ml where an ounce of weight is 28.3 g. Four percent, and cheaper to
  // get right than to explain.
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
 * Does this row's portion name a WHOLE MEAL rather than a helping of one food?
 *
 * A plate, a set, a bento: the vessel a complete meal arrives in. The catalogue
 * is full of rows measured that way, because most of what people look up by
 * typing is a whole dish — right for the dish tier and wrong for a part of a
 * breakdown, where charging one component for a whole plate counts the meal
 * twice.
 *
 * A LABEL ALONE IS WEAK EVIDENCE, so read `componentCandidates`, which is the
 * only caller, before reaching for this: a composition table states a household
 * portion of ONE food as "1 plate" too, and "Rice, Coconut Milk (Nasi Lemak)"
 * is a plate of nothing but rice. The label only settles it where there is no
 * weight to take a helping from, and that is exactly where the label has to
 * settle it, since a weightless row is charged in full.
 *
 * "Bowl" is deliberately absent. A bowl of laksa is a whole meal and a bowl of
 * soup beside a rice plate is a part of one, and nothing in the label says
 * which — where a plate at least leans one way.
 */
const WHOLE_MEAL_SERVING = /\b(plates?|sets?|meals?|platters?|combos?|bentos?)\b/i

export const isWholeMealServing = (label: string | null | undefined): boolean =>
  WHOLE_MEAL_SERVING.test(label ?? '')

/**
 * Does this label NAME A HELPING, or merely state a measurement?
 *
 * "1 serving (120 g)", "1 quarter (148 g)", "1 bowl", "1 cup" all name a portion
 * somebody is served. "100 g" and "3.0 oz" name an amount of substance and say
 * nothing about how much of it is a helping — they are the units a composition
 * table publishes in, not portions anybody eats.
 *
 * The distinction earns its keep in `boundGramsToServing`, which trusts the first
 * kind about size and has no business trusting the second.
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
 * How much a part may weigh when the catalogue names a helping of that food.
 *
 * A weight is the one thing about a portion a photograph carries, and it is why
 * `reconcile` and `bestFit` are built around it — but it is still the model's
 * guess, and for MEAT it is the guess that costs the most. Measured on a
 * photographed plate of Hainanese chicken rice: every density in the breakdown
 * was right and the whole of a 17 g protein overcount was one number, 220 g of
 * poached chicken where the picture holds about 125.
 *
 * The row that priced it was "Ayam Rebus Nasi Ayam — 1 serving (120 g)". The
 * catalogue had already said what one helping of exactly that food weighs, and
 * the cascade threw it away — while a row carrying NO weight would have gone
 * through `isWholeUnit` and overridden the model's mass completely. The better
 * the catalogue's data, the less it was believed, which is the wrong way round.
 *
 * A CAP RATHER THAN A CLAMP, at half again the stated helping. A restaurant
 * portion is not a composition table's portion and somebody really can be served
 * more, so this catches an answer wrong by a factor rather than arbitrating a
 * generous plate. Downwards only, like everything a weight is allowed to do here.
 *
 * The row's serving weight is taken WHOLE and not divided by how many units it
 * holds, which was the first shape of this and was wrong twice over: a part is a
 * helping of a food and not one countable item of it, so dividing "4 pieces
 * (120 g)" down to a single prawn cut a 190 g portion of curry prawns to 45 g.
 * Against a countable row the cap then never fires, which is the right kind of
 * inaction: `servingUnitCount` already prices those per unit.
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
 * The counted-twice repair.
 *
 * A component states what ONE of it weighs and costs, and `count` says how many
 * there are — so the plate is the sum of `kcal * count`. Models routinely
 * answer with the total instead and set the count beside it, which multiplies a
 * meal by four or six. A photographed Korean chicken set came back with
 * `{fried chicken pieces, count 4, 140 g, 392 kcal}` and
 * `{potato wedges, count 6, 150 g, 450 kcal}` — 150 g is the bowl of wedges and
 * not one wedge — and the parts multiplied out to 4,568 kcal against the
 * model's own 1,100-1,250 band for the same photo.
 *
 * The band is what makes this fixable rather than merely detectable. Two
 * readings of the same answer are available, and here they are far apart: taken
 * per unit the parts are 4,568, and taken as stated they are 1,142, which is
 * inside the band the model gave. When the arithmetic disagrees that sharply
 * and the other reading agrees that well, the counts have already been applied
 * — so the weights and the figures are divided back down to one, which is also
 * what makes the breakdown editable: 25 g a wedge, and a stepper that means
 * something.
 *
 * Both tests matter. Without the first, a plate whose parts genuinely multiply
 * to a large meal gets quartered; without the second, a wrong band could halve
 * a correct breakdown. Neither reading fitting means neither is trusted, and
 * the parts are left exactly as they came for the guard downstream to judge.
 */
export function unfoldCounts<T extends Sized & { count: number }>(
  components: T[],
  kcalLow: number,
  kcalHigh: number,
): T[] {
  if (kcalHigh <= 0 || !components.some((c) => c.count > 1)) return components

  const perUnit = components.reduce((sum, c) => sum + c.kcal * c.count, 0)
  const asStated = components.reduce((sum, c) => sum + c.kcal, 0)
  // The same tolerances the breakdown guard in the cascade applies, and for the
  // same reason: a band is not a measurement, so this only fires on a
  // disagreement too large to be about portion size.
  if (perUnit <= kcalHigh * 1.8) return components
  if (asStated < kcalLow * 0.6 || asStated > kcalHigh * 1.8) return components

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
 * How much of a food's energy comes from protein.
 *
 * This is what "what is this made of" has to mean once the two sides are allowed
 * to disagree about how many calories are in a gram. Compared as DENSITIES, an
 * omelette and a slice of Canadian bacon look like an argument about portion
 * size; compared as shares, one is 27% protein and the other 78%, and no amount
 * of portion disagreement closes that.
 */
export const proteinShare = (proteinG: number, kcal: number): number =>
  kcal > 0 ? (proteinG * 4) / kcal : 0

/**
 * Is this catalogue row describing a far more protein-heavy food than the part?
 *
 * The rows in this catalogue are ranked by NAME and then chosen by CALORIES, and
 * neither of those can tell one food from another of the same energy density.
 * Measured, on real plates: a part the model called a "pan-fried omelette" and
 * priced at 14 g of protein and 16 g of fat in 140 g — a three-egg omelette,
 * correctly — was priced from "Canadian bacon, cooked, pan-fried" at 28.3 g of
 * protein per 100 g, because 140 g of bacon costs 203 kcal against the model's
 * 210 while the catalogue's actual omelette rows fit the calories WORSE. And a
 * part plainly named "steamed white rice" was charged 27.5 g of protein, from a
 * row that states no weight at all and so was handed over whole.
 *
 * Nothing else in the cascade can see this. Every other gate is a calorie gate,
 * and Atwater cannot help: the prompt asks the model to make 4/4/9 agree with its
 * own kcal, so the check confirms the model's arithmetic and never its nutrition.
 * Protein and carbohydrate are both four calories a gram, which makes trading one
 * for the other free, and protein for fat nearly so — which is why the calories
 * have been broadly right all along while the macros drifted.
 *
 * A SHARE OF ENERGY IS SCALE FREE, and that is what makes this work where a
 * density comparison could not. Both sides can be handed over per serving, per
 * gram or per plate; the ratio is the same, so the two thirds of this catalogue
 * that never state a weight are judged exactly like the rest.
 *
 * ONE DIRECTION ONLY. It fires when the ROW claims the larger share, never when
 * the model does, and that asymmetry is the safety: a model that over-eggs the
 * protein of real meat is precisely the case the catalogue exists to correct, and
 * it goes on correcting it. Measured against eleven real (part, row) pairs it
 * agrees with the photograph nine times, and the two it misses are 1.4-1.5x
 * disagreements worth a few grams — which no threshold separates from a fried
 * rice whose row is RIGHT to add the oil the model forgot.
 *
 * `disputed` is in GRAMS ON THE PLATE, because that is the thing worth being
 * wrong about. A 20 g dip of dark soy really does hold 8 g of protein per 100 g
 * and a model really does report a sauce as zero, so the share test alone throws
 * out a row that is right; what settles it is that the dip disputes 1.6 g and the
 * omelette disputes 25.
 *
 * TWO AND A HALF IS MEASURED, not argued. `pnpm bench:photos --repeat=3` over
 * eleven photographed plates against a read reference: at 2.5x the protein bias
 * is +22% and the mean error 31%; at 2.0x the protein is no better (+23%, 31%) and
 * calories, carbohydrate and fat are all worse — fat's mean error goes from 30% to
 * 40%, because a tighter gate starts throwing out rows that were right. Loosening
 * it is what the benchmark is for; do that rather than reasoning about it.
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
  // Neither share means anything without energy behind it, and a part priced at
  // nothing would give the row an infinite head start: `proteinShare` answers 0
  // for it, and 0 times any factor is 0, so every protein-bearing row would look
  // like a different food. Nothing to compare is not a reason to reject.
  if (row.kcal <= 0 || part.kcal <= 0) return false
  if (proteinShare(row.protein, row.kcal) <= proteinShare(part.protein, part.kcal) * 2.5) {
    return false
  }
  return disputed >= 4
}

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
