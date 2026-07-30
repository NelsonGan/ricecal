import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { keys } from './keys'
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
}

export function useEntryIngredients(entryId: string | undefined) {
  return useQuery({
    queryKey: ['entry-ingredients', entryId ?? ''],
    enabled: Boolean(entryId),
    queryFn: async (): Promise<EntryIngredient[]> => {
      const { data, error } = await supabase
        .from('food_log_ingredient_details')
        .select('id, name, quantity, serving_label, kcal, position')
        .eq('food_log_id', entryId as string)
        .order('position')
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id ?? '',
        name: row.name ?? '',
        quantity: Number(row.quantity ?? 1),
        servingLabel: row.serving_label ?? '',
        kcal: row.kcal ?? 0,
      }))
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
 * `applied: false` resolves rather than rejects — "that wasn't a food
 * correction" is an answer to show the user, not a failure to retry.
 */
export function useRefineEntry() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { entryId: string; instruction: string; logDate: string }) => {
      const { data, error } = await supabase.functions.invoke<RefineResponse>('scan-refine', {
        body: { food_log_id: input.entryId, instruction: input.instruction },
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error ?? 'refine failed')
      return { applied: Boolean(data.applied), reason: data.reason }
    },
    onSuccess: (result, input) => {
      if (!result.applied) return
      queryClient.invalidateQueries({ queryKey: keys.day(userId, input.logDate) })
      queryClient.invalidateQueries({ queryKey: ['entry-ingredients', input.entryId] })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
    },
  })
}
