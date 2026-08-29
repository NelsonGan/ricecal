// The resolution cascade, shared by scan-meal and scan-refine. One vision item
// resolves to one entry, and the tiers are tried in this order:
//
//   2. component breakdown    each visible part to its own catalogue row, summed
//   1. catalogue match        search, verifier pick, kcal band check
//   3. nearest dish, rescaled right identity, wrong amount: adjust quantity
//   4. LLM nutrition          numbers only, Atwater-checked; no row is written
//
// Tier 2 outranks tier 1 for composite scenes, and stays all-or-nothing: either
// every part resolves and the sum lands in band, or the plate falls through to
// the dish tiers. The parent's macros are the catalogue sum of its parts, so the
// diary and the breakdown cannot disagree.
//
// There is no floor under tier 4, and there used to be: tier 5 wrote a terminal
// "Mixed meal" at 600 kcal that needed no model and no network. A roughly logged
// meal is indistinguishable on the day, and in every total built from it, from
// one the app actually recognised, so a failed scan quietly became calories the
// user never ate and never knew to check. `resolveItem` returns null when
// nothing fits, and the row on Today offers another go.

import type { SupabaseClient } from '@supabase/supabase-js'
import { type CatalogueFood, searchFoods } from './catalogue.ts'
import type { Meter } from './entitlement.ts'
import {
  estimateNutrition,
  type MockSteer,
  type Nutrition,
  type NutritionLabel,
  pickCandidate,
  type VisionItem,
} from './llm.ts'
import {
  boundGramsToServing,
  defaultMacros,
  isWholeMealServing,
  MAX_KCAL_PER_G,
  namesAPortion,
  namesOneArticle,
  PORTION_OVER_SERVING,
  plausibleForGrams,
  rowIsMeatier,
  servingGrams,
  servingUnitCount,
} from './portion.ts'

/**
 * A food, as everything downstream of resolution needs it. The snapshot an
 * entry keeps: a foreign key cannot cross into D1, so the numbers travel with
 * the entry rather than being joined back at read time. `id` is null for a
 * tier-4 estimate, which is numbers rather than a row.
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
   * What one of the part weighs, when the model said. Carried to the row so the
   * breakdown reads "6 x 25 g" rather than "x 6", which is what a person can
   * check against the plate in front of them.
   */
  grams: number | null
}

export type Resolved = {
  tier: 1 | 2 | 3 | 4
  food: FoodRow
  quantity: number
  /** Kept when the row's own name is generic (an estimate row). */
  displayLabel: string | null
  /** Tier 2 only: the parts the parent's sum came from. */
  ingredients?: Ingredient[]
}

/**
 * Whatever was thrown, as one readable line. Half of what reaches a catch here
 * is a PostgREST error, which is a plain object and renders as "[object
 * Object]".
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
// divided by another, so "1.08 servings" is precision the data does not have.
// Quarters match how people talk about portions, and anything near 1 is 1.
export const clampQuantity = (q: number): number =>
  Math.round(Math.min(3.0, Math.max(0.5, q)) * 4) / 4

/**
 * The same clamp for a fix-by-typing edit: wider, and in twentieths. A refine
 * factor comes from what the person typed, so it needs the finer step: "more
 * like 400 calories" against a 365 kcal entry is 1.096, which quarters round
 * back to no change at all.
 */
export const refineQuantity = (q: number): number =>
  Math.round(Math.min(10, Math.max(0.25, q)) * 20) / 20

/**
 * A query, folded the way the catalogue folds it, or the empty string when
 * nothing is left worth asking about. An approximation of the Worker's own
 * `normalize`: that one decides what matches, this only decides whether a round
 * trip is worth making.
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
 * The catalogue search, shaped to what the cascade needs. It carries the macros
 * as well as the calories, so a tier that has chosen a row needs no second query
 * to price it.
 */
async function search(q: string, limit: number): Promise<SearchRow[]> {
  // An unreachable catalogue and an empty one are the same thing here, since
  // there are tiers below this one either way. The distinction matters to the
  // person typing in the search panel; `data/catalogue.ts` makes it.
  const foods = (await searchFoods(q, limit)) ?? []

  // The Worker already shapes a food the way `food_details` did, so this
  // renames rather than derives. Deriving it again is how the two ends of one
  // seam start disagreeing about which portion is the base.
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
 * What one serving of a row weighs: the stated weight first, the label only as a
 * fallback. `servingGrams` answers for "100 g" and "1 bowl (400 g)" and gives up
 * on "1 plate", which is how nearly every curated Malaysian dish states its
 * portion, so reading the label alone logged a half plate as a whole one.
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
 * What one unit of a candidate row costs, and how much confidence that deserves.
 *
 * By weight: the row states what its serving weighs, so pricing the model's
 * `grams` is multiplication and nothing depends on the model's calorie guess.
 *
 * By unit: the row is countable, so its figure divided by that count is what one
 * costs. The answer for the two thirds of the catalogue measured in cups.
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
 * Grams of protein this row would put on the plate for a part of this size. The
 * same two paths `priceRow` takes, because it has to be the same arithmetic. A
 * row with no stated weight is handed over whole, which is how a part named
 * "steamed white rice" came to carry 27.5 g of protein.
 */
const rowProteinFor = (row: SearchRow, grams: number | null): number | null => {
  if (row.protein_g === null) return null
  const perServing = rowGrams(row)
  if (grams && perServing) return (Number(row.protein_g) / perServing) * grams
  return Number(row.protein_g) / servingUnitCount(row.serving_label)
}

/**
 * A row that is one of the thing, so an entry can point at it and let the
 * catalogue's figure stand. `units === 1` says the row is not priced by the ten,
 * and `!byWeight` says its figure was not rescaled to the model's grams.
 */
const isWholeUnit = (fit: Priced): boolean => !fit.byWeight && fit.units === 1

/**
 * What one of this part weighs when the row it matched is one of the thing, and
 * null when the row is a helping like any other.
 *
 * `bestFit` prices by weight whenever both sides state one, which is right for a
 * helping and wrong for an article: the catalogue knows what a Filet-O-Fish
 * weighs and a photograph does not, so scaling its 330 kcal up to a guessed
 * 180 g charged 418. Returning the weight rather than a boolean lets the caller
 * re-price the row and label the ingredient with the article's own weight.
 *
 * Upwards only, and only as far as the helping cap allows, so the two hand off
 * cleanly at `PORTION_OVER_SERVING`. Under the article's weight nothing happens,
 * because a weight may only bound a figure downwards.
 *
 * The dish tier never had this bug: `SAME_PORTION_LOW`/`HIGH` let the row stand
 * when the two weights are within 0.7-1.4 of each other.
 */
export const oneArticleGrams = (fit: Priced | null, grams: number | null): number | null => {
  if (!fit || !grams || !namesOneArticle(fit.row.serving_label)) return null
  const article = rowGrams(fit.row)
  if (!article || grams < article || grams > article * PORTION_OVER_SERVING) return null
  return article
}

/**
 * The rows a part of a meal may be priced from: two checks about identity, where
 * everything in `bestFit` is about size.
 *
 * A part is not priced from a food made of something else. Every other gate is a
 * calorie gate, so an omelette was priced from pan-fried Canadian bacon, which
 * fit the calories to three percent and tripled the protein. `rowIsMeatier`
 * compares protein's share of energy.
 *
 * A part is not charged for a whole plate. A row with no stated weight cannot be
 * asked for a helping, so a 600 kcal "1 plate" row would charge one component
 * for the whole meal.
 *
 * Neither check is redundant: a nasi lemak against its own coconut rice is 11%
 * protein against 6%, well inside the composition gate.
 *
 * The plate rule is scoped to weightless rows rather than every plate-shaped
 * label, which also threw out "Rice, Coconut Milk (Nasi Lemak)".
 *
 * A rejected part falls back to the model's figures, so this costs an estimate
 * rather than a missing part. The dish tier does not use it, and must not: a
 * dish is allowed to contain meat.
 */
export function componentCandidates(
  rows: SearchRow[],
  /** What the model said one unit of the part holds, and what it weighs. */
  part: { protein_g: number | null; kcal: number; grams: number | null } | null = null,
): SearchRow[] {
  // No weight required: the share test does not need one, and insisting on it
  // switched the check off for exactly the rows charged in full.
  const claim =
    part && part.protein_g !== null ? { protein: part.protein_g, kcal: part.kcal } : null

  return rows.filter((row) => {
    // Would this row be charged whole? `priceRow` converts by weight only when
    // both sides have one, and a full plate is not a part of a meal.
    if ((!part?.grams || !rowGrams(row)) && isWholeMealServing(row.serving_label)) return false

    // Composition needs no weight from either side: a share of energy is scale
    // free. Only the size of the disagreement needs arithmetic, and
    // `rowProteinFor` does it the way the pricing will.
    const contributed = rowProteinFor(row, part?.grams ?? null)
    if (!claim || contributed === null) return true
    return !rowIsMeatier(
      { protein: Number(row.protein_g), kcal: row.kcal },
      { protein: claim.protein, kcal: claim.kcal },
      contributed - claim.protein,
    )
  })
}

/**
 * The candidate closest in size to what the model described, or null.
 *
 * The gate is physical rather than a band around the model's calorie figure: a
 * row is eligible if what it charges for this many grams is a believable energy
 * density, and only then is the model's figure a tie-break. As a band it turned
 * one bad guess into a bad entry, excluding the catalogue's own 36 kcal a satay
 * stick because the model had said 180.
 *
 * Identity is `componentCandidates`' business.
 */
export function bestFit(rows: SearchRow[], grams: number | null, kcal: number): Priced | null {
  const priced = rows.map((row) => priceRow(row, grams))
  if (kcal <= 0) {
    // A part the model named and weighed but did not price. Relevance order is
    // the only ranking left, so take the top hit that is not absurd for the
    // weight and nothing otherwise: falling back to the top row regardless is
    // how 50 g of meatball became a 720 kcal row.
    if (!grams) return priced[0] ?? null
    return priced.find((c) => plausibleForGrams(c.kcal, grams)) ?? null
  }
  return (
    priced
      .filter((candidate) => {
        // Physically possible for this weight, which catches the different
        // food under a similar name: search ranks by name, so "white rice" can
        // top-rank rice flour.
        if (grams && !plausibleForGrams(candidate.kcal, grams)) return false
        // And in the same order of magnitude as the model said, which is worth
        // something now the model's figure agrees with its own weight. Wide,
        // because the point is to throw out a row that is not this food at all:
        // 40 g of lettuce matched a 140 kcal row.
        const ceiling = grams ? 2.5 : 2
        return candidate.kcal >= kcal * 0.25 && candidate.kcal <= kcal * ceiling
      })
      // Closest in log space, so half- and double-sized rows lose to one that
      // is nearly right in either direction.
      .sort((a, b) => Math.abs(Math.log(a.kcal / kcal)) - Math.abs(Math.log(b.kcal / kcal)))[0] ??
    null
  )
}

/**
 * A food the catalogue could not answer for, as numbers rather than a row. Pure:
 * no id, no round trip, no failure mode. It used to create a shared `foods` row
 * so two people photographing the same unlisted dish shared one estimate, which
 * was never worth much: a guess reused is still a guess.
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
 * Tier 2: the plate as its parts, folded into one entry.
 *
 * The model's per-part weight is what makes a catalogue row comparable, since
 * search ranks by name. When no hit fits, the model's figures price that
 * component as an estimate, so one unsearchable side dish does not kill the
 * breakdown.
 *
 * Everything is per single unit with the count in the quantity: two wings are a
 * 125 kcal row at quantity 2, not a 250 kcal row at quantity 1, which is the
 * same calories and a useless stepper.
 */
async function resolveByComponents(
  db: SupabaseClient,
  scanId: string,
  item: VisionItem,
  trace?: string[],
): Promise<Resolved | null> {
  if (item.components.length < 2) return null

  /**
   * How many of the whole described thing there were. The prompt asks for
   * multiplicity on the components, but "two roti canai with dhal" came back as
   * one item at count 2 with both parts priced for a single plate.
   *
   * Folding it into every part keeps the parent equal to the sum of its parts,
   * which `food_log_details` requires: the parts branch of its coalesce does not
   * multiply by the entry's own quantity. A count below one is a part portion.
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

  // One part's search failing is not the plate's problem: the model's figures
  // below price it. A throw here used to take the whole stage with it.
  //
  // One at a time. Fired together, five of these contend for a small instance
  // and four time out; in turn, each answers in tens of milliseconds.
  for (const component of item.components) {
    const q = usable(component.name)
    if (!q) continue

    const rows = await search(q, 5).catch((error) => {
      // A PostgREST error is a plain object, which `String()` renders as
      // "[object Object]".
      const message = `[cascade] components: search "${q}" failed: ${describe(error)}`
      console.error(message)
      trace?.push(message)
      return [] as SearchRow[]
    })

    // Which rows can be this part at all, before anything asks how big it is.
    // Rejected after `bestFit`, the part would keep whichever wrong row ranked
    // best and lose the runner-up that might have been the right food.
    const candidates = componentCandidates(rows, component)
    if (candidates.length < rows.length) {
      trace?.push(
        `[cascade] components: "${q}" dropped ${rows.length - candidates.length} of ${rows.length} ` +
          'row(s) as a whole meal, or as made of something else',
      )
    }

    // The catalogue row that best describes one of this part, at this weight.
    // Catalogue servings are whatever the source recorded ("Chicken Satay" is
    // 365 kcal for ten sticks), so a row's own figure is almost never the price
    // of one of the thing on the plate. `bestFit` converts before it compares.
    const ranked = bestFit(candidates, component.grams, component.kcal)
    // A row naming one whole article and stating its weight is one of the
    // thing, however the ranking priced it, so it is re-priced as one.
    const article = oneArticleGrams(ranked, component.grams)
    const fit = ranked && article ? priceRow(ranked.row, null) : ranked
    if (ranked && article) {
      trace?.push(
        `[cascade] components: "${q}" ${component.grams} g taken as one ` +
          `"${ranked.row.serving_label}" (${article} g) of ${ranked.row.name}`,
      )
    }

    if (fit && isWholeUnit(fit)) {
      // A row that is one of the thing, so the quantity is the count: rescaling
      // it to chase the model's guess is how a single scoop of rice was logged
      // as "0.75 ×". Where the two disagree the catalogue wins.
      parts.push({
        food: asFood(fit.row),
        quantity: component.count * meals,
        label: component.name.slice(0, 120),
        // The article's weight when that settled it, so the row cannot read
        // "180 g" beside a figure the catalogue quotes for 142.
        grams: article ?? component.grams,
        kcal: fit.row.kcal * component.count * meals,
      })
      continue
    }

    if (fit) {
      // A row that is ten of the thing, or a hundred grams of it. Pointing at
      // it would put "0.8" on a plate of eight skewers, so the ingredient gets a
      // per-unit row priced by converting the catalogue figure.
      //
      // The amount is capped first, by the row's own helping. Re-priced rather
      // than re-picked: picking again with the capped weight could choose a
      // different row, which would cap it somewhere else again.
      const capped = namesAPortion(fit.row.serving_label)
        ? boundGramsToServing(component.grams, rowGrams(fit.row))
        : component.grams
      const priced = capped === component.grams ? fit : priceRow(fit.row, capped)
      if (capped !== component.grams) {
        trace?.push(
          `[cascade] components: "${q}" ${component.grams} g capped to ${capped} g by ` +
            `"${fit.row.serving_label}" on ${fit.row.name}`,
        )
      }

      const perUnit = Math.max(1, Math.round(priced.kcal))
      const scale = priced.row.kcal > 0 ? priced.kcal / priced.row.kcal : 1
      const share = (value: number | null) =>
        value === null ? 0 : Math.round(Number(value) * scale * 10) / 10
      const unitRow = estimateRow({
        name: component.name,
        kcal: perUnit,
        carbs: share(priced.row.carbs_g),
        protein: share(priced.row.protein_g),
        fat: share(priced.row.fat_g),
      })
      parts.push({
        food: unitRow,
        quantity: component.count * meals,
        label: component.name.slice(0, 120),
        // The capped weight, not the claimed one: "220 g" beside a figure for
        // 180 is a contradiction the user can see.
        grams: capped,
        kcal: unitRow.kcal * component.count * meals,
      })
      continue
    }

    // A miss is a gap in the catalogue; "nothing this part could use" is not.
    // A row turned down over its composition exists and is right about some
    // other food, and recording those filled the widening backlog with queries
    // the catalogue already answers well.
    const noAnswer = !rows.length || rows.every((r) => isWholeMealServing(r.serving_label))
    if (noAnswer) await recordMisses(db, scanId, [q])

    // No catalogue answer at this size: the model's figures become an estimate.
    // Macros are the model's when it gave them, else an Atwater-consistent
    // split. The figure is the reconciled one from `shapeVision`, already made
    // to agree with the part's own weight, so the fallback is bounded.
    if (component.kcal <= 0) {
      // Neither the catalogue nor the model will price this. Dropped rather
      // than invented, which `parts.length < 2` below may decide is fatal.
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
    // Priced for one, so the count is the quantity. Nothing is shared any more,
    // so the row is this part at this size by construction.
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

  // A breakdown has to be a breakdown of this meal. The parts and the band are
  // two answers from the same model, and the breakdown is the one that is wrong
  // when they disagree: a basket of wings came back as celery and a pot of dip,
  // priced at 160 kcal against the model's own 780-900 band.
  //
  // Tolerances are loose, because a band is not a measurement either. Failing
  // this drops to the dish tier, which prices the whole plate at once.
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
  // Summed off the parts themselves. This was a sixth round trip until the
  // resolved rows started carrying their own numbers.
  for (const part of parts) {
    sum.carbs += part.food.carbs * part.quantity
    sum.protein += part.food.protein * part.quantity
    sum.fat += part.food.fat * part.quantity
  }
  if (sum.kcal <= 0) return null

  // The parent: the whole plate, priced by the catalogue sum, never by the model.
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
 * Three durian are three, not "1 cup". When the photo is several of one
 * countable thing, the entry's portion is the count and the food is priced for
 * one of them, or the stepper beside the row counts cups.
 */
async function resolveByCount(
  db: SupabaseClient,
  scanId: string,
  item: VisionItem,
  trace?: string[],
): Promise<Resolved | null> {
  if (item.count < 2) return null
  // The band divided by the count is what the model thinks one of them costs.
  // Where it also said what one weighs, that figure is reconciled the way a
  // component's is: ten wings banded at 1800-2200 is 200 kcal each, more than
  // twice what 60 g of fried chicken can hold.
  let perUnit = Math.round((item.kcal_low + item.kcal_high) / 2 / item.count)
  if (item.grams) perUnit = Math.min(Math.round(item.grams * MAX_KCAL_PER_G), perUnit)
  if (perUnit <= 0) return null

  // The local name first, then the generic one: "har gow" is in no catalogue
  // this app ships with and "shrimp dumplings" is.
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

  // The same conversion the breakdown uses: "Durian, raw" is priced per cup and
  // a durian is not a cup. With the item's own weight the per-100 g rows become
  // answerable too, which is most of what the catalogue holds per ingredient.
  const fit = bestFit(rows, item.grams, perUnit)

  if (fit && isWholeUnit(fit)) {
    return {
      tier: 1,
      food: asFood(fit.row),
      quantity: item.count,
      displayLabel: usable(item.name) === usable(fit.row.name) ? null : item.name.slice(0, 120),
    }
  }

  // A row measured in cups or grams, or nothing usable. All end in a row priced
  // for one, from the catalogue where there is one and the model otherwise.
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
    // The catalogue had nothing at any size, so the count is priced from the
    // model alone: the weakest answer this path can give.
    trace?.push(`[cascade] count: no catalogue row for "${item.name}", priced from the model`)
  }
  if (!rows.length) await recordMisses(db, scanId, [q])

  return { tier: fit ? 3 : 4, food: unitRow, quantity: item.count, displayLabel: item.name }
}

/**
 * How far two estimates of the same portion may differ before the row is treated
 * as a different size of the dish.
 *
 * Both weights are guesses. Held to 15%, ordinary disagreement read as a size
 * mismatch: a mee goreng priced at 657 kcal for 400 g was rescaled to 1.25
 * servings and logged at 821. A genuine mismatch clears this window easily, and
 * a half portion still falls outside it.
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
  // Ordered specific, generic, head noun, so the first that answers is the most
  // specific one the catalogue holds.
  for (const q of queries) {
    candidates = await search(q, 5)
    if (candidates.length) break
    missed.push(q)
  }
  await recordMisses(db, scanId, missed)

  // Zero rows and "the verifier rejected all of them" are one outcome: this
  // tier has no answer, so fall through rather than settle for a near miss.
  let chosen: SearchRow | null = null
  if (candidates.length) {
    // A verifier that failed is "no match", and the tier below takes over.
    const idx = await pickCandidate(item, candidates, mock, meter).catch(() => null)
    chosen = idx === null ? null : (candidates[idx] ?? null)
  }
  if (!chosen) return null

  // The model's name for the plate, worn over the matched row: the numbers stay
  // the catalogue's, and imported row names are written for databases rather
  // than diaries. Skipped when the two already read the same.
  const label = usable(item.name) === usable(chosen.name) ? null : item.name.slice(0, 120)

  // What was eaten, by weight, against what one serving of the row weighs. Both
  // or nothing: a ratio of two weights is a conversion, and a ratio of a weight
  // and a guess is a guess.
  //
  // `item.grams` is one unit and `item.count` is how many, so the numerator is
  // their product: one durian against a 100 g row would log three of them as a
  // third of one.
  const servingWeight = rowGrams(chosen)
  const byWeight = item.grams && servingWeight ? (item.grams * item.count) / servingWeight : null

  // A row the verifier says is this dish, at one portion.
  //
  // The gate used to be the model's calorie range, which had it backwards:
  // identity is what a vision model is good at and calories are what it is worst
  // at. A plate of apple slices came back "400-500 kcal", so every sensible
  // apple row looked wrong. Within a factor of 2.5 the row is simply taken.
  const ratio = chosen.kcal > 0 ? llmMid / chosen.kcal : 1

  // The sizing decision in one line, because it is the one thing about a scan
  // that cannot be reconstructed afterwards: a plate logged at one serving looks
  // identical whether the weights agreed, were missing, or the calorie ratio was
  // the only evidence there was.
  trace?.push(
    `[cascade] dish "${chosen.name}": model ${item.grams ?? '?'}g x${item.count} vs row ` +
      `${servingWeight ?? '?'}g — byWeight ${byWeight === null ? 'n/a' : byWeight.toFixed(2)}, ` +
      `ratio ${ratio.toFixed(2)} (${llmMid} vs ${chosen.kcal})`,
  )
  // A weight settles it before the calorie ratio gets a say: "100 g" of a dish
  // against a 450 g plate is 4.5 servings whatever either party thinks it
  // costs.
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

  // Further out, the row is a different size of the right thing, which is what
  // quantity is for. Still bounded: `clampQuantity` will not claim more than
  // three of anything.
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
 * A photographed nutrition panel, taken at its word. No search, no verifier, no
 * estimate: the cascade exists to work out numbers nobody wrote down, and here
 * the manufacturer did. Nothing reaches the catalogue, because a panel read once
 * is this meal's evidence rather than everybody's.
 */
export async function resolveByLabel(label: NutritionLabel): Promise<Resolved | null> {
  // A close-up of the panel has no product name in it, so the row must not be
  // named after the table ("Nutrition Facts") or after the model shrugging
  // ("Unidentified Food Product", from a real scan). The prompt asks for null;
  // this is the belt to its braces.
  const unnamed =
    /^(nutrition|nutritional)\s*(facts|information|panel)?$|\b(unidentified|unknown|unnamed|generic)\b/i
  const name = unnamed.test(label.name.trim()) ? 'Packaged food' : label.name

  const food = estimateRow({
    name,
    kcal: label.kcal,
    carbs: Math.round(label.carbs_g * 10) / 10,
    protein: Math.round(label.protein_g * 10) / 10,
    fat: Math.round(label.fat_g * 10) / 10,
    // Why somebody photographs a panel rather than the food: these are printed
    // there and nowhere else the app can reach.
    fibre: label.fibre_g,
    sugar: label.sugar_g,
    sodium: label.sodium_mg,
  })
  // One serving, as the panel defines one. The stepper is now counting the
  // packet's own unit.
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
   * And in the same world as the meal the vision call described. Atwater only
   * asks whether an answer agrees with itself, which a proportionally huge one
   * does: a fried chicken tray came back at 3,260 kcal with matching macros
   * against a photo the same model had bounded at 1,100-1,250.
   *
   * The band is still not shown to the estimator, which would anchor it.
   */
  const inBand = (n: Nutrition): boolean =>
    item.kcal_high <= 0 || (n.kcal <= item.kcal_high * 2 && n.kcal >= item.kcal_low * 0.4)

  // One retry: a self-contradicting answer once may be noise, twice is the
  // model not knowing this dish. Failing both ends the cascade.
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

/**
 * The full cascade for one item. Each stage guards itself, so one crash cannot
 * skip the ones below it. Null when every tier declined, which is a failed scan
 * rather than a rough answer.
 *
 * Nothing here reads the model's `scene` label: whether a plate has parts is
 * decided by whether it listed parts. A banana leaf of satay came back "single"
 * with three components on it, and the label sent it to a one-row match.
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
    // Every failure here is a tier failing and the tier below taking over, which
    // is only safe because the daily quota is claimed at the top of the
    // endpoint. Claimed per model request, running out arrived here like any
    // other error and was retried by every tier below.
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
  // Several of one thing: the count belongs in the portion rather than in a
  // breakdown of a plate with no parts. Only reached when decomposition
  // declined, which is the case for three durian and not for a chicken tray.
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
     * same cascade into the same row shape, so this column is the only place the
     * difference survives.
     */
    source: 'camera' | 'text'
    /**
     * The drawing the model picked for a typed meal, out of our own set.
     *
     * `food_logs_one_picture` allows a photograph or a drawing and not both.
     * Passing an icon alongside a `photoPath` is a caller bug, so the insert
     * drops it rather than letting the database refuse the whole entry.
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
      // Soft: no foreign key, and null for a tier-4 estimate. Kept for
      // provenance rather than for anything that reads this row today.
      food_id: resolved.food.id,
      serving_id: resolved.food.serving_id,
      // The snapshot, and the only thing that says what the entry is worth:
      // `food_log_details` has no catalogue left to join.
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
      // Always the base serving. The cascade picks a food rather than a portion
      // of one, and the size it decided on is carried by `quantity`.
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
    // Quoting the parent instead put a number in the notification that the diary
    // row underneath did not show.
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
  // A failed breakdown never fails the entry, but partial parts must not be
  // left behind.
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
