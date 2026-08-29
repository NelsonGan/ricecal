import { useMutation, useQueryClient } from '@tanstack/react-query'

import { dateOffset, type LogMethod, track } from '@/lib/analytics'
import { recordMealLogged } from '@/lib/rating'
import { supabase } from '@/lib/supabase'
import { today, unwrap, unwrapOne } from './client'
import { keys } from './keys'
import { removeMealPhoto } from './photos'
import { useUserId } from './session'
import { type LogSnapshot, snapshotColumns } from './snapshot'
import type { DayLog, EntrySource, IconRef } from './types'
import { toDbSource } from './types'

/**
 * Writes to `food_logs`.
 */

export type LogInput = {
  /**
   * What this entry is: the name, the numbers and the portion, taken at the moment
   * of logging. Built by one of the three builders in `snapshot.ts`, never
   * assembled at a call site, because the portion is easy to count twice.
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
   * blank and the pre-add screen is where one gets chosen. Mutually exclusive with
   * `photoPath`, and a check constraint refuses both.
   */
  icon?: IconRef
  /** The day it counts towards. Defaults to the day being viewed. */
  logDate: string
  /**
   * How the user got here, for analytics and for nothing else.
   *
   * Separate from `source`, which is a database column and a narrower question.
   * `entry_source` has no value for a barcode, a recipe or a dish re-logged from an
   * entry that already existed, because the column is about how the numbers were
   * obtained and these are about which door the user came through. Widening the
   * enum would be a migration, four views and a generated type for a report.
   */
  method?: LogMethod
}

/** What each database source means when nothing more specific was passed. */
const METHOD_FOR_SOURCE: Record<EntrySource, LogMethod> = {
  search: 'search',
  quickAdd: 'quick_add',
  camera: 'camera',
  text: 'describe',
  voice: 'describe',
  import: 'quick_add',
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
      // On success rather than at the tap, unlike the scan paths: this write is
      // one statement and there is no optimistic row standing in for it, so a
      // failure here means no meal was logged at all.
      track('Meal Logged', {
        method: input.method ?? METHOD_FOR_SOURCE[input.source ?? 'search'],
        date_offset: dateOffset(input.logDate, today()),
      })
      // Beside the event and for the same reason: this is the moment a meal
      // exists. It counts towards the rating prompt's milestone and may put the
      // sheet on screen a beat later. Synchronous and cannot throw, so nothing
      // below it is at risk. See `lib/rating`.
      recordMealLogged(userId)
      queryClient.invalidateQueries({ queryKey: keys.day(userId, input.logDate) })
      // And the search panel's "My foods" tab, whose whole content is the
      // newest of these. Invalidated on the write rather than left to go stale,
      // because the common way back into that list is straight after using it:
      // add a dish, notice the portion was wrong, come back.
      queryClient.invalidateQueries({ queryKey: keys.recentFoods(userId) })
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

/**
 * Which parts of an entry a patch actually moves.
 *
 * Sent with `Entry Updated` rather than the values themselves. What the report is
 * for is whether the catalogue offers the right portions, and the names of the
 * fields answer that while the numbers would only add a calorie count to a table
 * that has no business holding one.
 */
function changedFields(patch: EntryPatch): string[] {
  const changed: string[] = []
  if (patch.when !== undefined) changed.push('when')
  if (patch.quantity !== undefined) changed.push('quantity')
  if (patch.servingId !== undefined || patch.servingFactor !== undefined) changed.push('serving')
  if (patch.name !== undefined) changed.push('name')
  if (patch.note !== undefined) changed.push('note')
  if (patch.icon !== undefined) changed.push('icon')
  if (patch.photoPath !== undefined) changed.push('photo')
  if (patch.overrides !== undefined) changed.push('overrides')
  return changed
}

export type EntryPatch = {
  id: string
  /**
   * The day this entry is on NOW, which is what has to be invalidated. Not the
   * day it is being moved to — see `when`.
   */
  logDate: string
  /**
   * When this was eaten, and both columns of it.
   *
   * `log_date` is the day the entry counts towards and `logged_at` is the instant,
   * and they are written together for the same reason a portion writes all three of
   * its columns. Sent alone, the timestamp would move the row inside a day it had
   * not left, and the date would move the row to a day whose ordering still read
   * off the old afternoon.
   *
   * Moving the date is what makes this more than an edit: the entry leaves one
   * day's totals and joins another's, so `onSuccess` invalidates both and the
   * streak as well, since an emptied day can break one.
   */
  when?: { logDate: string; loggedAt: string }
  quantity?: number
  /**
   * A different portion, and all three columns of it.
   *
   * The id alone is a dangling note: nothing in Postgres can resolve it, since
   * `food_servings` is in D1 and no view joins to it. What the entry counts is
   * `base_* x serving_factor x quantity`, so a caller that sends the id and keeps
   * the factor has changed the row's label and not its arithmetic, which reads on
   * the day as a portion change that silently did nothing.
   */
  servingId?: string
  servingLabel?: string
  servingFactor?: number
  note?: string | null
  /**
   * What this entry is called. Written to `display_label`, which sits over the
   * catalogue row's own name, so renaming a plate never renames the dish for
   * anyone else who logged it.
   */
  name?: string
  /**
   * An illustration for this row, overriding whatever the food carries. `null`
   * clears it and falls back to the food's own.
   *
   * On the entry rather than on the food because `foods` is shared and read-only to
   * users, and most of the catalogue has no drawing to begin with.
   */
  icon?: IconRef | null
  /**
   * A photo for this row, already uploaded: the key `uploadMealPhoto` returned.
   *
   * A row carries a photo or an icon, never both. The picture of the actual plate
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
   * Figures the user typed for this entry, each overriding what the catalogue
   * computes. `null` clears one and goes back to the computed number; omitting a
   * field leaves whatever is stored alone.
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
      when,
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
       * The old object is orphaned when either kind of picture arrives to take its
       * place, an icon or a newer photo. `photoPath !== currentPhotoPath` because a
       * patch carrying the same key it already has is not a replacement, and deleting
       * that object would blank the row.
       */
      const replacesPhoto =
        Boolean(currentPhotoPath) &&
        (Boolean(icon) || (Boolean(photoPath) && photoPath !== currentPhotoPath))

      const row = unwrapOne(
        await supabase
          .from('food_logs')
          .update({
            // Both or neither, for the reason on `when`.
            ...(when === undefined ? {} : { log_date: when.logDate, logged_at: when.loggedAt }),
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
            // Both columns together: a check constraint refuses half an icon, and `null` is
            // how the row goes back to the food's own.
            //
            // Cast because `database.types.ts` is generated from a running local stack and
            // does not know these two columns until someone runs `pnpm db:reset &&
            // pnpm db:types` against the migration that adds them. Reads need no cast, since
            // the view already types both columns nullable, and this goes away the moment
            // the types are regenerated.
            ...((icon === undefined
              ? {}
              : {
                  icon_set: icon?.set ?? null,
                  icon_name: icon?.name ?? null,
                  ...(replacesPhoto ? { photo_path: null } : {}),
                }) as object),
            // A photo and an icon cannot be on the row together, so this nulls the icon
            // columns in the same statement rather than trusting the caller to have sent
            // `icon: null` alongside. Written after the block above, so a patch carrying both
            // resolves to the photo rather than to a constraint violation.
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
      track('Entry Updated', { changed: changedFields(patch) })
      queryClient.invalidateQueries({ queryKey: keys.day(userId, patch.logDate) })
      // The day it moved TO, when it moved. Without this the meal arrives on a
      // day whose cached answer was worked out before it got there — and if that
      // day happens to be the one on screen, it simply does not appear.
      if (patch.when && patch.when.logDate !== patch.logDate) {
        queryClient.invalidateQueries({ queryKey: keys.day(userId, patch.when.logDate) })
        // A day emptied by the move can break a streak, and a day filled by it
        // can start one. No other kind of patch can change which days have
        // entries on them, which is why this is not unconditional.
        queryClient.invalidateQueries({ queryKey: keys.streak(userId) })
      }
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
    // `logDate` is not read here: it is what `onMutate` and `onSettled` need to find
    // the day this row belongs to. `source` is read by neither, and is carried so the
    // analytics event can say which kind of entry was thrown away, which is the
    // closest thing the app has to a quality signal on the scan cascade that does not
    // involve reading anybody's diary.
    mutationFn: async ({
      id,
      photoPath,
    }: {
      id: string
      logDate: string
      photoPath?: string
      source?: EntrySource
    }) => {
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
    // On success rather than on settled: an optimistic removal that the server
    // refused puts the row back, and counting that as a deletion would report
    // a failed request as a user throwing their meal away.
    onSuccess: (_data, { source }) => {
      track('Entry Deleted', { source: source ?? 'unknown' })
    },
    onSettled: (_data, _error, { logDate }) => {
      queryClient.invalidateQueries({ queryKey: keys.day(userId, logDate) })
      // A deleted meal leaves the "My foods" list too. It is the one write that
      // can take a row OUT of it, and a list still offering a meal the user has
      // just thrown away is the app arguing with them.
      queryClient.invalidateQueries({ queryKey: keys.recentFoods(userId) })
      queryClient.invalidateQueries({ queryKey: keys.streak(userId) })
      queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
    },
  })
}
