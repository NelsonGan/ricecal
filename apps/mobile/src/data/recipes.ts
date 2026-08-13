import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrap, unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { toIcon, toRecipe, toRecipeIngredient } from './mappers'
import { removeMealPhoto } from './photos'
import { refusalFrom } from './refusals'
import { useUserId } from './session'
import type { IconRef, Macros, Recipe, RecipeIngredient, RecipeUnit } from './types'

/**
 * Home cooking.
 *
 * A recipe is the one thing in this app a user authors. It used to become a
 * catalogue row as well — the database mirrored it into `foods` so that logging
 * it was an ordinary entry against a foreign key — and that mirror is gone with
 * the catalogue. Logging a pot writes the same snapshot everything else does,
 * built from `perServing` by `snapshotFromRecipe`. See
 * `apps/supabase/schemas/22_recipes.sql`.
 *
 * Two writes are RPCs rather than updates, and both for the same reason: they
 * touch columns the client has no grant on. Publishing may only ever move a
 * recipe to `pending`, and saving a copy has to bump a counter on somebody
 * else's row.
 */

/** Which shelf of the list is on screen. Part of the query key. */
export type RecipeShelf = 'mine' | 'official' | 'community'

const RECIPE_COLUMNS = '*'

export function useRecipes(shelf: RecipeShelf, query = '') {
  const userId = useUserId()
  const needle = query.trim()

  return useQuery({
    queryKey: keys.recipes(userId, shelf, needle),
    queryFn: async (): Promise<Recipe[]> => {
      let request = supabase.from('recipe_details').select(RECIPE_COLUMNS)

      if (shelf === 'mine') {
        // `owner_id`, not `is_mine`: a computed column cannot be a filter
        // PostgREST pushes into the index, and this is the list that grows.
        request = request.eq('owner_id', userId).order('created_at', { ascending: false })
      } else if (shelf === 'official') {
        request = request.is('owner_id', null).order('created_at', { ascending: false })
      } else {
        // The community shelf leans on the read policy rather than restating
        // it: `is_public and review_status = 'approved'` is already the only
        // way somebody else's recipe is visible at all, so the filter here is
        // just "not mine, not the kitchen's".
        request = request
          .not('owner_id', 'is', null)
          .neq('owner_id', userId)
          .order('saved_count', { ascending: false })
          .order('created_at', { ascending: false })
      }

      // `ilike` rather than the catalogue's ranked search. That exists because
      // tens of thousands of dishes cannot be ranked by substring matching; a
      // shelf of recipes is tens of rows, and ranking tens of rows is something
      // a person does by reading them.
      if (needle) request = request.ilike('name', `%${needle}%`)

      return unwrap(await request.limit(100)).map(toRecipe)
    },
  })
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: keys.recipe(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Recipe | null> => {
      const row = unwrapMaybe(
        await supabase
          .from('recipe_details')
          .select(RECIPE_COLUMNS)
          .eq('id', id as string)
          .maybeSingle(),
      )
      return row ? toRecipe(row) : null
    },
  })
}

export function useRecipeIngredients(recipeId: string | undefined) {
  return useQuery({
    queryKey: keys.recipeIngredients(recipeId ?? ''),
    enabled: Boolean(recipeId),
    queryFn: async (): Promise<RecipeIngredient[]> =>
      unwrap(
        await supabase
          .from('recipe_ingredient_details')
          .select('*')
          .eq('recipe_id', recipeId as string)
          .order('position'),
      ).map(toRecipeIngredient),
  })
}

/**
 * An ingredient as the form holds it: no id, because the list is rewritten
 * whole on every save.
 *
 * `perUnit` and not a total, matching the column. The form multiplies for
 * display; what it stores is the density, which is what survives the amount
 * being corrected later.
 */
export type RecipeIngredientInput = {
  name: string
  foodId?: string
  amount: number
  unit: RecipeUnit
  perUnit: Macros
}

export type RecipeInput = {
  /** Absent for a new recipe. */
  id?: string
  name: string
  servings: number
  steps?: string
  icon?: IconRef | null
  photoPath?: string | null
  /**
   * The key that was on the row when the form opened, so a replacement can
   * delete the object it orphans. Nothing else reads it — same contract as
   * `EntryPatch.currentPhotoPath`.
   */
  previousPhotoPath?: string
  ingredients: RecipeIngredientInput[]
}

/**
 * What a save did, beyond writing.
 *
 * `review` is present only when the recipe was PUBLIC: editing one sends it
 * back through the reviewer (the database has already reset it to `pending`),
 * and the screen has to say which way that went. Absent means there was nothing
 * to review, not that a review passed.
 */
export type SaveResult = { id: string; review?: PublishResult }

const toIngredientRow = (recipeId: string, input: RecipeIngredientInput, position: number) => ({
  recipe_id: recipeId,
  name: input.name,
  food_id: input.foodId ?? null,
  amount: input.amount,
  unit: input.unit,
  kcal_per_unit: input.perUnit.kcal,
  carbs_g_per_unit: input.perUnit.carbs,
  protein_g_per_unit: input.perUnit.protein,
  fat_g_per_unit: input.perUnit.fat,
  position,
})

/**
 * Create or replace a recipe, in one go.
 *
 * The form stages everything and Save writes the lot, exactly as the entry
 * screen does — so this takes the WHOLE ingredient list and replaces what is
 * stored, rather than diffing it. Nothing anywhere references an ingredient by
 * id across a save, so the ids churning costs nothing and the alternative is a
 * three-way diff to save a handful of rows.
 *
 * The `foods` mirror follows by trigger. That is why this hook can be this
 * short, and why a recipe cannot end up priced differently from the entries
 * logged against it.
 */
export function useSaveRecipe() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RecipeInput): Promise<SaveResult> => {
      const fields = {
        name: input.name.trim(),
        servings: input.servings,
        steps: input.steps?.trim() || null,
        icon_set: input.icon?.set ?? null,
        icon_name: input.icon?.name ?? null,
        photo_path: input.photoPath ?? null,
      }

      const saved = input.id
        ? unwrapOne(
            await supabase
              .from('recipes')
              .update(fields)
              .eq('id', input.id)
              .eq('owner_id', userId)
              .select('id, is_public')
              .single(),
          )
        : unwrapOne(
            await supabase
              .from('recipes')
              // `share_slug` is `not null` with no default, so the generated
              // Insert type demands it — and it is not the client's to supply.
              // The before-insert trigger mints the link, which is a promise
              // Postgres can keep and a column type cannot express. This is the
              // narrowest seam that says so.
              .insert({ ...fields, owner_id: userId } as never)
              .select('id, is_public')
              .single(),
          )
      const recipeId = saved.id

      // Delete then insert, in two statements, which is not atomic: an insert
      // that fails after the delete leaves a recipe with no ingredients. That is
      // survivable HERE and nowhere else — the form still holds the whole staged
      // list, so Save is the retry, and the mirror recomputes from whatever the
      // second attempt lands. It would not be survivable from a background
      // writer, and if one ever appears this belongs in an RPC.
      if (input.id) {
        unwrap(
          await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId).select('id'),
        )
      }

      if (input.ingredients.length > 0) {
        unwrap(
          await supabase
            .from('recipe_ingredients')
            .insert(input.ingredients.map((item, index) => toIngredientRow(recipeId, item, index)))
            .select('id'),
        )
      }

      // After the row, as everywhere else: an object deleted for a row that
      // then failed to write leaves a recipe pointing at nothing.
      if (input.previousPhotoPath && input.previousPhotoPath !== input.photoPath) {
        await removeMealPhoto(input.previousPhotoPath).catch(() => {})
      }

      // A published recipe that has just been rewritten is back at `pending` —
      // the trigger put it there — so it needs reading again before it is
      // listed. See `runReview`: this never throws, and a review that could not
      // run leaves the recipe unlisted rather than unread and live.
      const review = saved.is_public ? await runReview(recipeId) : undefined

      return { id: recipeId, review }
    },
    onSuccess: ({ id: recipeId }) => {
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.recipe(recipeId) })
      queryClient.invalidateQueries({ queryKey: keys.recipeIngredients(recipeId) })
      // Editing a recipe reprices its mirror, and the mirror is what past
      // entries point at — so every day that has ever logged it now shows a
      // different number. Which days those are is not something this mutation
      // can know, hence the whole prefix.
      queryClient.invalidateQueries({ queryKey: keys.dayAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
    },
  })
}

export function useDeleteRecipe() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, photoPath }: { id: string; photoPath?: string }) => {
      unwrap(
        await supabase.from('recipes').delete().eq('id', id).eq('owner_id', userId).select('id'),
      )
      // After the row, as everywhere else: an object deleted for a row that
      // then fails to delete leaves a recipe pointing at nothing.
      if (photoPath) await removeMealPhoto(photoPath)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
    },
  })
}

/**
 * What happened when a recipe was sent for review.
 *
 * `pending` is not a third verdict, it is the absence of one: the review could
 * not run. The recipe is public and invisible, and the screen says "we are
 * still looking at it" rather than claiming either answer.
 */
export type PublishResult = { status: 'approved' | 'rejected' | 'pending'; reason?: string }

/**
 * Send a recipe through the reviewer and report what it said.
 *
 * Shared by publishing and by SAVING, because an edit to a published recipe
 * needs a second reading as much as the first publish did — the database has
 * already put the row back to `pending` by the time this runs (see the trigger
 * in 22_recipes.sql), so a review that never happens leaves it public and
 * unlisted rather than live and unread.
 *
 * Never throws. Every failure resolves to `pending`, which is the honest answer:
 * nobody read it, so it is neither approved nor rejected.
 */
async function runReview(recipeId: string): Promise<PublishResult> {
  const { data, error } = await supabase.functions.invoke('recipes', {
    body: { action: 'review', recipe_id: recipeId },
  })
  if (error) return { status: 'pending' }

  const result = data as { ok?: boolean; status?: string; reason?: string }
  if (!result?.ok) return { status: 'pending' }
  return {
    status: result.status === 'approved' ? 'approved' : 'rejected',
    reason: result.reason,
  }
}

/**
 * Ask for a recipe to be listed in the community, or take it back.
 *
 * Two steps and they are deliberately not one. `set_recipe_public` flips the
 * flag and parks the recipe at `pending` — that part is a database write and
 * cannot fail halfway. Only then does the review run, and a review that never
 * finishes leaves a recipe that is public, pending, and therefore not listed.
 * The opposite order — review first, publish after — would have to hold an
 * approval somewhere while the second write happened, and the somewhere is a
 * client.
 */
export function usePublishRecipe() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      isPublic,
    }: {
      id: string
      isPublic: boolean
    }): Promise<PublishResult> => {
      unwrapMaybe(await supabase.rpc('set_recipe_public', { p_recipe_id: id, p_public: isPublic }))

      if (!isPublic) return { status: 'pending' }
      return runReview(id)
    },
    onSuccess: (_result, { id }) => {
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.recipe(id) })
    },
  })
}

/** Save somebody else's recipe as your own. Returns the new recipe's id. */
export function useSaveRecipeCopy() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (recipeId: string): Promise<string> =>
      unwrapMaybe(
        await supabase.rpc('save_recipe_copy', { p_recipe_id: recipeId }),
      ) as unknown as string,
    onSuccess: (_newId, sourceId) => {
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
      // The original's saved count moved.
      queryClient.invalidateQueries({ queryKey: keys.recipe(sourceId) })
    },
  })
}

/** A recipe form, filled in from a photograph. Null when there was no cooking in it. */
export type ScannedRecipe = {
  name: string
  servings: number
  steps: string
  /**
   * The drawing the model picked for the pot, out of our own set.
   *
   * Only ever set on the DESCRIBED path: a photographed pot arrives with a
   * photograph and the form shows that instead, so the server does not spend a
   * vision call's tokens choosing a picture nothing displays.
   */
  icon?: IconRef
  ingredients: RecipeIngredientInput[]
}

/**
 * Where a drafted recipe came from: a photograph of the pot, or a sentence
 * about it. One or the other, never both.
 */
export type RecipeSource = { photoPath: string } | { text: string }

/**
 * Read a pot out of a photograph, or out of a description of one.
 *
 * ONE HOOK for both, because everything after the request is the same shape and
 * the screen does the same thing with it. Only the model call on the far side
 * differs — the same split `useSnapFood` and `useDescribeFood` make over the
 * meal cascade, folded into one here because a recipe draft is not written
 * anywhere until Save, so there is no second write path to keep apart.
 *
 * A mutation rather than a query because it is an action with a cost, taken
 * once, at a moment the user chose — not a fact about a photo that a screen
 * would want cached and refetched.
 *
 * Nothing is written. What comes back fills the form the user is looking at,
 * and a failure means they fill it in themselves — which is why this resolves
 * to `null` on a bad read rather than throwing at a screen that has a perfectly
 * good empty form to show.
 */
export function useReadRecipe() {
  return useMutation({
    mutationFn: async (source: RecipeSource): Promise<ScannedRecipe | null> => {
      const { data, error } = await supabase.functions.invoke('recipes', {
        body:
          'photoPath' in source
            ? { action: 'read', photo_path: source.photoPath }
            : { action: 'read', text: source.text },
      })
      // A refusal is thrown rather than folded into `null`. Null means "the
      // model could not read it", which the form answers by letting the user
      // fill it in themselves — and telling somebody to type it out by hand is
      // the wrong answer to "you have not subscribed" and to "you are out of
      // requests", both of which the caller turns into something actionable.
      if (error) {
        const refusal = await refusalFrom(error)
        if (refusal) throw refusal
        return null
      }

      const result = data as {
        ok?: boolean
        draft?: {
          name?: string
          servings?: number
          steps?: string
          icon_set?: string | null
          icon_name?: string | null
          ingredients?: Array<{
            name?: string
            amount?: number
            unit?: RecipeUnit
            kcal_per_unit?: number
            carbs_g_per_unit?: number
            protein_g_per_unit?: number
            fat_g_per_unit?: number
          }>
        } | null
      }
      if (!result?.ok || !result.draft) return null

      const draft = result.draft
      return {
        name: draft.name ?? '',
        servings: draft.servings ?? 1,
        steps: draft.steps ?? '',
        // Through the same seam every other icon comes through: two loose
        // columns become the tagged pair `Icon` takes, and a name no set has
        // renders blank rather than crashing.
        icon: toIcon(draft.icon_set ?? null, draft.icon_name ?? null),
        ingredients: (draft.ingredients ?? []).map((item) => ({
          name: item.name ?? '',
          amount: Number(item.amount ?? 0),
          unit: item.unit ?? 'g',
          perUnit: {
            kcal: Number(item.kcal_per_unit ?? 0),
            carbs: Number(item.carbs_g_per_unit ?? 0),
            protein: Number(item.protein_g_per_unit ?? 0),
            fat: Number(item.fat_g_per_unit ?? 0),
          },
        })),
      }
    },
  })
}
