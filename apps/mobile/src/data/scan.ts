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
   * What this much of it weighs, when the scan was able to say.
   *
   * Already multiplied by the quantity — the view does it, so the figure moves
   * with the stepper. Null for a part nobody weighed: an entry scanned before
   * the cascade started asking for grams, or one added by a typed correction,
   * where the model gives a calorie delta and never a mass.
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
 * Set one ingredient's portion. The database function recomputes the parent
 * entry's quantity in the same transaction, so the plate total and the parts
 * can never disagree — which is why this is an RPC and not a table update.
 *
 * Optimistic on the ingredient list: the row's numbers move under the finger,
 * and the server's answer reconciles quietly afterwards. The day totals are
 * only invalidated once the write settles, so tapping a stepper does not
 * ripple a refetch through the whole screen mid-gesture.
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
 * Put a food ON the plate.
 *
 * The list could only ever shrink until now: the sheet under an entry offered a
 * stepper and a bin, and anything the scan had missed had to be answered either
 * by retyping the whole entry's figures or by spending a model call on "add a
 * fried egg". Naming it out of the catalogue is cheaper than both and more
 * exact than either.
 *
 * The figures sent are per ONE of the part, which is what `add_ingredient`
 * stores against a factor of one — so a dish chosen at its "large" portion is
 * sent as that portion's own numbers rather than as a base and a multiplier
 * this row has nowhere to keep.
 *
 * NOT OPTIMISTIC, unlike the two above. Those move a row that is already on
 * screen and can be put back exactly as it was; this one has no id until the
 * server issues it, and a placeholder row that has to be reconciled with a real
 * one is the pending-snap problem again for a write that takes a moment.
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
      // Rewrapped rather than rethrown, unlike the two mutations above, and the
      // difference matters here because the caller READS this message. A
      // `PostgrestError` is a plain object, so `error instanceof Error` is false
      // for it and a screen that narrows on `Error` to reach `.message` would
      // silently take the generic branch every time — which is how the one
      // refusal worth explaining ("this entry uses your own calorie figure")
      // would have come out as "could not add that".
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
 * Take one ingredient off a scanned plate.
 *
 * Its own mutation rather than "set the quantity to zero": the database
 * function deletes the row and recomputes the parent from what is left, and a
 * portion of zero is not a portion.
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
 * Why a correction changed nothing, in the words the user gets told.
 *
 * The server answers with these; the screen translates them. One message for
 * every way `scan-refine` can decline was what made the feature feel broken —
 * "Could not apply that, try rewording it" was shown to somebody who typed
 * "extra spicy", where there is nothing to apply and rewording will not help.
 *
 * `unknown` is the client's own: an older function, or a shape this build does
 * not know about, and it keeps the general apology those used to get.
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
 * Fix-by-typing: sends the correction to the `scan-refine` function, which
 * interprets it against the entry's current state and either rescales the
 * quantity, re-resolves the food through the scan cascade, or declines.
 *
 * Fire-and-forget, like `useSnapFood` and for the same reason: the caller
 * navigates back to Today the moment the correction is sent, and a mutation
 * tied to the detail screen would die with it. The entry's id goes into the
 * refining set so its row on Today shows the work; when the server answers,
 * the day refetches into the corrected entry and the id comes back out.
 *
 * A correction the server DECLINES is the one outcome the row cannot express.
 * The function answers 200 with `applied: false` for text it could not read as
 * a food correction, and the entry then comes back looking exactly as it did —
 * so without `onNotApplied` the user watched a row work for ten seconds and
 * change nothing, with no way to tell that from a correction that had simply
 * made no difference.
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
       *
       * Carried for analytics alone — nothing in this hook or on the server
       * treats a chip differently, which is the point: a chip IS the sentence,
       * not a shortcut the client performs itself. What the property answers is
       * whether the four chips are being used at all, or whether everybody
       * types.
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
