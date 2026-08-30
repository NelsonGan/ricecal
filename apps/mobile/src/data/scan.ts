import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/ui'
import { keys } from './keys'
import { useRefiningEntries } from './refining'
import { announceRefusal, refusalFrom, ScanLimitError } from './refusals'
import { useUserId } from './session'

/**
 * What a scanned plate was made of: the `food_log_ingredients` rows behind
 * one entry, with the per-ingredient numbers already worked out by the view.
 * Only scanned entries have any; everything else returns an empty list.
 */
export type EntryIngredient = {
  id: string
  name: string
  quantity: number
  servingLabel: string
  kcal: number
  /**
   * What this much of it weighs, when the scan was able to say. Already
   * multiplied by the quantity, so the figure moves with the stepper. Null for a
   * part nobody weighed: an entry scanned before the cascade asked for grams, or
   * one added by a typed correction, which gives a delta and never a mass.
   */
  grams: number | null
  /** Its own macros, which are what the entry's totals are summed from. */
  carbs: number
  protein: number
  fat: number
}

export function useEntryIngredients(entryId: string | undefined) {
  return useQuery({
    queryKey: keys.entryIngredients(entryId ?? ''),
    enabled: Boolean(entryId),
    queryFn: async (): Promise<EntryIngredient[]> => {
      const { data, error } = await supabase
        .from('food_log_ingredient_details')
        .select(
          'id, name, quantity, serving_label, kcal, carbs_g, protein_g, fat_g, grams, position',
        )
        .eq('food_log_id', entryId as string)
        .order('position')
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id ?? '',
        name: row.name ?? '',
        quantity: Number(row.quantity ?? 1),
        servingLabel: row.serving_label ?? '',
        kcal: row.kcal ?? 0,
        // Null and zero are different answers: one is "nobody weighed this",
        // the other would be a claim that the part weighs nothing.
        grams: row.grams === null || row.grams === undefined ? null : Number(row.grams),
        carbs: Number(row.carbs_g ?? 0),
        protein: Number(row.protein_g ?? 0),
        fat: Number(row.fat_g ?? 0),
      }))
    },
  })
}

/**
 * Set one ingredient's portion. An RPC rather than a table update, because the
 * database function recomputes the parent entry's quantity in the same
 * transaction, so the plate total and the parts cannot disagree.
 *
 * Optimistic on the ingredient list, with the day totals invalidated only once
 * the write settles, so tapping a stepper does not ripple a refetch through the
 * screen mid-gesture.
 */
export function useUpdateIngredient() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      ingredientId: string
      quantity: number
      entryId: string
      logDate: string
    }) => {
      const { error } = await supabase.rpc('set_ingredient_quantity', {
        p_ingredient_id: input.ingredientId,
        p_quantity: input.quantity,
      })
      if (error) throw error
    },
    onMutate: async (input) => {
      const key = keys.entryIngredients(input.entryId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<EntryIngredient[]>(key)
      if (previous) {
        queryClient.setQueryData(
          key,
          previous.map((ingredient) =>
            ingredient.id === input.ingredientId
              ? (() => {
                  // Everything on the row scales with the portion, not just
                  // the calories: the totals above are a sum of these, so a
                  // patch that moved only kcal would show a plate whose macros
                  // disagreed with it until the refetch landed.
                  const factor = input.quantity / Math.max(0.01, ingredient.quantity)
                  const scale = (value: number) => Math.round(value * factor * 10) / 10
                  return {
                    ...ingredient,
                    quantity: input.quantity,
                    kcal: Math.round(ingredient.kcal * factor),
                    carbs: scale(ingredient.carbs),
                    protein: scale(ingredient.protein),
                    fat: scale(ingredient.fat),
                  }
                })()
              : ingredient,
          ),
        )
      }
      return { previous }
    },
    onError: (_error, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.entryIngredients(input.entryId), context.previous)
      }
    },
    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({ queryKey: keys.entryIngredients(input.entryId) })
      queryClient.invalidateQueries({ queryKey: keys.day(userId, input.logDate) })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
      // Movement is measured against what was eaten: the balance chart, the
      // "eaten" average and the deficit sentence all read `daily_nutrition`
      // through `activity_summary`. Without this a meal logged today left
      // the Activity tab still saying "Not enough logged".
      queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
    },
  })
}

/**
 * Put a food on the plate. The list could only shrink until now: anything the
 * scan missed had to be answered by retyping the entry's figures or spending a
 * model call on "add a fried egg".
 *
 * The figures sent are per one of the part, which is what `add_ingredient` stores
 * against a factor of one, so a dish chosen at its "large" portion is sent as
 * that portion's own numbers.
 *
 * Not optimistic, unlike the two above: those move a row already on screen, where
 * this has no id until the server issues one, and a placeholder to reconcile is
 * the pending-snap problem for a write that takes a moment.
 */
export function useAddIngredient() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      entryId: string
      logDate: string
      name: string
      /** Per one of this part, at the portion the user picked. */
      kcal: number
      carbs: number
      protein: number
      fat: number
      quantity?: number
      /** What one of them weighs, when the catalogue row says. */
      grams?: number
      /** Provenance only, exactly as on an entry. */
      foodId?: string
      servingId?: string
      servingLabel?: string
    }) => {
      const { error } = await supabase.rpc('add_ingredient', {
        p_food_log_id: input.entryId,
        p_name: input.name,
        p_kcal: input.kcal,
        p_carbs_g: input.carbs,
        p_protein_g: input.protein,
        p_fat_g: input.fat,
        p_quantity: input.quantity ?? 1,
        p_grams: input.grams,
        p_food_id: input.foodId,
        p_serving_id: input.servingId,
        p_serving_label: input.servingLabel,
      })
      // Rewrapped rather than rethrown, because the caller reads this message. A
      // `PostgrestError` is a plain object, so `error instanceof Error` is false
      // and a screen narrowing on `Error` takes the generic branch, which is how
      // "this entry uses your own calorie figure" came out as "could not add
      // that".
      if (error) throw new Error(error.message)
    },
    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({ queryKey: keys.entryIngredients(input.entryId) })
      queryClient.invalidateQueries({ queryKey: keys.day(userId, input.logDate) })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
    },
  })
}

/**
 * Take one ingredient off a scanned plate. Its own mutation rather than a
 * quantity of zero: the database function deletes the row and recomputes the
 * parent from what is left, and a portion of zero is not a portion.
 */
export function useRemoveIngredient() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { ingredientId: string; entryId: string; logDate: string }) => {
      const { error } = await supabase.rpc('remove_ingredient', {
        p_ingredient_id: input.ingredientId,
      })
      if (error) throw error
    },
    onMutate: async (input) => {
      const key = keys.entryIngredients(input.entryId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<EntryIngredient[]>(key)
      if (previous) {
        queryClient.setQueryData(
          key,
          previous.filter((ingredient) => ingredient.id !== input.ingredientId),
        )
      }
      return { previous }
    },
    onError: (_error, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.entryIngredients(input.entryId), context.previous)
      }
    },
    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({ queryKey: keys.entryIngredients(input.entryId) })
      queryClient.invalidateQueries({ queryKey: keys.day(userId, input.logDate) })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
    },
  })
}

/**
 * Why a correction changed nothing, in the words the user gets told. The server
 * answers with these and the screen translates them: one message for every way
 * `scan-refine` can decline is what made the feature feel broken.
 *
 * `unknown` is the client's own, for an older function or a shape this build does
 * not know, and keeps the general apology.
 */
export type RefineDeclined =
  | 'not_a_correction'
  | 'not_understood'
  | 'no_match'
  | 'no_change'
  | 'failed'
  | 'unknown'

const DECLINED: readonly RefineDeclined[] = [
  'not_a_correction',
  'not_understood',
  'no_match',
  'no_change',
  'failed',
]

const declinedFrom = (code: string | undefined): RefineDeclined =>
  DECLINED.includes(code as RefineDeclined) ? (code as RefineDeclined) : 'unknown'

type RefineResponse = {
  ok: boolean
  applied?: boolean
  code?: string
  reason?: string
  error?: string
}

/**
 * Fix-by-typing: sends the correction to `scan-refine`, which interprets it
 * against the entry's current state and either rescales the quantity,
 * re-resolves the food, or declines.
 *
 * Fire-and-forget, like `useSnapFood`: the caller navigates back to Today the
 * moment it is sent, and a mutation tied to the detail screen would die with it.
 * The entry's id goes into the refining set so its row shows the work.
 *
 * A declined correction is the one outcome the row cannot express: the function
 * answers 200 with `applied: false` and the entry comes back looking exactly as
 * it did, so without `onNotApplied` the user watched a row work for ten seconds
 * and change nothing.
 */
export function useRefineEntry() {
  const userId = useUserId()
  const queryClient = useQueryClient()
  const refining = useRefiningEntries()
  const toast = useToast()

  return useCallback(
    (input: {
      entryId: string
      instruction: string
      logDate: string
      /**
       * Whether the words came from a suggested chip rather than the field.
       * Analytics alone: nothing here or on the server treats a chip differently,
       * because a chip is the sentence. It answers whether the chips are used.
       */
      fromChip?: boolean
      /**
       * Called when the server understood the request and applied nothing,
       * with which of the five ways that happened. See `RefineDeclined`.
       */
      onNotApplied?: (reason: RefineDeclined) => void
    }) => {
      refining.add(input.entryId)
      const startedAt = Date.now()
      const settled = (
        outcome: 'applied' | 'not_applied' | 'failed' | 'limit_reached' | 'not_entitled',
      ) =>
        track('Entry Refined', {
          outcome,
          from_chip: input.fromChip ?? false,
          duration_ms: Date.now() - startedAt,
        })

      const work = async () => {
        const { data, error } = await supabase.functions.invoke<RefineResponse>('scan-refine', {
          body: { food_log_id: input.entryId, instruction: input.instruction },
        })
        if (error) {
          const refusal = await refusalFrom(error)
          throw refusal ?? error
        }
        if (!data?.ok) throw new Error(data?.error ?? 'refine failed')
        // Refetch BEFORE the loading state lifts, so the row goes straight
        // from "reworking" to its corrected self with no stale frame between.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: keys.day(userId, input.logDate) }),
          queryClient.invalidateQueries({ queryKey: keys.entryIngredients(input.entryId) }),
        ])
        queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
        queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
        queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
        // A correction spends a scan like a plate does. Invisible today — the
        // count is only drawn for a free account and only Pro can refine — and
        // an off-by-one waiting to happen the moment either of those changes.
        queryClient.invalidateQueries({ queryKey: keys.scanQuota(userId) })
        return data
      }

      work()
        .then((data) => {
          settled(data.applied === false ? 'not_applied' : 'applied')
          if (data.applied === false) input.onNotApplied?.(declinedFrom(data.code))
        })
        .catch((error: unknown) => {
          // The two refusals ARE announced, unlike everything else here. A
          // network failure leaves the same words worth sending again, so the
          // row going back to how it was says enough; being out of budget or
          // out of subscription does not improve by retrying, and silence
          // there reads as the button not working.
          if (announceRefusal(toast, error, 'refine')) {
            settled(error instanceof ScanLimitError ? 'limit_reached' : 'not_entitled')
            return
          }
          // The entry is untouched on the server; showing it as it was IS the
          // honest failure state, so nothing is said to the user here. The
          // event is still worth having: a correction that quietly did nothing
          // is invisible from the diary side.
          settled('failed')
        })
        .finally(() => refining.remove(input.entryId))
    },
    [queryClient, refining, toast, userId],
  )
}
