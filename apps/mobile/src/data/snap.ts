import { onlineManager, useQueryClient } from '@tanstack/react-query'
import { createElement, useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'

import i18n from '@/i18n'
import { dateOffset, type ScanOutcome, track } from '@/lib/analytics'
import {
  announceScan,
  cancelScanNotice,
  ensureNotificationPermission,
  scheduleScanNotice,
} from '@/lib/notifications'
import { useOnline } from '@/lib/online'
import { autoTagLocation, autoTagWanted, recordMealForLocationsOffer } from '@/lib/places'
import { recordMealLogged } from '@/lib/rating'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/ui'
import { TIMED_OUT, today, withDeadline } from './client'
import { invalidateEatenTotals, invalidateEntryPosts, keys } from './keys'
import { usePendingSnaps } from './pending-snaps'
import { lostUpload, uploadMealPhoto } from './photos'
import { keepQueuedPhoto, queuedPhotoUri } from './queued-photos'
import { announceRefusal, refusalFrom, ScanLimitError } from './refusals'
import { useSession, useUserId } from './session'
import type { EntryLocation } from './types'

export type SnapInput = {
  logDate: string
  /** The plate, if there was a camera to take it with. */
  photoUri?: string
  /**
   * The packet this shot is meant to answer for, when the camera was opened by
   * a barcode the catalogue could not resolve.
   *
   * Set only by the miss handoff, and only for the shot taken on that screen.
   * It does not change how the photo is read; it lets the server write the
   * panel back against this code so the next person to scan the packet gets an
   * answer rather than the same dead end.
   */
  barcode?: string
  /**
   * What the person added after the shutter about what the photo cannot show:
   * "beef not chicken", "shared". Empty or absent is the photo on its own, which
   * is also what Skip sends.
   */
  note?: string
  /**
   * Picked from the photo library rather than taken now, so where the phone is
   * says nothing about where it was eaten: no automatic tag (README: Meal
   * locations).
   */
  picked?: boolean
}

export type DescribeInput = {
  logDate: string
  /** The meal in the user's own words. */
  text: string
}

/**
 * How long a scan waits on the automatic tag once its photo is up (README:
 * Meal locations). The fix starts at the shutter and the upload gives it a
 * head start; past this the scan goes untagged rather than waiting on the GPS.
 */
const LOCATION_WAIT_MS = 3000
/** A typed meal has no upload to hide the wait behind, so it takes only a fix already at hand. */
const LOCATION_WAIT_TYPED_MS = 400

/** The location if it lands in time, else none. Never throws: a meal outranks its address. */
async function settleLocation(
  location: Promise<EntryLocation | null> | undefined,
  waitMs: number,
): Promise<EntryLocation | null> {
  if (!location) return null
  const settled = await withDeadline(
    location.catch(() => null),
    waitMs,
  )
  return settled === TIMED_OUT ? null : settled
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
 * Mark an error as one whose outcome is known: the distinction the pending row
 * turns on. A settled error means no entry is coming; an unsettled one means only
 * that this process stopped hearing about it. Attached to the error rather than
 * decided at the catch, where a timeout and a refusal are the same rejection.
 */
const settled = <E>(error: E, known = true): E =>
  known ? (Object.assign(error as object, { settled: true }) as E) : error

/**
 * The recognition call. The photo is already in the bucket and everything else
 * happens inside `scan-meal`, which writes the entries itself as service_role: a
 * scan records what the model claimed in `food_scan_items`, and no client is
 * granted that table.
 *
 * That is why a rejection here is not a failed scan: the work does not stop when
 * the caller stops listening, so this throws two kinds of error and marks which
 * is which. Once the caller is authenticated and the body parses, the function
 * never returns an HTTP error, so a status is an answer and anything else is the
 * wire.
 */
async function scanMeal(input: {
  photoPath?: string
  text?: string
  logDate: string
  barcode?: string
  note?: string
  location?: EntryLocation | null
  loggedAt?: string
}): Promise<ScanResponse> {
  const { data, error } = await supabase.functions.invoke<ScanResponse>('scan-meal', {
    body: {
      photo_path: input.photoPath,
      text: input.text,
      log_date: input.logDate,
      barcode: input.barcode,
      // Only with a photo: the server ignores it otherwise, and a typed meal
      // already is the words.
      note: input.photoPath && input.note ? input.note : undefined,
      // An older function ignores it, so the deploy order does not matter here.
      location: input.location ?? undefined,
      // Only for a meal sent after its shutter, from the queue. An older
      // function ignores it and stamps the entry when it arrives.
      logged_at: input.loggedAt,
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
  // The scan failed: no tier could say what the food was, the vision call would
  // not answer, or the write broke. The function answered, and its answer is no
  // — which it can now be, since the cascade lost the archetype floor that used
  // to guarantee a row. `settled`, so the pending row says so at once instead of
  // spinning out a deadline over an answer that has already arrived.
  if (!data?.ok) throw settled(new Error(data?.error ?? 'scan failed'), true)
  return data
}

/**
 * A scan that was never sent, because there was no connection to send it on.
 *
 * Thrown before the request to `scan-meal`, never after: the phone said it was
 * offline, or the photo's upload got no answer, so no object or request reached
 * the server and nothing about this meal exists there. That certainty is what
 * lets the queue send it again later with no chance of a second entry. A scan
 * request that broke in flight is a different thing (`detach`), because the
 * server may well be writing that one.
 */
class NotSent extends Error {
  readonly location: EntryLocation | null
  constructor(location: EntryLocation | null) {
    super('not sent: offline')
    this.name = 'NotSent'
    this.location = location
  }
}

/**
 * Whether Supabase answers at all, whatever it says. postgrest-js reports a
 * request that got no answer as status 0 rather than throwing.
 */
async function reachable(): Promise<boolean> {
  try {
    const { status } = await supabase.from('profiles').select('id', { head: true }).limit(1)
    return status > 0
  } catch {
    return false
  }
}

/** Everything a scan needs to be sent, whether at the shutter or from the queue. */
type Outgoing = {
  id: string
  logDate: string
  photoUri?: string
  text?: string
  barcode?: string
  note?: string
  /**
   * The fix started at the shutter, or the one a queued meal kept. A queued
   * meal is sent as from where it was eaten, not where the phone is now.
   */
  location?: Promise<EntryLocation | null> | EntryLocation | null
  /**
   * When the shutter fired, for a meal sent later than that. The entry is
   * stamped with it, so lunch photographed offline is not logged at dinner.
   */
  loggedAt?: string
}

/**
 * Sends one scan and settles its pending row: upload, invoke, and every way
 * that can end. Shared by the shutter and the queue, so a meal sent an hour
 * late is handled exactly like one sent at once.
 *
 * Nothing is cancelled when the caller unmounts: the sheet is gone a frame later
 * by design, and a snap that stopped there would be the app losing their food.
 */
function useSendScan() {
  const userId = useUserId()
  const queryClient = useQueryClient()
  const pending = usePendingSnaps()
  // The one place this layer reaches for UI. A refusal arrives seconds after
  // the sheet that started it has closed, so there is no screen left to hand
  // it back to — and `ToastProvider` sits outside the navigator precisely so a
  // message can outlive the screen that fired it.
  const toast = useToast()

  return useCallback(
    (snap: Outgoing): Promise<void> => {
      const { id, logDate, photoUri, text, barcode, note, location, loggedAt } = snap
      const method = text ? 'describe' : 'camera'
      const startedAt = Date.now()

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

      // Asked here rather than on launch, and effectively once: the OS shows its
      // dialog while a permission is undetermined and `ensure` declines to ask
      // again after a refusal. This is the moment it makes sense, since the user
      // has just started something that takes half a minute.
      //
      // The notice is booked here too: by the time the answer comes back the app
      // may be suspended, and a suspended app cannot post anything.
      //
      // A meal sent from the queue books it only once its photo is up. Its
      // shutter was long ago, so there is no permission to ask in the moment,
      // and on a connection that only looks alive the upload can outlast the
      // notice: it fired "your plate is counted" over a meal that was queued
      // again, every 30 seconds.
      const resending = loggedAt !== undefined
      let notice: string | null = null
      let booked: Promise<string | null> = Promise.resolve(null)
      const book = () => {
        booked = ensureNotificationPermission()
          .catch(() => false)
          .then(() =>
            scheduleScanNotice(i18n.t(doneTitle), i18n.t('logging:today.scanDoneBodyPlain')),
          )
          .then((id) => {
            notice = id
            return id
          })
          .catch(() => null)
      }
      if (!resending) book()

      // Settled once, however many steps ask: the queue needs it as much as the
      // scan does, and the fix is still being taken while the photo uploads.
      let where: Promise<EntryLocation | null> | null = null
      const settledWhere = () => {
        where ??= settleLocation(
          location instanceof Promise ? location : Promise.resolve(location ?? null),
          photoUri ? LOCATION_WAIT_MS : LOCATION_WAIT_TYPED_MS,
        )
        return where
      }

      /**
       * Failures here mean three different things, and only one is a failed
       * scan. An upload that throws leaves no object in the bucket, so nothing
       * was asked to recognise anything: settled, or queued when it was the
       * connection that failed. A broken request to the function leaves the
       * function still working, because it writes the entry itself, and calling
       * that "failed" is how a scan that succeeded produced an error message.
       */
      const work = async (): Promise<ScanResponse> => {
        // The phone says it is offline: nothing would arrive, so nothing is
        // sent, and the meal waits for the connection instead of failing.
        if (!onlineManager.isOnline()) throw new NotSent(await settledWhere())
        let path: string | undefined
        if (photoUri) {
          try {
            path = await uploadMealPhoto(photoUri)
          } catch (error) {
            if (lostUpload(error)) throw new NotSent(await settledWhere())
            throw settled(error instanceof Error ? error : new Error('upload failed'))
          }
        } else if (resending && !(await reachable())) {
          // A typed meal has no upload to prove the connection first, and a
          // scan request lost on the way could never be sent again safely.
          // The phone said online the moment it reconnected, before it could
          // know: one small read first, and the meal waits again if that is
          // lost too.
          throw new NotSent(await settledWhere())
        }
        if (resending) book()
        return scanMeal({
          photoPath: path,
          text,
          logDate,
          barcode,
          note,
          location: await settledWhere(),
          loggedAt,
        })
      }

      return work()
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
          // Here rather than beside `Meal Logged`, which fires at the commit.
          // The counter is the same either way, but crossing a checkpoint can put
          // a sheet on screen, and the commit is the moment a scan starts, with
          // the placeholder row still spinning. A plate with nothing edible in it
          // does not count, for the reason it is not a meal.
          recordMealLogged(userId)
          recordMealForLocationsOffer(userId)
          pending.remove(id)
          queryClient.invalidateQueries({ queryKey: keys.day(userId, logDate) })
          // The deferred auto post trigger may have published this scan.
          invalidateEntryPosts(queryClient, userId)
          // And the search panel's "My foods" tab: a scan is the third write
          // that changes what this account has recently eaten, and the newest
          // meal is the one most likely to be wanted again.
          queryClient.invalidateQueries({ queryKey: keys.recentFoods(userId) })
          queryClient.invalidateQueries({ queryKey: keys.streak(userId) })
          invalidateEatenTotals(queryClient, userId)
          // The scan is spent whichever way it turned out, so the count on the
          // camera panel has to move. Invalidated on the failure paths too, in
          // the catch below: a scan that ran out of budget is the one moment the
          // number matters most.
          queryClient.invalidateQueries({ queryKey: keys.scanQuota(userId) })
        })
        .catch(async (error: unknown) => {
          // Never sent, so nothing is coming and nothing is lost: the row waits
          // for a connection and `SnapQueue` sends it then. The booked notice
          // goes, since "your plate is counted" is exactly what has not
          // happened. No `Meal Scan Completed` yet: the scan has not run, and
          // the send that does run it reports how it went.
          if (error instanceof NotSent) {
            void booked.then(() => cancelScanNotice(notice))
            const kept = photoUri ? await keepQueuedPhoto(id, photoUri) : undefined
            pending.queue(id, { photoUri: kept, location: error.location })
            return
          }
          // The two refusals. The camera is not behind the paywall any more, so
          // what lands here is a free account's fourth plate of the day and the
          // answer is the paywall rather than an apology. The exception is a
          // subscriber who has reached a hundred, who is shown nothing to buy.
          //
          // Typing a meal is still Pro, so a described one can arrive here as
          // `not_entitled` when a subscription lapsed mid-request.
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
          // spinner and its photo, the day is polled until the entry appears, and
          // only a deadline with nothing on it is a failure. Never queued: the
          // server may be writing this entry right now, and sending it again
          // could log the meal twice.
          //
          // The booked notice stays, which is the case it was written for: the
          // answer is still coming, this process will not hear it, and a scheduled
          // notification fires whether or not the app is alive.
          completed('detached')
          pending.detach(id)
        })
    },
    [pending, queryClient, toast, userId],
  )
}

/**
 * Logs a snapped plate optimistically: the row appears now, the dish arrives
 * later. Waiting for the upload and the model call would make snapping the
 * slowest way to log rather than the fastest.
 *
 * The upload comes first rather than in parallel, because the edge function reads
 * the photo out of the bucket. The ordering also keeps `photo_path` naming a real
 * object, and an orphan from a failed scan is harmless.
 */
function useRecogniseMeal() {
  const userId = useUserId()
  const pending = usePendingSnaps()
  const send = useSendScan()

  return useCallback(
    ({
      logDate,
      photoUri,
      text,
      barcode,
      note,
      picked = false,
    }: {
      logDate: string
      photoUri?: string
      text?: string
      barcode?: string
      note?: string
      picked?: boolean
    }): string => {
      // Started now, at the shutter, so the upload covers the GPS's wait.
      const location =
        !picked && autoTagWanted(userId, logDate) ? autoTagLocation(userId, logDate) : undefined
      // Not a database id: this row does not exist yet. Prefixed so nothing
      // mistakes it for one and tries to update it.
      const id = `snap-${Date.now()}-${Math.round(Math.random() * 1e6)}`
      // The note and the code ride on the row so a meal queued for want of a
      // connection is sent later exactly as it would have been now.
      pending.add({
        id,
        logDate,
        photoUri,
        text,
        userId: userId ?? undefined,
        note: photoUri && note ? note : undefined,
        barcode,
      })

      /**
       * Two events for one meal. `Meal Logged` fires here, at the commit, because
       * that is what the user did and what the day shows; `Meal Scan Completed`
       * follows when the cascade answers, carrying the tier and the duration.
       *
       * One event at the end would drop every meal whose request broke, which is
       * the case the pending row exists to survive.
       */
      const method = text ? 'describe' : 'camera'
      const offset = dateOffset(logDate, today())
      track('Meal Logged', {
        method,
        date_offset: offset,
        // Whether the shot carried words, never the words themselves: a note
        // is diary content, and analytics carries none.
        // A device with no camera has no photo, so its note is never sent.
        ...(method === 'camera' ? { with_note: Boolean(note && photoUri) } : {}),
        // Asked for, not yet known: the fix may still miss the scan's wait.
        ...(location ? { located: true } : {}),
      })

      void send({ id, logDate, photoUri, text, barcode, note, location })
      return id
    },
    [pending, send, userId],
  )
}

/** How long a queued meal waits between tries while the phone says it is online. */
const QUEUE_RETRY_MS = 30_000

/**
 * Sends the meals taken without a connection, once there is one. Renders
 * nothing; mounted once, beside the toasts, because a refusal on the way may
 * have one to show.
 *
 * Each queued meal is sent at most once at a time (`sending`), and only as the
 * account that took it. It is tried when the phone comes back online or the
 * app comes back to the front, and every `QUEUE_RETRY_MS` while one waits, for
 * the phone that says it is online and still cannot get a photo up. A try that
 * fails for want of a connection queues it again; any other ending is the
 * ordinary scan's, so a queued meal is never sent twice.
 */
export function SnapQueue() {
  // Mounted at the root, where nobody may be signed in: the sending half needs
  // an account, and only exists while there is one.
  const { userId } = useSession()
  return userId ? createElement(SignedInSnapQueue) : null
}

function SignedInSnapQueue(): null {
  const { snaps, resend } = usePendingSnaps()
  const send = useSendScan()
  const userId = useUserId()
  const online = useOnline()

  // Read through refs, so `flush` keeps one identity. The pending context is a
  // new value on every change to any row, and an effect keyed on it resent a
  // meal the moment it was queued, past the wait between tries.
  const latest = useRef({ snaps, send, resend, userId })
  latest.current = { snaps, send, resend, userId }
  const sending = useRef(new Set<string>())
  const triedAt = useRef(new Map<string, number>())

  const flush = useCallback((now: boolean) => {
    const { snaps, send, resend, userId } = latest.current
    if (!userId || !onlineManager.isOnline()) return
    for (const snap of snaps) {
      if (snap.status !== 'queued' || snap.userId !== userId) continue
      if (sending.current.has(snap.id)) continue
      // A meal queued at the shutter counts the shutter as its first try.
      const last = triedAt.current.get(snap.id) ?? Date.parse(snap.loggedAt)
      if (!now && Date.now() - last < QUEUE_RETRY_MS) continue
      sending.current.add(snap.id)
      triedAt.current.set(snap.id, Date.now())
      resend(snap.id)
      void send({
        id: snap.id,
        logDate: snap.logDate,
        photoUri: queuedPhotoUri(snap.photoUri),
        text: snap.text,
        barcode: snap.barcode,
        note: snap.note,
        location: snap.location ?? null,
        loggedAt: snap.loggedAt,
      }).finally(() => sending.current.delete(snap.id))
    }
  }, [])

  // Coming back online, or signing in to the account that took them.
  useEffect(() => {
    if (online && userId) flush(true)
  }, [online, userId, flush])

  const waiting = snaps.some((snap) => snap.status === 'queued' && snap.userId === userId)
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => flush(false), QUEUE_RETRY_MS)
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') flush(false)
    })
    return () => {
      clearInterval(timer)
      listener.remove()
    }
  }, [waiting, flush])

  return null
}

/** The camera path. */
export function useSnapFood() {
  const recognise = useRecogniseMeal()
  return useCallback((input: SnapInput) => recognise(input), [recognise])
}

/**
 * The typing path: the same recognition, described in words. Optimistic for the
 * same reason. There is nothing to upload, so the wait is shorter, and still long
 * enough that a spinner would make typing the slow way to log a meal.
 */
export function useDescribeFood() {
  const recognise = useRecogniseMeal()
  return useCallback(
    ({ logDate, text }: DescribeInput) => recognise({ logDate, text: text.trim().slice(0, 500) }),
    [recognise],
  )
}
