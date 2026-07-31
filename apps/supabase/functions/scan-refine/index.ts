// Fix-by-typing: correct a logged entry with free text.
//
// "half portion", "no sambal", "it was rendang not curry", "add a fried egg"
// — the interpreter turns the instruction plus the entry's current state into
// one of three decisions:
//
//   quantity    only the amount changed: rescale the entry's quantity, and
//               every ingredient under it by the same factor
//   adjust      one part of the same dish changed: on a plate with a
//               breakdown that part is dropped or added and the entry is
//               re-priced from what is left; on one without, the delta lands
//               on the entry's own figure
//   redescribe  the food changed: describe the corrected dish and re-run the
//               SAME cascade a fresh scan uses (catalogue first, estimate,
//               archetype floor), then repoint the entry and its ingredients
//   none        the text is not a food correction: nothing changes
//
// A correction never silently loses the breakdown. It is the only part of an
// entry the user can edit piece by piece, and every path through here either
// keeps it, edits it, or replaces it with a new one.
//
// The entry keeps its identity — id, photo, scan_id, meal, date — so the
// diary row updates in place rather than being replaced. Applied or not, the
// answer after validation is HTTP 200: `applied: false` with a reason is a
// result, not an error.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import {
  clampQuantity,
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

/**
 * Re-price an entry from the ingredients currently under it.
 *
 * The same rule tier 2 writes a decomposed plate with: the parent is a shared
 * estimate row whose figures ARE the sum of the parts, at one portion. Running
 * it again after an edit is what lets a correction change the list and have the
 * total follow, instead of changing the total and having to bin the list.
 */
async function rebuildFromParts(
  db: ReturnType<typeof createClient>,
  entryId: string,
  name: string,
): Promise<{
  foodId: string
  quantity: number
  kcal: number
  ingredients: Array<{ name: string; kcal: number; quantity: number }>
} | null> {
  const { data: rows } = await db
    .from('food_log_ingredient_details')
    .select('name, quantity, kcal, carbs_g, protein_g, fat_g, position')
    .eq('food_log_id', entryId)
    .order('position')
  if (!rows?.length) return null

  const sum = rows.reduce(
    (total, row) => ({
      kcal: total.kcal + (row.kcal ?? 0),
      carbs: total.carbs + Number(row.carbs_g ?? 0),
      protein: total.protein + Number(row.protein_g ?? 0),
      fat: total.fat + Number(row.fat_g ?? 0),
    }),
    { kcal: 0, carbs: 0, protein: 0, fat: 0 },
  )
  if (sum.kcal <= 0) return null

  const round1 = (value: number) => Math.round(value * 10) / 10
  const { data: parentId, error } = await db.rpc('upsert_estimate_food', {
    p_name: name,
    p_kcal: Math.round(sum.kcal),
    p_carbs_g: round1(sum.carbs),
    p_protein_g: round1(sum.protein),
    p_fat_g: round1(sum.fat),
    p_fibre_g: null,
    p_sugar_g: null,
    p_sodium_mg: null,
  })
  if (error || !parentId) return null

  const [{ data: parent }, { data: serving }] = await Promise.all([
    db
      .from('foods')
      .select('id, kcal')
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

  // One plate, one portion — the size-aware dedup means the row that comes
  // back is priced for this plate, so this is 1 unless something drifted.
  const quantity = parent.kcal > 0 ? clampQuantity(sum.kcal / parent.kcal) : 1

  const { error: updateError } = await db
    .from('food_logs')
    .update({
      food_id: parent.id,
      serving_id: serving.id,
      quantity,
      display_label: name,
    })
    .eq('id', entryId)
  if (updateError) return null

  return {
    foodId: parent.id,
    quantity,
    kcal: Math.round(parent.kcal * quantity),
    ingredients: rows.map((row) => ({
      name: row.name ?? '',
      kcal: row.kcal ?? 0,
      quantity: Number(row.quantity ?? 1),
    })),
  }
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
        'food_log_ingredients(id, quantity, display_label, foods(name))',
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
  const parts = entry.food_log_ingredients as unknown as Array<{
    id: string
    quantity: number
    display_label: string | null
    foods: { name: string }
  }>
  const partName = (part: (typeof parts)[number]) => part.display_label ?? part.foods.name
  const ingredientNames = parts.map(partName)

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

      // Half the plate is half of everything on it. The parts move with the
      // whole, because a breakdown that still describes a full plate under an
      // entry counting half of one is worse than no breakdown at all — and
      // deleting it, which is what used to happen to every correction, threw
      // away the only thing on the screen the user can edit part by part.
      const applied = Math.max(0.01, quantity / Math.max(0.01, Number(entry.quantity)))
      for (const part of parts) {
        await db
          .from('food_log_ingredients')
          .update({ quantity: refineQuantity(Number(part.quantity) * applied) })
          .eq('id', part.id)
      }

      await recordRefine(null, entry.food_id, quantity)
      return json({ ok: true, applied: true, action: 'quantity', quantity })
    }

    if (interpretation.action === 'adjust' && parts.length) {
      // A plate that has a breakdown is CORRECTED THROUGH IT. "No sambal"
      // means one row leaves the list and the plate is what is left; "add a
      // fried egg" means one row joins it. Then the entry is re-priced from
      // the sum of its parts, exactly the way tier 2 built it in the first
      // place, so the total and the list can never drift apart.
      //
      // The old path could only add the delta to the entry's own figure, and
      // then had to delete the breakdown to stop it contradicting the total.
      // That is the bug this replaces: one correction and the plate forgot
      // what was on it.
      const wanted = interpretation.part?.toLowerCase().trim() ?? ''
      const match = wanted
        ? (parts.find((part) => partName(part).toLowerCase() === wanted) ??
          parts.find((part) => {
            const name = partName(part).toLowerCase()
            return name.includes(wanted) || wanted.includes(name)
          }))
        : undefined

      if (match && interpretation.count) {
        // The user counted them out. "Two more skewers" is two more skewers,
        // not the model's calorie estimate for two skewers divided by what one
        // costs — that arithmetic turned seven into ten.
        const next = Number(match.quantity) + interpretation.count
        if (next <= 0) {
          await db.from('food_log_ingredients').delete().eq('id', match.id)
        } else {
          await db
            .from('food_log_ingredients')
            .update({ quantity: refineQuantity(next) })
            .eq('id', match.id)
        }
      } else if (interpretation.kcal_delta > 0 && match) {
        // More of something already on the plate, with no number given. Adding
        // a SECOND satay row would leave the user with two steppers for one
        // thing and a list that reads like the scan saw double.
        const { data: rows } = await db
          .from('food_log_ingredient_details')
          .select('kcal, quantity')
          .eq('id', match.id)
          .single()
        const perUnit = rows?.kcal ? rows.kcal / Math.max(0.01, Number(rows.quantity)) : 0
        const extra = perUnit > 0 ? Math.max(1, Math.round(interpretation.kcal_delta / perUnit)) : 1
        await db
          .from('food_log_ingredients')
          .update({ quantity: refineQuantity(Number(match.quantity) + extra) })
          .eq('id', match.id)
      } else if (interpretation.kcal_delta < 0 && match) {
        await db.from('food_log_ingredients').delete().eq('id', match.id)
      } else if (interpretation.kcal_delta < 0 && parts.length > 1) {
        // Something was removed and no part answers to the name. Take it off
        // the plate as a whole rather than pretending the list still adds up:
        // the largest part shrinks by the delta, which is where a removed
        // portion most likely came from.
        const { data: rows } = await db
          .from('food_log_ingredient_details')
          .select('id, kcal, quantity')
          .eq('food_log_id', entry.id)
          .order('kcal', { ascending: false })
          .limit(1)
        const biggest = rows?.[0]
        if (biggest && biggest.kcal > 0) {
          const perUnit = biggest.kcal / Math.max(0.01, Number(biggest.quantity))
          const next = refineQuantity(
            Math.max(0.25, (biggest.kcal + interpretation.kcal_delta) / Math.max(1, perUnit)),
          )
          await db.from('food_log_ingredients').update({ quantity: next }).eq('id', biggest.id)
        }
      } else if (interpretation.kcal_delta > 0) {
        // An addition: its own row, priced by the model's delta for that one
        // thing, with an Atwater-consistent split so the parent's macros stay
        // internally honest.
        const added = interpretation.part ?? instruction
        const kcal = Math.round(interpretation.kcal_delta)
        const { data: addedId } = await db.rpc('upsert_estimate_food', {
          p_name: added,
          p_kcal: kcal,
          p_carbs_g: Math.round((kcal * 0.5) / 4),
          p_protein_g: Math.round((kcal * 0.2) / 4),
          p_fat_g: Math.round((kcal * 0.3) / 9),
          p_fibre_g: null,
          p_sugar_g: null,
          p_sodium_mg: null,
        })
        const { data: addedServing } = addedId
          ? await db
              .from('food_servings')
              .select('id')
              .eq('food_id', addedId as string)
              .eq('is_default', true)
              .single()
          : { data: null }
        if (addedId && addedServing) {
          await db.from('food_log_ingredients').insert({
            food_log_id: entry.id,
            food_id: addedId as string,
            serving_id: addedServing.id,
            quantity: 1,
            display_label: added.slice(0, 120),
            position: parts.length,
          })
        }
      }

      const rebuilt = await rebuildFromParts(db, entry.id, interpretation.name)
      if (!rebuilt) throw new Error('could not re-price the plate')

      await recordRefine(2, rebuilt.foodId, rebuilt.quantity)
      return json({
        ok: true,
        applied: true,
        action: 'adjust',
        entry: {
          id: entry.id,
          foodId: rebuilt.foodId,
          name: interpretation.name,
          quantity: rebuilt.quantity,
          kcal: rebuilt.kcal,
          isEstimate: true,
          isArchetype: false,
          ingredients: rebuilt.ingredients,
        },
      })
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
