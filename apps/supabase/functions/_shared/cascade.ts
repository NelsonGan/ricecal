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
  pickCandidate,
  type Vision,
  type VisionItem,
} from './llm.ts'

/** The terminal archetype. Seeded with this exact id by seed_archetype_foods(). */
export const TERMINAL_ARCHETYPE_ID = 'a0000000-0000-4000-8000-000000000000'

/** "Within ~25%": a catalogue figure against the model's low..high band. */
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

export const withinBand = (kcal: number, low: number, high: number): boolean =>
  high > 0 && kcal >= low * (1 - BAND_SLACK) && kcal <= high * (1 + BAND_SLACK)

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

/** search_foods via RPC, shaped to what the cascade needs. */
async function search(db: SupabaseClient, q: string, limit: number): Promise<SearchRow[]> {
  const { data, error } = await db.rpc('search_foods', { q, match_limit: limit })
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
 */
async function resolveByComponents(
  db: SupabaseClient,
  scanId: string,
  item: VisionItem,
  trace?: string[],
): Promise<Resolved | null> {
  if (item.components.length < 2) return null

  const snapIngredientQty = (q: number): number =>
    Math.round(Math.min(3, Math.max(0.25, q)) * 4) / 4

  const parts: Array<{ food: FoodRow; quantity: number; label: string; kcal: number }> = []
  for (const component of item.components) {
    const q = usable(component.name)
    if (!q) continue
    const rows = await search(db, q, 5)

    // First relevance-ranked hit that is portion-plausible for this part.
    const fit =
      component.kcal > 0
        ? rows.find((row) => row.kcal >= component.kcal * 0.5 && row.kcal <= component.kcal * 1.5)
        : rows[0]

    if (fit) {
      const quantity =
        component.kcal > 0 && fit.kcal > 0 ? snapIngredientQty(component.kcal / fit.kcal) : 1
      parts.push({
        food: asFood(fit),
        quantity,
        label: component.name.slice(0, 120),
        kcal: fit.kcal * quantity,
      })
      continue
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
    const { data: estimateId } = await db.rpc('upsert_estimate_food', {
      p_name: component.name,
      p_kcal: component.kcal,
      p_carbs_g: macros.carbs,
      p_protein_g: macros.protein,
      p_fat_g: macros.fat,
      p_fibre_g: null,
      p_sugar_g: null,
      p_sodium_mg: null,
    })
    if (!estimateId) continue
    const [{ data: estimateFood }, { data: estimateServing }] = await Promise.all([
      db
        .from('foods')
        .select('id, name, kcal')
        .eq('id', estimateId as string)
        .single(),
      db
        .from('food_servings')
        .select('id')
        .eq('food_id', estimateId as string)
        .eq('is_default', true)
        .single(),
    ])
    if (!estimateFood || !estimateServing) continue
    // A deduped row may carry an earlier estimate; quantity absorbs the drift.
    const quantity =
      estimateFood.kcal > 0 ? snapIngredientQty(component.kcal / estimateFood.kcal) : 1
    parts.push({
      food: {
        ...estimateFood,
        is_estimate: true,
        is_archetype: false,
        serving_id: estimateServing.id,
      },
      quantity,
      label: component.name.slice(0, 120),
      kcal: estimateFood.kcal * quantity,
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
    candidates = await search(db, q, 5)
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

  if (withinBand(chosen.kcal, item.kcal_low, item.kcal_high)) {
    // The catalogue row as-is. Never rescaled, never blended.
    return { tier: 1, food: asFood(chosen), quantity: 1, displayLabel: label }
  }

  // Right identity, wrong amount — adjust `quantity`, never the macros.
  if (item.confidence >= 0.5 && chosen.kcal > 0) {
    return {
      tier: 3,
      food: asFood(chosen),
      quantity: clampQuantity(llmMid / chosen.kcal),
      displayLabel: label,
    }
  }
  return null
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
 * The full cascade for one item. Composite plates try decomposition FIRST —
 * a plate of visible parts is better explained than approximated — then the
 * dish-level match, then the estimate. Returns null when only the archetype
 * floor is left; each stage guards itself so one stage's crash cannot skip
 * the ones below it.
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
    const message = `[cascade] ${stage}: ${error instanceof Error ? error.message : String(error)}`
    console.error(message)
    trace?.push(message)
  }

  let resolved: Resolved | null = null
  if (scene === 'composite') {
    resolved = await resolveByComponents(db, scanId, item, trace).catch((error) => {
      note('components stage threw', error)
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
    meal: string
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
      meal: input.meal,
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
