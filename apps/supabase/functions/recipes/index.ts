// The recipe endpoint: fill a form in from a photo, and review one for the
// community.
//
// Two actions rather than two functions, for the reason `photos` gives: each
// function costs a config block, an import map and a full restart of the local
// stack to appear, and these two share their auth, their body handling and
// their error shape line for line.
//
// The two halves fail in opposite directions, and that is the whole design.
//
//   `read`   is a CONVENIENCE. It fills a form the user is about to check, so a
//            failure answers 200 with `ok: false` and the form opens empty.
//            Nothing has been written and nothing is lost.
//
//   `review` is a GATE. The recipe is already `is_public` and already
//            `pending` — `set_recipe_public` put it there, and the community
//            tab reads `approved` only. So every failure path here leaves it
//            pending, which is invisible. There is no branch in this file that
//            approves a recipe because something went wrong.
//
// The model never sees a credential and the client never sees the model. As
// everywhere else: OPENROUTER_API_KEY unset means mock, so a local stack runs
// this with no configuration and production can never mock silently.

import '@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  claimScan,
  createMeter,
  NotEntitled,
  requireEntitlement,
  ScanLimitReached,
} from '../_shared/entitlement.ts'
import { mockActive } from '../_shared/llm.ts'
import { ownsKey, readObject } from '../_shared/r2.ts'
import {
  describeRecipe,
  type RecipeMockSteer,
  type ReviewInput,
  readRecipePhoto,
  reviewRecipe,
  toIngredientRow,
} from '../_shared/recipe.ts'

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
type ReviewRequest = { action: 'review'; recipe_id?: string; mock?: RecipeMockSteer }
type RecipeRequest = ReadRequest | ReviewRequest

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** The photo, base64'd for the vision call. Same shape as scan-meal's. */
async function fetchPhoto(path: string): Promise<string> {
  const bytes = await readObject(path)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/**
 * Everything the reviewer is shown, read as `service_role`.
 *
 * Ownership is checked by the caller before this runs — service_role is above
 * every policy there is, so a recipe id arriving from the client has to be
 * proven to be the caller's HERE or not at all.
 */
async function loadForReview(db: SupabaseClient, recipeId: string) {
  const { data: recipe } = await db
    .from('recipe_details')
    .select('name, owner_id, servings, steps, is_public')
    .eq('id', recipeId)
    .maybeSingle()

  if (!recipe) return null

  // No calorie columns. The reviewer decides whether this is a recipe and
  // whether it is fit to read; the figures are the app's own arithmetic and
  // showing them only invites a verdict on them. See `ReviewInput`.
  const { data: ingredients } = await db
    .from('recipe_ingredient_details')
    .select('name, amount, unit')
    .eq('recipe_id', recipeId)
    .order('position')

  return { recipe, ingredients: ingredients ?? [] }
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

  // Steering is a test affordance; outside mock mode it is ignored entirely.
  const mock = mockActive() ? body.mock : undefined

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Counts what this invocation spends at OpenRouter, for the logs. The QUOTA
  // is claimed inside `read` alone, one unit for the whole action, and so is
  // the entitlement check: filling a form in from a photograph is the same kind
  // of AI convenience a described meal is, and Pro for the same reason. The
  // publish review is a gate the app runs on its own behalf — it must go on
  // running for anybody who can reach the publish button, and charging a user's
  // daily allowance for a check they did not ask for would be the app billing
  // them for its own moderation.
  const meter = createMeter()

  // -- READ: a photograph of the pot, or a description of it, becomes a
  // filled-in form. One action rather than two, because everything after the
  // first model call is identical — the shaping, the per-unit division, the
  // "nothing here" answer — and the two differ only in what is handed to the
  // model. The same split `scan-meal` makes between a photographed meal and a
  // typed one.
  if (body.action === 'read') {
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

  // -- REVIEW: the gate in front of the community tab.
  if (body.action === 'review') {
    const recipeId = typeof body.recipe_id === 'string' ? body.recipe_id : null
    if (!recipeId) return json({ ok: false, error: 'recipe_id is required' }, 400)

    const loaded = await loadForReview(db, recipeId)
    if (!loaded) return json({ ok: false, error: 'recipe not found' }, 404)

    // Owner-checked against the service-role read above. Official recipes have
    // no owner and so match nobody, which is right: the kitchen's own recipes
    // do not go through this.
    if (loaded.recipe.owner_id !== userId) {
      return json({ ok: false, error: 'not your recipe' }, 403)
    }
    // Reviewing a recipe nobody asked to publish would write a verdict onto a
    // private row, and the next publish would inherit it without being read.
    if (!loaded.recipe.is_public) {
      return json({ ok: false, error: 'recipe is not public' }, 400)
    }

    const input: ReviewInput = {
      name: loaded.recipe.name ?? '',
      servings: loaded.recipe.servings ?? 1,
      steps: loaded.recipe.steps ?? '',
      ingredients: loaded.ingredients.map((i) => ({
        name: i.name ?? '',
        amount: Number(i.amount ?? 0),
        unit: i.unit ?? 'g',
      })),
    }

    let verdict: { approved: boolean; reason: string }
    try {
      verdict = await reviewRecipe(input, mock, meter)
    } catch (error) {
      // The gate failed shut. The recipe stays `pending` and so stays out of
      // the community tab; the client is told to try again rather than told it
      // was rejected, because nobody read it.
      console.error('[recipes/review]', error)
      return json({ ok: false, status: 'pending', error: 'the review could not run' })
    }

    const status = verdict.approved ? 'approved' : 'rejected'
    const { error: writeError } = await db
      .from('recipes')
      .update({
        review_status: status,
        review_note: verdict.approved ? null : verdict.reason || null,
      })
      .eq('id', recipeId)

    if (writeError) {
      console.error('[recipes/review] write failed:', writeError)
      return json({ ok: false, status: 'pending', error: 'the verdict could not be saved' })
    }

    return json({ ok: true, status, reason: verdict.reason })
  }

  return json({ ok: false, error: 'unknown action' }, 400)
})
