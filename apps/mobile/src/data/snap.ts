import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { AppState } from 'react-native'

import i18n from '@/i18n'
import { dateOffset, type ScanOutcome, track } from '@/lib/analytics'
import {
  announceScan,
  cancelScanNotice,
  ensureNotificationPermission,
  scheduleScanNotice,
} from '@/lib/notifications'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/ui'
import { today } from './client'
import { keys } from './keys'
import { usePendingSnaps } from './pending-snaps'
import { uploadMealPhoto } from './photos'
import { announceRefusal, refusalFrom, ScanLimitError } from './refusals'
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
 * Mark an error as one whose OUTCOME IS KNOWN.
 *
 * The distinction the pending row turns on: a settled error means no entry is
 * coming and the row should say so now, while an unsettled one means only that
 * this process stopped hearing about it. Attached to the error rather than
 * decided at the catch, because by the time it gets there a timeout and a
 * refusal are the same rejected promise.
 */
const settled = <E>(error: E, known = true): E =>
  known ? (Object.assign(error as object, { settled: true }) as E) : error

/**
 * The recognition call. The photo is already in the bucket; everything else —
 * the vision model, the catalogue search, the five-tier fallback — happens
 * inside the `scan-meal` edge function, which also WRITES the entries itself as
 * service_role. It has to: a scan records what the model claimed in
 * `food_scan_items`, and no client is granted that table.
 *
 * That the function writes the entry ITSELF is why a rejection here is not the
 * same as a failed scan. The work does not stop when the caller stops listening
 * — there is no result to hand back and drop — so this throws two kinds of
 * error and marks which is which. The function's contract is that once the
 * caller is authenticated and the body parses it never returns an HTTP error,
 * the cascade bottoming out at an archetype row that needs no model and no
 * network; so a status IS an answer, and anything else is the wire.
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
  if (error) {
    // A refusal, before anything else. These are the two 4xx answers the
    // endpoint gives BEFORE the cascade starts, so nothing was written and
    // nothing is coming — settled, like the rest of the statuses below, but
    // carrying which refusal it was so the row can say something better than
    // "scan failed".
    const refusal = await refusalFrom(error)
    if (refusal) throw settled(refusal, true)
    // A STATUS is an answer. This endpoint does not return an HTTP error once
    // the caller is authenticated and the body parses — that is its contract —
    // so a 4xx here means "not signed in" or "not your photo", and no entry is
    // on its way. Everything else that lands in `error` is the transport
    // failing, which says nothing about what the function is doing.
    throw settled(error, (error as { name?: string }).name === 'FunctionsHttpError')
  }
  // The cascade's own floor gave way (the database was down, the terminal
  // archetype row is missing). The function answered, and its answer is no.
  if (!data?.ok) throw settled(new Error(data?.error ?? 'scan failed'), true)
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
 * The upload comes FIRST rather than in parallel with recognition: the edge
 * function reads the photo out of the bucket, so there is nothing to recognise
 * until the object exists. The ordering also keeps `photo_path` on an entry
 * always naming a real object, and an orphaned object from a failed scan is
 * harmless.
 *
 * Nothing is cancelled when the caller unmounts — the sheet is gone a frame
 * later by design, and a snap that stopped because the user navigated away
 * would be the app losing their food.
 */
function useRecogniseMeal() {
  const userId = useUserId()
  const queryClient = useQueryClient()
  const pending = usePendingSnaps()
  // The one place this layer reaches for UI. A refusal arrives seconds after
  // the sheet that started it has closed, so there is no screen left to hand
  // it back to — and `ToastProvider` sits outside the navigator precisely so a
  // message can outlive the screen that fired it.
  const toast = useToast()

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

      /**
       * TWO EVENTS FOR ONE MEAL, and they answer different questions.
       *
       * `Meal Logged` is fired HERE, at the commit, because that is what the
       * user did and what the day already shows — a pending row on the diary.
       * `Meal Scan Completed` follows when the cascade answers, carrying which
       * tier priced it and how long it took.
       *
       * The alternative — one event at the end — would drop every meal whose
       * request broke, which is exactly the case the pending row exists to
       * survive: the edge function writes the entry itself, so a scan that
       * stopped reporting to this process very probably still landed.
       */
      const method = text ? 'describe' : 'camera'
      const startedAt = Date.now()
      const offset = dateOffset(logDate, today())
      track('Meal Logged', { method, date_offset: offset })

      const completed = (outcome: ScanOutcome, result?: ScanResponse) =>
        track('Meal Scan Completed', {
          method,
          outcome,
          duration_ms: Date.now() - startedAt,
          // The tier the FIRST entry landed on. A decomposed plate has one per
          // component, but the tier is a property of how the cascade resolved
          // the meal rather than of each part, and `components` below is what
          // says the plate came apart.
          tier: result?.entries?.[0]?.tier ?? null,
          components: result?.entries?.length ?? 0,
        })
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
       * Failures in here mean two different things, and only one of them is a
       * failure of the SCAN.
       *
       * If the upload throws there is no object in the bucket, so nothing was
       * ever asked to recognise anything: settled, and the row should say so at
       * once. If the request to the function breaks — a timeout, a dropped
       * connection, an app the OS suspended mid-flight — the function on the
       * other end is very probably still working, because it writes the entry
       * itself rather than handing it back for us to write. Calling that one
       * "failed" is how a scan that succeeded produced an error message.
       */
      const work = async (): Promise<ScanResponse> => {
        let path: string | undefined
        if (photoUri) {
          try {
            path = await uploadMealPhoto(photoUri)
          } catch (error) {
            throw settled(error instanceof Error ? error : new Error('upload failed'))
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
            completed('no_food', result)
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
          completed('logged', result)
          pending.remove(id)
          queryClient.invalidateQueries({ queryKey: keys.day(userId, logDate) })
          queryClient.invalidateQueries({ queryKey: keys.streak(userId) })
          queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
          queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
          // Movement is measured against what was eaten: the balance chart, the
          // "eaten" average and the deficit sentence all read `daily_nutrition`
          // through `activity_summary`. Without this a meal logged today left
          // the Activity tab still saying "Not enough logged".
          queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
          // The scan is spent whichever way it turned out, so the count on the
          // camera panel has to move. Invalidated on the failure paths too, in
          // the catch below: a scan that ran out of budget is the one moment the
          // number matters most.
          queryClient.invalidateQueries({ queryKey: keys.scanQuota(userId) })
        })
        .catch((error: unknown) => {
          // The two refusals. A snapped plate is REFUSED FOR A DIFFERENT REASON
          // now than it used to be: the camera is not behind the paywall any
          // more, so what lands here is a free account's fourth plate of the
          // day, and the answer to that is the paywall rather than an apology.
          // `announceRefusal` says what happened and opens it — except to a
          // subscriber who has somehow reached fifty, who is told and shown
          // nothing to buy.
          //
          // Typing a meal is still Pro, so a described one can also arrive here
          // as `not_entitled` when a subscription lapsed between the send and
          // the request.
          queryClient.invalidateQueries({ queryKey: keys.scanQuota(userId) })
          if (announceRefusal(toast, error, method === 'describe' ? 'describe' : 'camera')) {
            void booked.then(() => cancelScanNotice(notice))
            pending.fail(id)
            completed(error instanceof ScanLimitError ? 'limit_reached' : 'not_entitled')
            return
          }
          // The outcome is known and it is no: say so now rather than spinning
          // out the deadline over an answer that already arrived.
          if ((error as { settled?: boolean })?.settled) {
            // A failed scan has nothing to announce, so the booked notice goes
            // too — the row on Today says what happened, and a banner claiming
            // the plate was counted would be a lie the user acts on.
            void booked.then(() => cancelScanNotice(notice))
            pending.fail(id)
            completed('failed')
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
          completed('detached')
          pending.detach(id)
        })

      return id
    },
    [pending, queryClient, toast, userId],
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
