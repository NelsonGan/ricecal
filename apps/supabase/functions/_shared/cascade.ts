// The resolution cascade, shared by scan-meal (fresh photos) and scan-refine
// (fix-by-typing). One vision item resolves to ONE entry:
//
//   2. component breakdown  — composite plates FIRST: each visible part to its
//                             own catalogue row, summed into one parent entry
//                             with the parts attached as ingredients
//   1. catalogue match      — a search + a verifier pick, kcal band check
//   3. nearest dish, rescaled — right identity, wrong amount: adjust quantity
//   4. LLM nutrition        — numbers only, Atwater-checked; no row is written
//   5. archetype            — classification over seeded rows; the terminal
//                             "mixed meal" is a hardcoded id needing no model
//
// Tier 2 outranks tier 1 for composite scenes because a plate of parts is
// better explained than approximated — but it stays all-or-nothing: either
// every part resolves and the sum lands in band, or the plate falls through
// to the dish-level tiers. A breakdown is one food_logs row (the plate) plus
// food_log_ingredients rows (the parts); the parent's macros are the
// catalogue sum of the parts, so the diary and the breakdown cannot disagree.

import type { SupabaseClient } from '@supabase/supabase-js'
import { type CatalogueFood, searchFoods } from './catalogue.ts'
import { AiLimitReached, type Meter } from './entitlement.ts'
import {
  type Archetype,
  classifyArchetype,
  estimateNutrition,
  type MockSteer,
  type Nutrition,
  type NutritionLabel,
  pickCandidate,
  type VisionItem,
} from './llm.ts'
import {
  defaultMacros,
  isWholeMealServing,
  MAX_KCAL_PER_G,
  plausibleForGrams,
  rowIsMeatier,
  servingGrams,
  servingUnitCount,
} from './portion.ts'

/** The terminal archetype. Seeded with this exact id by seed_archetype_foods(). */
export const TERMINAL_ARCHETYPE_ID = 'a0000000-0000-4000-8000-000000000000'

/**
 * A food, as everything downstream of resolution needs it.
 *
 * THIS USED TO BE A POINTER. It carried `id` and `serving_id` and nothing else,
 * because the entry it became referenced a catalogue row in the same database
 * and `food_log_details` joined the numbers back at read time.
 *
 * The catalogue is in Cloudflare D1 now, so there is no join to make and no
 * foreign key to keep: an entry carries its own numbers. That makes this the
 * SNAPSHOT — everything a logged row needs to state what it was worth, filled
 * in once at resolution and written verbatim.
 *
 * Two consequences worth knowing. `id` is nullable, because a tier-4 estimate
 * is no longer a shared row that had to be created before it could be
 * referenced — it is just numbers, and numbers do not need an id. And the
 * macros ride along, which deleted three separate round trips that existed only
 * to read back what the resolver already knew.
 */
export type FoodRow = {
  /** Soft reference into the catalogue, for provenance. Null for an estimate. */
  id: string | null
  name: string
  /** Per ONE base serving, exactly as the catalogue quotes them. */
  kcal: number
  carbs: number
  protein: number
  fat: number
  fibre: number | null
  sugar: number | null
  sodium: number | null
  place: string | null
  /** The portion these numbers are per, and what it weighs when known. */
  servingLabel: string
  servingGrams: number | null
  /** Soft too. The cascade only ever picks a row's default serving. */
  serving_id: string | null
}

export type Ingredient = {
  food: FoodRow
  quantity: number
  displayLabel: string | null
  /**
   * What ONE of the part weighs, when the model said. Carried through to the
   * row so the breakdown can show "6 x 25 g" rather than "x 6" — the weight is
   * what a person can check against the plate in front of them, and it is the
   * only unit the stepper beside it has.
   */
  grams: number | null
}

export type Resolved = {
  tier: 1 | 2 | 3 | 4 | 5
  food: FoodRow
  quantity: number
  /** Kept when the row's own name is generic (estimate/archetype rows). */
  displayLabel: string | null
  /** Tier 2 only: the parts the parent's sum came from. */
  ingredients?: Ingredient[]
}

/**
 * Whatever was thrown, as one readable line. Half of what reaches a catch here
 * is a PostgREST error — a plain object, which `String()` renders as
 * "[object Object]" and a trace then carries all the way to a bug report.
 */
export const describe = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const { message, code, details, hint } = error as Record<string, unknown>
    if (message || code) {
      return [code, message, details, hint].filter(Boolean).join(' | ')
    }
    return JSON.stringify(error)
  }
  return String(error)
}

// Quarter steps, not two decimals. The rescale ratio is one rough estimate
// divided by another, so "1.08 servings" is precision the data does not have —
// it reads as hallucination on the row. Quarters match how people actually
// talk about portions, and anything near 1 IS 1.
export const clampQuantity = (q: number): number =>
  Math.round(Math.min(3.0, Math.max(0.5, q)) * 4) / 4

/**
 * The same clamp for a fix-by-typing edit: wider, and in twentieths.
 *
 * `clampQuantity` rounds a SCAN to quarters because its ratio is one rough
 * estimate divided by another, and "1.08 servings" is precision the evidence
 * does not have. A refine factor is not that number. It comes from what the
 * person typed, and the one instruction that needs a fine step is the one they
 * are most specific about: "this was more like 400 calories" against a 365 kcal
 * entry is a factor of 1.096, which quarters round back to exactly where it
 * started — the correction ran, said it applied, and changed nothing.
 */
export const refineQuantity = (q: number): number =>
  Math.round(Math.min(10, Math.max(0.25, q)) * 20) / 20

/**
 * A query, folded the way the catalogue folds it, or the empty string when
 * there is nothing left worth asking about.
 *
 * An approximation of the Worker's own `normalize` — that one still decides
 * what matches; this only decides whether a round trip is worth making.
 */
const usable = (q: string | null | undefined): string => {
  const norm = (q ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return norm.length >= 2 ? norm : ''
}

/** The head noun fallback: "chicken fried rice" → "rice". */
const headNoun = (q: string): string => {
  const words = usable(q).split(' ')
  return words.length > 1 ? (words.at(-1) ?? '') : ''
}

export type SearchRow = {
  id: string
  name: string
  brand: string | null
  kcal: number
  carbs_g: number | null
  protein_g: number | null
  fat_g: number | null
  fibre_g: number | null
  sugar_g: number | null
  sodium_mg: number | null
  place: string | null
  default_serving_id: string | null
  serving_label: string | null
  serving_grams: number | null
}

/**
 * The catalogue search, shaped to what the cascade needs.
 *
 * This carries the MACROS now, not just the calories, and that is the change
 * that paid for itself three times over in this file. Every tier used to read
 * back `carbs_g, protein_g, fat_g` from `foods` in a separate query after it had
 * already chosen the row — because the row it chose was a pointer and the
 * numbers were somebody else's to hold. They arrive with the answer now, so a
 * component plate that made five searches and then one more round trip to price
 * its parent makes five.
 */
async function search(q: string, limit: number): Promise<SearchRow[]> {
  // `?? []` on purpose: an unreachable catalogue and an empty one are the same
  // thing to the cascade, which has four more tiers below this one and a floor
  // that needs no network at all. The DISTINCTION matters to the person typing
  // in the search panel, and `data/catalogue.ts` is where it is made.
  //
  // There used to be a strict/forgiving mode here, because forgiving matching
  // in Postgres cost over a second against half a million rows — enough that a
  // five-component plate tripped the 8s statement timeout and lost its
  // breakdown. The Worker fuses all four arms in one round trip, so there is
  // one path now, and the retry that used to follow a miss was re-asking an
  // identical question.
  const foods = (await searchFoods(q, limit)) ?? []

  // The Worker already shapes a food the way `food_details` did, including
  // `default_serving_id` and the default portion's label and weight — so this
  // renames rather than derives. Deriving it here as well is how the two ends
  // of one seam start disagreeing about which portion is the base.
  return foods
    .map(
      (f: CatalogueFood): SearchRow => ({
        id: f.id,
        name: f.name,
        brand: f.brand,
        kcal: f.kcal,
        carbs_g: f.carbs_g,
        protein_g: f.protein_g,
        fat_g: f.fat_g,
        fibre_g: f.fibre_g,
        sugar_g: f.sugar_g,
        sodium_mg: f.sodium_mg,
        place: f.place,
        default_serving_id: f.default_serving_id,
        serving_label: f.serving_label,
        serving_grams: f.serving_g,
      }),
    )
    .filter((r) => r.id && r.serving_label && r.kcal !== null)
}

/**
 * What one serving of a row weighs — the STATED weight first, and the label
 * only as a fallback.
 *
 * This is the whole benefit of the catalogue carrying `food_servings.grams`,
 * and it went unclaimed for a while: `servingGrams` recovers a weight by
 * reading the label with a regex, so it answers for "100 g" and "1 bowl (400
 * g)" and gives up on "1 plate" — which is how nearly every curated Malaysian
 * dish states its portion. The rows have had the number all along.
 *
 * What that cost was the weight path switching itself off exactly where it was
 * most wanted. "Half a plate of char kuey teow" reached the cascade with the
 * model's own 180 g against a row that weighs 300, which is 0.6 of a serving
 * and arithmetic; with no row weight it fell through to the calorie ratio,
 * which was inside the wide gate, and a half plate was logged as a whole one.
 */
const rowGrams = (row: SearchRow): number | null =>
  row.serving_grams ?? servingGrams(row.serving_label)

const asFood = (r: SearchRow): FoodRow => ({
  id: r.id,
  name: r.name,
  kcal: r.kcal,
  carbs: Number(r.carbs_g ?? 0),
  protein: Number(r.protein_g ?? 0),
  fat: Number(r.fat_g ?? 0),
  fibre: r.fibre_g ?? null,
  sugar: r.sugar_g ?? null,
  sodium: r.sodium_mg ?? null,
  place: r.place ?? null,
  servingLabel: r.serving_label ?? '1 serving',
  servingGrams: rowGrams(r),
  serving_id: r.default_serving_id,
})

/**
 * What one unit of a candidate row costs, and how much confidence that figure
 * deserves — the whole of the size question, in one place.
 *
 * There are two ways a catalogue row can answer "what does one of these cost",
 * and they are not equally good:
 *
 *   BY WEIGHT. The row states what its serving weighs ("100 g", "3.0 oz",
 *   "1 bowl (400 g)"), so it knows its own energy density, and the price of the
 *   model's `grams` of it is multiplication. Nothing here depends on the
 *   model's calorie guess, which is the point.
 *
 *   BY UNIT. The row is countable ("10 sticks") or is simply one of the thing,
 *   so its figure divided by that count is what one costs. This is what the
 *   cascade did before weights existed, and it stays the answer for the two
 *   thirds of the catalogue measured in cups and spoons.
 */
type Priced = {
  row: SearchRow
  /** What ONE of the thing costs, converted from whichever the row could answer. */
  kcal: number
  byWeight: boolean
  /** How many of the thing one serving of the row holds. 1 when it is one. */
  units: number
}

export const priceRow = (row: SearchRow, grams: number | null): Priced => {
  const perServing = rowGrams(row)
  const units = servingUnitCount(row.serving_label)
  if (grams && perServing) {
    return { row, kcal: (row.kcal / perServing) * grams, byWeight: true, units }
  }
  return { row, kcal: row.kcal / units, byWeight: false, units }
}

/**
 * A row that IS one of the thing, so an entry can point straight at it and let
 * the catalogue's own figure stand.
 *
 * Both halves matter. `units === 1` says the row is not priced by the ten, and
 * `!byWeight` says its figure was not converted — a row read by weight has been
 * rescaled to the model's grams and no longer says what its own serving costs.
 */
const isWholeUnit = (fit: Priced): boolean => !fit.byWeight && fit.units === 1

/**
 * The rows a PART of a meal may be priced from — two checks about IDENTITY,
 * where everything in `bestFit` below is about size.
 *
 * Both come from one entry. A photographed Hainanese chicken rice was logged at
 * 959 kcal and 72.6 g of protein for a plate holding about 38, and it passed
 * every gate in this file because every gate in this file was a calorie gate:
 * 959 kcal for a large chicken rice with soup is defensible, so nothing looked
 * at the half of the answer that was wrong.
 *
 *   A LEAN PART IS NOT PRICED FROM A MEATY ROW. The rice component matched the
 *   Malaysian composition table's "Rice, Chicken (Nasi Ayam)" — 1 plate, 230 g,
 *   16.1 g of protein, which is 7 g per 100 g against plain cooked rice's 2.7,
 *   with LESS carbohydrate per 100 g than plain rice. That row is not seasoned
 *   rice, it is rice with the bird in it, so the chicken was priced once as
 *   itself and again inside the rice. Told to stop naming the part after its
 *   dish, the model called it "seasoned rice" and weighed it honestly at 6 g of
 *   protein in 220 g — and the catalogue went on answering with rows at 7.7,
 *   because their calories are right and only their composition is wrong. Same
 *   for a clear radish broth priced from a soup with meat in it. See
 *   `rowIsMeatier`.
 *
 *   A PART IS NOT CHARGED FOR A WHOLE PLATE. The check above needs a weight at
 *   both ends to read a density, and the rows that state neither are the
 *   dangerous ones: with no weight to take a helping from, `priceRow` hands back
 *   the row's ENTIRE figure and `isWholeUnit` lets the part point straight at it.
 *   "Hainanese Chicken Rice, Steamed (SG)" is 600 kcal for "1 plate" and says
 *   nothing about what a plate weighs, so it would charge one component for the
 *   whole meal.
 *
 * Which is why the plate rule is scoped to exactly that case rather than applied
 * to every plate-shaped label, and the scoping was learnt by breaking something:
 * unscoped, it also threw out "Rice, Coconut Milk (Nasi Lemak)" — 1 plate, 230 g,
 * 4.2 g of protein per 100 g, which IS just the rice, a plate being how a
 * composition table states a household portion of one food. Losing it promoted
 * "Coconut sticky rice", a Thai dessert with no stated weight, and a nasi lemak's
 * rice went from 338 kcal to 527. A row that states its weight can be asked for a
 * helping, and then composition decides whether it is the right food at all.
 *
 * A part with no usable row falls back to the model's own figures, which is the
 * path this file already takes for a part the catalogue cannot answer — so the
 * cost of rejecting a row is an estimate rather than a missing part, and the
 * model's own composition claim was the better witness in every case above.
 *
 * The DISH tier does not use this and must not: a plate is exactly the row it
 * wants, and a dish is allowed to contain meat.
 */
export function componentCandidates(
  rows: SearchRow[],
  /** Grams of protein in ONE unit of the part, as the model stated them. */
  partProtein: number | null = null,
  /** What one unit weighs, so both sides can be read per gram. */
  partGrams: number | null = null,
): SearchRow[] {
  const partPerG =
    partProtein === null || !partGrams || partGrams <= 0 ? null : partProtein / partGrams

  return rows.filter((row) => {
    const weight = rowGrams(row)
    // Would this row be charged WHOLE? `priceRow` converts by weight only when
    // both sides have one, so either side missing means the part pays the row's
    // full figure — and a full plate is not a part of a meal.
    if ((!partGrams || !weight) && isWholeMealServing(row.serving_label)) return false
    // The row's own density, which is what it charges per gram whatever its
    // serving happens to be called — so this reads the same for "100 g" and for
    // "1 quarter (148 g)".
    const rowPerG =
      !weight || weight <= 0 || row.protein_g === null ? null : Number(row.protein_g) / weight
    return !rowIsMeatier(rowPerG, partPerG)
  })
}

/**
 * The candidate closest in size to what the model described, or null.
 *
 * The gate used to be the model's own calorie figure — a quarter to double of
 * it — and that is the mechanism by which one bad guess became a bad entry.
 * Told a satay stick was 180 kcal, the band ran 45-360 and so excluded the
 * catalogue's own "Chicken Satay (Satay Ayam), 365 kcal per 10 sticks" at 36
 * kcal a stick: the number that was wrong rejected the number that was right,
 * and four skewers were logged at 720 kcal.
 *
 * With a weight in hand the gate becomes a physical one instead. A row is
 * eligible if what it charges for THIS many grams is a believable energy
 * density at all, which throws out the rice flour ranked above the rice and
 * keeps everything else — and only then does the model's (already reconciled)
 * figure act as a tie-break between the survivors. Where the two disagree
 * about a row that is plainly the right food, the catalogue wins, which is the
 * arrangement everywhere else in this file.
 *
 * Identity is NOT this function's business beyond that — see
 * `componentCandidates` for the two checks that are, and which run before it.
 */
export function bestFit(rows: SearchRow[], grams: number | null, kcal: number): Priced | null {
  const priced = rows.map((row) => priceRow(row, grams))
  if (kcal <= 0) {
    // No price to compare against — a part the model named and weighed but did
    // not cost. Relevance order is the only ranking left, so take the top hit
    // that is not absurd for the weight, and nothing at all if none of them
    // qualifies: falling back to the top row regardless is how 50 g of
    // meatball became a 720 kcal row, at fourteen calories a gram.
    if (!grams) return priced[0] ?? null
    return priced.find((c) => plausibleForGrams(c.kcal, grams)) ?? null
  }
  return (
    priced
      .filter((candidate) => {
        // Physically possible for something of this weight. Catches the row
        // that is a different food under a similar name — search ranks by
        // NAME, so "white rice" can top-rank rice flour.
        if (grams && !plausibleForGrams(candidate.kcal, grams)) return false
        // And in the same order of magnitude as what the model said, which is
        // worth something again now that the model's figure has been made to
        // agree with its own weight. Before that it was worth nothing: a satay
        // stick claimed at 180 kcal put the band at 45-360 and so excluded the
        // catalogue's own 36 kcal a stick. Wide, because the point is to throw
        // out the row that is not this food at all — 40 g of lettuce matched a
        // 140 kcal row and put a salad on the plate at fourteen times what the
        // model, correctly, said a salad costs.
        const ceiling = grams ? 2.5 : 2
        return candidate.kcal >= kcal * 0.25 && candidate.kcal <= kcal * ceiling
      })
      // Closest in log space, so half-sized and double-sized rows lose to one
      // that is nearly right in either direction.
      .sort((a, b) => Math.abs(Math.log(a.kcal / kcal)) - Math.abs(Math.log(b.kcal / kcal)))[0] ??
    null
  )
}

/**
 * A food the catalogue could not answer for, as numbers rather than as a row.
 *
 * This used to be a WRITE. `upsert_estimate_food` created a shared `foods` row
 * deduped on name and size, and handed back an id for the entry to point at, so
 * that two people who both photographed an unlisted dish shared one estimate.
 *
 * That sharing was never worth much — a guess reused is still a guess — and it
 * cost the one thing that mattered: a client-facing table the scan pipeline
 * wrote to, in a catalogue no client may write. With the catalogue in D1 there
 * is nowhere to put such a row and nothing that needs one, because an entry
 * carries its own numbers. So this is now pure: no id, no round trip, no
 * failure mode. It cannot return null any more, and every caller's null branch
 * went with it.
 */
function estimateRow(input: {
  name: string
  kcal: number
  carbs: number
  protein: number
  fat: number
  /** Only a photographed panel knows these; a guess leaves them null. */
  fibre?: number | null
  sugar?: number | null
  sodium?: number | null
}): FoodRow {
  return {
    id: null,
    name: input.name,
    kcal: Math.round(input.kcal),
    carbs: input.carbs,
    protein: input.protein,
    fat: input.fat,
    fibre: input.fibre ?? null,
    sugar: input.sugar ?? null,
    sodium: input.sodium ?? null,
    place: null,
    servingLabel: '1 serving',
    servingGrams: null,
    serving_id: null,
  }
}

async function recordMisses(db: SupabaseClient, scanId: string, queries: string[]) {
  if (queries.length) {
    await db.from('food_scan_misses').insert(queries.map((q) => ({ scan_id: scanId, query: q })))
  }
}

/**
 * Tier 2: the plate as its parts, folded into ONE entry.
 *
 * Each component carries the vision model's own sizing — a WEIGHT for one of
 * them, and what that weight costs — and it does two jobs. Against the
 * catalogue the weight is what makes a row comparable at all: search ranks by
 * NAME, so "white rice" can top-rank rice flour at 578 kcal, and a row priced
 * per 100 g or per ten sticks says nothing about one scoop or one skewer until
 * it is converted. And when no hit fits, the model's figures PRICE that
 * component as an estimate — so one unsearchable side dish no longer kills the
 * breakdown.
 *
 * Everything here is per SINGLE unit, with the count carried in the
 * ingredient's quantity. Two wings are a 125 kcal row at quantity 2, not a 250
 * kcal row at quantity 1: the second shape is the same calories and a useless
 * stepper, because the smallest edit it can express is both wings at once.
 */
async function resolveByComponents(
  db: SupabaseClient,
  scanId: string,
  item: VisionItem,
  trace?: string[],
): Promise<Resolved | null> {
  if (item.components.length < 2) return null

  /**
   * How many of the WHOLE described thing there were.
   *
   * The prompt asks for multiplicity on the components when there are
   * components, and the item's own count is meant to be 1 there. It is not
   * always: "two roti canai with dhal" came back as one item at count 2 with
   * both parts priced for a single plate, and this stage read only the parts —
   * so the count vanished, twice over. The breakdown would have logged two
   * plates at the price of one, and before it got that far the band check below
   * compared a one-plate total against bounds drawn for two and threw the
   * breakdown away as "the main food is missing".
   *
   * Folding it into every part is the literal reading of an item count beside a
   * list of parts — that many of this whole meal — and it is the only reading
   * that keeps the parent equal to the sum of its parts, which is what
   * `food_log_details` requires: the parts branch of its coalesce does not
   * multiply by the entry's own quantity, so multiplicity that is not in an
   * ingredient row is multiplicity nothing downstream will ever see.
   *
   * It reads a count BELOW one too, which is how a part portion of a described
   * plate arrives: "half a nasi lemak with fried chicken" is count 0.5, and
   * halving every part is what makes that half reach the diary.
   */
  const meals = item.count > 0 ? item.count : 1

  const parts: Array<{
    food: FoodRow
    quantity: number
    label: string
    kcal: number
    /** What one of it weighs, straight from the model. Null when unweighed. */
    grams: number | null
  }> = []

  // One part's search failing is not the plate's problem: it means no
  // catalogue answer for that part, which the model's own figures below
  // already know how to price. A throw here used to take the whole stage with
  // it — the plate lost its breakdown and fell to a tier that rescaled it.
  //
  // One at a time, deliberately. Fired together, five of these contend for a
  // small instance and four of the five time out; run in turn each gets the
  // whole box and a search answers in tens of milliseconds.
  for (const component of item.components) {
    const q = usable(component.name)
    if (!q) continue

    const rows = await search(q, 5).catch((error) => {
      // A PostgREST error is a plain object, which `String()` renders as
      // "[object Object]" — the least useful thing a trace can say.
      const message = `[cascade] components: search "${q}" failed: ${describe(error)}`
      console.error(message)
      trace?.push(message)
      return [] as SearchRow[]
    })

    // Which of these rows can be THIS PART at all, before anything asks how big
    // it is. It runs before `bestFit` rather than after for the obvious reason:
    // rejected afterwards, the part would keep whichever wrong row ranked best
    // and lose the runner-up that might have been the right food.
    const candidates = componentCandidates(
      rows,
      component.protein_g === null ? null : Number(component.protein_g),
      component.grams,
    )
    if (candidates.length < rows.length) {
      trace?.push(
        `[cascade] components: "${q}" dropped ${rows.length - candidates.length} of ${rows.length} ` +
          'row(s) as a whole meal or as meatier than the part',
      )
    }

    // The catalogue row that best describes ONE of this part, at this weight.
    // Catalogue servings are whatever the source recorded — "Chicken Satay
    // (Satay Ayam)" is 365 kcal for TEN STICKS, and "Chicken, fried" is per
    // 100 g — so a row's own figure is almost never the price of one of the
    // thing on the plate. `bestFit` converts before it compares.
    const fit = bestFit(candidates, component.grams, component.kcal)

    if (fit && isWholeUnit(fit)) {
      // A row that IS one of the thing. The quantity is the count and nothing
      // else: the row's own figure is what one of them costs, and rescaling it
      // to chase the model's guess is how a single scoop of rice ended up
      // logged as "0.75 ×" — a fraction nobody can act on and no evidence
      // supports. Where the two disagree the catalogue wins, silently.
      parts.push({
        food: asFood(fit.row),
        quantity: component.count * meals,
        label: component.name.slice(0, 120),
        grams: component.grams,
        kcal: fit.row.kcal * component.count * meals,
      })
      continue
    }

    if (fit) {
      // A row that is ten of the thing, or a hundred grams of it. Pointing at
      // it would put "0.8" on a plate of eight skewers, so the ingredient gets
      // a per-unit row of its own — priced by CONVERTING the catalogue figure,
      // never by asking the model again — and the quantity is the count the
      // user can see. The macros come across at the same ratio the calories
      // did, so the row stays internally consistent whichever way it was
      // scaled.
      const perUnit = Math.max(1, Math.round(fit.kcal))
      const scale = fit.row.kcal > 0 ? fit.kcal / fit.row.kcal : 1
      const share = (value: number | null) =>
        value === null ? 0 : Math.round(Number(value) * scale * 10) / 10
      const unitRow = estimateRow({
        name: component.name,
        kcal: perUnit,
        carbs: share(fit.row.carbs_g),
        protein: share(fit.row.protein_g),
        fat: share(fit.row.fat_g),
      })
      parts.push({
        food: unitRow,
        quantity: component.count * meals,
        label: component.name.slice(0, 120),
        grams: component.grams,
        kcal: unitRow.kcal * component.count * meals,
      })
      continue
    }

    // The filtered set, not the raw one. "chicken rice" answers eight rows and
    // not one of them can be the rice UNDER a chicken rice — they are plates,
    // sets and a seasoning packet — so the catalogue genuinely has nothing for
    // this part, and the widening backlog is where that belongs.
    if (!candidates.length) await recordMisses(db, scanId, [q])

    // No catalogue answer at this size: the model's own figures become a
    // shared estimate row for the component. Macros are the model's when it
    // gave them, else an Atwater-consistent default split; either way the
    // ingredient exists and the breakdown survives.
    //
    // The figure used here is the RECONCILED one — already made to agree with
    // the part's own weight in `shapeVision` — so the fallback is bounded even
    // though nothing checked it against a real portion.
    if (component.kcal <= 0) {
      // Neither the catalogue nor the model will say what this is worth. It is
      // dropped rather than invented, and the plate is one part short, which
      // `parts.length < 2` below may yet decide is fatal.
      trace?.push(`[cascade] components: "${component.name}" has no price anywhere`)
      continue
    }
    const macros =
      component.carbs_g !== null || component.protein_g !== null || component.fat_g !== null
        ? {
            carbs: Number(component.carbs_g ?? 0),
            protein: Number(component.protein_g ?? 0),
            fat: Number(component.fat_g ?? 0),
          }
        : defaultMacros(component.kcal)
    const guess = estimateRow({
      name: component.name,
      kcal: component.kcal,
      carbs: macros.carbs,
      protein: macros.protein,
      fat: macros.fat,
    })
    // Priced for ONE, so the count is the quantity here too. That used to need
    // an argument — the shared row was deduped on name AND size, so a part
    // priced for a different-sized version of itself would not have been
    // reused. Nothing is shared now, so the row is this part at this size by
    // construction.
    parts.push({
      food: guess,
      quantity: component.count * meals,
      label: component.name.slice(0, 120),
      grams: component.grams,
      kcal: guess.kcal * component.count * meals,
    })
  }
  if (parts.length < 2) {
    const message = `[cascade] components: only ${parts.length} of ${item.components.length} parts resolved`
    console.error(message)
    trace?.push(message)
    return null
  }

  const sum = { kcal: 0, carbs: 0, protein: 0, fat: 0 }
  for (const part of parts) {
    sum.kcal += part.kcal
  }

  // A breakdown has to be a breakdown OF THIS MEAL.
  //
  // The parts and the calorie band are two answers from the same model to the
  // same question, and when they contradict each other the breakdown is the
  // one that is wrong — because the band is about the meal and the list is
  // about whatever the model chose to enumerate. What it chooses to leave out
  // is the main food: a basket of chicken wings came back with two components,
  // celery and a pot of dip, and since the entry is priced FROM the parts, a
  // meal the model itself bounded at 780-900 kcal was logged at 160. The plain
  // thing underneath — the rice, the noodles, the wings — is exactly what a
  // model listing "what else is on the plate" omits.
  //
  // Both sides are checked and the tolerances are loose, because a band is not
  // a measurement either: this is here to catch a breakdown that is describing
  // a different meal, not to arbitrate a disagreement about a plate of rice.
  // Failing it drops to the dish tier, which prices the whole plate at once and
  // cannot lose a part it never enumerated.
  if (item.kcal_low > 0 && sum.kcal < item.kcal_low * 0.6) {
    const message = `[cascade] components: parts total ${Math.round(sum.kcal)} kcal against a meal the model put at ${item.kcal_low}-${item.kcal_high} — the main food is missing from the breakdown`
    console.error(message)
    trace?.push(message)
    return null
  }
  if (item.kcal_high > 0 && sum.kcal > item.kcal_high * 1.8) {
    const message = `[cascade] components: parts total ${Math.round(sum.kcal)} kcal against a meal the model put at ${item.kcal_low}-${item.kcal_high} — a part is priced as a portion`
    console.error(message)
    trace?.push(message)
    return null
  }
  // Macros summed off the parts themselves. This was a sixth round trip until
  // the resolved rows started carrying their own numbers: the parts were
  // pointers, so the only way to add up what they were made of was to go and
  // read the rows back by id.
  for (const part of parts) {
    sum.carbs += part.food.carbs * part.quantity
    sum.protein += part.food.protein * part.quantity
    sum.fat += part.food.fat * part.quantity
  }
  if (sum.kcal <= 0) return null

  // The parent: the whole plate, priced by the catalogue sum — never by the
  // model.
  //
  // The drift check that used to live here is gone, and its absence is the
  // point. The parent was a SHARED row deduped on the normalized name, so
  // "korean fried chicken rice" resolved to one row across users — and a reuse
  // brought back somebody else's figure. That is what `quantity` absorbed
  // (rule 12: adjust the amount, never the macros) and what dropped the
  // breakdown when the two were too far apart to reconcile. Nothing is shared
  // now, so the parent IS the sum of these parts, at quantity 1, and a
  // breakdown that does not add up to its own total is unspellable.
  const parent = estimateRow({
    name: item.name,
    kcal: sum.kcal,
    carbs: Math.round(sum.carbs * 10) / 10,
    protein: Math.round(sum.protein * 10) / 10,
    fat: Math.round(sum.fat * 10) / 10,
  })

  return {
    tier: 2,
    food: parent,
    quantity: 1,
    displayLabel: item.name,
    ingredients: parts.map((part) => ({
      food: part.food,
      quantity: part.quantity,
      displayLabel: part.label.toLowerCase() === part.food.name.toLowerCase() ? null : part.label,
      grams: part.grams,
    })),
  }
}

/**
 * Three durian are three, not "1 cup".
 *
 * When the photo is several of ONE countable thing, the entry's portion is the
 * count and the food it points at has to be priced for one of them. Otherwise
 * the row says "1 cup" over three seeds — wrong, and unfixable with the
 * stepper beside it, because that stepper counts cups.
 *
 * The catalogue is rarely per-unit for these ("Durian, raw — 1 cup"), so the
 * same trick the breakdown uses applies here: divide a row that holds many
 * units, or price one unit from the model when nothing fits, and put the count
 * in `quantity` where the user can edit it.
 */
async function resolveByCount(
  db: SupabaseClient,
  scanId: string,
  item: VisionItem,
  trace?: string[],
): Promise<Resolved | null> {
  if (item.count < 2) return null
  // The band divided by the count is what the model thinks one of them costs.
  // Where it also said what one WEIGHS, that figure gets the same reconciling
  // a component's does: ten wings banded at 1800-2200 is 200 kcal each, which
  // is more than twice what 60 g of fried chicken can hold.
  let perUnit = Math.round((item.kcal_low + item.kcal_high) / 2 / item.count)
  if (item.grams) perUnit = Math.min(Math.round(item.grams * MAX_KCAL_PER_G), perUnit)
  if (perUnit <= 0) return null

  // The local name first, then the generic one: "har gow" is in no catalogue
  // this app ships with, and "shrimp dumplings" is — at 230 kcal for six,
  // which is what three of them should be priced from.
  const tried = new Set<string>()
  const queries = [item.specific_query, item.name, item.generic_query]
    .map(usable)
    .filter((q) => q && !tried.has(q) && tried.add(q))
  if (!queries.length) return null

  let rows: SearchRow[] = []
  let q = queries[0]
  for (const candidate of queries) {
    q = candidate
    rows = await search(candidate, 5).catch(() => [] as SearchRow[])
    if (rows.length) break
  }

  // Same conversion the breakdown uses, for the same reason: "Durian, raw" is
  // priced per cup and a durian is not a cup. With the item's own weight the
  // catalogue's per-100g rows become answerable too, which is most of what the
  // catalogue holds for a single ingredient.
  const fit = bestFit(rows, item.grams, perUnit)

  if (fit && isWholeUnit(fit)) {
    return {
      tier: 1,
      food: asFood(fit.row),
      quantity: item.count,
      displayLabel: usable(item.name) === usable(fit.row.name) ? null : item.name.slice(0, 120),
    }
  }

  // Either a row measured in cups or in grams, or nothing usable. All end in a
  // row priced for one — from the catalogue when there is one, from the model
  // when not.
  const scale = fit && fit.row.kcal > 0 ? fit.kcal / fit.row.kcal : 1
  const share = (value: number | null) =>
    value === null ? 0 : Math.round(Number(value) * scale * 10) / 10
  const unitRow = fit
    ? estimateRow({
        name: item.name,
        kcal: Math.max(1, Math.round(fit.kcal)),
        carbs: share(fit.row.carbs_g),
        protein: share(fit.row.protein_g),
        fat: share(fit.row.fat_g),
      })
    : estimateRow({ name: item.name, kcal: perUnit, ...defaultMacros(perUnit) })
  if (!fit) {
    // Worth recording: this is the tier where the catalogue had nothing at any
    // size and the count is priced from the model alone, which is the weakest
    // answer this path can give and the one a trace should be able to explain.
    trace?.push(`[cascade] count: no catalogue row for "${item.name}", priced from the model`)
  }
  if (!rows.length) await recordMisses(db, scanId, [q])

  return { tier: fit ? 3 : 4, food: unitRow, quantity: item.count, displayLabel: item.name }
}

/**
 * How far two estimates of the same portion may differ before the row is
 * treated as a different SIZE of the dish rather than the same size.
 *
 * The model's grams for a plate and the catalogue's grams for its own serving
 * are two independent guesses at one number, and neither was weighed. Held to
 * within 15% of each other, ordinary disagreement between them read as a size
 * mismatch: a plate of mee goreng mamak the catalogue prices at 657 kcal for
 * 400 g was rescaled to 1.25 servings and logged at 821 — against a band the
 * same model had put at 490-630, so its own two answers disagreed and the
 * weaker one won by a third.
 *
 * A genuine size mismatch, which is what this test exists to catch, is not
 * subtle: a per-100 g row against a plateful, a whole cake against a slice, a
 * bag of ten against one. Those are factors of two and up and clear this window
 * easily, while a half portion (0.5) still falls outside it.
 */
const SAME_PORTION_LOW = 0.7
const SAME_PORTION_HIGH = 1.4

/** Tiers 1 and 3: the dish-level catalogue match. */
async function resolveByDish(
  db: SupabaseClient,
  scanId: string,
  item: VisionItem,
  mock: MockSteer | undefined,
  meter: Meter,
  trace?: string[],
): Promise<Resolved | null> {
  const llmMid = (item.kcal_low + item.kcal_high) / 2

  const tried = new Set<string>()
  const queries = [item.specific_query, item.generic_query, headNoun(item.generic_query)]
    .map(usable)
    .filter((q) => q && !tried.has(q) && tried.add(q))
    .slice(0, 3)

  let candidates: SearchRow[] = []
  const missed: string[] = []
  // Specific first, then generic, then the head noun — the queries are already
  // ordered that way, so the first that answers is the most specific one the
  // catalogue holds.
  for (const q of queries) {
    candidates = await search(q, 5)
    if (candidates.length) break
    missed.push(q)
  }
  await recordMisses(db, scanId, missed)

  // Zero rows and "the verifier rejected all of them" are ONE outcome: this
  // tier has no answer, so fall through rather than settling for a near miss.
  let chosen: SearchRow | null = null
  if (candidates.length) {
    // A verifier that failed is "no match", and the tier below takes over — but
    // not when what failed was the budget. Swallowed here that would be spent
    // again by the estimate tier and answered with an archetype, which is the
    // one outcome running out of requests must never produce.
    const idx = await pickCandidate(item, candidates, mock, meter).catch((error: unknown) => {
      if (error instanceof AiLimitReached) throw error
      return null
    })
    chosen = idx === null ? null : (candidates[idx] ?? null)
  }
  if (!chosen) return null

  // The model's name for the plate, worn over the matched row. The numbers
  // stay the catalogue's; the LABEL is the model's, because imported row
  // names are written for databases, not diaries — "MEAL KIT, KOREAN FRIED
  // CHICKEN WITH SWEET GOCHUJANG SAUCE" is the right macros wearing the
  // wrong name. Skipped when the two already read the same.
  const label = usable(item.name) === usable(chosen.name) ? null : item.name.slice(0, 120)

  // What was eaten, by weight, against what one serving of the row weighs.
  // Only both-or-nothing: a ratio of two weights is a conversion, and a ratio
  // of a weight and a guess is a guess.
  //
  // `item.grams` is one unit and `item.count` is how many, so the numerator is
  // their product — the same whole-meal quantity `ratio` below carries, since
  // the band it divides covers every unit on the table. Weighing one durian
  // against a 100 g row and logging that would put three of them on the diary
  // as a third of one.
  const servingWeight = rowGrams(chosen)
  const byWeight = item.grams && servingWeight ? (item.grams * item.count) / servingWeight : null

  // A row the verifier says IS this dish, at one portion.
  //
  // The gate here used to be the model's calorie range, and that had it
  // backwards: identity is what a vision model is good at and calories are
  // what it is worst at. A plate of apple slices came back "400-500 kcal", so
  // every sensible apple row in the catalogue looked wrong and the cascade
  // fell through to the model's own figure — the bad number rejecting the good
  // one. Within a factor of two and a half either way the row is simply taken.
  const ratio = chosen.kcal > 0 ? llmMid / chosen.kcal : 1

  // The whole sizing decision, in one line, because it is the one thing about a
  // scan that cannot be reconstructed afterwards. The entry records the portion
  // it landed on and nothing about how: a plate logged at one serving looks
  // identical whether the weights agreed, the weights were missing, or the
  // calorie ratio was the only evidence there was. Three different bugs.
  trace?.push(
    `[cascade] dish "${chosen.name}": model ${item.grams ?? '?'}g x${item.count} vs row ` +
      `${servingWeight ?? '?'}g — byWeight ${byWeight === null ? 'n/a' : byWeight.toFixed(2)}, ` +
      `ratio ${ratio.toFixed(2)} (${llmMid} vs ${chosen.kcal})`,
  )
  // A weight settles it before the calorie ratio gets a say. "100 g" of a dish
  // against a 450 g plate of it is 4.5 servings whatever either party thinks
  // the plate costs, and the ratio would have called the same row a size
  // mismatch or a match depending on a number the model is bad at.
  if (byWeight !== null && (byWeight < SAME_PORTION_LOW || byWeight > SAME_PORTION_HIGH)) {
    return {
      tier: 3,
      food: asFood(chosen),
      quantity: clampQuantity(byWeight),
      displayLabel: label,
    }
  }
  if (ratio >= 0.5 && ratio <= 2.5) {
    return { tier: 1, food: asFood(chosen), quantity: 1, displayLabel: label }
  }

  // Further out, the row is a different SIZE of the right thing — a per-piece
  // row against a plateful, or a whole cake against a slice — which is what
  // quantity is for. Still bounded: one photo is one plate, and `clampQuantity`
  // will not claim more than three of anything.
  if (item.confidence >= 0.5) {
    return {
      tier: 3,
      food: asFood(chosen),
      quantity: clampQuantity(ratio),
      displayLabel: label,
    }
  }
  return null
}

/**
 * A photographed nutrition panel, taken at its word.
 *
 * No search, no verifier, no estimate. The whole cascade below exists to work
 * out numbers nobody wrote down, and here somebody did — the manufacturer,
 * on the packet, in the photo. Reading them and then "checking" them against a
 * catalogue guess would be the app overruling the only measured figure in the
 * room.
 *
 * The figures land on the entry the way every other tier's do, through
 * `estimateRow`. Nothing is written to the catalogue and nothing is shared with
 * the next person to photograph the same packet — a panel read once is this
 * meal's evidence, not everybody's.
 */
export async function resolveByLabel(label: NutritionLabel): Promise<Resolved | null> {
  // A close-up of the panel alone has no product name in it, and the row must
  // not be called after the table or after the model's way of shrugging. Two
  // shapes to catch: the heading copied out as if it were the food
  // ("Nutrition Facts"), and a stand-in for not knowing ("Unidentified Food
  // Product", which is what a real scan came back with). The prompt asks for
  // null in that case; this is the belt to its braces, because there are
  // endless ways to write "I could not read it" and only one null.
  const unnamed =
    /^(nutrition|nutritional)\s*(facts|information|panel)?$|\b(unidentified|unknown|unnamed|generic)\b/i
  const name = unnamed.test(label.name.trim()) ? 'Packaged food' : label.name

  const food = estimateRow({
    name,
    kcal: label.kcal,
    carbs: Math.round(label.carbs_g * 10) / 10,
    protein: Math.round(label.protein_g * 10) / 10,
    fat: Math.round(label.fat_g * 10) / 10,
    // The reason somebody photographs a panel rather than the food: these are
    // printed there and nowhere else the app can reach.
    fibre: label.fibre_g,
    sugar: label.sugar_g,
    sodium: label.sodium_mg,
  })
  // One serving, as the panel defines a serving. Somebody who ate two of them
  // says so with the stepper — which is now counting the packet's own unit.
  return { tier: 1, food, quantity: 1, displayLabel: name }
}

/** Tier 4: validated model nutrition, kept as the entry's own numbers. */
async function resolveByEstimate(
  item: VisionItem,
  mock: MockSteer | undefined,
  meter: Meter,
): Promise<Resolved | null> {
  const atwaterOk = (n: Nutrition): boolean => {
    if (n.kcal <= 0) return false
    const atwater = n.carbs_g * 4 + n.protein_g * 4 + n.fat_g * 9
    return Math.abs(atwater - n.kcal) / n.kcal <= 0.25
  }

  /**
   * And in the same world as the meal the vision call described.
   *
   * Atwater only asks whether an answer agrees with ITSELF, which a
   * proportionally huge one does: a Korean fried chicken tray came back at
   * 3,260 kcal with macros to match, passed, and was written to the diary
   * against a photo the same model had bounded at 1,100-1,250 kcal. Nothing
   * else in this tier looks at a portion at all — the catalogue has already
   * failed by the time it runs, so the band is the only other evidence there
   * is, and a figure two and a half times outside it is not a second opinion
   * about this meal.
   *
   * The band is still not shown to the estimator, and that is deliberate:
   * anchored with "expected around 400-500 kcal" the model answered 450 for a
   * plate of apple slices and 120 without. Checking an answer afterwards is not
   * the same as suggesting one beforehand.
   */
  const inBand = (n: Nutrition): boolean =>
    item.kcal_high <= 0 || (n.kcal <= item.kcal_high * 2 && n.kcal >= item.kcal_low * 0.4)

  // One retry: a self-contradicting answer once may be noise, twice is the
  // model not knowing this dish. Failing both leaves the archetype floor, which
  // prices the plate by scaling a generic row to the band — a rougher answer,
  // and one that cannot be off by a factor of three.
  let nutrition: Nutrition | null = null
  for (let attempt = 0; attempt < 2 && !nutrition; attempt++) {
    const candidate = await estimateNutrition(item, mock, meter)
    if (atwaterOk(candidate) && inBand(candidate)) nutrition = candidate
  }
  if (!nutrition) return null

  return {
    tier: 4,
    food: estimateRow({
      name: item.name,
      kcal: nutrition.kcal,
      carbs: nutrition.carbs_g,
      protein: nutrition.protein_g,
      fat: nutrition.fat_g,
      fibre: nutrition.fibre_g,
      sugar: nutrition.sugar_g,
      sodium: nutrition.sodium_mg,
    }),
    quantity: 1,
    displayLabel: item.name,
  }
}

/** Tier 5. The only tier that cannot fail: worst case is the terminal row. */
export async function resolveByArchetype(
  db: SupabaseClient,
  item: VisionItem | null,
  mock: MockSteer | undefined,
  meter: Meter,
): Promise<Resolved> {
  // `public.archetypes`, not the catalogue, and that is the whole reason the
  // table exists: this tier is where a scan lands when the catalogue, the model
  // or the network has failed it. Reading the sixty rows over HTTP from D1 would
  // make the fallback for "the network failed" another network call.
  //
  // Every archetype is quoted per "1 serving" with no stated weight, which is
  // why nothing here reads a serving label — there is one and it is a constant.
  const columns = 'id, slug, name, kcal, carbs_g, protein_g, fat_g'
  const snapshot = (row: Archetype): FoodRow => ({
    id: row.id,
    name: row.name,
    kcal: row.kcal,
    carbs: Number(row.carbs_g ?? 0),
    protein: Number(row.protein_g ?? 0),
    fat: Number(row.fat_g ?? 0),
    fibre: null,
    sugar: null,
    sodium: null,
    place: null,
    servingLabel: '1 serving',
    servingGrams: null,
    serving_id: null,
  })

  let archetype: Archetype | null = null
  if (item) {
    try {
      const { data } = await db.from('archetypes').select(columns)
      if (data?.length) archetype = await classifyArchetype(item, data as Archetype[], mock, meter)
    } catch {
      archetype = null
    }
  }

  let food: FoodRow
  if (archetype) {
    food = snapshot(archetype)
  } else {
    // The terminal row: hardcoded id, no model call, no search.
    const { data: terminal } = await db
      .from('archetypes')
      .select(columns)
      .eq('id', TERMINAL_ARCHETYPE_ID)
      .single()
    if (!terminal) throw new Error('terminal archetype row missing — run seed_archetype_foods()')
    food = snapshot(terminal as Archetype)
  }

  // The model's range is still better portion evidence than nothing: scale
  // quantity, never the archetype's macros.
  const llmMid = item ? (item.kcal_low + item.kcal_high) / 2 : 0
  const quantity = llmMid > 0 && food.kcal > 0 ? clampQuantity(llmMid / food.kcal) : 1

  return { tier: 5, food, quantity, displayLabel: item ? item.name : null }
}

/**
 * The full cascade for one item. A plate with visible parts tries
 * decomposition FIRST — parts are better explained than approximated — then
 * the dish-level match, then the estimate. Returns null when only the
 * archetype floor is left; each stage guards itself so one stage's crash
 * cannot skip the ones below it.
 *
 * Nothing here reads the model's `scene` label. Whether a plate has parts is
 * decided by whether it LISTED parts: a banana leaf of satay came back as
 * "single" with three components on it — seven skewers, two ketupat, a heap of
 * shallots — and the label sent it to a one-row catalogue match for 365 kcal
 * against the 525 its own parts add up to. The list is the evidence; `scene`
 * was the model's summary of it, and it is recorded on the eval row rather
 * than acted on.
 */
export async function resolveItem(
  db: SupabaseClient,
  scanId: string,
  item: VisionItem,
  mock: MockSteer | undefined,
  meter: Meter,
  trace?: string[],
): Promise<Resolved | null> {
  const note = (stage: string, error: unknown) => {
    // Running out of budget is not a tier failing. Swallowed here it would be
    // retried by every tier below and finally answered with an archetype, so
    // somebody over their limit would get a guessed "Mixed meal" in their
    // diary rather than being told what happened.
    if (error instanceof AiLimitReached) throw error
    const message = `[cascade] ${stage}: ${describe(error)}`
    console.error(message)
    trace?.push(message)
  }

  let resolved: Resolved | null = null
  if (item.components.length >= 2) {
    resolved = await resolveByComponents(db, scanId, item, trace).catch((error) => {
      note('components stage threw', error)
      return null
    })
  }
  // Several of one thing: the count belongs in the portion, not in a breakdown
  // of a plate that has no parts. Only reached when decomposition declined,
  // which is the case for three durian and not for a tray of fried chicken.
  if (!resolved && item.count >= 2) {
    resolved = await resolveByCount(db, scanId, item, trace).catch((error) => {
      note('count stage threw', error)
      return null
    })
  }
  resolved =
    resolved ??
    (await resolveByDish(db, scanId, item, mock, meter, trace).catch((error) => {
      note('dish stage threw', error)
      return null
    }))
  resolved =
    resolved ??
    (await resolveByEstimate(item, mock, meter).catch((error) => {
      note('estimate stage threw', error)
      return null
    }))
  return resolved
}

export type WrittenEntry = {
  id: string
  /** Both soft references into a catalogue elsewhere, and null for an estimate. */
  foodId: string | null
  servingId: string | null
  name: string
  quantity: number
  /** What the row will show. The client announces it from the background. */
  kcal: number
  tier: number
  ingredients: Array<{ name: string; kcal: number; quantity: number }>
}

/** One resolved item into the diary: the entry, then its ingredients. */
export async function writeEntry(
  db: SupabaseClient,
  input: {
    userId: string
    logDate: string
    scanId: string
    resolved: Resolved
    photoPath: string | null
    suggestedEdits: string[]
    /**
     * How the meal was described. A photographed plate and a typed one run the
     * identical cascade and land in the identical row shape, so this column is
     * the only place the difference survives — and "what fraction of logs come
     * from the camera" is the question `entry_source` exists to answer.
     */
    source: 'camera' | 'text'
    /**
     * The drawing the model picked for a TYPED meal, out of our own set.
     *
     * `food_logs_one_picture` allows a row a photograph or a drawing and not
     * both, which is not a constraint to work around here: a typed meal has no
     * photograph by definition, and a photographed one has the better picture
     * already. Passing an icon alongside a `photoPath` is a caller bug, so the
     * insert drops it rather than letting the database refuse the whole entry.
     */
    icon?: { set: string; name: string } | null
  },
): Promise<WrittenEntry> {
  const { resolved } = input
  const icon = input.photoPath ? null : (input.icon ?? null)
  const { data: entry, error } = await db
    .from('food_logs')
    .insert({
      user_id: input.userId,
      // Soft now: no foreign key, and null for a tier-4 estimate. Kept for
      // provenance and for a future job that re-snapshots against the
      // catalogue, not for anything that reads this row today.
      food_id: resolved.food.id,
      serving_id: resolved.food.serving_id,
      // The snapshot. This is what the entry is worth, and it is the ONLY thing
      // that says so — `food_log_details` has no catalogue left to join.
      item_name: resolved.food.name,
      item_place: resolved.food.place,
      base_kcal: Math.round(resolved.food.kcal),
      base_carbs_g: resolved.food.carbs,
      base_protein_g: resolved.food.protein,
      base_fat_g: resolved.food.fat,
      base_fibre_g: resolved.food.fibre,
      base_sugar_g: resolved.food.sugar,
      base_sodium_mg: resolved.food.sodium,
      serving_label: resolved.food.servingLabel,
      // Always the base serving. The cascade picks a food, never a portion of
      // one — the size it decided on is carried by `quantity`, which is what
      // the stepper beside the entry adjusts.
      serving_factor: 1,
      serving_grams: resolved.food.servingGrams,
      log_date: input.logDate,
      quantity: resolved.quantity,
      source: input.source,
      photo_path: input.photoPath,
      icon_set: icon?.set ?? null,
      icon_name: icon?.name ?? null,
      scan_id: input.scanId,
      display_label: resolved.displayLabel,
      suggested_edits: input.suggestedEdits.length ? input.suggestedEdits : null,
    })
    .select('id')
    .single()
  if (error || !entry) throw error ?? new Error('insert failed')

  const ingredients = await writeIngredients(db, entry.id, resolved.ingredients ?? [])

  return {
    id: entry.id,
    foodId: resolved.food.id,
    servingId: resolved.food.serving_id,
    name: resolved.displayLabel ?? resolved.food.name,
    quantity: resolved.quantity,
    // The parts when there are parts, exactly as `food_log_details` reads it.
    // The parent row is a reused estimate that may be priced a little either
    // way, so quoting it here put a number in the "your plate is counted"
    // notification that the diary row underneath did not show.
    kcal: ingredients.length
      ? ingredients.reduce((sum, part) => sum + part.kcal, 0)
      : Math.round(resolved.food.kcal * resolved.quantity),
    tier: resolved.tier,
    ingredients,
  }
}

/** The breakdown rows for an entry. Exported for scan-refine's re-resolve. */
export async function writeIngredients(
  db: SupabaseClient,
  foodLogId: string,
  ingredients: Ingredient[],
): Promise<WrittenEntry['ingredients']> {
  if (!ingredients.length) return []
  const { error } = await db.from('food_log_ingredients').insert(
    ingredients.map((ingredient, index) => ({
      food_log_id: foodLogId,
      food_id: ingredient.food.id,
      serving_id: ingredient.food.serving_id,
      item_name: ingredient.food.name,
      base_kcal: Math.round(ingredient.food.kcal),
      base_carbs_g: ingredient.food.carbs,
      base_protein_g: ingredient.food.protein,
      base_fat_g: ingredient.food.fat,
      serving_label: ingredient.food.servingLabel,
      serving_factor: 1,
      quantity: ingredient.quantity,
      display_label: ingredient.displayLabel,
      grams: ingredient.grams,
      position: index,
    })),
  )
  // A failed breakdown never fails the entry: the parent's numbers stand on
  // their own, and partial parts must not be left behind.
  if (error) {
    await db.from('food_log_ingredients').delete().eq('food_log_id', foodLogId)
    return []
  }
  return ingredients.map((ingredient) => ({
    name: ingredient.displayLabel ?? ingredient.food.name,
    kcal: Math.round(ingredient.food.kcal * ingredient.quantity),
    quantity: ingredient.quantity,
  }))
}
