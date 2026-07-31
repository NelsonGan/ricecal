import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { AppState } from 'react-native'

import i18n from '@/i18n'
import {
  announceScan,
  cancelScanNotice,
  ensureNotificationPermission,
  scheduleScanNotice,
} from '@/lib/notifications'
import { supabase } from '@/lib/supabase'
import { keys } from './keys'
import { usePendingSnaps } from './pending-snaps'
import { uploadMealPhoto } from './photos'
import { useUserId } from './session'
import type { Meal } from './types'

export type SnapInput = {
  meal: Meal
  logDate: string
  /** The plate, if there was a camera to take it with. */
  photoUri?: string
}

/** What the scan-meal edge function answers with. */
type ScanResponse = {
  ok: boolean
  scanId?: string
  /** False when the photo had nothing edible in it. No entry was written. */
  food?: boolean
  entries?: Array<{ id: string; foodId: string; tier: number; name: string; kcal: number }>
  error?: string
}

/**
 * The recognition call. The photo is already in the bucket; everything else —
 * the vision model, the catalogue search, the five-tier fallback — happens
 * inside the `scan-meal` edge function, which also WRITES the entries itself
 * as service_role. It has to: tier 4 creates catalogue rows, which no client
 * is allowed to do.
 *
 * The function's contract is that once the photo is uploaded it never returns
 * an HTTP error — the cascade bottoms out at an archetype row that needs no
 * model and no network. So a rejection here means the scan genuinely did not
 * happen (offline, signed out), which is exactly when the pending row should
 * stay on screen as failed.
 */
async function scanMeal(input: {
  photoPath?: string
  meal: Meal
  logDate: string
}): Promise<ScanResponse> {
  const { data, error } = await supabase.functions.invoke<ScanResponse>('scan-meal', {
    body: {
      photo_path: input.photoPath,
      meal: input.meal,
      log_date: input.logDate,
    },
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error ?? 'scan failed')
  return data
}

/**
 * Logs a snapped plate optimistically: the row appears now, the dish arrives
 * later.
 *
 * Recognition is a model call and the upload is a network round trip, so
 * waiting for either would make snapping the slowest way to log rather than
 * the fastest. Instead the row goes on the day immediately as a pending snap,
 * the sheet closes, and the slow work happens behind it.
 *
 * The upload comes FIRST, not in parallel with recognition the way the mock
 * flow ran them: the edge function reads the photo out of the bucket, so
 * there is nothing to recognise until the object exists. The ordering also
 * keeps the old invariant — `photo_path` on an entry always names a real
 * object, and an orphaned object from a failed scan is harmless.
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
    ({ meal, logDate, photoUri }: SnapInput): string => {
      // Not a database id: this row does not exist yet. Prefixed so nothing
      // mistakes it for one and tries to update it.
      const id = `snap-${Date.now()}-${Math.round(Math.random() * 1e6)}`
      pending.add({ id, meal, logDate, photoUri })

      // Asked here rather than on launch, and effectively once: the OS shows
      // its dialog while a permission is undetermined and `ensure` declines to
      // ask again after a refusal. This is the moment it makes sense — the
      // user has just started something that takes half a minute, which is the
      // reason the notification exists.
      //
      // The notice is BOOKED here for the same reason: by the time the answer
      // comes back the app may be suspended, and a suspended app cannot post
      // anything. See `scheduleScanNotice`.
      let notice: string | null = null
      const booked = ensureNotificationPermission()
        .catch(() => false)
        .then(() =>
          scheduleScanNotice(
            i18n.t('logging:today.scanDoneTitle'),
            i18n.t('logging:today.scanDoneBodyPlain'),
          ),
        )
        .then((id) => {
          notice = id
          return id
        })
        .catch(() => null)

      const work = async () => {
        const path = photoUri ? await uploadMealPhoto(userId, photoUri) : undefined
        return scanMeal({ photoPath: path, meal, logDate })
      }

      work()
        .then((result) => {
          // Nothing edible in the photo: no entry exists to refetch into, so
          // the row stays and says so. Dismissing it is the user's answer.
          if (result.food === false) {
            void booked.then(() => cancelScanNotice(notice))
            pending.noFood(id)
            return
          }

          // Still awake, so the booked notice is not needed as it stands: in
          // front, the row on Today has already turned into the dish; behind,
          // this can say which dish it was instead of guessing.
          void booked.then(() => cancelScanNotice(notice))
          if (AppState.currentState !== 'active') {
            const entry = result.entries?.[0]
            void announceScan(
              i18n.t('logging:today.scanDoneTitle'),
              entry
                ? i18n.t('logging:today.scanDoneBody', {
                    food: entry.name,
                    kcal: entry.kcal.toLocaleString(),
                  })
                : i18n.t('logging:today.scanDoneBodyPlain'),
            )
          }

          // The real rows are in the database now, so the placeholder goes and
          // the day refetches into them. Removing first avoids one frame with
          // both on screen.
          pending.remove(id)
          queryClient.invalidateQueries({ queryKey: keys.day(userId, logDate) })
          queryClient.invalidateQueries({ queryKey: keys.streak(userId) })
          queryClient.invalidateQueries({ queryKey: keys.recentFoodsAll(userId) })
          queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
        })
        // A failed scan has nothing to announce, so the booked notice goes
        // too — the row on Today says what happened, and a banner claiming
        // the plate was counted would be a lie the user acts on.
        //
        // The row stays, with its photo, and says it could not be read. Losing
        // both because a request timed out would make the user take the
        // picture again for nothing.
        .catch(() => {
          void booked.then(() => cancelScanNotice(notice))
          pending.fail(id)
        })

      return id
    },
    [pending, queryClient, userId],
  )
}
