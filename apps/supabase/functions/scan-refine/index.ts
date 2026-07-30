// Fix-by-typing: correct a logged entry with free text.
//
// "half portion", "no sambal", "it was rendang not curry", "add a fried egg"
// — the interpreter turns the instruction plus the entry's current state into
// one of three decisions:
//
//   quantity    only the amount changed: rescale the entry's quantity
//   redescribe  the food changed: describe the corrected dish and re-run the
//               SAME cascade a fresh scan uses (catalogue first, estimate,
//               archetype floor), then repoint the entry and its ingredients
//   none        the text is not a food correction: nothing changes
//
// The entry keeps its identity — id, photo, scan_id, meal, date — so the
// diary row updates in place rather than being replaced. Applied or not, the
// answer after validation is HTTP 200: `applied: false` with a reason is a
// result, not an error.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import {
  refineQuantity,
  resolveByArchetype,
  resolveItem,
  writeIngredients,
} from '../_shared/cascade.ts'
import { interpretInstruction, type MockSteer, mockActive } from '../_shared/llm.ts'

type RefineRequest = {
  food_log_id: string
  instruction: string
  mock?: MockSteer
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
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

  let body: RefineRequest
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'body is not JSON' }, 400)
  }
  const instruction = (body.instruction ?? '').trim().slice(0, 500)
  if (!body.food_log_id || !instruction) {
    return json({ ok: false, error: 'food_log_id and instruction are required' }, 400)
  }
  const mock = mockActive() ? body.mock : undefined

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // The entry, with enough context for the interpreter. service_role reads it,
  // so ownership is checked explicitly — this function must not be a way to
  // edit someone else's diary.
  const { data: entry } = await db
    .from('food_logs')
    .select(
      'id, user_id, quantity, scan_id, display_label, food_id, serving_id, ' +
        'foods(name, kcal, carbs_g, protein_g, fat_g), food_servings(label, factor), ' +
        'food_log_ingredients(display_label, foods(name))',
    )
    .eq('id', body.food_log_id)
    .single()
  if (!entry || entry.user_id !== userId) {
    return json({ ok: false, error: 'entry not found' }, 404)
  }

  const food = entry.foods as unknown as {
    name: string
    kcal: number
    carbs_g: number | null
    protein_g: number | null
    fat_g: number | null
  }
  const serving = entry.food_servings as unknown as { label: string; factor: number }
  const ingredientNames = (
    entry.food_log_ingredients as unknown as Array<{
      display_label: string | null
      foods: { name: string }
    }>
  ).map((ingredient) => ingredient.display_label ?? ingredient.foods.name)

  try {
    const interpretation = await interpretInstruction(
      {
        name: entry.display_label ?? food.name,
        kcal: Math.round(food.kcal * serving.factor * Number(entry.quantity)),
        quantity: Number(entry.quantity),
        servingLabel: serving.label,
        ingredients: ingredientNames,
      },
      instruction,
      mock,
    )

    // The eval row for every refine, applied or not: "what people correct" is
    // the scan-accuracy backlog sorted by pain.
    const recordRefine = (tier: number | null, foodId: string | null, quantity: number | null) =>
      db.from('food_scan_items').insert({
        user_id: userId,
        scan_id: entry.scan_id ?? entry.id,
        refine_instruction: instruction,
        resolved_tier: tier,
        resolved_food_id: foodId,
        quantity,
        food_log_id: entry.id,
      })

    if (interpretation.action === 'quantity') {
      const quantity = refineQuantity(Number(entry.quantity) * interpretation.factor)
      const { error } = await db.from('food_logs').update({ quantity }).eq('id', entry.id)
      if (error) throw error
      await recordRefine(null, entry.food_id, quantity)
      return json({ ok: true, applied: true, action: 'quantity', quantity })
    }

    if (interpretation.action === 'adjust') {
      // The same dish, one part changed. The base stays the catalogue figure
      // the entry already trusts; only the DELTA is the model's — so "no
      // sambal" can never re-guess the whole plate, and the answer moves in
      // the direction the words say. Macros scale proportionally, which keeps
      // Atwater consistency by construction.
      const portionKcal = food.kcal * serving.factor
      const target = Math.max(20, Math.round(portionKcal + interpretation.kcal_delta))
      const scale = target / Math.max(1, portionKcal)
      const round1 = (value: number) => Math.round(value * 10) / 10

      const { data: adjustedId, error: adjustError } = await db.rpc('upsert_estimate_food', {
        p_name: interpretation.name,
        p_kcal: target,
        p_carbs_g: round1(Number(food.carbs_g ?? 0) * serving.factor * scale),
        p_protein_g: round1(Number(food.protein_g ?? 0) * serving.factor * scale),
        p_fat_g: round1(Number(food.fat_g ?? 0) * serving.factor * scale),
        p_fibre_g: null,
        p_sugar_g: null,
        p_sodium_mg: null,
      })
      if (adjustError || !adjustedId) throw adjustError ?? new Error('adjust upsert failed')

      const [{ data: adjustedFood }, { data: adjustedServing }] = await Promise.all([
        db
          .from('foods')
          .select('id, name, kcal')
          .eq('id', adjustedId as string)
          .single(),
        db
          .from('food_servings')
          .select('id')
          .eq('food_id', adjustedId as string)
          .eq('is_default', true)
          .single(),
      ])
      if (!adjustedFood || !adjustedServing) throw new Error('adjusted row incomplete')

      // Dedup may hand back an earlier variant priced differently; the
      // quantity absorbs the difference (rule 12 — amount, never macros).
      const quantity = refineQuantity(
        (Number(entry.quantity) * target) / Math.max(1, adjustedFood.kcal),
      )

      const { error: updateError } = await db
        .from('food_logs')
        .update({
          food_id: adjustedFood.id,
          serving_id: adjustedServing.id,
          quantity,
          display_label: interpretation.name,
        })
        .eq('id', entry.id)
      if (updateError) throw updateError

      // The parts list described the pre-adjustment plate.
      await db.from('food_log_ingredients').delete().eq('food_log_id', entry.id)

      await recordRefine(null, adjustedFood.id, quantity)
      return json({
        ok: true,
        applied: true,
        action: 'adjust',
        entry: {
          id: entry.id,
          foodId: adjustedFood.id,
          name: interpretation.name,
          quantity,
          kcal: Math.round(adjustedFood.kcal * quantity),
          isEstimate: true,
          isArchetype: false,
          ingredients: [],
        },
      })
    }

    if (interpretation.action === 'redescribe') {
      const scanId = entry.scan_id ?? crypto.randomUUID()
      const item = interpretation.item
      const resolved =
        (await resolveItem(
          db,
          scanId,
          item.components.length >= 2 ? 'composite' : 'single',
          item,
          mock,
        )) ?? (await resolveByArchetype(db, item, mock))

      const { error } = await db
        .from('food_logs')
        .update({
          food_id: resolved.food.id,
          serving_id: resolved.food.serving_id,
          quantity: resolved.quantity,
          display_label: resolved.displayLabel,
          scan_id: scanId,
        })
        .eq('id', entry.id)
      if (error) throw error

      // The breakdown describes the OLD food now; replace it wholesale.
      await db.from('food_log_ingredients').delete().eq('food_log_id', entry.id)
      const ingredients = await writeIngredients(db, entry.id, resolved.ingredients ?? [])

      await recordRefine(resolved.tier, resolved.food.id, resolved.quantity)
      return json({
        ok: true,
        applied: true,
        action: 'redescribe',
        entry: {
          id: entry.id,
          foodId: resolved.food.id,
          name: resolved.displayLabel ?? resolved.food.name,
          quantity: resolved.quantity,
          tier: resolved.tier,
          isEstimate: resolved.food.is_estimate,
          isArchetype: resolved.food.is_archetype,
          ingredients,
        },
      })
    }

    await recordRefine(null, null, null)
    return json({ ok: true, applied: false, reason: interpretation.reason })
  } catch (error) {
    console.error('[scan-refine] failed:', error)
    return json({
      ok: true,
      applied: false,
      reason: error instanceof Error ? error.message : 'could not apply the correction',
    })
  }
})
