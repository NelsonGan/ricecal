import { useQuery } from '@tanstack/react-query'
import type { Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { unwrap, unwrapMaybe } from './client'
import { keys } from './keys'
import { toSession } from './mappers'
import { useUserId } from './session'
import type { ActivitySession, DayRings } from './types'

/**
 * Movement: discrete workouts, and the day's rings.
 *
 * Both are mirrors of what a watch reports rather than things this app
 * creates, which is why there are no mutations here yet — the write path is a
 * HealthKit / Health Connect sync, not a screen. Until that exists these are
 * empty, and every consumer already handles empty because a user with no watch
 * is the common case.
 */

export function useWorkouts(date: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.workouts(userId, date),
    queryFn: async (): Promise<ActivitySession[]> => {
      const rows = unwrap(
        await supabase
          .from('workouts')
          .select('*')
          .eq('user_id', userId)
          .eq('log_date', date)
          .order('started_at'),
      ) as Tables<'workouts'>[]

      return rows.map(toSession)
    },
  })
}

/**
 * Calories a day's workouts earned back.
 *
 * Exercise is a credit against the budget, so this is added to the target
 * rather than subtracted from what was eaten — the ring measures the budget
 * the user actually has.
 */
export function useDayBurn(date: string): number {
  const { data } = useWorkouts(date)
  return (data ?? []).reduce((total, session) => total + session.kcal, 0)
}

export function useDayRings(date: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.activity(userId, date),
    queryFn: async (): Promise<DayRings | null> => {
      const row = unwrapMaybe(
        await supabase
          .from('daily_activity')
          .select('*')
          .eq('user_id', userId)
          .eq('log_date', date)
          .maybeSingle(),
      )

      if (!row) return null
      return {
        steps: row.steps,
        moveKcal: row.move_kcal,
        moveGoal: row.move_goal_kcal ?? 0,
        exerciseMin: row.exercise_minutes,
        exerciseGoal: row.exercise_goal_minutes ?? 0,
        standHours: row.stand_hours,
        standGoal: row.stand_goal_hours ?? 0,
        // Rendered as "synced 4 min ago". Stored as an instant, because a
        // minute count would need something to increment it.
        syncedMinutesAgo: Math.max(
          0,
          Math.round((Date.now() - new Date(row.synced_at).getTime()) / 60000),
        ),
      }
    },
  })
}

/** Calories burned per day across a range, for the weekly chart. */
export function useBurnRange(from: string, to: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.weeklyBurn(userId, `${from}:${to}`),
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(
        await supabase
          .from('workouts')
          .select('log_date, kcal')
          .eq('user_id', userId)
          .gte('log_date', from)
          .lte('log_date', to),
      )

      const byDate: Record<string, number> = {}
      for (const row of rows) {
        byDate[row.log_date] = (byDate[row.log_date] ?? 0) + row.kcal
      }
      return byDate
    },
  })
}
