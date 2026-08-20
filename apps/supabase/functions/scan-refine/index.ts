// Fix-by-typing: correct a logged entry with free text.
//
// "half portion", "no sambal", "it was rendang not curry", "add a fried egg": the
// interpreter turns the instruction plus the entry's current state into one of
// four decisions, and they are ordered by how much of the entry they keep. That
// order is the whole design: everything about a logged meal except the words just
// typed is something the user has already accepted, so a correction that reaches
// further down this list than it had to comes back as a different meal from the
// one they were fixing.
//
//   none        the text is not a food correction, or has no calories in it
//               ("extra spicy"): nothing changes
//   quantity    only the amount changed: rescale the entry's quantity, and every
//               ingredient under it by the same factor. A calorie total for the
//               whole dish lands here too, since "more like 500 calories" is a
//               different amount of this food rather than a different food.
//               Not `override_kcal`, which would hit the figure exactly: the
//               override sits above the parts in `food_log_details`, so an entry
//               with a breakdown would show the typed number while its own
//               ingredient list added to something else. Rescaling keeps the two
//               in lockstep and pays for it in granularity, hence twentieths of a
//               portion.
//   adjust      one part of the same meal was added, removed, resized or swapped:
//               on a plate with a breakdown that part is edited in place and the
//               entry is re-priced from what is left; on one without, the delta
//               lands on the entry's own figure
//   redescribe  the food itself was wrong: describe the corrected dish and re-run
//               the same cascade a fresh scan uses, then repoint the entry and
//               its ingredients
//
// A correction never silently loses the breakdown. It is the only part of an
// entry the user can edit piece by piece, and every path through here either
// keeps it, edits it, or replaces it with a new one.
//
// The entry keeps its identity (id, photo, scan_id, date) so the diary row
// updates in place rather than being replaced. Applied or not, the answer after
// validation is HTTP 200: `applied: false` with a reason is a result, not an
// error.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  refineQuantity,
  resolveByArchetype,
  resolveItem,
  writeIngredients,
} from '../_shared/cascade.ts'
import {
  claimScan,
  createMeter,
  NotEntitled,
  requireEntitlement,
  ScanLimitReached,
} from '../_shared/entitlement.ts'
import { interpretInstruction, type MockSteer, mockActive } from '../_shared/llm.ts'

type RefineRequest = {
  food_log_id: string
  instruction: string
  mock?: MockSteer
}

/**
 * How much of a part a reduction has to account for before it takes the whole
 * thing off the plate.
 *
 * "No sambal" is a removal, and the model prices it at roughly what the sambal
 * costs — so most of the part. Well short of that the user asked for less of
 * something, not for none of it, and the difference matters because there is
 * no undo on an ingredient.
 */
const REMOVES_THE_PART = 0.6

/**
 * The entry this function reasons over: the row, the dish it holds, the portion
 * it is measured in, and the parts hanging off it. Exactly the select below,
 * named.
 *
 * The dish and the portion used to be two joins, into `foods` and
 * `food_servings`. They are columns on the entry now, which is the same
 * information with one fewer thing that can be missing: an entry whose food had
 * been deleted from under it came back with a null relation and threw here.
 */
type RefineEntry = {
  id: string
  user_id: string
  quantity: number
  scan_id: string | null
  display_label: string | null
  food_id: string | null
  item_name: string | null
  base_kcal: number | null
  base_carbs_g: number | string | null
  base_protein_g: number | string | null
  base_fat_g: number | string | null
  serving_label: string | null
  serving_factor: number | null
  food_log_ingredients: Array<{
    id: string
    quantity: number
    display_label: string | null
    item_name: string | null
  }>
}

/** One row of `food_log_ingredient_details`, as this function reads it. */
type PartRow = {
  name: string | null
  quantity: number | string | null
  kcal: number | null
  carbs_g: number | string | null
  protein_g: number | string | null
  fat_g: number | string | null
  position: number | null
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
  db: SupabaseClient,
  entryId: string,
  name: string,
): Promise<{
  quantity: number
  kcal: number
  ingredients: Array<{ name: string; kcal: number; quantity: number }>
} | null> {
  const { data } = await db
    .from('food_log_ingredient_details')
    .select('name, quantity, kcal, carbs_g, protein_g, fat_g, position')
    .eq('food_log_id', entryId)
    .order('position')

  // Named for the same reason the entry above is: an untyped client hands back
  // a row it cannot describe, and every field read off it is unchecked.
  const rows = data as PartRow[] | null
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

  // The parent is the sum of these parts, written onto the entry itself.
  //
  // It used to be a shared `foods` row upserted on the normalized name, which
  // meant the figure that came back was not always the figure just computed —
  // somebody else's plate of the same name may have been priced differently —
  // and `quantity` existed here to absorb that drift. With the numbers on the
  // entry there is no other plate to collide with, so this is exactly the sum
  // at one portion, and `quantity` is 1 by construction.
  const { error: updateError } = await db
    .from('food_logs')
    .update({
      // A plate rebuilt from its own parts is nothing in any catalogue, so both
      // references are cleared rather than left pointing at whatever the entry
      // used to be. Leaving `food_id` behind would attribute this total to a
      // dish that no longer describes it.
      food_id: null,
      serving_id: null,
      item_name: name,
      item_brand: null,
      item_place: null,
      base_kcal: Math.round(sum.kcal),
      base_carbs_g: round1(sum.carbs),
      base_protein_g: round1(sum.protein),
      base_fat_g: round1(sum.fat),
      base_fibre_g: null,
      base_sugar_g: null,
      base_sodium_mg: null,
      serving_label: '1 serving',
      serving_factor: 1,
      serving_grams: null,
      quantity: 1,
      display_label: name,
    })
    .eq('id', entryId)
  if (updateError) return null

  return {
    quantity: 1,
    kcal: Math.round(sum.kcal),
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

  // Correcting a meal by describing it is a model call like any other, so it asks
  // the same two questions scan-meal asks. Editing the portion by hand on the
  // detail screen is not gated: no model is involved, and a subscription that
  // lapses should not trap somebody's existing diary behind a paywall.
  //
  // The whole endpoint is Pro, unlike the photographed plate that reaches
  // `scan-meal`. Fixing a meal with a sentence is the most expensive thing a user
  // can ask for per unit of value, since the entry already exists and already has
  // numbers on it, and it is the one path with a free alternative sitting right
  // beside it: every figure it would change is editable by hand, on the same
  // screen, for nothing.
  try {
    await requireEntitlement(db, userId, 'refine')
    await claimScan(db, userId)
  } catch (error) {
    if (error instanceof NotEntitled) {
      return json(
        { ok: false, code: 'not_entitled', feature: error.feature, error: 'subscription required' },
        402,
      )
    }
    if (error instanceof ScanLimitReached) {
      return json(
        {
          ok: false,
          code: 'scan_limit',
          used: error.used,
          limit: error.dailyLimit,
          entitled: error.entitled,
          error: error.message,
        },
        429,
      )
    }
    throw error
  }
  const meter = createMeter()

  // The entry, with enough context for the interpreter. service_role reads it, so
  // ownership is checked explicitly: this function must not be a way to edit
  // someone else's diary.
  //
  // The shape is declared rather than inferred. `createClient` here carries no
  // `Database` generic, so supabase-js parses the select string on its own and
  // gives up on the embedded relations, and every field of the result then comes
  // back as an error union. Casting each relation separately bought silence for
  // three of them and left the other forty unchecked. One name for the row is the
  // honest version, and it is also the documentation for what this function needs
  // from the diary.
  const { data } = await db
    .from('food_logs')
    .select(
      'id, user_id, quantity, scan_id, display_label, food_id, ' +
        'item_name, base_kcal, base_carbs_g, base_protein_g, base_fat_g, ' +
        'serving_label, serving_factor, ' +
        'food_log_ingredients(id, quantity, display_label, item_name)',
    )
    .eq('id', body.food_log_id)
    .single()

  const entry = data as RefineEntry | null
  if (!entry || entry.user_id !== userId) {
    return json({ ok: false, error: 'entry not found' }, 404)
  }

  const parts = entry.food_log_ingredients
  const partName = (part: RefineEntry['food_log_ingredients'][number]) =>
    part.display_label ?? part.item_name ?? ''

  // The breakdown WITH its numbers. The interpreter is asked for a calorie
  // delta for one part, and it cannot compute a fraction of a portion it has
  // only been told the name of — see `RefineContext.ingredients`. One extra
  // read, and only when the entry has parts at all.
  const partKcal = new Map<string, number>()
  if (parts.length) {
    const { data: rows } = await db
      .from('food_log_ingredient_details')
      .select('id, kcal')
      .eq('food_log_id', entry.id)
    for (const row of (rows ?? []) as Array<{ id: string; kcal: number | null }>) {
      partKcal.set(row.id, Number(row.kcal ?? 0))
    }
  }

  try {
    const interpretation = await interpretInstruction(
      {
        name: entry.display_label ?? entry.item_name ?? '',
        kcal: Math.round(
          Number(entry.base_kcal ?? 0) * Number(entry.serving_factor ?? 1) * Number(entry.quantity),
        ),
        quantity: Number(entry.quantity),
        servingLabel: entry.serving_label ?? '1 serving',
        ingredients: parts.map((part) => ({
          name: partName(part),
          quantity: Number(part.quantity),
          kcal: partKcal.get(part.id) ?? 0,
        })),
      },
      instruction,
      mock,
      meter,
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
      // A plate that has a breakdown is corrected through it. "No sambal" means one row
      // leaves the list and the plate is what is left; "add a fried egg" means one row
      // joins it. Then the entry is re-priced from the sum of its parts, exactly the
      // way tier 2 built it in the first place, so the total and the list can never
      // drift apart.
      //
      // The old path could only add the delta to the entry's own figure, and then had
      // to delete the breakdown to stop it contradicting the total. That is the bug
      // this replaces: one correction and the plate forgot what was on it.
      //
      // Exact name first, then either direction of containment: the model is asked to
      // copy the ingredient's name and mostly does, but "the chicken" has to find
      // "fried chicken wing" too.
      const findPart = (wanted: string | null) => {
        const needle = wanted?.toLowerCase().trim() ?? ''
        if (!needle) return undefined
        return (
          parts.find((part) => partName(part).toLowerCase() === needle) ??
          parts.find((part) => {
            const name = partName(part).toLowerCase()
            return name.includes(needle) || needle.includes(name)
          })
        )
      }
      const match = findPart(interpretation.part)
      const swapped = findPart(interpretation.replaces)

      if (swapped && interpretation.part) {
        // ONE PART BECAME A DIFFERENT FOOD. The row is replaced in place: same
        // count, same position, priced from what it used to cost plus the
        // model's delta for the swap — so the three parts nobody mentioned are
        // untouched, which is the whole reason this is not a redescribe.
        const held = Math.max(0.25, Number(swapped.quantity))
        const before = partKcal.get(swapped.id) ?? 0
        // The model's own price for the new food when it gave one, and only
        // the delta as a fallback. See `Interpretation.part_kcal`: asked what
        // rendang chicken costs it answers 280; asked how it differs from a
        // 247 kcal fried chicken it answered -172, which is 75 kcal of rendang.
        const after = Math.max(
          10,
          Math.round(interpretation.part_kcal ?? before + interpretation.kcal_delta),
        )
        const perUnit = Math.max(1, Math.round(after / held))
        await db
          .from('food_log_ingredients')
          .update({
            // The new food is nothing in any catalogue, so the reference goes
            // rather than being left pointing at what this part used to be.
            food_id: null,
            serving_id: null,
            item_name: interpretation.part.slice(0, 120),
            base_kcal: perUnit,
            base_carbs_g: Math.round((perUnit * 0.5) / 4),
            base_protein_g: Math.round((perUnit * 0.2) / 4),
            base_fat_g: Math.round((perUnit * 0.3) / 9),
            serving_label: '1 serving',
            serving_factor: 1,
            quantity: refineQuantity(held),
            display_label: interpretation.part.slice(0, 120),
          })
          .eq('id', swapped.id)
      } else if (match && interpretation.total) {
        // The user said how many there ARE. "Only 3 skewers" sets that part to
        // three and leaves the rest of the plate alone — read as a change it
        // would be nine, and read as a portion of the whole dish (which is
        // where it used to land) it halved the lontong nobody mentioned.
        await db
          .from('food_log_ingredients')
          .update({ quantity: refineQuantity(interpretation.total) })
          .eq('id', match.id)
      } else if (match && interpretation.count) {
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
        // Less of something, with no number given. How much less decides
        // whether the part goes or shrinks.
        //
        // It used to always go, which is right for "no sambal" — a fifty
        // calorie delta against a sixty calorie part IS the whole part — and
        // destructive for anything else. A correction the interpreter read as
        // a small reduction took a 384 kcal row of satay off the plate
        // outright, and there is no undo on an ingredient.
        const { data: row } = await db
          .from('food_log_ingredient_details')
          .select('kcal, quantity')
          .eq('id', match.id)
          .single()
        // Not `partKcal`: that name is the map above, and shadowing it here
        // hid which of the two a reader was looking at.
        const partCost = Number(row?.kcal ?? 0)
        const removed = Math.abs(interpretation.kcal_delta)

        if (partCost <= 0 || removed >= partCost * REMOVES_THE_PART) {
          await db.from('food_log_ingredients').delete().eq('id', match.id)
        } else {
          const left = Number(row?.quantity ?? 1) * (1 - removed / partCost)
          await db
            .from('food_log_ingredients')
            .update({ quantity: refineQuantity(Math.max(0.25, left)) })
            .eq('id', match.id)
        }
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
        await db.from('food_log_ingredients').insert({
          food_log_id: entry.id,
          food_id: null,
          serving_id: null,
          item_name: added.slice(0, 120),
          base_kcal: kcal,
          base_carbs_g: Math.round((kcal * 0.5) / 4),
          base_protein_g: Math.round((kcal * 0.2) / 4),
          base_fat_g: Math.round((kcal * 0.3) / 9),
          serving_label: '1 serving',
          serving_factor: 1,
          quantity: 1,
          display_label: added.slice(0, 120),
          position: parts.length,
        })
      }

      const rebuilt = await rebuildFromParts(db, entry.id, interpretation.name)
      if (!rebuilt) throw new Error('could not re-price the plate')

      // No food id: a plate rebuilt from its own parts is not a catalogue row.
      await recordRefine(2, null, rebuilt.quantity)
      return json({
        ok: true,
        applied: true,
        action: 'adjust',
        entry: {
          id: entry.id,
          foodId: null,
          name: interpretation.name,
          quantity: rebuilt.quantity,
          kcal: rebuilt.kcal,
          ingredients: rebuilt.ingredients,
        },
      })
    }

    if (interpretation.action === 'adjust') {
      // The same dish, one part changed. The base stays the catalogue figure the entry
      // already trusts; only the delta is the model's, so "no sambal" can never
      // re-guess the whole plate. Macros scale proportionally, which keeps Atwater
      // consistency by construction.
      //
      // The delta is for the whole correction, so it has to be divided by the portion
      // count before it is added to one portion, since the row below is priced per
      // serving and then multiplied by the quantity again. Added flat, "add a fried
      // egg" to an entry logged at half a plate put half an egg on it.
      const factor = Number(entry.serving_factor ?? 1)
      const portionKcal = Number(entry.base_kcal ?? 0) * factor
      const perPortionDelta = interpretation.kcal_delta / Math.max(0.25, Number(entry.quantity))
      const target = Math.max(20, Math.round(portionKcal + perPortionDelta))
      const scale = target / Math.max(1, portionKcal)
      const round1 = (value: number) => Math.round(value * 10) / 10

      // The adjusted figures replace the entry's own, and the quantity does not move.
      // It used to: the row was a shared estimate deduped on the name, so an earlier
      // variant priced differently could come back instead, and the quantity absorbed
      // that. Nothing is shared now, so `target` is what this entry is worth per
      // portion and the portion count the user chose is left where they put it.
      //
      // The portion collapses to a plain "1 serving" because these numbers are no
      // longer per a catalogue serving that a factor scales: the factor is already in
      // them, via `portionKcal`. Keeping a "Half" label over a base that already means
      // half would double the discount at the next read.
      const quantity = refineQuantity(Number(entry.quantity))
      const { error: updateError } = await db
        .from('food_logs')
        .update({
          food_id: null,
          serving_id: null,
          item_name: interpretation.name,
          item_brand: null,
          item_place: null,
          base_kcal: target,
          base_carbs_g: round1(Number(entry.base_carbs_g ?? 0) * factor * scale),
          base_protein_g: round1(Number(entry.base_protein_g ?? 0) * factor * scale),
          base_fat_g: round1(Number(entry.base_fat_g ?? 0) * factor * scale),
          base_fibre_g: null,
          base_sugar_g: null,
          base_sodium_mg: null,
          serving_label: '1 serving',
          serving_factor: 1,
          serving_grams: null,
          quantity,
          display_label: interpretation.name,
        })
        .eq('id', entry.id)
      if (updateError) throw updateError

      // The parts list described the pre-adjustment plate.
      await db.from('food_log_ingredients').delete().eq('food_log_id', entry.id)

      await recordRefine(null, null, quantity)
      return json({
        ok: true,
        applied: true,
        action: 'adjust',
        entry: {
          id: entry.id,
          foodId: null,
          name: interpretation.name,
          quantity,
          kcal: Math.round(target * quantity),
          ingredients: [],
        },
      })
    }

    if (interpretation.action === 'redescribe') {
      const scanId = entry.scan_id ?? crypto.randomUUID()
      const item = interpretation.item
      const resolved =
        (await resolveItem(db, scanId, item, mock, meter)) ??
        (await resolveByArchetype(db, item, mock, meter))

      const { error } = await db
        .from('food_logs')
        .update({
          food_id: resolved.food.id,
          serving_id: resolved.food.serving_id,
          // The whole snapshot, because a redescribe is a different food: every
          // number the entry carries described the dish that was just corrected
          // away. Leaving any of them behind would put the old plate's macros
          // under the new plate's name.
          item_name: resolved.food.name,
          item_brand: null,
          item_place: resolved.food.place,
          base_kcal: Math.round(resolved.food.kcal),
          base_carbs_g: resolved.food.carbs,
          base_protein_g: resolved.food.protein,
          base_fat_g: resolved.food.fat,
          base_fibre_g: resolved.food.fibre,
          base_sugar_g: resolved.food.sugar,
          base_sodium_mg: resolved.food.sodium,
          serving_label: resolved.food.servingLabel,
          serving_factor: 1,
          serving_grams: resolved.food.servingGrams,
          quantity: resolved.quantity,
          display_label: resolved.displayLabel,
          scan_id: scanId,
          // The drawing described the OLD food, the same way the breakdown
          // below did. A typed meal is illustrated from its own name (see
          // `icons.ts`), so a redescribe leaves a picture of the dish that was
          // just corrected away sitting on the dish that replaced it. Cleared
          // rather than re-chosen: the row falls back to the blank tile every
          // hand-logged entry has, and the detail screen has a picker.
          icon_set: null,
          icon_name: null,
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
