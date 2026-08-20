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
 * Reading the phone's health store into the database. The only place in the app
 * that writes `activity_days`, `activity_sessions` and `activity_hours`.
 *
 * Three mechanisms, each covering what the others cannot: a week-deep backfill on
 * connect, chunked so the UI keeps painting; a rolling window on every
 * foreground; and a refetch of the affected queries when either lands.
 *
 * The incremental pass re-reads a window rather than tracking a cursor, and that
 * is the decision the file is shaped around. Health data arrives late and arrives
 * edited: a watch out of range writes Tuesday on Wednesday, Strava back-dates an
 * upload, Apple recomputes a day when a second source appears. "Everything since
 * the last sync" misses all three permanently, because the data's timestamp is
 * older than the cursor by the time it exists.
 *
 * Every key in the schema exists to make that repetition free: days by date,
 * hours by date and hour, sessions by the store's own id.
 *
 * No edge function, because there is nothing to authenticate against: the data is
 * on the device behind a permission the user granted to this app.
 */

/**
 * How far back a first connection reads.
 *
 * A week. The backfill exists so the Activity tab has something in it on the day
 * it is turned on, and a week answers that in a single query, which matters
 * because the ask sits inside onboarding.
 *
 * What it costs is the 30-day range, which starts three quarters empty and fills
 * in over the following weeks. Deeper history is unread rather than lost, and
 * `backfilled_from` records how far this account has gone.
 */
const BACKFILL_DAYS = 7

/**
 * How far back every incremental pass re-reads. See the header: this is the
 * number that makes late-arriving watch data land.
 */
const WINDOW_DAYS = 7

/**
 * How much of the past keeps an hourly breakdown. Nothing draws older.
 */
const HOURLY_DAYS = 30

/**
 * The backfill's chunk size, in days.
 *
 * A long statistics query blocks the JS thread long enough to drop frames on the
 * screen that started it. Thirty days is about a tenth of a second on an iPhone,
 * so a week-deep backfill is one chunk. The chunking stays because the depth is
 * a constant somebody will raise again, and a re-read of a wider window must not
 * hang the screen that asked.
 */
const CHUNK_DAYS = 30

/**
 * The shortest gap between two automatic syncs.
 */
const MIN_INTERVAL_MS = 60_000

export type SyncMode = 'backfill' | 'window'

export type SyncProgress = {
  /**
   * Days read so far, out of `total`. Only meaningful during a backfill.
   */
  done: number
  total: number
}

/**
 * Writes one reading.
 *
 * Every statement is an upsert onto a key the provider cannot collide with, so
 * calling this twice with the same reading is indistinguishable from calling it
 * once. That is the property the whole design rests on.
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
   * Hours are replaced for the window rather than upserted into it.
   *
   * An upsert cannot express "this hour no longer has any steps", and that happens:
   * a duplicate source is removed in Health and the hour that had 400 steps now has
   * none. Nothing would ever write a zero over it.
   *
   * Safe only because the delete covers exactly the dates the reading can contain.
   * The insert is an `insert`, not an upsert, so a row the delete missed is a
   * duplicate-key error that fails the entire sync. Clamping the delete to the
   * hourly retention window while the providers returned the whole chunk did
   * exactly that: invisible on a first backfill, a hard failure on the second.
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
   * Weigh-ins go through a function rather than an upsert, and that is the one
   * asymmetry in this file.
   *
   * The three tables above are the sync's own, so an upsert onto their key is
   * unambiguous. `weight_logs` is shared with the user, and one row per day means
   * the two authors compete for the same key on every foreground.
   *
   * A reading the user typed always wins. That is a WHERE on the DO UPDATE, which
   * PostgREST's `.upsert()` cannot express, so `sync_weight_readings` owns it.
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
 * The two facts about the person that a provider needs and cannot know.
 *
 * `age` bands a heart rate: the zones are fractions of an estimated maximum.
 * Without it every session was banded against a 40-year-old, which for a
 * 29-year-old puts the Peak threshold seven beats too low. Not `ageFrom` alone,
 * which returns 0 for a missing birth date, and 0 through Tanaka is a maximum of
 * 208.
 *
 * `basalKcal` splits a store's total energy into the active half that may extend
 * a budget and the resting half that may not. Null unless all four inputs are on
 * the profile: every fallback would be a number invented on the client and then
 * written as if a watch had measured it.
 */
async function personOf(userId: string): Promise<{ age: number | null; basalKcal: number | null }> {
  // Two rows, because a body is spread over two tables: the parts that do not
  // change live on the profile, and the weight is the latest weigh-in, which is
  // the same place `compute_targets()` reads it from rather than a copy that would
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
            // Ignored by `basalRate`: the multiplier belongs to maintenance, and a basal
            // figure is what splits a store's total.
            activity: 'sedentary',
          }),
        )
      : null,
  }
}

/**
 * Read a range from a provider and write it, a chunk at a time.
 *
 * Returns the number of days actually written, which is what tells a caller
 * whether a granted-looking permission produced anything. On iOS that is the only
 * way to know, since HealthKit will not say whether a read was denied.
 *
 * It also returns whatever hardware named itself along the way, so every sync
 * keeps the device name current rather than only a connect.
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
  // Overwritten as the loop advances rather than kept at the first hit. Chunks run
  // oldest to newest, so the last one to name a device is the most recent, which
  // is the watch the user is actually wearing.
  let deviceName: string | null = null
  const total = chunks.length

  for (const chunk of chunks) {
    // Only chunks inside the retention window pay for the hourly read: 24 rows a day
    // to answer a question only ever asked about this month. The backfill is a week
    // deep, so in practice every chunk qualifies. The guard stays for the
    // incremental pass and any future deeper backfill.
    const withHours = chunk.to >= hourlyFrom
    const reading = await provider.read(chunk.from, chunk.to, { withHours, ...person })
    // The hour window is the chunk, not the retention window. A provider hands back
    // hours for everything it was asked to read, so this is the range the delete has
    // to cover for the replace to be idempotent. See `persist`.
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
 * Shared by the connect and the incremental pass because they write the same
 * tables, and a list that drifted between the two would mean a screen that
 * refreshes after one kind of sync and not the other.
 *
 * The weight three are easy to miss: a synced weigh-in fires
 * `weight_logs_sync_daily_goals`, so a sync can change the user's calorie target
 * without anything in the app having asked it to.
 */
function invalidateAfterSync(queryClient: QueryClient, userId: string): void {
  queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
  queryClient.invalidateQueries({ queryKey: keys.healthConnection(userId) })
  // The budget on Today is goal plus burned, so a connect that did not move it
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
 * What each provider was last asked to read, on this device.
 *
 * MMKV rather than `health_connections.permissions`: a permission is granted to
 * an install, while that column belongs to an account, and the same account on a
 * new phone has been asked nothing.
 *
 * The incremental pass deliberately does not ask for access, because it runs on
 * every foreground. So when a release starts reading a type the last one did not,
 * nobody already connected is ever asked for it, and the feature is silently dead
 * for every existing install while working perfectly on a fresh one.
 *
 * The stored value is the list itself rather than a version number somebody has
 * to remember to bump.
 */
const asked = createMMKV({ id: 'ricecal-health-permissions' })

const fingerprint = (types: readonly string[]): string => [...types].sort().join(',')

const askedKey = (provider: ProviderId) => `asked.${provider}`

/**
 * Ask for anything this device has not been asked for, once.
 *
 * Stamped whatever the answer. A refusal is a decision, and re-opening the sheet
 * on the next foreground because the user said no is the behaviour that makes
 * people uninstall an app. The next change to the read list asks again, which is
 * the only time there is a new question to put.
 */
async function ensureAccess(userId: string, provider: HealthProvider): Promise<void> {
  const want = fingerprint(provider.readTypes)
  if (asked.getString(askedKey(provider.id)) === want) return

  const access = await provider.requestAccess()
  asked.set(askedKey(provider.id), want)

  // Recorded so the screens that explain a gap are explaining the current grant
  // rather than the one from before the list grew.
  await noteSync(userId, provider.id, { permissions: access.permissions })
}

export type ConnectResult = {
  granted: boolean
  /**
   * Days written. Zero after a granted-looking connect means iOS said no.
   */
  days: number
}

/**
 * Ask for access, then read the recent past.
 *
 * One mutation rather than two because they are one user action: nobody taps
 * "connect" and then separately asks for their history. The permission sheet and
 * the backfill are the same wait, and splitting them would put an empty Activity
 * tab between them.
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
      // Stamped here too, so the sync that follows a connect does not turn straight
      // round and ask again for the list it was just granted.
      asked.set(askedKey(id), fingerprint(provider.readTypes))
      if (!access.granted) return { granted: false, days: 0 }

      const from = daysAgo(BACKFILL_DAYS)
      const to = dateKey(new Date())

      // Recorded before the read, not after. Even a week's backfill is long enough to
      // be interrupted, and a connection that only existed once the read finished
      // would leave the user on the connect screen with a full database behind it.
      await noteSync(userId, id, { permissions: access.permissions })

      // The device name comes out of the reading rather than the API, because neither
      // store has a "what watch is this" call. It is whatever named itself on a
      // sample, and the backfill has already seen every one of them.
      const { days, deviceName } = await syncRange(userId, provider, from, to, onProgress)
      await noteSync(userId, id, { deviceName, backfilledFrom: from })

      return { granted: true, days }
    },

    onSuccess: (result, { provider }) => {
      /**
       * `granted: false` and `days: 0` are two different failures wearing one empty
       * tab, which is why both are on the event. A refused permission sheet is a copy
       * problem, and a granted store that returned nothing is a device problem, most
       * often a simulator, whose Health app reports itself as available and holds
       * nothing at all.
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

      // Before the read, because a type this device has never been asked about returns
      // nothing rather than failing. Almost always a no-op: it touches the platform
      // only on the first pass after the read list has changed.
      await ensureAccess(userId, provider)

      const from = daysAgo(WINDOW_DAYS - 1)
      const to = dateKey(new Date())

      // The device name is refreshed on every pass, not only on connect. An account
      // that connected before a watch was paired would otherwise never learn its name,
      // so the settings screen would say "Apple Health" and never "Apple Watch".
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
 * Mounted once, high in the tree: it is a background rule about the account
 * rather than anything a screen owns.
 *
 * Runs on mount and on every foreground, throttled so flicking between apps does
 * not become a request per switch. The throttle is a ref rather than state,
 * because it must not cause a render and it is read inside an effect that would
 * otherwise re-subscribe on every tick.
 */
export function useHealthAutoSync(provider: ProviderId | null): {
  syncNow: () => void
  /**
   * A sync the user asked for is in flight. Not the automatic ones.
   *
   * The distinction exists because the only consumer is a `RefreshControl`, and
   * one that is `refreshing` holds the whole scroll view pushed down under its
   * spinner. The automatic pass runs on mount, so opening the Activity tab parked
   * the header below the notch and left it there for the length of the sync, which
   * reads as a screen stuck mid-swipe rather than as progress. The badge in the
   * header is where an automatic pass reports itself.
   */
  isSyncing: boolean
  /**
   * Any pass at all, automatic or asked for. For the header badge.
   */
  isBusy: boolean
} {
  const sync = useSyncHealth()
  const lastRun = useRef(0)

  // Whether the pass in flight was asked for. State rather than a ref: the refresh
  // control has to re-render when it changes.
  const [forced, setForced] = useState(false)

  // The mutation object is a new identity on every render, so the effect below
  // would re-subscribe to AppState constantly if it depended on it. A ref holding
  // the current one keeps the effect's dependency list to the provider.
  const syncRef = useRef(sync)
  syncRef.current = sync

  const run = useCallback(
    (force: boolean) => {
      if (!provider) return
      const now = Date.now()
      if (!force && now - lastRun.current < MIN_INTERVAL_MS) return
      lastRun.current = now
      // After the guards, so a pull that was thrown away for want of a provider does
      // not leave the control spinning over nothing.
      if (force) setForced(true)
      // Fire and forget. A failed sync is not something to interrupt anybody over: the
      // numbers are as fresh as the last successful pass, and the screen says when
      // that was.
      //
      // `onSettled` rather than `onSuccess`, or a pull that fails leaves the spinner
      // running for ever.
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

  // `forced` alone, not `forced && sync.isPending`. Both are set in the same event
  // handler and therefore batched into one render, so there is no frame where the
  // control is told to stop while the user is still holding it down.
  return { syncNow: () => run(true), isSyncing: forced, isBusy: sync.isPending }
}
