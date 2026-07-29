import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { today, unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { useUserId } from './session'
import type { CurrentGoalsRow, Targets } from './types'

/**
 * The budget in force today.
 *
 * `daily_goals` is effective-dated — one row per change, never one mutable row
 * — so "the current budget" is a view over the newest row at or before today.
 * The weekly report reads `goals_on(date)` for the same reason: a target
 * tightened on Thursday must not redraw Monday.
 *
 * There is no row until onboarding computes one, so this can legitimately be
 * null and every caller has to handle it. That is deliberate: a placeholder
 * budget would put a ring on Today against a number nobody chose.
 */
export function useTargets() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.goals(userId),
    queryFn: async (): Promise<Targets | null> => {
      const row = unwrapMaybe(
        await supabase.from('current_daily_goals').select('*').eq('user_id', userId).maybeSingle(),
      ) as CurrentGoalsRow | null

      if (!row) return null
      return {
        kcal: row.kcal ?? 0,
        carbs: row.carbs_g ?? 0,
        protein: row.protein_g ?? 0,
        fat: row.fat_g ?? 0,
        waterGlasses: row.water_glasses ?? 8,
        steps: row.steps ?? 8000,
        isCustom: row.is_custom ?? false,
      }
    },
  })
}

export type GoalsInput = {
  kcal: number
  carbs: number
  protein: number
  fat: number
  waterGlasses: number
  steps: number
  /**
   * True when the user typed the numbers. The recompute trigger reads exactly
   * this and stops, so an automatic write must never set it.
   */
  isCustom: boolean
}

/**
 * Writes today's budget.
 *
 * An upsert on `(user_id, effective_from)` with today's date: changing a
 * target twice in one day corrects that day rather than leaving two rows, and
 * changing it tomorrow leaves today's history intact.
 */
export function useSetTargets() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: GoalsInput) =>
      unwrapOne(
        await supabase
          .from('daily_goals')
          .upsert(
            {
              user_id: userId,
              effective_from: today(),
              kcal: Math.round(input.kcal),
              carbs_g: Math.round(input.carbs),
              protein_g: Math.round(input.protein),
              fat_g: Math.round(input.fat),
              water_glasses: Math.round(input.waterGlasses),
              steps: Math.round(input.steps),
              is_custom: input.isCustom,
            },
            { onConflict: 'user_id,effective_from' },
          )
          .select('*')
          .single(),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.goals(userId) }),
  })
}
