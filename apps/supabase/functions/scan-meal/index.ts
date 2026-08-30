// The meal-recognition endpoint: a photographed plate, or a typed one.
//
// The cascade itself lives in _shared/cascade.ts, shared with scan-refine —
// this file is auth, the first model call, and the loop. Which model call is
// the only difference between the two inputs: a photo goes to `analysePhoto`
// and a sentence to `describeMeal`, both answer in the same `Vision` shape,
// and from there the catalogue search, the verifier and the estimate are
// line-for-line the same. Text is not a lesser path with its own arithmetic; it
// is the same pipeline asked a question in words.
//
// Once the caller is authenticated, the body parses AND the account is allowed
// to be here, this function does not return an HTTP error: a scan that could
// not be resolved answers 200 with `ok: false`, and the client turns its
// pending row into "we could not read that, try again". Whichever tier answers,
// the numbers are that tier's alone — an LLM figure is never averaged with a
// catalogue figure.
//
// A failed scan writes nothing, which is why every item is resolved before any
// of them is written. There used to be a floor under the cascade that could not
// fail, so the loop resolved and wrote one item at a time; without it a plate
// whose second component cannot be priced leaves the first as half a meal.
//
// The two refusals answer with a status rather than `ok: false`, and sit beside
// the auth check rather than inside the cascade: they are statements about who
// is asking, settled before any work starts.
//
// They are asked of different inputs, which is the freemium shape. A typed meal
// needs a subscription; a photographed one spends one of the day's scans, three
// on a free account and fifty on a paid one. So the same endpoint answers 402 to
// one input and 429 to either, and the client reads the `code` in the body.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

import {
  describe,
  type Resolved,
  resolveByLabel,
  resolveItem,
  type WrittenEntry,
  writeEntry,
} from '../_shared/cascade.ts'
import {
  claimScan,
  createMeter,
  NotEntitled,
  requireEntitlement,
  ScanLimitReached,
} from '../_shared/entitlement.ts'
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
  if (photoPath && !ownsKey(photoPath, userId, 'meal')) {
    return json({ ok: false, error: 'not your photo' }, 403)
  }
  // Same ceiling as a refine instruction. A meal takes a sentence to describe;
  // anything past this is prose, and the model charges by the token for it.
  const description = photoPath ? '' : (body.text ?? '').trim().slice(0, 500)
  // Steering is a test affordance; outside mock mode it is ignored entirely.
  const mock = mockActive() ? body.mock : undefined

  // NEITHER A PHOTOGRAPH NOR WORDS. There is nothing here to recognise, and
  // asking anyway would spend one of the day's scans to be told so. Checked
  // before the claim, because a request that carries no evidence is a bad
  // request rather than a scan that went badly.
  if (!photoPath && !description) {
    return json({ ok: false, error: 'photo_path or text is required' }, 400)
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // May this account be here at all, and has it any scans left today? Before the
  // photo is read and before the first model call, because both cost money and
  // neither is refundable once spent.
  //
  // The two inputs are not the same product. Photographing a plate is what the
  // app is for, and a free account gets three a day. Typing a meal costs the same
  // model time for a meal the user could have photographed, so it is Pro.
  //
  // Both checks run in mock mode, or a local stack would be the one place every
  // gating bug is invisible.
  if (description) {
    try {
      await requireEntitlement(db, userId, 'describe')
    } catch (error) {
      if (error instanceof NotEntitled) {
        return json(
          {
            ok: false,
            code: 'not_entitled',
            feature: error.feature,
            error: 'subscription required',
          },
          402,
        )
      }
      throw error
    }
  }
  try {
    await claimScan(db, userId)
  } catch (error) {
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
    // The first model call. A failure here ends the scan: there is no item to
    // resolve and nothing left to guess with.
    //
    // One meal, one entry, whichever way it was described: a model that split the
    // tray into per-side items is put back together by `foldMealItems`.
    let vision: Vision | null = null
    try {
      const photoBase64 = photoPath && !mockActive() ? await fetchPhoto(photoPath) : null
      vision = foldMealItems(
        description
          ? await describeMeal(description, mock, meter)
          : await analysePhoto(photoBase64, mock, meter),
      )
    } catch (error) {
      // Anything that goes wrong here is a model failure, and a model failure
      // is a failed scan. Running out of scans cannot arrive this way: the
      // claim is taken above, before a single request is sent, so the one
      // outcome this catch used to have to re-throw is now unreachable.
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

    // Nothing edible in the photo, said deliberately by the model rather than
    // arrived at by a cascade that ran out of tiers. It answers `ok: true` and a
    // row that offers to be dismissed, where a scan that FAILED answers
    // `ok: false` and a row that offers another go — "there is no food here" and
    // "we could not read this" are different things to be told.
    if (vision?.noFood) {
      return json({ ok: true, scanId, food: false, entries: [], ...(wantDebug ? { trace } : {}) })
    }

    const items: VisionItem[] = vision?.items ?? []
    const scene = vision?.scene ?? 'unclear'

    // The model answered and named no food. Not `noFood`, which is the model
    // saying so deliberately and has its own reply above — this is an answer
    // that came back empty, or a vision call that threw and left `vision` null.
    if (items.length === 0) {
      trace.push('[vision] the model named no food')
      return json({
        ok: false,
        scanId,
        entries: [],
        error: 'could not work out what this was',
        ...(wantDebug ? { trace } : {}),
      })
    }

    /**
     * Everything resolved first, and only then written. The cascade can come back
     * with nothing, so a plate that half resolves is reported as a failure rather
     * than logged as the half that worked. Resolution touches no diary row, so
     * abandoning it leaves nothing behind.
     */
    const resolutions: Array<{ item: VisionItem; resolved: Resolved }> = []
    for (const [index, item] of items.entries()) {
      const resolved = await resolveItem(db, scanId, item, mock, meter, trace)
      if (resolved) {
        resolutions.push({ item, resolved })
        continue
      }
      // The eval row is still written, and it is the most interesting one in
      // the table: what the model saw, and no tier that could price it. This is
      // the catalogue-widening backlog, so losing it because the scan failed
      // would lose exactly the scans worth looking at.
      await db.from('food_scan_items').insert({
        user_id: userId,
        scan_id: scanId,
        item_index: index,
        described_text: description || null,
        scene,
        specific_query: item.specific_query,
        generic_query: item.generic_query,
        components: item.components,
        serving_hint: item.serving_hint,
        llm_kcal_low: Math.round(item.kcal_low),
        llm_kcal_high: Math.round(item.kcal_high),
        confidence: item.confidence,
        resolved_tier: null,
        food_log_id: null,
      })
      trace.push(`[cascade] no tier could price "${item.name}"`)
      return json({
        ok: false,
        scanId,
        entries: [],
        error: 'could not work out what this was',
        ...(wantDebug ? { trace } : {}),
      })
    }

    const written: WrittenEntry[] = []
    let firstEntry = true

    for (const [index, { item, resolved }] of resolutions.entries()) {
      const entry = await writeEntry(db, {
        userId,
        logDate,
        scanId,
        resolved,
        // On the first row only: N copies of one photo would render the same
        // plate N times in the diary.
        photoPath: firstEntry ? photoPath : null,
        suggestedEdits: item.suggested_edits ?? [],
        source,
        // Only ever set on the typed path — the prompt that asks for it is the
        // one with no photograph behind it. See `writeEntry`.
        icon: item.icon ?? null,
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
        specific_query: item.specific_query,
        generic_query: item.generic_query,
        components: item.components,
        serving_hint: item.serving_hint,
        llm_kcal_low: Math.round(item.kcal_low),
        llm_kcal_high: Math.round(item.kcal_high),
        confidence: item.confidence,
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
    // The database went away mid-write, or something else nobody planned for.
    // Still not an HTTP error: the client turns its pending row into one that
    // says the plate could not be read, with a way to try again.
    console.error('[scan-meal] unrecoverable:', error)
    return json({
      ok: false,
      scanId,
      entries: [],
      error: error instanceof Error ? error.message : 'scan failed',
    })
  }
})
