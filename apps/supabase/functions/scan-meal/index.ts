// The photo-scan resolution cascade.
//
// A scan NEVER dead-ends. Five tiers, each one strictly cheaper in accuracy
// and stronger in guarantee than the one above it:
//
//   1. catalogue match      — search_foods + a verifier pick, kcal band check
//   2. component breakdown  — each named ingredient to its own catalogue row
//   3. nearest dish, rescaled — right identity, wrong amount: adjust quantity
//   4. LLM nutrition        — writes a shared, deduped `is_estimate` food row
//   5. archetype            — classification over ~60 seeded rows; terminal
//                             "mixed meal" is a hardcoded id needing no model
//
// Once the caller is authenticated and the body parses, this function does not
// return an HTTP error: any uncaught failure in tiers 1-4 falls to tier 5, and
// a tier-5 failure still answers 200 with `ok: false` so the client can keep
// its pending row and retry. The numbers the user sees always come from a
// `foods` row — an LLM figure is never averaged with a catalogue figure.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  type Archetype,
  analysePhoto,
  type Candidate,
  classifyArchetype,
  estimateNutrition,
  type MockSteer,
  mockActive,
  type Nutrition,
  pickCandidate,
  type Vision,
  type VisionItem,
} from './llm.ts'

/** The terminal archetype. Seeded with this exact id by seed_archetype_foods(). */
const TERMINAL_ARCHETYPE_ID = 'a0000000-0000-4000-8000-000000000000'

/** "Within ~25%": candidate kcal against the model's low..high band. */
const BAND_SLACK = 0.25

type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

type ScanRequest = {
  photo_path?: string
  meal: Meal
  log_date: string
  mock?: MockSteer
}

type FoodRow = {
  id: string
  name: string
  kcal: number
  is_estimate: boolean
  is_archetype: boolean
  serving_id: string
}

type Resolution = {
  tier: 1 | 2 | 3 | 4 | 5
  /** One per entry to write. Tier 2 has several; every other tier has one. */
  parts: Array<{
    food: FoodRow
    quantity: number
    /** Kept when the row's own name is generic (estimate/archetype rows). */
    displayLabel: string | null
  }>
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const withinBand = (kcal: number, low: number, high: number): boolean =>
  high > 0 && kcal >= low * (1 - BAND_SLACK) && kcal <= high * (1 + BAND_SLACK)

const clampQuantity = (q: number): number => Math.round(Math.min(3.0, Math.max(0.5, q)) * 100) / 100

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

/** search_foods via RPC, shaped to what the cascade needs. */
async function search(db: SupabaseClient, q: string, limit: number) {
  const { data, error } = await db.rpc('search_foods', { q, match_limit: limit })
  if (error) throw error
  type Row = {
    id: string
    name: string
    brand: string | null
    kcal: number
    default_serving_id: string | null
    serving_label: string | null
  }
  return ((data ?? []) as Row[]).filter((r) => r.id && r.default_serving_id && r.kcal !== null)
}

const asFood = (r: {
  id: string
  name: string
  kcal: number
  default_serving_id: string | null
}): FoodRow => ({
  id: r.id,
  name: r.name,
  kcal: r.kcal,
  is_estimate: false,
  is_archetype: false,
  serving_id: r.default_serving_id as string,
})

/**
 * Tiers 1-3 for one item. Returns null when the catalogue cannot answer,
 * which is tier 4's cue.
 */
async function resolveFromCatalogue(
  db: SupabaseClient,
  scanId: string,
  scene: Vision['scene'],
  item: VisionItem,
  mock: MockSteer | undefined,
): Promise<Resolution | null> {
  const llmMid = (item.kcal_low + item.kcal_high) / 2

  // -- Tier 1: at most 3 retrieval attempts, specific → generic → head noun.
  const tried = new Set<string>()
  const queries = [item.specific_query, item.generic_query, headNoun(item.generic_query)]
    .map(usable)
    .filter((q) => q && !tried.has(q) && tried.add(q))
    .slice(0, 3)

  let candidates: Awaited<ReturnType<typeof search>> = []
  const missed: string[] = []
  for (const q of queries) {
    candidates = await search(db, q, 5)
    if (candidates.length) break
    missed.push(q)
  }

  // Every query that found nothing feeds the catalogue-widening backlog —
  // including all of them when the whole tier missed.
  if (missed.length) {
    await db.from('food_scan_misses').insert(missed.map((q) => ({ scan_id: scanId, query: q })))
  }

  // Requirement 13: zero rows and "verifier said none" are ONE outcome.
  let chosen: (Candidate & { default_serving_id: string | null }) | null = null
  if (candidates.length) {
    const idx = await pickCandidate(item, candidates, mock).catch(() => null)
    chosen = idx === null ? null : (candidates[idx] ?? null)
  }

  if (chosen && withinBand(chosen.kcal, item.kcal_low, item.kcal_high)) {
    // The catalogue row as-is. Never rescaled, never blended.
    return { tier: 1, parts: [{ food: asFood(chosen), quantity: 1, displayLabel: null }] }
  }

  // -- Tier 2: component decomposition, only for composite plates and only
  // all-or-nothing — a partial breakdown undercounts, which is the dangerous
  // direction for a calorie app.
  if (scene === 'composite' && item.components.length >= 2) {
    const parts: Resolution['parts'] = []
    for (const component of item.components) {
      const q = usable(component)
      if (!q) continue
      const rows = await search(db, q, 5)
      if (!rows.length) {
        await db.from('food_scan_misses').insert({ scan_id: scanId, query: q })
        parts.length = 0
        break
      }
      parts.push({ food: asFood(rows[0]), quantity: 1, displayLabel: null })
    }
    if (parts.length >= 2) {
      const sum = parts.reduce((total, p) => total + p.food.kcal, 0)
      if (withinBand(sum, item.kcal_low, item.kcal_high)) return { tier: 2, parts }
    }
  }

  // -- Tier 3: the verifier named a dish but the amount looks wrong. Right
  // identity, wrong quantity — so adjust `quantity`, never the macros.
  if (chosen && item.confidence >= 0.5 && chosen.kcal > 0) {
    const quantity = clampQuantity(llmMid / chosen.kcal)
    return { tier: 3, parts: [{ food: asFood(chosen), quantity, displayLabel: null }] }
  }

  return null
}

/** Tier 4: validated model nutrition into a shared, deduped estimate row. */
async function resolveByEstimate(
  db: SupabaseClient,
  item: VisionItem,
  mock: MockSteer | undefined,
): Promise<Resolution | null> {
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

  const { data: serving } = await db
    .from('food_servings')
    .select('id')
    .eq('food_id', foodId as string)
    .eq('is_default', true)
    .single()
  if (!serving) return null

  // The row may be an older estimate with a different figure (dedup reuses
  // it); the entry still gets THIS scan's name via display_label.
  const { data: food } = await db
    .from('foods')
    .select('id, name, kcal')
    .eq('id', foodId as string)
    .single()
  if (!food) return null

  return {
    tier: 4,
    parts: [
      {
        food: { ...food, is_estimate: true, is_archetype: false, serving_id: serving.id },
        quantity: 1,
        displayLabel: item.name,
      },
    ],
  }
}

/** Tier 5. The only tier that cannot fail: worst case is the terminal row. */
async function resolveByArchetype(
  db: SupabaseClient,
  item: VisionItem | null,
  mock: MockSteer | undefined,
): Promise<Resolution> {
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

  return {
    tier: 5,
    parts: [{ food, quantity, displayLabel: item ? item.name : null }],
  }
}

Deno.serve(async (req: Request) => {
  // -- Auth: same self-inspection pattern as healthcheck.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'missing Authorization header' }, 401)

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: auth, error: authError } = await anonClient.auth.getUser()
  const userId = auth.user?.id
  if (authError || !userId) return json({ ok: false, error: 'not signed in' }, 401)

  // -- Body. The last 4xx this function can return.
  let body: ScanRequest
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'body is not JSON' }, 400)
  }
  const meal = MEALS.includes(body.meal) ? body.meal : null
  const logDate = /^\d{4}-\d{2}-\d{2}$/.test(body.log_date ?? '') ? body.log_date : null
  if (!meal || !logDate) return json({ ok: false, error: 'meal and log_date are required' }, 400)

  const photoPath = typeof body.photo_path === 'string' ? body.photo_path : null
  // Steering is a test affordance; outside mock mode it is ignored entirely.
  const mock = mockActive() ? body.mock : undefined

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const scanId = crypto.randomUUID()

  try {
    // -- Vision. A failure here — network, model, no photo — skips straight
    // to tier 5 with no item context: the terminal row.
    let vision: Vision | null = null
    try {
      let photoBase64: string | null = null
      if (photoPath && !mockActive()) {
        const { data: blob, error: downloadError } = await db.storage
          .from('meal-photos')
          .download(photoPath)
        if (downloadError || !blob) throw downloadError ?? new Error('photo missing')
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        }
        photoBase64 = btoa(binary)
      }
      vision = await analysePhoto(photoBase64, mock)
    } catch {
      vision = null
    }

    const items: Array<VisionItem | null> = vision?.items ?? [null]
    const scene = vision?.scene ?? 'unclear'

    const written: Array<{
      id: string
      foodId: string
      servingId: string
      name: string
      quantity: number
      tier: number
      isEstimate: boolean
      isArchetype: boolean
    }> = []
    let firstEntry = true

    for (const [index, item] of items.entries()) {
      // The cascade. Any throw inside tiers 1-4 falls through to tier 5.
      // Each stage guards itself: a failure in tiers 1-3 must still reach
      // tier 4, and a tier-4 failure still reaches tier 5.
      let resolution: Resolution | null = null
      if (item) {
        resolution = await resolveFromCatalogue(db, scanId, scene, item, mock).catch(() => null)
        resolution = resolution ?? (await resolveByEstimate(db, item, mock).catch(() => null))
      }
      resolution = resolution ?? (await resolveByArchetype(db, item, mock))

      for (const part of resolution.parts) {
        const { data: entry, error: insertError } = await db
          .from('food_logs')
          .insert({
            user_id: userId,
            food_id: part.food.id,
            serving_id: part.food.serving_id,
            meal,
            log_date: logDate,
            quantity: part.quantity,
            source: 'camera',
            // On the first row only: N copies of one photo would render the
            // same plate N times in the diary.
            photo_path: firstEntry ? photoPath : null,
            scan_id: scanId,
            display_label: part.displayLabel,
          })
          .select('id')
          .single()
        if (insertError || !entry) throw insertError ?? new Error('insert failed')
        firstEntry = false

        written.push({
          id: entry.id,
          foodId: part.food.id,
          servingId: part.food.serving_id,
          name: part.displayLabel ?? part.food.name,
          quantity: part.quantity,
          tier: resolution.tier,
          isEstimate: part.food.is_estimate,
          isArchetype: part.food.is_archetype,
        })
      }

      // The eval row: what the model claimed, what was accepted, which tier.
      if (item || resolution.parts.length) {
        const first = resolution.parts[0]
        await db.from('food_scan_items').insert({
          user_id: userId,
          scan_id: scanId,
          item_index: index,
          scene,
          specific_query: item?.specific_query ?? null,
          generic_query: item?.generic_query ?? null,
          components: item?.components ?? null,
          serving_hint: item?.serving_hint ?? null,
          llm_kcal_low: item ? Math.round(item.kcal_low) : null,
          llm_kcal_high: item ? Math.round(item.kcal_high) : null,
          confidence: item?.confidence ?? null,
          resolved_tier: resolution.tier,
          resolved_food_id: first?.food.id ?? null,
          catalogue_kcal: first?.food.kcal ?? null,
          quantity: first?.quantity ?? null,
          food_log_id: written.at(-resolution.parts.length)?.id ?? null,
        })
      }
    }

    return json({
      ok: true,
      scanId,
      entries: written,
      // Requirement 17: the client shows a breakdown only when the whole
      // plate decomposed — which is exactly "tier 2 wrote several rows".
      breakdown: written.length > 1 && written.every((w) => w.tier === 2),
    })
  } catch (error) {
    // Even the cascade's floor failed (database down, terminal row missing).
    // Still not an HTTP error: the client keeps its pending row and retries.
    console.error('[scan-meal] unrecoverable:', error)
    return json({
      ok: false,
      scanId,
      entries: [],
      error: error instanceof Error ? error.message : 'scan failed',
    })
  }
})
