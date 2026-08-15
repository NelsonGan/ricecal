import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { setPersonProps, track } from '@/lib/analytics'
import type { TablesUpdate } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { unwrap, unwrapMaybe, unwrapOne } from './client'
import { keys } from './keys'
import { useUserId } from './session'
import type { Meal, MealTime, Settings } from './types'

/**
 * Display, notification, integration and privacy preferences.
 *
 * One row per user, created with the account by the signup trigger, so like
 * the profile this only ever has to handle "not loaded yet".
 */
export function useSettings() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.settings(userId),
    queryFn: async () =>
      unwrapMaybe(
        await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
      ),
  })
}

export function useUpdateSettings() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (patch: TablesUpdate<'user_settings'>) =>
      unwrapOne(
        await supabase
          .from('user_settings')
          .update(patch)
          .eq('user_id', userId)
          .select('*')
          .single(),
      ),
    // Every one of these is a switch. Waiting for a round trip to move it
    // makes the toggle feel broken, so the cache moves first and the server
    // confirms; a failure puts it back.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: keys.settings(userId) })
      const previous = queryClient.getQueryData<Settings>(keys.settings(userId))
      if (previous) {
        queryClient.setQueryData(keys.settings(userId), { ...previous, ...patch })
      }
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(keys.settings(userId), context.previous)
    },
    onSuccess: (settings: Settings) => queryClient.setQueryData(keys.settings(userId), settings),
  })
}

/** When each meal is, and whether it reminds. Four rows, seeded at signup. */
export function useMealTimes() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.mealTimes(userId),
    queryFn: async () =>
      unwrap(
        await supabase.from('meal_times').select('*').eq('user_id', userId).order('at'),
      ) as MealTime[],
  })
}

export function useUpdateMealTime() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      meal,
      ...patch
    }: {
      meal: Meal
      at?: string
      reminder_enabled?: boolean
    }) =>
      unwrapOne(
        await supabase
          .from('meal_times')
          .update(patch)
          .eq('user_id', userId)
          .eq('meal', meal)
          .select('*')
          .single(),
      ),
    onMutate: async ({ meal, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: keys.mealTimes(userId) })
      const previous = queryClient.getQueryData<MealTime[]>(keys.mealTimes(userId))
      if (previous) {
        queryClient.setQueryData(
          keys.mealTimes(userId),
          previous.map((row) => (row.meal === meal ? { ...row, ...patch } : row)),
        )
      }
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(keys.mealTimes(userId), context.previous)
    },
    onSuccess: (_row, { meal, reminder_enabled }) => {
      // Only the switch. Moving a reminder from 08:00 to 08:30 is somebody
      // adjusting a feature they already use, which is not what this is here to
      // measure — reminders are the app's only unprompted way back in, so the
      // question is how many people have any at all.
      if (reminder_enabled === undefined) return
      track('Reminder Toggled', { meal, enabled: reminder_enabled })

      // The count, kept fresh from the cache the mutation has already updated.
      // It is a fact about the account rather than an event, so it belongs on
      // the person: "users with no reminders on" is a cohort worth having.
      const rows = queryClient.getQueryData<MealTime[]>(keys.mealTimes(userId)) ?? []
      setPersonProps({ meal_reminders: rows.filter((row) => row.reminder_enabled).length })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.mealTimes(userId) }),
  })
}
