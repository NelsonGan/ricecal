import { FREE_RECIPES, FREE_VIDEO_IMPORTS } from '@ricecal/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { currentLanguage } from '@/i18n'
import { track } from '@/lib/analytics'
import type { MeasureUnit } from '@/lib/measures'
import { supabase } from '@/lib/supabase'
import { unwrap, unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { displayUnitOf, toIcon, toRecipe, toRecipeIngredient } from './mappers'
import { removeMealPhoto } from './photos'
import { refusalFrom, ScanLimitError } from './refusals'
import { useUserId } from './session'
import { useEntitlement } from './subscription'
import type { IconRef, Macros, Recipe, RecipeIngredient, RecipeTag, RecipeUnit } from './types'

/**
 * Home cooking.
 *
 * A recipe is the one thing in this app a user authors. It used to be mirrored
 * into `foods` so logging it was an entry against a foreign key, and that mirror
 * went with the catalogue: logging a pot now writes the same snapshot everything
 * else does, built by `snapshotFromRecipe`.
 *
 * Two writes are RPCs rather than updates, because they touch columns the client
 * has no grant on: publishing toggles `is_public` directly on the owner's row,
 * and saving a copy bumps a counter on somebody else's row.
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

  // Not subscribed: every screen with a list re-renders on a language change
  // through its own `useTranslation`, which re-runs this with the new key.
  const language = currentLanguage()

  return useQuery({
    queryKey: keys.recipes(userId, shelf, needle, language),
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
      // `%` and `_` are wildcards to `ilike`: escaped, so "50%" finds the dish
      // called that and a lone "_" is not a match for every recipe.
      //
      // An imported recipe is also found by the name it is shown under in the
      // app's language (`recipes.translations`), since that is the name on its
      // card. Inside `or` the pattern is double-quoted, with `"` and `\`
      // escaped for PostgREST on top of the `ilike` escaping.
      if (needle) {
        const pattern = `%${needle.replace(/[\\%_]/g, '\\$&')}%`
        if (language === 'en') request = request.ilike('name', pattern)
        else {
          const quoted = `"${pattern.replace(/[\\"]/g, '\\$&')}"`
          request = request.or(
            `name.ilike.${quoted},translations->${language}->>name.ilike.${quoted}`,
          )
        }
      }

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
        // A recipe imported from a video has its own allowance and does not
        // count here, as `recipes_enforce_free_limit` does not count it.
        .is('import_id', null)
      if (error) throw error
      return rows ?? 0
    },
    // Only an account with a cap is counted against it. The log sheet asks
    // this on every open, and for Pro it was a request whose answer nothing
    // reads.
    enabled: !entitlementLoading && !entitled,
  })

  const owned = count.data ?? 0
  // A disabled query stays pending for ever, so Pro is not waiting on it.
  const loading = entitlementLoading || (!entitled && count.isPending)

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

/** A route reached inside the app carries the row id; a shared link carries its bearer slug. */
const RECIPE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RECIPE_SHARE_SLUG = /^[0-9a-f]{32}$/

function isRecipeId(reference: string): boolean {
  return RECIPE_ID.test(reference)
}

export function useRecipe(reference: string | undefined) {
  return useQuery({
    queryKey: keys.recipe(reference ?? ''),
    enabled: Boolean(reference),
    queryFn: async (): Promise<Recipe | null> => {
      if (!isRecipeId(reference as string)) {
        if (!RECIPE_SHARE_SLUG.test(reference as string)) return null
        const row = unwrapMaybe(
          await supabase
            .rpc('get_shared_recipe', { p_share_slug: reference as string })
            .maybeSingle(),
        )
        return row ? toRecipe(row) : null
      }

      const row = unwrapMaybe(
        await supabase
          .from('recipe_details')
          .select(RECIPE_COLUMNS)
          .eq('id', reference as string)
          .maybeSingle(),
      )
      return row ? toRecipe(row) : null
    },
  })
}

export function useRecipeIngredients(reference: string | undefined) {
  return useQuery({
    queryKey: keys.recipeIngredients(reference ?? ''),
    enabled: Boolean(reference),
    queryFn: async (): Promise<RecipeIngredient[]> => {
      if (!isRecipeId(reference as string)) {
        if (!RECIPE_SHARE_SLUG.test(reference as string)) return []
        return unwrap(
          await supabase.rpc('get_shared_recipe_ingredients', {
            p_share_slug: reference as string,
          }),
        ).map(toRecipeIngredient)
      }

      return unwrap(
        await supabase
          .from('recipe_ingredient_details')
          .select('*')
          .eq('recipe_id', reference as string)
          .order('position'),
      ).map(toRecipeIngredient)
    },
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
  /** In `unit`, always: grams, millilitres or pieces. */
  amount: number
  unit: RecipeUnit
  /** What the cook measured in, when it is not `unit`. Display only. */
  displayUnit?: MeasureUnit
  perUnit: Macros
}

/** An amount as `recipe_ingredients.amount` keeps it: `numeric(9, 2)`, two decimals. */
export const storedAmount = (amount: number) => Math.round(amount * 100) / 100

/**
 * Whether `recipe_ingredients.amount` can hold this: above zero and at most
 * 100,000 once rounded, as Postgres rounds before the check, so 0.004 counts
 * as the zero it becomes.
 */
export function isStorableAmount(amount: number): boolean {
  if (!Number.isFinite(amount)) return false
  const stored = storedAmount(amount)
  return stored > 0 && stored <= 100_000
}

/** Whether a per-unit figure fits its column: `numeric(10, 4)`, never negative. */
export function isStorablePerUnit(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && Math.round(value * 10_000) / 10_000 < 1_000_000
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
  prepMinutes?: number | null
  cookMinutes?: number | null
  tags?: RecipeTag[]
  sourceUrl?: string | null
}

/** What a save did, beyond writing. */
export type SaveResult = { id: string }

/** The longest name `recipe_ingredients` holds, in characters, as Postgres counts them. */
const INGREDIENT_NAME_MAX = 120

/**
 * The name as the column will take it. A typed name and a drafted one are
 * already bounded, but a catalogue dish's name is not, and the picker passes it
 * through whole: one name over the column's limit refused the whole list, so
 * the recipe could not be saved at all. By code point, which is what
 * `char_length` counts; slicing the UTF-16 string could cut a character in half.
 */
export function ingredientName(name: string): string {
  const trimmed = name.trim()
  const points = Array.from(trimmed)
  return points.length <= INGREDIENT_NAME_MAX
    ? trimmed
    : points.slice(0, INGREDIENT_NAME_MAX).join('').trim()
}

const toIngredientRow = (recipeId: string, input: RecipeIngredientInput, position: number) => ({
  recipe_id: recipeId,
  name: ingredientName(input.name),
  food_id: input.foodId ?? null,
  amount: input.amount,
  unit: input.unit,
  // Through the same check the reader uses, so a spoon never lands on a row
  // stored in grams. The column's own check would refuse it, and with it the
  // whole save.
  display_unit: displayUnitOf(input.unit, input.displayUnit).displayUnit ?? null,
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
        prep_minutes: input.prepMinutes ?? null,
        cook_minutes: input.cookMinutes ?? null,
        tags: input.tags ?? [],
      }

      const saved = input.id
        ? unwrapOne(
            await supabase
              .from('recipes')
              .update(fields)
              .eq('id', input.id)
              .eq('owner_id', userId)
              .select('id')
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
              .select('id')
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

      const sourceUrl = input.sourceUrl?.trim() || null
      try {
        if (input.ingredients.length > 0) {
          unwrap(
            await supabase
              .from('recipe_ingredients')
              .insert(
                input.ingredients.map((item, index) => toIngredientRow(recipeId, item, index)),
              )
              .select('id'),
          )
        }
        // The link lives in `recipe_private`, which only its owner can read.
        // Written when there is one, or when an edit may be clearing one; a new
        // recipe with no link needs no row. Only `source_url` is sent, so the
        // upsert leaves the star as it was.
        if (sourceUrl || input.id) {
          unwrap(
            await supabase
              .from('recipe_private')
              .upsert(
                { recipe_id: recipeId, owner_id: userId, source_url: sourceUrl },
                { onConflict: 'recipe_id' },
              )
              .select('recipe_id'),
          )
        }
      } catch (error) {
        // A new recipe whose ingredients or link were refused is taken back
        // out. The form has no id for it, so Save would insert a second recipe
        // beside an empty one, and on the free tier the empty one takes the
        // slot the retry needs.
        if (!input.id) await supabase.from('recipes').delete().eq('id', recipeId)
        throw error
      }

      // After the row, as everywhere else: an object deleted for a row that
      // then failed to write leaves a recipe pointing at nothing.
      if (input.previousPhotoPath && input.previousPhotoPath !== input.photoPath) {
        await removeMealPhoto(input.previousPhotoPath).catch(() => {})
      }

      return { id: recipeId }
    },
    onSuccess: ({ id: recipeId }, input) => {
      track('Recipe Saved', {
        is_new: !input.id,
        ingredients: input.ingredients.length,
        servings: input.servings,
      })
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
      queryClient.invalidateQueries({ queryKey: RECIPE_PREFIX })
      queryClient.invalidateQueries({ queryKey: RECIPE_INGREDIENTS_PREFIX })
      queryClient.invalidateQueries({ queryKey: keys.recipe(recipeId) })
      queryClient.invalidateQueries({ queryKey: keys.recipeIngredients(recipeId) })
    },
  })
}

/** Every single-recipe query, by row id or by share slug: `keys.recipe`'s prefix. */
const RECIPE_PREFIX = ['recipe'] as const
/** Every recipe-ingredients query, by row id or by share slug. */
const RECIPE_INGREDIENTS_PREFIX = ['recipe-ingredients'] as const

/**
 * Star one of your own recipes, or take the star off. Optimistic, because a
 * heart that waits a round trip to fill reads as a missed tap; the shelves and
 * the recipe are refetched either way, so a refused write puts it back.
 */
export function useFavouriteRecipe() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    // One at a time, in the order tapped. Two quick taps sent side by side can
    // land in either order, and the server would keep whichever arrived last.
    scope: { id: 'recipe-favourite' },
    mutationFn: async ({ id, favourite }: { id: string; favourite: boolean }) => {
      // In `recipe_private`, the owner-only table, so nobody else learns which
      // of a cook's recipes they star. Only `is_favourite` is sent, so the
      // upsert leaves the source link as it was.
      unwrap(
        await supabase
          .from('recipe_private')
          .upsert(
            { recipe_id: id, owner_id: userId, is_favourite: favourite },
            { onConflict: 'recipe_id' },
          )
          .select('recipe_id'),
      )
    },
    onMutate: async ({ id, favourite }) => {
      // A refetch already in flight would land after this and put the old star
      // back. And the recipe is cached under whatever opened it, the row id or
      // a share link's slug, so every single-recipe query is matched by its row.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: keys.recipesAll(userId) }),
        queryClient.cancelQueries({ queryKey: RECIPE_PREFIX }),
      ])
      queryClient.setQueriesData<Recipe | null>({ queryKey: RECIPE_PREFIX }, (current) =>
        current?.id === id ? { ...current, isFavourite: favourite } : current,
      )
      queryClient.setQueriesData<Recipe[]>({ queryKey: keys.recipesAll(userId) }, (current) =>
        Array.isArray(current)
          ? current.map((recipe) =>
              recipe.id === id ? { ...recipe, isFavourite: favourite } : recipe,
            )
          : current,
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
      queryClient.invalidateQueries({ queryKey: RECIPE_PREFIX })
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
      // then fails to delete leaves a recipe pointing at nothing. A failed R2
      // sweep must not undo the already-deleted row's UI feedback or cache refresh.
      if (photoPath) await removeMealPhoto(photoPath).catch(() => {})
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
      // Mark detail caches stale without refetching active queries: the detail
      // screen that just deleted this row waits for its ConfirmSheet to dismiss
      // before navigating away, and an immediate refetch would flip it to the
      // "not found" branch and unmount the sheet before `onDismiss` fires.
      queryClient.invalidateQueries({ queryKey: RECIPE_PREFIX, refetchType: 'none' })
      queryClient.invalidateQueries({ queryKey: RECIPE_INGREDIENTS_PREFIX, refetchType: 'none' })
    },
  })
}

/**
 * Where a recipe stands after asking to publish it. Publishing lists it at
 * once, so this is `approved`; the type keeps the other two because the
 * column does (`pending` is a recipe three reports took down).
 */
export type PublishResult = { status: 'approved' | 'rejected' | 'pending' }

/**
 * List a recipe in the community, or take it back. One call: there is no
 * review between asking and being listed.
 */
export function usePublishRecipe() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    scope: { id: 'recipe-publish' },
    mutationFn: async ({
      id,
      isPublic,
    }: {
      id: string
      isPublic: boolean
    }): Promise<PublishResult> => {
      const status = unwrapMaybe(
        await supabase.rpc('set_recipe_public', { p_recipe_id: id, p_public: isPublic }),
      )
      return { status: status ?? 'pending' }
    },
    onSuccess: (result, { isPublic }) => {
      // Only the publishing direction; unpublishing is not counted.
      if (isPublic) track('Recipe Published', { outcome: result.status })
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
      queryClient.invalidateQueries({ queryKey: RECIPE_PREFIX })
    },
  })
}

/** Save somebody else's recipe as your own. Returns the new recipe's id. */
export function useSaveRecipeCopy() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      recipeId,
      shareSlug,
    }: {
      recipeId: string
      shareSlug?: string
    }): Promise<string> =>
      unwrapMaybe(
        shareSlug
          ? await supabase.rpc('save_shared_recipe_copy', { p_share_slug: shareSlug })
          : await supabase.rpc('save_recipe_copy', { p_recipe_id: recipeId }),
      ) as unknown as string,
    onSuccess: (_newId, source) => {
      track('Recipe Copied', {})
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
      // The original's saved count moved.
      queryClient.invalidateQueries({ queryKey: keys.recipe(source.recipeId) })
      if (source.shareSlug) {
        queryClient.invalidateQueries({ queryKey: keys.recipe(source.shareSlug) })
      }
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

/**
 * This month's video imports, against the allowance: five on a free account,
 * and an unprinted ceiling on Pro, which the sheet does not show. The server's
 * own count, so a reinstall or a second phone cannot reset it.
 */
export type VideoImportQuota = {
  used: number
  limit: number
  remaining: number
  entitled: boolean
}

export function useVideoImportQuota() {
  const userId = useUserId()
  return useQuery({
    queryKey: keys.videoImports(userId),
    queryFn: async (): Promise<VideoImportQuota | null> => {
      const { data, error } = await supabase.rpc('recipe_import_usage_this_month').maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        used: data.used ?? 0,
        limit: data.monthly_limit ?? FREE_VIDEO_IMPORTS,
        remaining: data.remaining ?? 0,
        entitled: data.entitled ?? false,
      }
    },
    enabled: Boolean(userId),
  })
}

/**
 * Why an import came back without a recipe, as the server said it. Each has
 * its own sentence on the import screen and most have their own way forward:
 *
 *   unsupported_link   not a post on a platform this reads
 *   unreadable         the platform would not show the post to us
 *   not_recipe         the video is not a recipe (cached, so asking again is free)
 *   too_long           past the three minutes a short-form video runs
 *   failed             the model or the database fell over; try again
 *   busy               the hourly ceiling on uncached videos
 *   offline            the request never arrived
 */
export type VideoImportFailure =
  | 'unsupported_link'
  | 'unreadable'
  | 'not_recipe'
  | 'too_long'
  | 'failed'
  | 'busy'
  | 'offline'

export class VideoImportError extends Error {
  readonly code: VideoImportFailure
  constructor(code: VideoImportFailure) {
    super(`Video import failed: ${code}`)
    this.name = 'VideoImportError'
    this.code = code
  }
}

/** The month's imports are spent. Carries the numbers the refusal sent. */
export class VideoImportLimitError extends Error {
  readonly used: number
  readonly limit: number
  readonly entitled: boolean
  constructor(used: number, limit: number, entitled = false) {
    super('Monthly video import limit reached')
    this.name = 'VideoImportLimitError'
    this.used = used
    this.limit = limit
    this.entitled = entitled
  }
}

export type ImportedRecipe = {
  recipeId: string
  /** This account had already imported the video, and got that recipe back. */
  existing: boolean
  /** This import is the one on the community shelf for the video. */
  community: boolean
}

const IMPORT_FAILURES = new Set<VideoImportFailure>([
  'unsupported_link',
  'unreadable',
  'not_recipe',
  'too_long',
  'failed',
  'busy',
])

/**
 * A link to a cooking video, made into a recipe on the server and written to
 * this account's shelf there. Nothing is drafted on the phone: the recipe is
 * cached for everybody who imports the same video, so it is the server's to
 * write, and the app opens it once it exists.
 *
 * A mutation, because it spends one of the month's imports. Every failure is
 * thrown with its code; the screen chooses the words.
 */
export function useImportRecipe() {
  const queryClient = useQueryClient()
  const userId = useUserId()

  return useMutation({
    // Sent even offline, rather than paused until the network returns: the
    // user is looking at a screen waiting for this, and "you are offline" is
    // the answer it needs, not a spinner that outlasts their patience.
    networkMode: 'always',
    // A shelf, the count and the allowance all move on a success, and the
    // allowance is worth re-reading after a refusal too.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.videoImports(userId) })
      queryClient.invalidateQueries({ queryKey: keys.recipesAll(userId) })
    },
    mutationFn: async (url: string): Promise<ImportedRecipe> => {
      const { data, error } = await supabase.functions.invoke('recipes', {
        // The app's language: anything but English gets the recipe in that
        // language too, kept beside the English. See `recipeLanguage.ts`.
        body: { action: 'import', url, language: currentLanguage() },
      })
      const body = (error ? await errorBody(error) : data) as {
        ok?: boolean
        code?: string
        used?: number
        limit?: number
        entitled?: boolean
        recipe_id?: string
        existing?: boolean
        community?: boolean
        platform?: string
      } | null

      if (body?.ok && body.recipe_id) {
        track('Recipe Imported', {
          platform: body.platform ?? 'unknown',
          outcome: body.existing ? 'existing' : 'imported',
        })
        return {
          recipeId: body.recipe_id,
          existing: body.existing === true,
          community: body.community === true,
        }
      }

      if (body?.code === 'import_limit') {
        track('Recipe Imported', { platform: body.platform ?? 'unknown', outcome: 'limit_reached' })
        const limit = body.limit ?? FREE_VIDEO_IMPORTS
        const entitled = body.entitled ?? limit > FREE_VIDEO_IMPORTS
        throw new VideoImportLimitError(body.used ?? FREE_VIDEO_IMPORTS, limit, entitled)
      }
      // Distinguish a non-JSON HTTP gateway error (502/504 HTML) from a real
      // transport failure so online users do not get told they are offline.
      const gotResponse =
        !error || typeof (error as { context?: { status?: unknown } })?.context?.status === 'number'
      const code: VideoImportFailure =
        body?.code && IMPORT_FAILURES.has(body.code as VideoImportFailure)
          ? (body.code as VideoImportFailure)
          : body || gotResponse
            ? 'failed'
            : 'offline'
      track('Recipe Imported', { platform: body?.platform ?? 'unknown', outcome: code })
      throw new VideoImportError(code)
    },
  })
}

/**
 * The JSON a refused or failed invoke carried, or null when there was no
 * answer at all. supabase-js turns a non-2xx into an error with the response
 * hanging off it; see `asResponse` in `refusals.ts` for why it is duck-typed.
 */
async function errorBody(error: unknown): Promise<unknown> {
  const context = (error as { context?: { json?: () => Promise<unknown> } })?.context
  if (!context || typeof context.json !== 'function') return null
  try {
    return await context.json()
  } catch {
    return null
  }
}
