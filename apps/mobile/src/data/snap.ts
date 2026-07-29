import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { recogniseDish } from '@/features/logging/recognise'
import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { usePendingSnaps } from './pending-snaps'
import { uploadMealPhoto } from './photos'
import { useUserId } from './session'
import type { Meal } from './types'
import { toDbSource } from './types'

export type SnapInput = {
  meal: Meal
  logDate: string
  /** The plate, if there was a camera to take it with. */
  photoUri?: string
  source: 'camera' | 'barcode'
}

/**
 * Logs a snapped plate optimistically: the row appears now, the dish arrives
 * later.
 *
 * Recognition is a model call and the upload is a network round trip, so
 * waiting for either would make snapping the slowest way to log rather than
 * the fastest. Instead the row goes on the day immediately as a pending snap,
 * the sheet closes, and the two slow things happen in parallel behind it.
 *
 * The order at the end matters: the photo has to be in the bucket before the
 * row that names it, because `photo_path` on an entry pointing at nothing is
 * worse than an entry with no photo. An orphaned object the other way round is
 * harmless.
 *
 * Nothing is cancelled when the caller unmounts — the sheet is gone a frame
 * later by design, and a snap that stopped because the user navigated away
 * would be the app losing their food.
 */
export function useSnapFood() {
  const userId = useUserId()
  const queryClient = useQueryClient()
  const pending = usePendingSnaps()

  return useCallback(
    ({ meal, logDate, photoUri, source }: SnapInput): string => {
      // Not a database id: this row does not exist yet. Prefixed so nothing
      // mistakes it for one and tries to update it.
      const id = `snap-${Date.now()}-${Math.round(Math.random() * 1e6)}`
      pending.add({ id, meal, logDate, photoUri })

      const work = async () => {
        const [path, recognition] = await Promise.all([
          photoUri ? uploadMealPhoto(userId, photoUri) : Promise.resolve(undefined),
          recogniseDish(source === 'barcode' ? 'barcode' : 'photo'),
        ])

        const { error } = await supabase.from('food_logs').insert({
          user_id: userId,
          food_id: recognition.foodId,
          serving_id: recognition.servingId,
          meal,
          quantity: 1,
          log_date: logDate,
          source: toDbSource(source),
          photo_path: path,
        })

        if (error) throw error
      }

      work()
        .then(() => {
          // The real row is in the database now, so the placeholder goes and
          // the day refetches into it. Removing first avoids one frame with
          // both on screen.
          pending.remove(id)
          queryClient.invalidateQueries({ queryKey: keys.day(userId, logDate) })
          queryClient.invalidateQueries({ queryKey: keys.streak(userId) })
          queryClient.invalidateQueries({ queryKey: keys.usualFoods(userId, meal) })
        })
        // The row stays, with its photo, and says it could not be read. Losing
        // both because a request timed out would make the user take the
        // picture again for nothing.
        .catch(() => pending.fail(id))

      return id
    },
    [pending, queryClient, userId],
  )
}
