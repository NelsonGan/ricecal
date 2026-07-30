import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { today, unwrap, unwrapOne } from './client'
import { keys } from './keys'
import { useUserId } from './session'
import type { WeighIn } from './types'

/**
 * Weigh-ins, oldest first.
 *
 * This is where current weight lives — there is no `weight_kg` on the profile,
 * because a column there would be a cache with no invalidation story: the
 * scale syncs, the profile still says what onboarding recorded, and the budget
 * is computed from the stale one.
 */
export function useWeighIns(limit = 90) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.weighIns(userId),
    queryFn: async (): Promise<WeighIn[]> => {
      const rows = unwrap(
        await supabase
          .from('weight_logs')
          .select('measured_on, weight_kg')
          .eq('user_id', userId)
          // Newest first for the limit, then reversed: "the last 90 readings"
          // is what a chart wants, not "the first 90 ever".
          .order('measured_on', { ascending: false })
          .limit(limit),
      )

      return rows.map((row) => ({ date: row.measured_on, kg: Number(row.weight_kg) })).reverse()
    },
  })
}

/** The newest reading, which is what "current weight" means everywhere. */
export function useCurrentWeight(): number | undefined {
  const { data } = useWeighIns()
  return data?.at(-1)?.kg
}

/**
 * Records a weigh-in, on any day.
 *
 * Keyed on `(user_id, measured_on)`, so weighing twice in one morning corrects
 * the day rather than adding a second point to the chart — and passing a past
 * date corrects that day instead, which is what makes the history editable.
 * Writing it also recomputes the budget in the database, which is why the targets
 * are invalidated here.
 */
export function useLogWeight() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ kg, date = today() }: { kg: number; date?: string }) =>
      unwrapOne(
        await supabase
          .from('weight_logs')
          .upsert(
            { user_id: userId, measured_on: date, weight_kg: kg },
            { onConflict: 'user_id,measured_on' },
          )
          .select('measured_on')
          .single(),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.weighIns(userId) })
      queryClient.invalidateQueries({ queryKey: keys.goals(userId) })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
    },
  })
}

/**
 * Removes one day's reading.
 *
 * A weigh-in typed at the wrong scale — 165 lb into a kilogram field — is worth
 * more than a wrong number on a chart: the newest row is what the budget is
 * recomputed from, so it moves the day's calories too. Correcting the day covers
 * most of it, and this covers a day that should never have had a reading at all.
 *
 * Invalidates the targets for the same reason `useLogWeight` does: deleting the
 * newest row makes the one before it current.
 */
export function useDeleteWeighIn() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ date }: { date: string }) =>
      unwrap(
        await supabase
          .from('weight_logs')
          .delete()
          .eq('user_id', userId)
          .eq('measured_on', date)
          // Selected so this goes through `unwrap` like every other write here,
          // rather than growing its own error handling.
          .select('measured_on'),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.weighIns(userId) })
      queryClient.invalidateQueries({ queryKey: keys.goals(userId) })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
    },
  })
}
