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

export type SnapInput = {
  logDate: string
  /** The plate, if there was a camera to take it with. */
  photoUri?: string
}

export type DescribeInput = {
  logDate: string
  /** The meal in the user's own words. */
  text: string
}

/** What the scan-meal edge function answers with. */
type ScanResponse = {
  ok: boolean
  scanId?: string
  /** False when the evidence had nothing edible in it. No entry was written. */
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
  text?: string
  logDate: string
}): Promise<ScanResponse> {
  const { data, error } = await supabase.functions.invoke<ScanResponse>('scan-meal', {
    body: {
      photo_path: input.photoPath,
      text: input.text,
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
function useRecogniseMeal() {
  const userId = useUserId()
  const queryClient = useQueryClient()
  const pending = usePendingSnaps()

  return useCallback(
    ({
      logDate,
      photoUri,
      text,
    }: {
      logDate: string
      photoUri?: string
      text?: string
    }): string => {
      // Not a database id: this row does not exist yet. Prefixed so nothing
      // mistakes it for one and tries to update it.
      const id = `snap-${Date.now()}-${Math.round(Math.random() * 1e6)}`
      pending.add({ id, logDate, photoUri, text })
      // A typed meal has no picture, so the banner and the row talk about the
      // words instead of the plate. Same work underneath, different noun.
      const doneTitle = text ? 'logging:today.describeDoneTitle' : 'logging:today.scanDoneTitle'

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
          scheduleScanNotice(i18n.t(doneTitle), i18n.t('logging:today.scanDoneBodyPlain')),
        )
        .then((id) => {
          notice = id
          return id
        })
        .catch(() => null)

      /**
       * Two failures live in here and they mean opposite things.
       *
       * If the UPLOAD throws there is no object in the bucket, so nothing was
       * ever asked to recognise anything and no entry is coming: that is a real
       * failure and the row should say so at once. If the INVOKE throws, the
       * request is what broke — a timeout, a dropped connection, an app the OS
       * suspended mid-flight — and the function on the other end is very
       * probably still working, because it writes the entry itself rather than
       * handing it back for us to write. Calling that one "failed" is how a
       * scan that succeeded produced an error message.
       *
       * So the two are distinguished here rather than at the catch, where they
       * arrive as the same rejected promise.
       */
      const work = async (): Promise<ScanResponse> => {
        let path: string | undefined
        if (photoUri) {
          try {
            path = await uploadMealPhoto(photoUri)
          } catch (error) {
            throw Object.assign(error instanceof Error ? error : new Error('upload failed'), {
              beforeScan: true,
            })
          }
        }
        return scanMeal({ photoPath: path, text, logDate })
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
              i18n.t(doneTitle),
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
          queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
          // Movement is measured against what was eaten: the balance chart, the
          // "eaten" average and the deficit sentence all read `daily_nutrition`
          // through `activity_summary`. Without this a meal logged today left
          // the Activity tab still saying "Not enough logged".
          queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
        })
        .catch((error: unknown) => {
          // Nothing reached the server, so nothing is coming: say so now.
          if ((error as { beforeScan?: boolean })?.beforeScan) {
            // A failed scan has nothing to announce, so the booked notice goes
            // too — the row on Today says what happened, and a banner claiming
            // the plate was counted would be a lie the user acts on.
            void booked.then(() => cancelScanNotice(notice))
            pending.fail(id)
            return
          }
          // The request broke; the scan probably did not. The row keeps its
          // spinner and its photo, the day is polled until the entry appears,
          // and only a deadline with nothing on it turns this into a failure.
          //
          // The booked notice STAYS for this one. It is the case it was
          // written for: the answer is still coming, this process is no longer
          // the thing that will hear it, and a scheduled notification fires
          // whether or not the app is alive to fire it.
          pending.detach(id)
        })

      return id
    },
    [pending, queryClient, userId],
  )
}

/** The camera path. */
export function useSnapFood() {
  const recognise = useRecogniseMeal()
  return useCallback((input: SnapInput) => recognise(input), [recognise])
}

/**
 * The typing path: the same recognition, described in words.
 *
 * Optimistic for the same reason and in the same way — the row goes on the day
 * with the sentence on it, the sheet closes, and the cascade runs behind it.
 * There is nothing to upload, so the wait is one model call shorter, but it is
 * still long enough that holding the user on a spinner would make typing the
 * slow way to log a meal.
 */
export function useDescribeFood() {
  const recognise = useRecogniseMeal()
  return useCallback(
    ({ logDate, text }: DescribeInput) => recognise({ logDate, text: text.trim().slice(0, 500) }),
    [recognise],
  )
}
