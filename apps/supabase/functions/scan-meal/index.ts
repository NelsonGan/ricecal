// The meal-recognition endpoint: a photographed plate, or a typed one.
//
// The cascade itself lives in _shared/cascade.ts, shared with scan-refine —
// this file is auth, the first model call, and the loop. Which model call is
// the only difference between the two inputs: a photo goes to `analysePhoto`
// and a sentence to `describeMeal`, both answer in the same `Vision` shape,
// and from there the catalogue search, the verifier, the estimate and the
// archetype floor are line-for-line the same. Text is not a lesser path with
// its own arithmetic; it is the same pipeline asked a question in words.
//
// Once the caller is authenticated and the body parses, this function does not
// return an HTTP error: any failure in tiers 1-4 falls to the archetype floor,
// and a floor failure still answers 200 with `ok: false` so the client can
// keep its pending row and retry. The numbers the user sees always come from
// a `foods` row — an LLM figure is never averaged with a catalogue figure.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import {
  describe,
  resolveByArchetype,
  resolveByLabel,
  resolveItem,
  type WrittenEntry,
  writeEntry,
} from '../_shared/cascade.ts'
import {
  analysePhoto,
  describeMeal,
  foldMealItems,
  type MockSteer,
  mockActive,
  type Vision,
  type VisionItem,
} from '../_shared/llm.ts'
import { ownsKey, readObject } from '../_shared/r2.ts'

type ScanRequest = {
  photo_path?: string
  /**
   * The meal in words, for a log that had no camera in it. Only read when
   * there is no `photo_path`: a request carrying both has a picture of the
   * food, and a picture is the better evidence of what is on the plate.
   */
  text?: string
  log_date: string
  mock?: MockSteer
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
  const logDate = /^\d{4}-\d{2}-\d{2}$/.test(body.log_date ?? '') ? body.log_date : null
  if (!logDate) return json({ ok: false, error: 'log_date is required' }, 400)

  const photoPath = typeof body.photo_path === 'string' ? body.photo_path : null
  // The object is read as `service_role`, which is above every check there is,
  // so the key has to be checked HERE or not at all. Without this the caller
  // could name someone else's plate and be told what was on it — not the image
  // back, but the dish name and the calories, which is most of the answer.
  //
  // It was equally unchecked when this read Supabase Storage: the download ran
  // as `service_role` there too, and the bucket policies never saw it.
  if (photoPath && !ownsKey(photoPath, userId, 'meal')) {
    return json({ ok: false, error: 'not your photo' }, 403)
  }
  // Same ceiling as a refine instruction. A meal takes a sentence to describe;
  // anything past this is prose, and the model charges by the token for it.
  const description = photoPath ? '' : (body.text ?? '').trim().slice(0, 500)
  // Steering is a test affordance; outside mock mode it is ignored entirely.
  const mock = mockActive() ? body.mock : undefined

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const scanId = crypto.randomUUID()
  const source = description ? 'text' : 'camera'
  // Stage failures, readable two ways: always in the function logs, and in
  // the response when the caller asks (`debug: true`) — nothing secret is in
  // here, and "which tier failed and why" is exactly what a bug report needs.
  const trace: string[] = []
  const wantDebug = (body as { debug?: boolean }).debug === true

  /** Read the photo out of the bucket, as base64 for the vision call. */
  const fetchPhoto = async (path: string): Promise<string> => {
    const bytes = await readObject(path)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(binary)
  }

  try {
    // -- The first model call. A failure here — network, model, no photo —
    // skips straight to the archetype floor with no item context: the
    // terminal row.
    //
    // One meal, one entry, whichever way it was described: if the model split
    // the tray into per-side items, `foldMealItems` puts them back into a
    // single composite plate with the parts as its breakdown.
    let vision: Vision | null = null
    try {
      const photoBase64 = photoPath && !mockActive() ? await fetchPhoto(photoPath) : null
      vision = foldMealItems(
        description ? await describeMeal(description, mock) : await analysePhoto(photoBase64, mock),
      )
    } catch (error) {
      const message = `[vision] ${describe(error)}`
      console.error(message)
      trace.push(message)
      vision = null
    }

    // A photographed nutrition panel: the numbers are printed in the picture,
    // so nothing here has to be guessed and nothing below this line runs.
    if (vision?.label) {
      const resolved = await resolveByLabel(vision.label)
      if (resolved) {
        const entry = await writeEntry(db, {
          userId,
          logDate,
          scanId,
          resolved,
          photoPath,
          suggestedEdits: [],
          source,
        })
        await db.from('food_scan_items').insert({
          user_id: userId,
          scan_id: scanId,
          item_index: 0,
          scene: 'packaged',
          specific_query: vision.label.name,
          serving_hint: vision.label.serving,
          resolved_tier: 1,
          resolved_food_id: resolved.food.id,
          catalogue_kcal: resolved.food.kcal,
          quantity: resolved.quantity,
          food_log_id: entry.id,
        })
        return json({
          ok: true,
          scanId,
          label: true,
          entries: [entry],
          breakdown: false,
          ...(wantDebug ? { trace } : {}),
        })
      }
      trace.push('[label] could not create a row for the panel')
    }

    // Nothing edible in the photo. No entry, no archetype floor, no calories —
    // the floor exists to keep a MEAL from being lost, and this is not a meal.
    // The client keeps its row and says so, with a way to dismiss it.
    if (vision?.noFood) {
      return json({ ok: true, scanId, food: false, entries: [], ...(wantDebug ? { trace } : {}) })
    }

    const items: Array<VisionItem | null> = vision?.items ?? [null]
    const scene = vision?.scene ?? 'unclear'

    const written: WrittenEntry[] = []
    let firstEntry = true

    for (const [index, item] of items.entries()) {
      const resolved = item
        ? ((await resolveItem(db, scanId, item, mock, trace)) ??
          (await resolveByArchetype(db, item, mock)))
        : await resolveByArchetype(db, null, mock)

      const entry = await writeEntry(db, {
        userId,
        logDate,
        scanId,
        resolved,
        // On the first row only: N copies of one photo would render the same
        // plate N times in the diary.
        photoPath: firstEntry ? photoPath : null,
        suggestedEdits: item?.suggested_edits ?? [],
        source,
        // Only ever set on the typed path — the prompt that asks for it is the
        // one with no photograph behind it. See `writeEntry`.
        icon: item?.icon ?? null,
      })
      firstEntry = false
      written.push(entry)

      // The eval row: what the model claimed, what was accepted, which tier.
      await db.from('food_scan_items').insert({
        user_id: userId,
        scan_id: scanId,
        item_index: index,
        // What the user typed, when they typed it. The model's queries below
        // are its reading of this sentence, and "which phrasings does it read
        // badly" is only answerable with both halves on the row.
        described_text: description || null,
        scene,
        specific_query: item?.specific_query ?? null,
        generic_query: item?.generic_query ?? null,
        components: item?.components ?? null,
        serving_hint: item?.serving_hint ?? null,
        llm_kcal_low: item ? Math.round(item.kcal_low) : null,
        llm_kcal_high: item ? Math.round(item.kcal_high) : null,
        confidence: item?.confidence ?? null,
        resolved_tier: resolved.tier,
        resolved_food_id: resolved.food.id,
        catalogue_kcal: resolved.food.kcal,
        quantity: resolved.quantity,
        food_log_id: entry.id,
      })
    }

    return json({
      ok: true,
      scanId,
      entries: written,
      breakdown: written.some((entry) => entry.ingredients.length > 0),
      ...(wantDebug ? { trace } : {}),
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
