// The recipe endpoint: fill a form in from a photo, and import one from a
// cooking video (`import.ts`).
//
// Actions rather than functions, for the reason `photos` gives: each
// function costs a config block, an import map and a restart of the local stack,
// and these two share their auth, body handling and error shape.
//
// `read` is a convenience. It fills a form the user is about to check, so a
// failure answers 200 with `ok: false` and the form opens empty.
//
// `review` used to be a model reading a recipe before the community saw it.
// Publishing lists a recipe at once now (`set_recipe_public`), but released
// apps still call `review` after publishing and after editing a public recipe,
// so it stays and reports the state the database already holds.
//
// The model never sees a credential and the client never sees the model.
// OPENROUTER_API_KEY unset means mock, so a local stack runs with no
// configuration and production can never mock silently.

import { createClient } from '@supabase/supabase-js'
import { signedIn } from '../_shared/auth.ts'
import {
  claimScan,
  createMeter,
  NotEntitled,
  requireEntitlement,
  ScanLimitReached,
} from '../_shared/entitlement.ts'
import { json, respondWithin } from '../_shared/http.ts'
import { mockActive, photoBase64 } from '../_shared/llm.ts'
import { readSessionId } from '../_shared/posthog.ts'
import { ownsKey, readObject } from '../_shared/r2.ts'
import {
  describeRecipe,
  type RecipeMockSteer,
  readRecipePhoto,
  toIngredientRow,
} from '../_shared/recipe.ts'
import { handleImport, type ImportRequest } from './import.ts'

type ReadRequest = {
  action: 'read'
  photo_path?: string
  /**
   * The recipe in words, for a cook who would rather type it than photograph
   * it. Read only when there is no `photo_path`: a request carrying both has a
   * picture of the food, and a picture is the better evidence of what is in the
   * pot. Same precedence `scan-meal` gives a typed meal.
   */
  text?: string
  mock?: RecipeMockSteer
}
type ReviewRequest = { action: 'review'; recipe_id?: string }
type RecipeRequest = ReadRequest | ReviewRequest | ImportRequest

/** The photo, base64'd for the vision call. Same shape as scan-meal's. */
async function fetchPhoto(path: string): Promise<string> {
  return photoBase64(await readObject(path))
}

Deno.serve(async (req: Request) => {
  const caller = await signedIn(req)
  if (caller instanceof Response) return caller
  const { userId } = caller

  // `req.json()` parses any JSON, including `null`, a bare string and a number,
  // and every one of those makes `body.action` throw a TypeError OUTSIDE the try
  // blocks below — which `Deno.serve` turns into an opaque 500 rather than the
  // 400 this is trying to be.
  let body: RecipeRequest
  try {
    const parsed = await req.json()
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ ok: false, error: 'body must be a JSON object' }, 400)
    }
    body = parsed as RecipeRequest
  } catch {
    return json({ ok: false, error: 'body is not JSON' }, 400)
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Counts what this invocation spends at OpenRouter, for the logs. The QUOTA
  // is claimed inside `read` alone, one unit for the whole action, and so is
  // the entitlement check: filling a form in from a photograph is the same kind
  // of AI convenience a described meal is, and Pro for the same reason.
  const meter = createMeter({
    distinctId: userId,
    feature: 'recipes',
    sessionId: readSessionId(req),
  })

  // -- READ: a photograph of the pot, or a description of it, becomes a
  // filled-in form. One action rather than two, because everything after the
  // first model call is identical — the shaping, the per-unit division, the
  // "nothing here" answer — and the two differ only in what is handed to the
  // model. The same split `scan-meal` makes between a photographed meal and a
  // typed one.
  if (body.action === 'read') {
    // Steering is a test affordance; outside mock mode it is ignored entirely.
    const mock = mockActive() ? body.mock : undefined
    const photoPath = typeof body.photo_path === 'string' ? body.photo_path : null
    // Capped like a refine instruction and a described meal. A recipe takes a
    // few sentences; past this is prose, and the model charges by the token.
    const described = photoPath ? '' : (body.text ?? '').trim().slice(0, 1000)

    if (!photoPath && !described) {
      return json({ ok: false, error: 'photo_path or text is required' }, 400)
    }
    // The object is read as `service_role`, above every check there is, so the
    // key is proven to be the caller's here — exactly as in scan-meal. Without
    // it, naming somebody else's plate would tell you what was on it.
    if (photoPath && !ownsKey(photoPath, userId, 'meal')) {
      return json({ ok: false, error: 'not your photo' }, 403)
    }

    try {
      await requireEntitlement(db, userId, 'read_recipe')
      await claimScan(db, userId)
      const draft = described
        ? await describeRecipe(described, mock, meter)
        : await readRecipePhoto(
            mockActive() ? null : await fetchPhoto(photoPath as string),
            mock,
            meter,
          )

      // Nothing cookable in it. Not an error — the user pointed the camera at
      // something, or typed something that is not food, and the honest answer
      // is "there is nothing here to fill in", which the form shows as itself,
      // empty.
      if (!draft.name && draft.ingredients.length === 0) {
        return json({ ok: true, food: false, draft: null })
      }

      return json({
        ok: true,
        food: true,
        // Per-unit already, so the client can hand these straight to
        // `recipe_ingredients` without doing the division itself — there is one
        // definition of what a per-unit figure is and it is in `recipe.ts`.
        draft: {
          name: draft.name,
          servings: draft.servings,
          steps: draft.steps,
          // Two loose columns rather than the pair, because that is what
          // `recipes.icon_set` / `icon_name` are and the client writes them
          // straight through. Null on the photo path, where the photograph is
          // the picture.
          icon_set: draft.icon?.set ?? null,
          icon_name: draft.icon?.name ?? null,
          ingredients: draft.ingredients.map(toIngredientRow),
        },
      })
    } catch (error) {
      console.error('[recipes/read]', error)
      // The two refusals answer with a code and a status, so the form can send
      // the user to the paywall or say what happened. Everything else here is
      // "the model could not read it", which the form answers by letting them
      // fill it in themselves.
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
      return json({
        ok: false,
        error: error instanceof Error ? error.message : 'could not read the photo',
      })
    }
  }

  // -- IMPORT: a cooking video becomes a recipe. Metered by its own monthly
  // allowance rather than by scans; see `import.ts`.
  if (body.action === 'import') {
    return respondWithin(handleImport(body, { db, userId, meter }))
  }

  // -- REVIEW: what a released app asks after publishing or editing a public
  // recipe. No model reads anything; the answer is the state
  // `set_recipe_public` wrote. A 1.x app shows "published" for `ok: true` and
  // "still looking at it" for `ok: false`, which is what a recipe parked by
  // reports, or one the old reviewer rejected, should say.
  if (body.action === 'review') {
    const recipeId = typeof body.recipe_id === 'string' ? body.recipe_id : null
    if (!recipeId) return json({ ok: false, error: 'recipe_id is required' }, 400)

    const { data: recipe } = await db
      .from('recipes')
      .select('owner_id, is_public, review_status')
      .eq('id', recipeId)
      .maybeSingle()
    // Owner-checked against the service-role read, so this cannot tell a
    // caller anything about somebody else's recipe.
    if (!recipe || recipe.owner_id !== userId) {
      return json({ ok: false, error: 'recipe not found' }, 404)
    }
    if (!recipe.is_public) return json({ ok: false, error: 'recipe is not public' }, 400)
    if (recipe.review_status !== 'approved') return json({ ok: false, status: 'pending' })
    return json({ ok: true, status: 'approved' })
  }

  return json({ ok: false, error: 'unknown action' }, 400)
})
