import { useMutation, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrap, unwrapOne } from './client'
import { keys } from './keys'
import { removeMealPhoto } from './photos'
import { useUserId } from './session'
import type { DayLog, EntrySource, Meal } from './types'
import { toDbSource } from './types'

/**
 * Writes to `food_logs`.
 *
 * An entry is a foreign key and a quantity — no macros are copied, because
 * correcting a dish has to correct every log that used it. Everything these
 * mutations touch is invalidated by day, since that is the only shape anything
 * reads.
 */

export type LogInput = {
  foodId: string
  servingId: string
  meal: Meal
  quantity?: number
  note?: string
  source?: EntrySource
  photoPath?: string
  /** The day it counts towards. Defaults to the day being viewed. */
  logDate: string
}

export function useLogFood() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: LogInput) =>
      unwrapOne(
        await supabase
          .from('food_logs')
          .insert({
            user_id: userId,
            food_id: input.foodId,
            serving_id: input.servingId,
            meal: input.meal,
            quantity: input.quantity ?? 1,
            note: input.note,
            source: toDbSource(input.source ?? 'search'),
            photo_path: input.photoPath,
            log_date: input.logDate,
          })
          .select('id')
          .single(),
      ),
    onSuccess: (_row, input) => {
      queryClient.invalidateQueries({ queryKey: keys.day(userId, input.logDate) })
      // A first entry can start a streak, and both feed the badges.
      queryClient.invalidateQueries({ queryKey: keys.streak(userId) })
      queryClient.invalidateQueries({ queryKey: keys.usualFoods(userId, input.meal) })
    },
  })
}

export type EntryPatch = {
  id: string
  logDate: string
  quantity?: number
  servingId?: string
  meal?: Meal
  note?: string | null
}

export function useUpdateEntry() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, quantity, servingId, meal, note }: EntryPatch) =>
      unwrapOne(
        await supabase
          .from('food_logs')
          .update({
            ...(quantity === undefined ? {} : { quantity }),
            ...(servingId === undefined ? {} : { serving_id: servingId }),
            ...(meal === undefined ? {} : { meal }),
            ...(note === undefined ? {} : { note }),
          })
          .eq('id', id)
          .eq('user_id', userId)
          .select('id')
          .single(),
      ),
    onSuccess: (_row, patch) =>
      queryClient.invalidateQueries({ queryKey: keys.day(userId, patch.logDate) }),
  })
}

export function useRemoveEntry() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    // `logDate` is not read here — it is what `onMutate` and `onSettled` need
    // to find the day this row belongs to.
    mutationFn: async ({ id, photoPath }: { id: string; logDate: string; photoPath?: string }) => {
      unwrap(
        await supabase.from('food_logs').delete().eq('id', id).eq('user_id', userId).select('id'),
      )
      // After the row, not before: an object deleted for a row that then fails
      // to delete leaves an entry pointing at nothing.
      if (photoPath) await removeMealPhoto(photoPath)
    },
    // Undo has to look instant — it is offered in a toast that is already
    // fading, and a row that lingers reads as the undo not having worked.
    onMutate: async ({ id, logDate }) => {
      await queryClient.cancelQueries({ queryKey: keys.day(userId, logDate) })
      const previous = queryClient.getQueryData<DayLog>(keys.day(userId, logDate))
      if (previous) {
        queryClient.setQueryData(keys.day(userId, logDate), {
          ...previous,
          entries: previous.entries.filter((entry) => entry.id !== id),
        })
      }
      return { previous }
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.day(userId, variables.logDate), context.previous)
      }
    },
    onSettled: (_data, _error, { logDate }) => {
      queryClient.invalidateQueries({ queryKey: keys.day(userId, logDate) })
      queryClient.invalidateQueries({ queryKey: keys.streak(userId) })
    },
  })
}
