import { FREE_RECIPES } from '@ricecal/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'
import { unwrap, unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { toIcon, toRecipe, toRecipeIngredient } from './mappers'
import { removeMealPhoto } from './photos'
import { refusalFrom, ScanLimitError } from './refusals'
import { useUserId } from './session'
import { useEntitlement } from './subscription'
import type { IconRef, Macros, Recipe, RecipeIngredient, RecipeUnit } from './types'

/**
 * Home cooking.
 *
 * A recipe is the one thing in this app a user authors. It used to be mirrored
 * into `foods` so logging it was an entry against a foreign key, and that mirror
 * went with the catalogue: logging a pot now writes the same snapshot everything
 * else does, built by `snapshotFromRecipe`.
 *
 * Two writes are RPCs rather than updates, because they touch columns the client
 * has no grant on: publishing may only move a recipe to `pending`, and saving a
 * copy bumps a counter on somebody else's row.
 */

/**
 * Which shelf of the list is on screen. Part of the query key.
 *
 * There was a third, `official`: the recipes with no owner at all, written by
 * us. Nothing was ever put on it, and a shelf that is permanently empty is a
 * tab that teaches people the app has nothing. `is_official` is still a column
 * on `recipe_details` — a released app reads that view, so the view keeps
 * answering — and nothing in the client asks for it any more.
 */
export type RecipeShelf = 'mine' | 'community'

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
      } else {
        // The community shelf leans on the read policy rather than restating
        // it: `is_public and review_status = 'approved'` is already the only
        // way somebody else's food is visible at all, so the filter here is
        // just "not mine, and it has an author".
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

/**
 * How many recipes this account owns, and whether it may write another.
 *
 * A count query rather than the list's length: `useRecipes('mine')` is filtered
 * by the search field and capped at 100, either of which would let somebody past
 * the ceiling by typing a word into a box.
 *
 * The `recipes_enforce_free_limit` trigger enforces this independently, because
 * the client writes `recipes` directly under RLS. This copy makes the button read
 * honestly; that one refuses.
 *
 * `limit: null` is unlimited rather than zero, which is what Pro has.
 */
export type RecipeQuota = {
  count: number
  limit: number | null
  atLimit: boolean
  /** Still finding out. Nothing should be refused on this. */
  loading: boolean
}

export function useRecipeQuota(): RecipeQuota {
  const userId = useUserId()
  const { entitled, loading: entitlementLoading } = useEntitlement()

  const count = useQuery({
    queryKey: keys.recipeCount(userId),
    queryFn: async (): Promise<number> => {
      const { count: rows, error } = await supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId)
      if (error) throw error
      return rows ?? 0
    },
  })

  const owned = count.data ?? 0
  const loading = count.isPending || entitlementLoading

  return {
    count: owned,
    limit: entitled ? null : FREE_RECIPES,
    /**
     * Never true while either answer is in flight, or a paywall appears in front
     * of somebody with two recipes because the count had not landed.
     *
     * It errs the other way when the count fails: a query that errored or is
     * paused offline is not pending, so `owned` falls back to 0 and the button
     * opens a form the database refuses at Save. The screens route that refusal to
     * the paywall through `isRecipeLimit`.
     */
    atLimit: !loading && !entitled && owned >= FREE_RECIPES,
    loading,
  }
}

/**
 * Did this write hit the free tier's recipe ceiling?
 *
 * The rule lives in the `recipes_enforce_free_limit` trigger, because the client
 * writes `recipes` directly under RLS. What comes back is a plpgsql exception,
 * which PostgREST turns into a 400 carrying the raised message.
 *
 * Matched on a token, which is why the trigger raises `recipe_limit_reached`
 * rather than a sentence: prose cannot be translated and would break the moment
 * somebody improved the wording.
 */
const RECIPE_LIMIT = 'recipe_limit_reached'

export function isRecipeLimit(error: unknown): boolean {
  const message = (error as { message?: unknown })?.message
  return typeof message === 'string' && message.includes(RECIPE_LIMIT)
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
 * An ingredient as the form holds it: no id, because the list is rewritten whole
 * on every save. `perUnit` rather than a total, matching the column, since the
 * density is what survives the amount being corrected later.
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
 * What a save did, beyond writing. `review` is present only when the recipe was
 * public, since editing one sends it back through the reviewer. Absent means
 * there was nothing to review rather than that a review passed.
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
 * Create or replace a recipe, in one go. The form stages everything and Save
 * writes the lot, so this replaces the stored ingredient list rather than
 * diffing it: nothing references an ingredient by id across a save, so the ids
 * churning costs nothing.
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

      // Delete then insert, in two statements, which is not atomic: an insert that
      // fails after the delete leaves a recipe with no ingredients. That is survivable
      // here and nowhere else, because the form still holds the whole staged list so
      // Save is the retry. It would not be survivable from a background writer, and if
      // one ever appears this belongs in an RPC.
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
    onSuccess: ({ id: recipeId, review }, input) => {
      track('Recipe Saved', {
        is_new: !input.id,
        ingredients: input.ingredients.length,
        servings: input.servings,
      })
      // An edit to a PUBLISHED recipe sends it back through the reviewer, so
      // this path produces a verdict too — and it is the same verdict, from the
      // same call, as the one publishing produces. Reporting it here as well is
      // what makes the rejection rate a number about the reviewer rather than a
      // number about which button was pressed.
      if (review) track('Recipe Published', { outcome: review.status })
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
 * What happened when a recipe was sent for review. `pending` is the absence of a
 * verdict rather than a third one: the review could not run, so the recipe is
 * public and invisible and the screen says "we are still looking at it".
 */
export type PublishResult = { status: 'approved' | 'rejected' | 'pending'; reason?: string }

/**
 * Send a recipe through the reviewer and report what it said. Shared by
 * publishing and saving, because an edit to a published recipe needs a second
 * reading. The database has already put the row back to `pending`, so a review
 * that never happens leaves it public and unlisted rather than live and unread.
 *
 * Never throws: every failure resolves to `pending`, which is the honest answer.
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
 * Two steps rather than one. `set_recipe_public` flips the flag and parks the
 * recipe at `pending`, which cannot fail halfway; only then does the review run,
 * and one that never finishes leaves a recipe public, pending and unlisted. The
 * opposite order would have to hold an approval on a client.
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
    onSuccess: (result, { id, isPublic }) => {
      // Only the publishing direction. Taking a recipe back runs no reviewer
      // and has no verdict — `pending` there is the absence of a question, not
      // an answer, and counting it would put every unpublish in the column that
      // means "the review failed to run".
      if (isPublic) track('Recipe Published', { outcome: result.status })
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.recipe(id) })
      // Publishing runs the reviewer, which is a model call. Unpublishing does
      // not, but it is one wasted invalidation against a figure that is only
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
      track('Recipe Copied', {})
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
   * The drawing the model picked for the pot. Only on the described path: a
   * photographed pot arrives with a photograph, so the server does not spend a
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
 * Read a pot out of a photograph, or out of a description of one. One hook for
 * both, because everything after the request is the same shape and a draft is
 * not written anywhere until Save.
 *
 * A mutation rather than a query, because it is an action with a cost taken at a
 * moment the user chose.
 *
 * Nothing is written: what comes back fills the form, and a failure means they
 * fill it in themselves, which is why this resolves to `null` rather than
 * throwing at a screen with a perfectly good empty form.
 */
export function useReadRecipe() {
  const queryClient = useQueryClient()
  const userId = useUserId()

  return useMutation({
    // Reading a pot spends a scan on the server like a photographed plate does,
    // so the count the camera panel draws has to move. Invisible today — that
    // caption is only drawn for a free account and only Pro can reach this —
    // and an off-by-one waiting to happen the moment either changes. `onSettled`
    // rather than `onSuccess`: a read that came back `null` was still charged.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.scanQuota(userId) })
    },
    mutationFn: async (source: RecipeSource): Promise<ScannedRecipe | null> => {
      /**
       * Which of the two offers was taken, and whether it produced anything.
       * `empty` is the model finding no cooking in the evidence, worth watching
       * after the escape clause fired on "Coq au vin, feeds 6"; `failed` is the
       * request not landing at all.
       */
      const from = 'photoPath' in source ? 'photo' : 'text'
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
      // scans", both of which the caller turns into something actionable.
      if (error) {
        const refusal = await refusalFrom(error)
        if (refusal) {
          track('Recipe Drafted', {
            source: from,
            outcome: refusal instanceof ScanLimitError ? 'limit_reached' : 'not_entitled',
          })
          throw refusal
        }
        track('Recipe Drafted', { source: from, outcome: 'failed' })
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
      if (!result?.ok || !result.draft) {
        track('Recipe Drafted', { source: from, outcome: 'empty' })
        return null
      }

      track('Recipe Drafted', { source: from, outcome: 'drafted' })
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
