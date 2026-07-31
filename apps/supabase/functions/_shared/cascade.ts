// The resolution cascade, shared by scan-meal (fresh photos) and scan-refine
// (fix-by-typing). One vision item resolves to ONE entry:
//
//   2. component breakdown  — composite plates FIRST: each visible part to its
//                             own catalogue row, summed into one parent entry
//                             with the parts attached as ingredients
//   1. catalogue match      — search_foods + a verifier pick, kcal band check
//   3. nearest dish, rescaled — right identity, wrong amount: adjust quantity
//   4. LLM nutrition        — a shared, deduped `is_estimate` food row
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

import {
  type Archetype,
  classifyArchetype,
  estimateNutrition,
  type MockSteer,
  type Nutrition,
  type NutritionLabel,
  pickCandidate,
  type Vision,
  type VisionItem,
} from './llm.ts'

/** The terminal archetype. Seeded with this exact id by seed_archetype_foods(). */
export const TERMINAL_ARCHETYPE_ID = 'a0000000-0000-4000-8000-000000000000'

/**
 * "Within ~25%". Used for the one comparison that is still worth making
 * against the model's band: whether a decomposed plate's parts add up to the
 * entry above them. A breakdown that does not sum to the total is worse than
 * no breakdown, so that check stays strict.
 */
const BAND_SLACK = 0.25

export type FoodRow = {
  id: string
  name: string
  kcal: number
  is_estimate: boolean
  is_archetype: boolean
  serving_id: string
}

export type Ingredient = {
  food: FoodRow
  quantity: number
  displayLabel: string | null
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

/** Refine edits rescale an existing quantity, so the range is wider. */
export const refineQuantity = (q: number): number =>
  Math.round(Math.min(10, Math.max(0.25, q)) * 4) / 4

/**
 * Requirement 14: skip retrieval when a query normalizes to nothing usable.
 * A TS approximation of `search_normalize` — the database's own version still
 * decides matching; this only decides whether a round trip is worth making.
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

type SearchRow = {
  id: string
  name: string
  brand: string | null
  kcal: number
  carbs_g: number | null
  protein_g: number | null
  fat_g: number | null
  default_serving_id: string | null
  serving_label: string | null
}

/**
 * search_foods via RPC, shaped to what the cascade needs.
 *
 * Two modes, and the default is the strict one. Forgiving matching — fuzzy
 * names, any-term full text — is built for a person typing, and it costs over
 * a second per call (nine on a cold cache) because a loose query matches tens
 * of thousands of rows. A plate with five components makes five calls, which
 * used to trip the 8s statement timeout: the component stage threw, the plate
 * lost its breakdown, and the tier below rescaled one photo into two servings.
 * Strict matching answers the same question in ~40ms, and every query on this
 * path was written by a model that spells.
 *
 * The dish tier is the one that reaches for `forgiving`, and only after strict
 * has come back empty — there its recall is worth the second, and the verifier
 * call downstream is there to throw out what the looser net drags in.
 */
async function search(
  db: SupabaseClient,
  q: string,
  limit: number,
  mode: 'strict' | 'forgiving' = 'strict',
): Promise<SearchRow[]> {
  const { data, error } = await db.rpc('search_foods', {
    q,
    match_limit: limit,
    p_fuzzy: mode === 'forgiving',
  })
  if (error) throw error
  return ((data ?? []) as SearchRow[]).filter(
    (r) => r.id && r.default_serving_id && r.kcal !== null,
  )
}

const asFood = (r: SearchRow): FoodRow => ({
  id: r.id,
  name: r.name,
  kcal: r.kcal,
  is_estimate: false,
  is_archetype: false,
  serving_id: r.default_serving_id as string,
})

/**
 * How many of the thing one serving of a catalogue row holds.
 *
 * "10 sticks" is ten satay; "1 cup" and "100 g" are one serving of something
 * measured, not ten of it, so only countable units are read this way. Getting
 * this wrong in the other direction would divide a row's calories by a hundred.
 */
const COUNTABLE =
  /^(\d+(?:\.\d+)?)\s*(sticks?|skewers?|pieces?|pcs|slices?|wings?|balls?|eggs?|rolls?|cubes?|nuggets?|dumplings?|prawns?|drumsticks?|fillets?|cakes?|puffs?|buns?)\b/i

const servingUnitCount = (label: string | null): number => {
  const match = (label ?? '').trim().match(COUNTABLE)
  const count = match ? Number(match[1]) : 1
  return Number.isFinite(count) && count >= 1 && count <= 50 ? count : 1
}

/**
 * Reuse-or-create a shared estimate row and hand back what an entry needs to
 * point at it. Used for a part the catalogue cannot answer at all, and for one
 * it answers only in tens.
 */
async function estimateRow(
  db: SupabaseClient,
  input: {
    name: string
    kcal: number
    carbs: number
    protein: number
    fat: number
    /** Only a photographed panel knows these; a guess leaves them null. */
    fibre?: number | null
    sugar?: number | null
    sodium?: number | null
  },
): Promise<FoodRow | null> {
  const { data: id } = await db.rpc('upsert_estimate_food', {
    p_name: input.name,
    p_kcal: Math.round(input.kcal),
    p_carbs_g: input.carbs,
    p_protein_g: input.protein,
    p_fat_g: input.fat,
    p_fibre_g: input.fibre ?? null,
    p_sugar_g: input.sugar ?? null,
    p_sodium_mg: input.sodium ?? null,
  })
  if (!id) return null

  const [{ data: food }, { data: serving }] = await Promise.all([
    db
      .from('foods')
      .select('id, name, kcal')
      .eq('id', id as string)
      .single(),
    db
      .from('food_servings')
      .select('id')
      .eq('food_id', id as string)
      .eq('is_default', true)
      .single(),
  ])
  if (!food || !serving) return null
  return { ...food, is_estimate: true, is_archetype: false, serving_id: serving.id }
}

async function recordMisses(db: SupabaseClient, scanId: string, queries: string[]) {
  if (queries.length) {
    await db.from('food_scan_misses').insert(queries.map((q) => ({ scan_id: scanId, query: q })))
  }
}

/**
 * Tier 2: the plate as its parts, folded into ONE entry.
 *
 * Each component carries the vision model's own portion estimate, which does
 * two jobs. Against the catalogue it is the acceptance band — search ranks by
 * NAME, so "white rice" can top-rank rice flour at 578 kcal, and the first
 * relevance-ordered hit whose figure sits within ±50% of the estimate is the
 * one taken, with the residue absorbed into the ingredient's quantity. And
 * when no hit fits, the estimate PRICES a fallback `is_estimate` row for that
 * component — so one unsearchable side dish no longer kills the breakdown.
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

  const parts: Array<{ food: FoodRow; quantity: number; label: string; kcal: number }> = []

  // One part's search failing is not the plate's problem: it means no
  // catalogue answer for that part, which the model's own figures below
  // already know how to price. A throw here used to take the whole stage with
  // it — the plate lost its breakdown and fell to a tier that rescaled it.
  //
  // One at a time, deliberately. Fired together, five of these contend for a
  // small instance and four of the five time out; run in turn each gets the
  // whole box and the strict mode answers in tens of milliseconds.
  for (const component of item.components) {
    const q = usable(component.name)
    if (!q) continue
    const look = (mode: 'strict' | 'forgiving') =>
      search(db, q, 5, mode).catch((error) => {
        // PostgREST hands back a plain object, which `String()` renders as
        // "[object Object]" — the least useful thing a trace can say.
        const message = `[cascade] components: ${mode} search "${q}" failed: ${describe(error)}`
        console.error(message)
        trace?.push(message)
        return [] as SearchRow[]
      })

    // Strict first, then the slow net if it caught nothing. A part is named
    // the way it sits on the plate — "satay skewer", "kerabu (blue rice)" —
    // and the catalogue names it "Satay, chicken", so requiring every term
    // misses rows that exist. Missing one means pricing that part from the
    // model's own guess, which for satay was double what a stick weighs in at.
    //
    // Not for a long phrase, though: "soft drink medium cup" has no catalogue
    // answer under any matching rule, and the fuzzy arm spends seconds (and
    // sometimes the whole statement timeout) proving it.
    let rows = await look('strict')
    if (!rows.length && q.split(' ').length <= 3) rows = await look('forgiving')

    // The row whose ONE unit is closest in size to the model's one unit.
    //
    // Not the first row inside a band, which is what this was: catalogue
    // servings are whatever the source recorded, and "Chicken Satay (Satay
    // Ayam)" is 365 kcal for TEN STICKS. Against a model saying 85 for one
    // stick that row looked absurd and was skipped, so eight sticks got priced
    // from the model's own guess at more than double what a stick weighs in
    // at. Divided by its serving's unit count it is 36 kcal a stick, which is
    // the number that should have been competing.
    const fit =
      component.kcal > 0
        ? rows
            .map((row) => {
              const units = servingUnitCount(row.serving_label)
              return { row, units, perUnit: row.kcal / units }
            })
            // A quarter to double, which is deliberately lopsided. The model's
            // per-unit guesses are unstable upwards — the same satay stick
            // came back at 35, then 85, then 145 kcal on three runs — and a
            // symmetric band around an inflated guess excludes the catalogue
            // rows that would have corrected it. Letting a much smaller row
            // through costs little, because the closest match still wins.
            .filter(
              (candidate) =>
                candidate.perUnit >= component.kcal * 0.25 &&
                candidate.perUnit <= component.kcal * 2,
            )
            // Closest in log space, so half-sized and double-sized rows lose
            // to one that is nearly right in either direction.
            .sort(
              (a, b) =>
                Math.abs(Math.log(a.perUnit / component.kcal)) -
                Math.abs(Math.log(b.perUnit / component.kcal)),
            )[0]
        : rows[0] && { row: rows[0], units: 1, perUnit: rows[0].kcal }

    if (fit && fit.units === 1) {
      // A row that IS one of the thing. The quantity is the count and nothing
      // else: the row's own figure is what one of them costs, and rescaling it
      // to chase the model's guess is how a single scoop of rice ended up
      // logged as "0.75 ×" — a fraction nobody can act on and no evidence
      // supports. Where the two disagree the catalogue wins, silently.
      parts.push({
        food: asFood(fit.row),
        quantity: component.count,
        label: component.name.slice(0, 120),
        kcal: fit.row.kcal * component.count,
      })
      continue
    }

    if (fit) {
      // A row that is ten of the thing. Pointing at it would put "0.8" on a
      // plate of eight skewers, so the ingredient gets a per-unit row of its
      // own — priced by DIVIDING the catalogue figure, never by asking the
      // model again — and the quantity is the count the user can see.
      const perUnit = Math.max(1, Math.round(fit.perUnit))
      const share = (value: number | null) =>
        value === null ? 0 : Math.round((Number(value) / fit.units) * 10) / 10
      const unitRow = await estimateRow(db, {
        name: component.name,
        kcal: perUnit,
        carbs: share(fit.row.carbs_g),
        protein: share(fit.row.protein_g),
        fat: share(fit.row.fat_g),
      })
      if (unitRow) {
        parts.push({
          food: unitRow,
          quantity: component.count,
          label: component.name.slice(0, 120),
          kcal: unitRow.kcal * component.count,
        })
        continue
      }
    }

    if (!rows.length) await recordMisses(db, scanId, [q])

    // No catalogue answer at this size: the model's own figures become a
    // shared estimate row for the component. Macros are the model's when it
    // gave them, else an Atwater-consistent default split; either way the
    // ingredient exists and the breakdown survives.
    if (component.kcal <= 0) continue
    const macros =
      component.carbs_g !== null || component.protein_g !== null || component.fat_g !== null
        ? {
            carbs: Number(component.carbs_g ?? 0),
            protein: Number(component.protein_g ?? 0),
            fat: Number(component.fat_g ?? 0),
          }
        : {
            carbs: Math.round((component.kcal * 0.5) / 4),
            protein: Math.round((component.kcal * 0.2) / 4),
            fat: Math.round((component.kcal * 0.3) / 9),
          }
    const guess = await estimateRow(db, {
      name: component.name,
      kcal: component.kcal,
      carbs: macros.carbs,
      protein: macros.protein,
      fat: macros.fat,
    })
    if (!guess) continue
    // Priced for ONE, so the count is the quantity here too. The size-aware
    // dedup is what makes that safe: a row that came back priced for a
    // different-sized version of this part would not have been reused.
    parts.push({
      food: guess,
      quantity: component.count,
      label: component.name.slice(0, 120),
      kcal: guess.kcal * component.count,
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
  // Macros summed from the resolved rows at their quantities, fetched in one
  // read so the parent's split matches the parts exactly.
  const { data: macroRows } = await db
    .from('foods')
    .select('id, carbs_g, protein_g, fat_g')
    .in(
      'id',
      parts.map((part) => part.food.id),
    )
  for (const part of parts) {
    const row = (macroRows ?? []).find((m) => m.id === part.food.id)
    sum.carbs += Number(row?.carbs_g ?? 0) * part.quantity
    sum.protein += Number(row?.protein_g ?? 0) * part.quantity
    sum.fat += Number(row?.fat_g ?? 0) * part.quantity
  }
  if (sum.kcal <= 0) return null

  // The parent: a shared estimate row for the whole plate, priced by the
  // catalogue sum — never by the model. Deduped on the normalized name, so
  // "korean fried chicken rice" is one row across users.
  const { data: parentId, error } = await db.rpc('upsert_estimate_food', {
    p_name: item.name,
    p_kcal: Math.round(sum.kcal),
    p_carbs_g: Math.round(sum.carbs * 10) / 10,
    p_protein_g: Math.round(sum.protein * 10) / 10,
    p_fat_g: Math.round(sum.fat * 10) / 10,
    p_fibre_g: null,
    p_sugar_g: null,
    p_sodium_mg: null,
  })
  if (error || !parentId) {
    const message = `[cascade] components: parent upsert failed: ${error?.message ?? 'no id'}`
    console.error(message)
    trace?.push(message)
    return null
  }

  const [{ data: parent }, { data: serving }] = await Promise.all([
    db
      .from('foods')
      .select('id, name, kcal')
      .eq('id', parentId as string)
      .single(),
    db
      .from('food_servings')
      .select('id')
      .eq('food_id', parentId as string)
      .eq('is_default', true)
      .single(),
  ])
  if (!parent || !serving) return null

  // A reused row may carry a different figure. Small drift becomes quantity
  // (rule 12 — adjust the amount, never the macros); large drift keeps the
  // entry but drops the parts, because a breakdown that does not sum to the
  // total is worse than none.
  const quantity = parent.kcal > 0 ? clampQuantity(sum.kcal / parent.kcal) : 1
  const settled = parent.kcal * quantity
  const ingredients: Ingredient[] | undefined =
    Math.abs(settled - sum.kcal) / sum.kcal <= BAND_SLACK
      ? parts.map((part) => ({
          food: part.food,
          quantity: part.quantity,
          displayLabel:
            part.label.toLowerCase() === part.food.name.toLowerCase() ? null : part.label,
        }))
      : undefined

  return {
    tier: 2,
    food: { ...parent, is_estimate: true, is_archetype: false, serving_id: serving.id },
    quantity,
    displayLabel: item.name,
    ingredients,
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
  const perUnit = Math.round((item.kcal_low + item.kcal_high) / 2 / item.count)
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
    rows = await search(db, candidate, 5, 'strict').catch(() => [] as SearchRow[])
    if (!rows.length) {
      rows = await search(db, candidate, 5, 'forgiving').catch(() => [] as SearchRow[])
    }
    if (rows.length) break
  }

  const fit = rows
    .map((row) => {
      const units = servingUnitCount(row.serving_label)
      return { row, units, perUnit: row.kcal / units }
    })
    .filter((c) => c.perUnit >= perUnit * 0.25 && c.perUnit <= perUnit * 2)
    .sort(
      (a, b) => Math.abs(Math.log(a.perUnit / perUnit)) - Math.abs(Math.log(b.perUnit / perUnit)),
    )[0]

  if (fit?.units === 1) {
    return {
      tier: 1,
      food: asFood(fit.row),
      quantity: item.count,
      displayLabel: usable(item.name) === usable(fit.row.name) ? null : item.name.slice(0, 120),
    }
  }

  // Either a row measured in cups, or nothing usable. Both end in a row priced
  // for one — from the catalogue when there is one, from the model when not.
  const share = (value: number | null, units: number) =>
    value === null ? 0 : Math.round((Number(value) / units) * 10) / 10
  const unitRow = fit
    ? await estimateRow(db, {
        name: item.name,
        kcal: Math.max(1, Math.round(fit.perUnit)),
        carbs: share(fit.row.carbs_g, fit.units),
        protein: share(fit.row.protein_g, fit.units),
        fat: share(fit.row.fat_g, fit.units),
      })
    : await estimateRow(db, {
        name: item.name,
        kcal: perUnit,
        carbs: Math.round((perUnit * 0.5) / 4),
        protein: Math.round((perUnit * 0.2) / 4),
        fat: Math.round((perUnit * 0.3) / 9),
      })
  if (!unitRow) {
    trace?.push(`[cascade] count: no per-unit row for "${item.name}"`)
    return null
  }
  if (!rows.length) await recordMisses(db, scanId, [q])

  return { tier: fit ? 3 : 4, food: unitRow, quantity: item.count, displayLabel: item.name }
}

/** Tiers 1 and 3: the dish-level catalogue match. */
async function resolveByDish(
  db: SupabaseClient,
  scanId: string,
  item: VisionItem,
  mock: MockSteer | undefined,
): Promise<Resolved | null> {
  const llmMid = (item.kcal_low + item.kcal_high) / 2

  const tried = new Set<string>()
  const queries = [item.specific_query, item.generic_query, headNoun(item.generic_query)]
    .map(usable)
    .filter((q) => q && !tried.has(q) && tried.add(q))
    .slice(0, 3)

  let candidates: SearchRow[] = []
  const missed: string[] = []
  for (const q of queries) {
    // Strict first, which is nearly free and, for a dish the catalogue holds
    // under that name, enough. The forgiving pass is the fallback rather than
    // the default: "nasi lemak ayam goreng" needs every-term matching relaxed
    // to reach "PappaRich Nasi Lemak Ayam Rendang", and that is worth a second
    // once per scan — but not five times over, once per ingredient.
    candidates = await search(db, q, 5)
    if (!candidates.length) candidates = await search(db, q, 5, 'forgiving')
    if (candidates.length) break
    missed.push(q)
  }
  await recordMisses(db, scanId, missed)

  // Requirement 13: zero rows and "verifier said none" are ONE outcome.
  let chosen: SearchRow | null = null
  if (candidates.length) {
    const idx = await pickCandidate(item, candidates, mock).catch(() => null)
    chosen = idx === null ? null : (candidates[idx] ?? null)
  }
  if (!chosen) return null

  // The model's name for the plate, worn over the matched row. The numbers
  // stay the catalogue's; the LABEL is the model's, because imported row
  // names are written for databases, not diaries — "MEAL KIT, KOREAN FRIED
  // CHICKEN WITH SWEET GOCHUJANG SAUCE" is the right macros wearing the
  // wrong name. Skipped when the two already read the same.
  const label = usable(item.name) === usable(chosen.name) ? null : item.name.slice(0, 120)

  // A row the verifier says IS this dish, at one portion.
  //
  // The gate here used to be the model's calorie range, and that had it
  // backwards: identity is what a vision model is good at and calories are
  // what it is worst at. A plate of apple slices came back "400-500 kcal", so
  // every sensible apple row in the catalogue looked wrong and the cascade
  // fell through to the model's own figure — the bad number rejecting the good
  // one. Within a factor of two and a half either way the row is simply taken.
  const ratio = chosen.kcal > 0 ? llmMid / chosen.kcal : 1
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
 * It still lands in a `foods` row like everything else, because that is what an
 * entry can point at, and the row is shared and deduped by name and size: two
 * people photographing the same packet get the same row, and the next scan of
 * it needs no model call at all.
 */
export async function resolveByLabel(
  db: SupabaseClient,
  label: NutritionLabel,
): Promise<Resolved | null> {
  // "Nutrition Facts" is the heading, not the food. A panel photographed off a
  // real packet usually carries the product name; a close-up of the panel
  // alone does not, and the row should not be called after the table.
  const heading = /^(nutrition|nutritional)\s*(facts|information|panel)?$/i
  const name = heading.test(label.name.trim()) ? 'Packaged food' : label.name

  const food = await estimateRow(db, {
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
  if (!food) return null
  // One serving, as the panel defines a serving. Somebody who ate two of them
  // says so with the stepper — which is now counting the packet's own unit.
  return { tier: 1, food, quantity: 1, displayLabel: name }
}

/** Tier 4: validated model nutrition into a shared, deduped estimate row. */
async function resolveByEstimate(
  db: SupabaseClient,
  item: VisionItem,
  mock: MockSteer | undefined,
): Promise<Resolved | null> {
  const atwaterOk = (n: Nutrition): boolean => {
    if (n.kcal <= 0) return false
    const atwater = n.carbs_g * 4 + n.protein_g * 4 + n.fat_g * 9
    return Math.abs(atwater - n.kcal) / n.kcal <= 0.25
  }

  // One retry: a self-contradicting answer once may be noise, twice is the
  // model not knowing this dish.
  let nutrition: Nutrition | null = null
  for (let attempt = 0; attempt < 2 && !nutrition; attempt++) {
    const candidate = await estimateNutrition(item, mock)
    if (atwaterOk(candidate)) nutrition = candidate
  }
  if (!nutrition) return null

  const { data: foodId, error } = await db.rpc('upsert_estimate_food', {
    p_name: item.name,
    p_kcal: nutrition.kcal,
    p_carbs_g: nutrition.carbs_g,
    p_protein_g: nutrition.protein_g,
    p_fat_g: nutrition.fat_g,
    p_fibre_g: nutrition.fibre_g,
    p_sugar_g: nutrition.sugar_g,
    p_sodium_mg: nutrition.sodium_mg,
  })
  if (error || !foodId) return null

  const [{ data: food }, { data: serving }] = await Promise.all([
    db
      .from('foods')
      .select('id, name, kcal')
      .eq('id', foodId as string)
      .single(),
    db
      .from('food_servings')
      .select('id')
      .eq('food_id', foodId as string)
      .eq('is_default', true)
      .single(),
  ])
  if (!food || !serving) return null

  return {
    tier: 4,
    food: { ...food, is_estimate: true, is_archetype: false, serving_id: serving.id },
    quantity: 1,
    displayLabel: item.name,
  }
}

/** Tier 5. The only tier that cannot fail: worst case is the terminal row. */
export async function resolveByArchetype(
  db: SupabaseClient,
  item: VisionItem | null,
  mock: MockSteer | undefined,
): Promise<Resolved> {
  let archetype: Archetype | null = null

  if (item) {
    try {
      const { data } = await db
        .from('foods')
        .select('id, slug, name, kcal')
        .eq('is_archetype', true)
      if (data?.length) archetype = await classifyArchetype(item, data as Archetype[], mock)
    } catch {
      archetype = null
    }
  }

  let food: FoodRow
  if (archetype) {
    const { data: serving } = await db
      .from('food_servings')
      .select('id')
      .eq('food_id', archetype.id)
      .eq('is_default', true)
      .single()
    food = {
      id: archetype.id,
      name: archetype.name,
      kcal: archetype.kcal,
      is_estimate: false,
      is_archetype: true,
      serving_id: serving?.id ?? '',
    }
  } else {
    // The terminal row: hardcoded id, no model call, no search.
    const { data: terminal } = await db
      .from('foods')
      .select('id, name, kcal, food_servings(id, is_default)')
      .eq('id', TERMINAL_ARCHETYPE_ID)
      .single()
    if (!terminal) throw new Error('terminal archetype row missing — run seed_archetype_foods()')
    const servings = terminal.food_servings as Array<{ id: string; is_default: boolean }>
    food = {
      id: terminal.id,
      name: terminal.name,
      kcal: terminal.kcal,
      is_estimate: false,
      is_archetype: true,
      serving_id: servings.find((s) => s.is_default)?.id ?? '',
    }
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
 */
export async function resolveItem(
  db: SupabaseClient,
  scanId: string,
  scene: Vision['scene'],
  item: VisionItem,
  mock: MockSteer | undefined,
  trace?: string[],
): Promise<Resolved | null> {
  const note = (stage: string, error: unknown) => {
    const message = `[cascade] ${stage}: ${describe(error)}`
    console.error(message)
    trace?.push(message)
  }

  // Whether the plate has parts is decided by whether the model LISTED parts,
  // not by what it called the scene. A banana leaf of satay came back as
  // "single" with three components on it — seven skewers, two ketupat, a heap
  // of shallots — and the scene label sent it to a one-row catalogue match for
  // 365 kcal against the 525 its own parts add up to. The list is the evidence;
  // `scene` is the model's summary of it.
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
    (await resolveByDish(db, scanId, item, mock).catch((error) => {
      note('dish stage threw', error)
      return null
    }))
  resolved =
    resolved ??
    (await resolveByEstimate(db, item, mock).catch((error) => {
      note('estimate stage threw', error)
      return null
    }))
  return resolved
}

export type WrittenEntry = {
  id: string
  foodId: string
  servingId: string
  name: string
  quantity: number
  /** What the row will show. The client announces it from the background. */
  kcal: number
  tier: number
  isEstimate: boolean
  isArchetype: boolean
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
  },
): Promise<WrittenEntry> {
  const { resolved } = input
  const { data: entry, error } = await db
    .from('food_logs')
    .insert({
      user_id: input.userId,
      food_id: resolved.food.id,
      serving_id: resolved.food.serving_id,
      log_date: input.logDate,
      quantity: resolved.quantity,
      source: 'camera',
      photo_path: input.photoPath,
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
    kcal: Math.round(resolved.food.kcal * resolved.quantity),
    tier: resolved.tier,
    isEstimate: resolved.food.is_estimate,
    isArchetype: resolved.food.is_archetype,
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
      quantity: ingredient.quantity,
      display_label: ingredient.displayLabel,
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
