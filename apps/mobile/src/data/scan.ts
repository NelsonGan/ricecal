import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { useRefiningEntries } from './refining'
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
  /** Its own macros, which are what the entry's totals are summed from. */
  carbs: number
  protein: number
  fat: number
}

export function useEntryIngredients(entryId: string | undefined) {
  return useQuery({
    queryKey: ['entry-ingredients', entryId ?? ''],
    enabled: Boolean(entryId),
    queryFn: async (): Promise<EntryIngredient[]> => {
      const { data, error } = await supabase
        .from('food_log_ingredient_details')
        .select('id, name, quantity, serving_label, kcal, carbs_g, protein_g, fat_g, position')
        .eq('food_log_id', entryId as string)
        .order('position')
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id ?? '',
        name: row.name ?? '',
        quantity: Number(row.quantity ?? 1),
        servingLabel: row.serving_label ?? '',
        kcal: row.kcal ?? 0,
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
      const key = ['entry-ingredients', input.entryId]
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
        queryClient.setQueryData(['entry-ingredients', input.entryId], context.previous)
      }
    },
    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({ queryKey: ['entry-ingredients', input.entryId] })
      queryClient.invalidateQueries({ queryKey: keys.day(userId, input.logDate) })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
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
      const key = ['entry-ingredients', input.entryId]
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
        queryClient.setQueryData(['entry-ingredients', input.entryId], context.previous)
      }
    },
    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({ queryKey: ['entry-ingredients', input.entryId] })
      queryClient.invalidateQueries({ queryKey: keys.day(userId, input.logDate) })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
    },
  })
}

type RefineResponse = {
  ok: boolean
  applied?: boolean
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
 * the day refetches into the corrected entry and the id comes back out —
 * applied or not, the row simply shows whatever is true now.
 */
export function useRefineEntry() {
  const userId = useUserId()
  const queryClient = useQueryClient()
  const refining = useRefiningEntries()

  return useCallback(
    (input: { entryId: string; instruction: string; logDate: string }) => {
      refining.add(input.entryId)

      const work = async () => {
        const { data, error } = await supabase.functions.invoke<RefineResponse>('scan-refine', {
          body: { food_log_id: input.entryId, instruction: input.instruction },
        })
        if (error) throw error
        if (!data?.ok) throw new Error(data?.error ?? 'refine failed')
        // Refetch BEFORE the loading state lifts, so the row goes straight
        // from "reworking" to its corrected self with no stale frame between.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: keys.day(userId, input.logDate) }),
          queryClient.invalidateQueries({ queryKey: ['entry-ingredients', input.entryId] }),
        ])
        queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
      }

      work()
        .catch(() => {
          // The entry is untouched on the server; showing it as it was IS the
          // honest failure state.
        })
        .finally(() => refining.remove(input.entryId))
    },
    [queryClient, refining, userId],
  )
}
