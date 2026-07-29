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
 * Records a weigh-in.
 *
 * Keyed on `(user_id, measured_on)`, so weighing twice in one morning corrects
 * the day rather than adding a second point to the chart. Writing it also
 * recomputes the budget in the database, which is why the targets are
 * invalidated here.
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
    },
  })
}
