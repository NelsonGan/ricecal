import { useMutation, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrap, unwrapOne } from './client'
import { keys } from './keys'
import { removeMealPhoto } from './photos'
import { useUserId } from './session'
import type { DayLog, EntrySource, IconRef, Meal } from './types'
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
  /**
   * An illustration for this row, when the user picked one before adding.
   *
   * Most of the catalogue has no drawing, so a dish added from the list arrives
   * blank and the pre-add screen is where one gets chosen. Mutually exclusive
   * with `photoPath` — a check constraint refuses both — but nothing sends the
   * two together: a snap has a photo and no picker, a manual add is the reverse.
   */
  icon?: IconRef
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
            // Cast for the same reason as in `useUpdateEntry`:
            // `database.types.ts` is generated from a running local stack and
            // does not know these columns until `pnpm db:types` runs against the
            // migration that adds them.
            ...((input.icon
              ? { icon_set: input.icon.set, icon_name: input.icon.name }
              : {}) as object),
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
  /**
   * An illustration for this row, overriding whatever the food carries. `null`
   * clears it and falls back to the food's own.
   *
   * On the entry rather than on the food because `foods` is shared and read-only
   * to users, and most of the catalogue has no drawing to begin with.
   */
  icon?: IconRef | null
  /**
   * The photo currently on this row, so that setting an icon can delete it.
   *
   * A row carries a photo or an icon, never both — the picture of the actual
   * plate and a drawing of the dish are answers to the same question, and a
   * check constraint refuses to hold both. Read only when `icon` names one.
   */
  photoPath?: string
}

export function useUpdateEntry() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, quantity, servingId, meal, note, icon, photoPath }: EntryPatch) => {
      // An icon replaces the photo, because the row cannot hold both.
      const replacesPhoto = Boolean(icon) && Boolean(photoPath)

      const row = unwrapOne(
        await supabase
          .from('food_logs')
          .update({
            ...(quantity === undefined ? {} : { quantity }),
            ...(servingId === undefined ? {} : { serving_id: servingId }),
            ...(meal === undefined ? {} : { meal }),
            ...(note === undefined ? {} : { note }),
            // Both columns together: a check constraint refuses half an icon,
            // and `null` is how the row goes back to the food's own.
            //
            // Cast because `database.types.ts` is generated from a running local
            // stack and does not know these two columns until someone runs
            // `pnpm db:reset && pnpm db:types` against the migration that adds
            // them. Deliberately the narrowest possible seam — reads need no cast,
            // since the view already types both columns nullable — and it goes
            // away the moment the types are regenerated.
            ...((icon === undefined
              ? {}
              : {
                  icon_set: icon?.set ?? null,
                  icon_name: icon?.name ?? null,
                  ...(replacesPhoto ? { photo_path: null } : {}),
                }) as object),
          })
          .eq('id', id)
          .eq('user_id', userId)
          .select('id')
          .single(),
      )

      // After the row, not before: an object deleted for a row that then failed
      // to update leaves an entry pointing at nothing. Same order as
      // `useRemoveEntry`, for the same reason.
      if (replacesPhoto && photoPath) await removeMealPhoto(photoPath)

      return row
    },
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
