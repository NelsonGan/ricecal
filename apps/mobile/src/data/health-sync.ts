import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { createMMKV } from 'react-native-mmkv'

import { setPersonProps, track } from '@/lib/analytics'
import type { HealthProvider, HealthReading, ProviderId } from '@/lib/health'
import { providerFor } from '@/lib/health'
import { ageFrom, basalRate } from '@/lib/nutrition'
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
 *   1. A BACKFILL on connect, a month deep, chunked so the UI keeps painting.
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

/**
 * How far back a first connection reads.
 *
 * A WEEK. It was a year, then a month, and each cut was the same argument
 * carried further: the backfill exists so the Activity tab has something in it
 * on the day it is turned on — an empty tab reads as broken rather than as new
 * — and a week answers that. Nothing about future syncing is affected; the
 * rolling window below goes on reading forward for as long as the app is
 * installed.
 *
 * It is also the difference between a connect that finishes while the user is
 * looking at it and one they wait through. This ask sits INSIDE onboarding, a
 * screen away from an account a minute old, and a week is a single query.
 *
 * What it costs is the 30-day range on the Activity tab, which starts its life
 * three-quarters empty and fills in over the following weeks. That is the
 * accepted trade: a range that fills up is legible, while a permission screen
 * somebody waits through during their first minute is not.
 *
 * Deeper history is not lost, only unread: the store still has it, and
 * `backfilled_from` records how far this account has actually gone, so a future
 * screen that wants more can ask for the part it has not seen.
 */
const BACKFILL_DAYS = 7

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
 * A long statistics query blocks the JS thread long enough to drop frames on
 * the screen that started it. Thirty days is about a tenth of a second on an
 * iPhone, which is why the backfill is one chunk now that it reads a month —
 * and why the chunking stays, since the depth is a constant somebody will raise
 * again and a re-read of a wider window must not hang the screen that asked.
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

  /**
   * Weigh-ins go through a FUNCTION rather than an upsert, and that is the one
   * asymmetry in this file worth reading twice.
   *
   * The three tables above are the sync's own: nothing else writes them, so an
   * upsert onto their key is unambiguous and re-running it is free. Weight is
   * not like that. `weight_logs` is shared with the user, who types into it from
   * the Trends tab, and one row per day means the two authors compete for the
   * same key — with the rolling window re-reading the last seven days on every
   * foreground, so the sync gets to compete once a minute for as long as the app
   * is open.
   *
   * A READING THE USER TYPED ALWAYS WINS. That is a WHERE on the DO UPDATE,
   * which PostgREST's `.upsert()` cannot express, so `sync_weight_readings` owns
   * it — see the header on `schemas/40_weight_logs.sql` for why it also drops
   * out-of-range readings instead of raising on them.
   */
  if (reading.weights.length > 0) {
    const { error } = await supabase.rpc('sync_weight_readings', {
      p_provider: provider,
      p_readings: reading.weights.map((weigh) => ({
        measured_on: weigh.date,
        weight_kg: weigh.kg,
        body_fat_pct: weigh.bodyFatPct,
      })),
    })
    if (error) throw error
  }
}

/**
 * The two facts about the PERSON that a provider needs and cannot know.
 *
 * Read here rather than inside a provider because both are about the user and
 * the providers only know about the store. One round trip for the pair, since
 * they come off the same row.
 *
 * `age` is what bands a heart rate: the zones are fractions of an estimated
 * maximum, and that maximum is a function of age. Without it every session was
 * banded against a 40-year-old — which for a 29-year-old puts the Peak
 * threshold seven beats too low and turns a steady run into twenty minutes of
 * Peak. NOT `ageFrom` alone: that returns 0 for a missing birth date, and 0
 * through the Tanaka formula is a maximum of 208, which would band nothing as
 * hard at all. Null is the answer `estimatedMaxHr` documents a fallback for.
 *
 * `basalKcal` is what splits a store's total energy into the active half that
 * may extend a budget and the resting half that may not — see `energyFor` in
 * `androidHealth.ts`. Mifflin-St Jeor, the same formula `compute_targets()`
 * runs in Postgres, so the figure the split uses is the same one the budget it
 * feeds was built from. Null unless all four inputs are on the profile: a
 * partial body cannot be guessed at here, because every fallback would be a
 * number invented on the client and then written to the database as if a watch
 * had measured it.
 */
async function personOf(userId: string): Promise<{ age: number | null; basalKcal: number | null }> {
  // Two rows, because a body is spread over two tables: the parts that do not
  // change live on the profile, and the weight is the latest weigh-in — the
  // same place `compute_targets()` reads it from, rather than a copy that would
  // drift the first time somebody stood on a scale.
  const [profile, weighIn] = await Promise.all([
    supabase.from('profiles').select('birth_date, sex, height_cm').eq('id', userId).maybeSingle(),
    supabase
      .from('weight_logs')
      .select('weight_kg')
      .eq('user_id', userId)
      .order('measured_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const body = profile.data
  const age = body?.birth_date ? ageFrom(body.birth_date) : null
  const weightKg = weighIn.data?.weight_kg ?? null
  const sex = body?.sex

  const known =
    age != null &&
    weightKg != null &&
    body?.height_cm != null &&
    (sex === 'female' || sex === 'male')

  return {
    age,
    basalKcal: known
      ? Math.round(
          basalRate({
            sex,
            weightKg,
            heightCm: body.height_cm as number,
            age,
            // Ignored by `basalRate` — the multiplier belongs to maintenance,
            // and a basal figure is what splits a store's total.
            activity: 'sedentary',
          }),
        )
      : null,
  }
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
  // Once for the whole range rather than once per chunk. Neither can change
  // between two chunks of the same sync, and it is a round trip either way.
  const person = await personOf(userId)

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
    // Only chunks inside the retention window pay for the hourly read: 24 rows
    // a day to answer a question only ever asked about this month. The backfill
    // is a week deep now, so in practice every chunk qualifies — the guard
    // stays because it is the incremental pass and any future deeper backfill
    // that it exists for, not the current value of `BACKFILL_DAYS`.
    const withHours = chunk.to >= hourlyFrom
    const reading = await provider.read(chunk.from, chunk.to, { withHours, ...person })
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

/**
 * What a sync can have moved.
 *
 * Shared by the connect and the incremental pass because they write exactly the
 * same tables — the only difference between them is how far back they read, and
 * a list that drifted between the two would mean a screen that refreshes after
 * one kind of sync and not the other.
 *
 * The weight three are here for a reason that is easy to miss: a synced weigh-in
 * fires `weight_logs_sync_daily_goals` in the database, which rewrites
 * `daily_goals`. So a sync can change the user's calorie target without anything
 * in the app having asked it to, and a stale `keys.goals` would leave Today
 * showing a budget the server has already replaced.
 */
function invalidateAfterSync(queryClient: QueryClient, userId: string): void {
  queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
  queryClient.invalidateQueries({ queryKey: keys.healthConnection(userId) })
  // The budget on Today is goal + burned now. A connect that did not move it
  // would look like it had not worked.
  queryClient.invalidateQueries({ queryKey: keys.dayAll(userId) })
  // Movement extends the budget, so it moves the week strip's dots too.
  queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
  // And a weigh-in that arrived from a scale is a new point on the chart, a new
  // "current weight" on Me and the goals screen, and a recomputed target.
  queryClient.invalidateQueries({ queryKey: keys.weighIns(userId) })
  queryClient.invalidateQueries({ queryKey: keys.goals(userId) })
  queryClient.invalidateQueries({ queryKey: keys.trendsAll(userId) })
}

/**
 * What each provider was last asked to read, ON THIS DEVICE.
 *
 * MMKV rather than `health_connections.permissions`, and the difference is the
 * point: a permission is granted to an INSTALL, while that column belongs to an
 * account. The same account on a new phone has been asked nothing.
 *
 * WHY THIS EXISTS AT ALL
 *
 * A connection is made once. The incremental pass deliberately does not ask for
 * access — it runs on every foreground, and a permission sheet that appeared
 * every time somebody opened the app would be intolerable. So when a release
 * starts reading a type the last one did not, nobody who was already connected
 * is ever asked for it: on iOS the type stays `notDetermined` and reads return
 * nothing, on Android it is simply absent. The feature is then silently dead for
 * every existing install while working perfectly on a fresh one, which is the
 * worst shape a bug can have.
 *
 * Weight was the first release to do this, and it was caught because the
 * developer's own account was already connected with the previous list.
 *
 * The stored value is the LIST ITSELF rather than a version number somebody has
 * to remember to bump. Adding a type therefore re-asks exactly once, on each
 * device, with no second thing to keep in step.
 */
const asked = createMMKV({ id: 'ricecal-health-permissions' })

const fingerprint = (types: readonly string[]): string => [...types].sort().join(',')

const askedKey = (provider: ProviderId) => `asked.${provider}`

/**
 * Ask for anything this device has not been asked for, once.
 *
 * Stamped WHATEVER THE ANSWER. A refusal is a decision, and re-opening the
 * sheet on the next foreground because the user said no is the behaviour that
 * makes people uninstall an app. The next change to the read list asks again,
 * which is the only time there is a new question to put.
 */
async function ensureAccess(userId: string, provider: HealthProvider): Promise<void> {
  const want = fingerprint(provider.readTypes)
  if (asked.getString(askedKey(provider.id)) === want) return

  const access = await provider.requestAccess()
  asked.set(askedKey(provider.id), want)

  // Recorded so the screens that explain a gap are explaining the current
  // grant rather than the one from before the list grew.
  await noteSync(userId, provider.id, { permissions: access.permissions })
}

export type ConnectResult = {
  granted: boolean
  /** Days written. Zero after a granted-looking connect means iOS said no. */
  days: number
}

/**
 * Ask for access, then read the recent past.
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
      // Stamped here too, so the sync that follows a connect does not turn
      // straight round and ask again for the list it was just granted.
      asked.set(askedKey(id), fingerprint(provider.readTypes))
      if (!access.granted) return { granted: false, days: 0 }

      const from = daysAgo(BACKFILL_DAYS)
      const to = dateKey(new Date())

      // Recorded BEFORE the read, not after. Even a month's backfill is long
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

    onSuccess: (result, { provider }) => {
      /**
       * `granted: false` and `days: 0` are two different failures wearing one
       * empty tab, which is the whole reason both are on the event: a refused
       * permission sheet is a copy problem, and a granted store that returned
       * nothing is a device problem — most often a simulator, whose Health app
       * reports itself as available and holds nothing at all.
       */
      track('Health Connected', {
        provider,
        granted: result.granted,
        days: result.days,
      })
      if (result.granted) setPersonProps({ health_provider: provider })
      invalidateAfterSync(queryClient, userId)
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

      // Before the read, because a type this device has never been asked about
      // returns nothing rather than failing — see `ensureAccess`. Almost always
      // a no-op: it touches the platform only on the first pass after the read
      // list has changed.
      await ensureAccess(userId, provider)

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

    onSuccess: () => invalidateAfterSync(queryClient, userId),
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
