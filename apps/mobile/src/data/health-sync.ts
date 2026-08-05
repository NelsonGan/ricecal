import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import type { HealthProvider, HealthReading, ProviderId } from '@/lib/health'
import { providerFor } from '@/lib/health'
import { ageFrom } from '@/lib/nutrition'
import { supabase } from '@/lib/supabase'
import { daysAgo } from './activity'
import { dateKey } from './client'
import { keys } from './keys'
import { useUserId } from './session'

/**
 * Reading the phone's health store into the database.
 *
 * The only place in the app that writes `activity_days`, `activity_sessions`
 * and `activity_hours`.
 *
 * WHAT "SEAMLESS" MEANS HERE
 *
 * The user connects once and never thinks about it again. There is no sync
 * button on any screen that matters, no spinner between them and their numbers,
 * and no state where the app is right and the watch is not. Three mechanisms
 * get there, and each one exists because the others cannot cover its case:
 *
 *   1. A BACKFILL on connect, a year deep, chunked so the UI keeps painting.
 *      Without it the Activity tab is empty on the day it is turned on, which
 *      reads as broken rather than as new.
 *   2. A ROLLING WINDOW on every foreground. Not "since last sync" — see below.
 *   3. A REFETCH of the affected queries when either lands, so Today's budget
 *      moves without the user pulling anything.
 *
 * WHY THE INCREMENTAL SYNC RE-READS A WINDOW RATHER THAN A CURSOR
 *
 * This is the decision the whole file is shaped around, and the naive
 * alternative is wrong in a way that only shows up in the field.
 *
 * Health data arrives LATE and it arrives EDITED. A watch out of Bluetooth
 * range writes Tuesday's calories on Wednesday evening. Strava back-dates a run
 * uploaded from a laptop. Apple recomputes a day's active energy when a second
 * source turns up. A cursor — "everything since the last sync instant" —
 * misses all three, permanently, because the data's timestamp is older than the
 * cursor by the time it exists.
 *
 * So the incremental pass re-reads the last seven days, every time, and upserts
 * them. Seven because that is comfortably longer than any late arrival anyone
 * has observed and short enough to be one round trip. Every key in the schema
 * was chosen to make that repetition free: days are keyed by date, hours by
 * date and hour, and sessions by the store's own id.
 *
 * WHY IT IS NOT AN EDGE FUNCTION
 *
 * Nothing here needs a secret and there is nothing to authenticate against. The
 * data is on the device, behind a permission the user granted to this app; the
 * server could not fetch it if it wanted to. This is the one write path in
 * RiceCal that genuinely belongs on the client.
 */

/** How far back a first connection reads. */
const BACKFILL_DAYS = 365

/**
 * How far back every incremental pass re-reads. See the header — this is the
 * number that makes late-arriving watch data land.
 */
const WINDOW_DAYS = 7

/** How much of the past keeps an hourly breakdown. Nothing draws older. */
const HOURLY_DAYS = 30

/**
 * The backfill's chunk size, in days.
 *
 * A single year-long statistics query blocks the JS thread long enough to drop
 * frames on the screen that started it. Thirty days is about a tenth of a
 * second on an iPhone and lets the progress count climb visibly, which is the
 * difference between a wait and a hang.
 */
const CHUNK_DAYS = 30

/** The shortest gap between two automatic syncs. */
const MIN_INTERVAL_MS = 60_000

export type SyncMode = 'backfill' | 'window'

export type SyncProgress = {
  /** Days read so far, out of `total`. Only meaningful during a backfill. */
  done: number
  total: number
}

/**
 * Writes one reading.
 *
 * Every statement is an upsert onto a key the provider cannot collide with, so
 * calling this twice with the same reading is indistinguishable from calling it
 * once. That is the property the whole design rests on, and it is worth stating
 * where it is implemented rather than only where it is relied upon.
 */
async function persist(
  userId: string,
  provider: ProviderId,
  reading: HealthReading,
  window: { from: string; to: string; withHours: boolean },
): Promise<void> {
  if (reading.days.length > 0) {
    const { error } = await supabase.from('activity_days').upsert(
      reading.days.map((day) => ({
        user_id: userId,
        log_date: day.date,
        provider,
        active_kcal: day.activeKcal,
        resting_kcal: day.restingKcal,
        steps: day.steps,
        distance_m: day.distanceM,
        exercise_minutes: day.exerciseMinutes,
        stand_hours: day.standHours,
        flights: day.flights,
        move_goal_kcal: day.moveGoalKcal,
        exercise_goal_min: day.exerciseGoalMin,
        stand_goal_hr: day.standGoalHr,
        synced_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,log_date' },
    )
    if (error) throw error
  }

  if (reading.workouts.length > 0) {
    const { error } = await supabase.from('activity_sessions').upsert(
      reading.workouts.map((workout) => ({
        user_id: userId,
        provider,
        external_id: workout.externalId,
        log_date: workout.date,
        kind: workout.kind,
        kind_label: workout.kindLabel,
        started_at: workout.startedAt,
        ended_at: workout.endedAt,
        duration_s: workout.durationS,
        active_kcal: workout.activeKcal,
        distance_m: workout.distanceM,
        avg_hr: workout.avgHr,
        max_hr: workout.maxHr,
        elevation_m: workout.elevationM,
        hr_zones: workout.hrZones,
        source_name: workout.sourceName,
      })),
      { onConflict: 'user_id,provider,external_id' },
    )
    if (error) throw error
  }

  /**
   * Hours are REPLACED for the window rather than upserted into it.
   *
   * An upsert cannot express "this hour no longer has any steps", and that
   * happens for real: a duplicate source is removed in Health, or a day is
   * re-attributed, and the hour that had 400 steps now has none. Left alone it
   * would sit on the chart forever, because nothing would ever write a zero
   * over it. Deleting the window first is the only version that converges.
   *
   * Safe ONLY because the delete covers exactly the dates the reading can
   * contain — the chunk that was just read, end to end. That equality is the
   * whole correctness argument, and getting it wrong is not a cosmetic bug:
   * the insert is an `insert`, not an upsert, so a row the delete missed is a
   * duplicate-key error that fails the entire sync. It was wrong once. The
   * delete was clamped to the start of the hourly retention window while the
   * providers kept returning hours for the whole chunk, so the one chunk
   * straddling that boundary inserted rows outside the delete — invisible on a
   * first backfill against empty tables, and a hard failure on the second.
   */
  if (window.withHours) {
    const { error: deleteError } = await supabase
      .from('activity_hours')
      .delete()
      .eq('user_id', userId)
      .gte('log_date', window.from)
      .lte('log_date', window.to)
    if (deleteError) throw deleteError

    if (reading.hours.length > 0) {
      const { error } = await supabase.from('activity_hours').insert(
        reading.hours.map((hour) => ({
          user_id: userId,
          log_date: hour.date,
          hour: hour.hour,
          steps: hour.steps,
          active_kcal: hour.activeKcal,
          distance_m: hour.distanceM,
        })),
      )
      if (error) throw error
    }
  }
}

/**
 * The user's age in years, or null when the profile has no birth date.
 *
 * Read here rather than inside a provider because it is a fact about the person
 * and the providers only know about the store. It is what bands a heart rate:
 * the zones are fractions of an estimated maximum, and that maximum is a
 * function of age. Without it every session was banded against a 40-year-old —
 * which for a 29-year-old puts the Peak threshold seven beats too low and turns
 * a steady run into twenty minutes of Peak.
 *
 * NOT `ageFrom` alone: that returns 0 for a missing birth date, and 0 through
 * the Tanaka formula is a maximum of 208, which would band nothing as hard at
 * all. Null is the answer `estimatedMaxHr` documents a fallback for.
 */
async function ageOf(userId: string): Promise<number | null> {
  const { data } = await supabase
    .from('profiles')
    .select('birth_date')
    .eq('id', userId)
    .maybeSingle()

  return data?.birth_date ? ageFrom(data.birth_date) : null
}

/**
 * Read a range from a provider and write it, a chunk at a time.
 *
 * Returns the number of days actually written, which is what the connect screen
 * reports and — more usefully — what tells a caller whether a granted-looking
 * permission produced anything. On iOS that is the only way to know: HealthKit
 * will not say whether a read was denied.
 *
 * It also returns whatever hardware named itself along the way. That used to be
 * thrown away and re-fetched by a second `read` immediately afterwards, purely
 * because this function discarded it — and the extra read only covered the
 * CONNECT path, so an account that connected before a watch was paired never
 * learned its name at all. Carrying it out of the loop costs nothing and lets
 * every sync keep it current.
 */
export async function syncRange(
  userId: string,
  provider: HealthProvider,
  from: string,
  to: string,
  onProgress?: (progress: SyncProgress) => void,
): Promise<{ days: number; deviceName: string | null }> {
  // Once for the whole range rather than once per chunk. It cannot change
  // between two chunks of the same sync, and a year-long backfill is thirteen
  // of them.
  const age = await ageOf(userId)

  const chunks: Array<{ from: string; to: string }> = []
  const cursor = new Date(`${from}T00:00:00`)
  const last = new Date(`${to}T00:00:00`)

  while (cursor <= last) {
    const chunkStart = dateKey(cursor)
    const chunkEnd = new Date(cursor)
    chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS - 1)
    chunks.push({ from: chunkStart, to: dateKey(chunkEnd > last ? last : chunkEnd) })
    cursor.setDate(cursor.getDate() + CHUNK_DAYS)
  }

  const hourlyFrom = daysAgo(HOURLY_DAYS)
  let written = 0
  let done = 0
  // Overwritten as the loop advances rather than kept at the first hit. Chunks
  // run oldest to newest, so the last one to name a device is the most recent —
  // which is the watch the user is actually wearing, not the one they replaced
  // in March.
  let deviceName: string | null = null
  const total = chunks.length

  for (const chunk of chunks) {
    // Only recent chunks pay for the hourly read. A year of it is 8,760 rows
    // per user to answer a question only ever asked about this month.
    const withHours = chunk.to >= hourlyFrom
    const reading = await provider.read(chunk.from, chunk.to, { withHours, age })
    // The hour window is the CHUNK, not the retention window. A provider hands
    // back hours for everything it was asked to read, so this is the range the
    // delete has to cover for the replace to be idempotent — see `persist`.
    await persist(userId, provider.id, reading, {
      from: chunk.from,
      to: chunk.to,
      withHours,
    })
    written += reading.days.length
    if (reading.deviceName) deviceName = reading.deviceName
    done += 1
    onProgress?.({ done, total })
  }

  return { days: written, deviceName }
}

async function noteSync(
  userId: string,
  provider: ProviderId,
  patch: {
    permissions?: string[]
    deviceName?: string | null
    backfilledFrom?: string
  },
): Promise<void> {
  const { error } = await supabase.from('health_connections').upsert(
    {
      user_id: userId,
      provider,
      connected: true,
      last_synced_at: new Date().toISOString(),
      ...(patch.permissions ? { permissions: patch.permissions } : {}),
      ...(patch.deviceName ? { device_name: patch.deviceName } : {}),
      ...(patch.backfilledFrom ? { backfilled_from: patch.backfilledFrom } : {}),
    },
    { onConflict: 'user_id,provider' },
  )
  if (error) throw error
}

export type ConnectResult = {
  granted: boolean
  /** Days written. Zero after a granted-looking connect means iOS said no. */
  days: number
}

/**
 * Ask for access, then read a year.
 *
 * One mutation rather than two because they are one user action: nobody taps
 * "connect" and then separately asks for their history. The permission sheet
 * and the backfill are the same wait, and splitting them would put an empty
 * Activity tab between them.
 */
export function useConnectHealth() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      provider: id,
      onProgress,
    }: {
      provider: ProviderId
      onProgress?: (progress: SyncProgress) => void
    }): Promise<ConnectResult> => {
      const provider = providerFor(id)

      const access = await provider.requestAccess()
      if (!access.granted) return { granted: false, days: 0 }

      const from = daysAgo(BACKFILL_DAYS)
      const to = dateKey(new Date())

      // Recorded BEFORE the read, not after. A backfill of a year takes long
      // enough to be interrupted — a call comes in, the app is swiped away —
      // and a connection that only exists once the read finished would leave
      // the user on the connect screen with a full database behind it.
      await noteSync(userId, id, { permissions: access.permissions })

      // The device name comes out of the reading rather than the API, because
      // neither store has a "what watch is this" call — it is whatever named
      // itself on a sample. The backfill has already seen every one of them, so
      // it is carried out of there rather than re-read.
      const { days, deviceName } = await syncRange(userId, provider, from, to, onProgress)
      await noteSync(userId, id, { deviceName, backfilledFrom: from })

      return { granted: true, days }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.healthConnection(userId) })
      // The budget on Today is goal + burned now. A connect that did not move it
      // would look like it had not worked.
      queryClient.invalidateQueries({ queryKey: keys.dayAll(userId) })
      // Movement extends the budget, so it moves the week strip's dots too.
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
    },
  })
}

/**
 * The incremental pass: the last seven days, re-read and upserted.
 *
 * Exposed as a mutation so the pull-to-refresh on Activity and the automatic
 * pass below share one implementation and one set of invalidations.
 */
export function useSyncHealth() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: ProviderId): Promise<number> => {
      const provider = providerFor(id)

      const availability = await provider.isAvailable()
      if (!availability.ok) return 0

      const from = daysAgo(WINDOW_DAYS - 1)
      const to = dateKey(new Date())

      // The device name is refreshed on every pass, not only on connect. An
      // account that connected before a watch was paired would otherwise never
      // learn its name — the settings screen would say "Apple Health" and never
      // "Apple Watch" — because the only write was on a connect that had
      // already happened.
      const { days, deviceName } = await syncRange(userId, provider, from, to)
      await noteSync(userId, id, { deviceName })
      return days
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.healthConnection(userId) })
      queryClient.invalidateQueries({ queryKey: keys.dayAll(userId) })
      // Movement extends the budget, so it moves the week strip's dots too.
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
    },
  })
}

/**
 * Keeps a connected account in step, without anybody asking.
 *
 * Mounted once, high in the tree, next to `useReminderSync` and for the same
 * reason: it is a background rule about the account rather than anything a
 * screen owns.
 *
 * Runs on mount and on every return to the foreground, throttled so that
 * flicking between apps does not become a request per switch. The throttle is a
 * ref rather than state — it must not cause a render, and it is read inside an
 * effect that would otherwise re-subscribe on every tick.
 */
export function useHealthAutoSync(provider: ProviderId | null): {
  syncNow: () => void
  /**
   * A sync THE USER ASKED FOR is in flight. Not the automatic ones.
   *
   * The distinction exists because the only consumer is a `RefreshControl`, and
   * a refresh control that is `refreshing` holds the whole scroll view pushed
   * down under its spinner. The automatic pass runs on mount, so opening the
   * Activity tab parked the header below the notch and left it there for the
   * length of the sync — which reads as a screen stuck mid-swipe, not as
   * progress. The badge in the header is where an automatic pass reports
   * itself; a pull is the only thing allowed to move the screen.
   */
  isSyncing: boolean
  /** Any pass at all, automatic or asked for. For the header badge. */
  isBusy: boolean
} {
  const sync = useSyncHealth()
  const lastRun = useRef(0)

  // Whether the pass in flight was asked for. State rather than a ref: the
  // refresh control has to re-render when it changes.
  const [forced, setForced] = useState(false)

  // The mutation object is a new identity on every render, so the effect below
  // would re-subscribe to AppState constantly if it depended on it. A ref
  // holding the current one keeps the effect's dependency list to the provider.
  const syncRef = useRef(sync)
  syncRef.current = sync

  const run = useCallback(
    (force: boolean) => {
      if (!provider) return
      const now = Date.now()
      if (!force && now - lastRun.current < MIN_INTERVAL_MS) return
      lastRun.current = now
      // After the guards, so a pull that was thrown away for want of a provider
      // does not leave the control spinning over nothing.
      if (force) setForced(true)
      // Fire and forget. A failed sync is not something to interrupt anybody
      // over — the numbers are simply as fresh as the last successful pass, and
      // the screen says when that was.
      //
      // `onSettled` rather than `onSuccess`: a pull that fails still has to give
      // the screen back, or the spinner is permanent.
      syncRef.current.mutate(provider, {
        onSettled: () => {
          if (force) setForced(false)
        },
      })
    },
    [provider],
  )

  useEffect(() => {
    if (!provider) return
    run(false)

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run(false)
    })
    return () => subscription.remove()
  }, [provider, run])

  // `forced` alone, not `forced && sync.isPending`. Both are set in the same
  // event handler and therefore batched into one render, so there is no frame
  // where the control is told to stop while the user is still holding it down.
  return { syncNow: () => run(true), isSyncing: forced, isBusy: sync.isPending }
}
