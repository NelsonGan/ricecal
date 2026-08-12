import { useMutation, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { unwrap, unwrapOne } from './client'
import { keys } from './keys'
import { removeMealPhoto } from './photos'
import { useUserId } from './session'
import { type LogSnapshot, snapshotColumns } from './snapshot'
import type { DayLog, EntrySource, IconRef } from './types'
import { toDbSource } from './types'

/**
 * Writes to `food_logs`.
 *
 * An entry used to be a foreign key and a quantity, with no macros copied,
 * because correcting a dish had to correct every log that used it. The
 * catalogue is in another database now and the numbers travel with the entry
 * instead — see `snapshot.ts`, which is where every write path's copy of them
 * is built. Everything these mutations touch is invalidated by day, since that
 * is the only shape anything reads.
 */

export type LogInput = {
  /**
   * What this entry IS: the name, the numbers and the portion, taken at the
   * moment of logging. Built by one of the three builders in `snapshot.ts` —
   * never assembled at a call site, because the portion is easy to count twice.
   */
  snapshot: LogSnapshot
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
            ...snapshotColumns(input.snapshot),
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
      // A meal moves this day's column, the range average and "days under goal"
      // on every one of the three ranges — hence the prefix rather than one key.
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
      // And the dot under this day on the week strip, which is that same
      // question — was the day under its goal — asked one day at a time.
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
      // Movement is measured against what was eaten: the balance chart, the
      // "eaten" average and the deficit sentence all read `daily_nutrition`
      // through `activity_summary`. Without this a meal logged today left
      // the Activity tab still saying "Not enough logged".
      queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
    },
  })
}

export type EntryPatch = {
  id: string
  logDate: string
  quantity?: number
  /**
   * A different portion, and all three columns of it.
   *
   * The id alone is a dangling note: nothing in Postgres can resolve it, since
   * `food_servings` is in D1 and no view joins to it. What the entry counts is
   * `base_* x serving_factor x quantity`, so a caller that sends the id and
   * keeps the factor has changed the row's label and not its arithmetic — which
   * reads, on the day, as a portion change that silently did nothing.
   */
  servingId?: string
  servingLabel?: string
  servingFactor?: number
  note?: string | null
  /**
   * What THIS entry is called. Written to `display_label`, which sits over the
   * catalogue row's own name — so renaming a plate never renames the dish for
   * anyone else who logged it.
   */
  name?: string
  /**
   * An illustration for this row, overriding whatever the food carries. `null`
   * clears it and falls back to the food's own.
   *
   * On the entry rather than on the food because `foods` is shared and read-only
   * to users, and most of the catalogue has no drawing to begin with.
   */
  icon?: IconRef | null
  /**
   * A photo for this row, already uploaded — the key `uploadMealPhoto` returned.
   *
   * A row carries a photo or an icon, never both: the picture of the actual plate
   * and a drawing of the dish are answers to the same question, and a check
   * constraint refuses to hold both. So this clears the icon columns in the same
   * statement, and `icon` clears this one.
   */
  photoPath?: string
  /**
   * What is on the row NOW, so that whichever of the two above replaces it can
   * delete the object it leaves behind. Nothing else reads it.
   */
  currentPhotoPath?: string
  /**
   * Figures the user typed for THIS entry, each overriding what the catalogue
   * computes. `null` clears one and goes back to the computed number; omitting
   * a field leaves whatever is stored alone.
   */
  overrides?: {
    kcal?: number | null
    carbs?: number | null
    protein?: number | null
    fat?: number | null
  }
}

export function useUpdateEntry() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      quantity,
      servingId,
      servingLabel,
      servingFactor,
      note,
      name,
      icon,
      photoPath,
      currentPhotoPath,
      overrides,
    }: EntryPatch) => {
      /**
       * The old object is orphaned when either kind of picture arrives to take
       * its place: an icon, or a newer photo. `photoPath !== currentPhotoPath`
       * because a patch that carries the same key it already has is not a
       * replacement, and deleting that object would blank the row.
       */
      const replacesPhoto =
        Boolean(currentPhotoPath) &&
        (Boolean(icon) || (Boolean(photoPath) && photoPath !== currentPhotoPath))

      const row = unwrapOne(
        await supabase
          .from('food_logs')
          .update({
            ...(quantity === undefined ? {} : { quantity }),
            ...(servingId === undefined ? {} : { serving_id: servingId }),
            // The two that make a portion change count for anything. Sent
            // separately from the id rather than folded into it, because
            // `serving_id` is nullable and soft while these two are what the
            // day's arithmetic reads.
            ...(servingLabel === undefined ? {} : { serving_label: servingLabel }),
            ...(servingFactor === undefined ? {} : { serving_factor: servingFactor }),
            ...(note === undefined ? {} : { note }),
            ...(name === undefined ? {} : { display_label: name }),
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
            // A photo and an icon cannot be on the row together, so this nulls the
            // icon columns in the same statement rather than trusting the caller
            // to have sent `icon: null` alongside. Written after the block above,
            // so a patch carrying both — which nothing sends — resolves to the
            // photo rather than to a constraint violation.
            ...((photoPath === undefined
              ? {}
              : { photo_path: photoPath, icon_set: null, icon_name: null }) as object),
            // Typed figures, same cast and same reason as the icon columns
            // above: generated types do not know a column until the migration
            // that adds it has been reset into the local stack.
            ...((overrides === undefined
              ? {}
              : {
                  ...(overrides.kcal === undefined ? {} : { override_kcal: overrides.kcal }),
                  ...(overrides.carbs === undefined ? {} : { override_carbs_g: overrides.carbs }),
                  ...(overrides.protein === undefined
                    ? {}
                    : { override_protein_g: overrides.protein }),
                  ...(overrides.fat === undefined ? {} : { override_fat_g: overrides.fat }),
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
      if (replacesPhoto && currentPhotoPath) await removeMealPhoto(currentPhotoPath)

      return row
    },
    onSuccess: (_row, patch) => {
      queryClient.invalidateQueries({ queryKey: keys.day(userId, patch.logDate) })
      // A corrected portion is a different day total, which is a different bar.
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
    },
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
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
    },
  })
}
