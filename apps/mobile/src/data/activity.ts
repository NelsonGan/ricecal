import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { setPersonProps, track } from '@/lib/analytics'
import type { Database, Tables } from '@/lib/database.types'
import { type ProviderId, parseHrZones, providerFor } from '@/lib/health'
import { supabase } from '@/lib/supabase'
import { dateKey, datesBetween, seedMissing, unwrap, unwrapMaybe } from './client'
import { keys } from './keys'
import { useUserId } from './session'
import type { TrendRange } from './types'

/**
 * Movement, on the read side.
 *
 * The same three shapes Trends uses — a day, a bucketed series, a folded
 * summary — plus two lists the Activity tab needs that Trends has no analogue
 * for: the sessions of a day, and the hours of one.
 *
 * The bucketing and every average is in `activity_series` / `activity_summary`,
 * not here, for the reason stated at the top of `data/index.ts`: a figure
 * computed in the client is one the weekly report cannot reuse.
 *
 * The WRITE side is `data/health-sync.ts`. It is a separate file because it is
 * a different kind of thing: nothing on a screen calls it directly, it talks to
 * the phone's health store rather than to a user's tap, and it is the only
 * place in the app that writes these tables.
 */

type SeriesRow = Database['public']['Functions']['activity_series']['Returns'][number]
type SummaryRow = Database['public']['Functions']['activity_summary']['Returns'][number]

/** See `data/trends.ts`: PostgREST sends `numeric` as a string. */
const num = (value: number | null): number | null => (value === null ? null : Number(value))
const orZero = (value: number | null): number => (value === null ? 0 : Number(value))

export type ActivityDay = {
  date: string
  provider: ProviderId
  /** Energy spent moving. The figure that extends the budget. */
  activeKcal: number
  restingKcal: number | null
  steps: number
  distanceM: number | null
  exerciseMinutes: number | null
  standHours: number | null
  flights: number | null
  moveGoalKcal: number | null
  exerciseGoalMin: number | null
  standGoalHr: number | null
  syncedAt: string
}

export type ActivitySession = {
  id: string
  provider: ProviderId
  date: string
  kind: string
  kindLabel: string | null
  startedAt: string
  endedAt: string
  durationS: number
  activeKcal: number
  distanceM: number | null
  avgHr: number | null
  maxHr: number | null
  elevationM: number | null
  hrZones: { easy: number; steady: number; hard: number; peak: number } | null
  sourceName: string | null
}

export type ActivityHour = {
  hour: number
  steps: number
  activeKcal: number
  distanceM: number | null
}

export type ActivityBucket = {
  start: string
  end: string
  days: number
  activeDays: number
  activeKcal: number | null
  activeKcalTotal: number
  restingKcal: number | null
  burn: number | null
  steps: number | null
  stepsTotal: number
  stepsBest: number
  stepGoalDays: number
  stepGoal: number
  distanceTotalM: number
  exerciseMinutes: number | null
  standHours: number | null
  sessions: number
  sessionKcal: number
  sessionMinutes: number
  eaten: number | null
  balance: number | null
}

export type ActivitySummary = {
  from: string
  to: string
  days: number
  activeDays: number
  activeKcal: number | null
  activeKcalTotal: number
  restingKcal: number | null
  restingKcalTotal: number
  burn: number | null
  steps: number | null
  stepsTotal: number
  stepsBest: number
  stepGoalDays: number
  stepGoal: number
  distanceTotalM: number
  exerciseMinutes: number | null
  exerciseMinutesTotal: number
  standHours: number | null
  sessions: number
  sessionKcal: number
  sessionMinutes: number
  /** Active energy no session accounts for. Clamped at zero in SQL. */
  walkingKcal: number
  eaten: number | null
  eatenTotal: number
  balance: number | null
  /** Days with BOTH food and a resting figure — what `balance` is an average over. */
  balanceDays: number
}

export type HealthConnection = {
  provider: ProviderId
  connected: boolean
  permissions: string[]
  deviceName: string | null
  backfilledFrom: string | null
  lastSyncedAt: string | null
}

function toDay(row: Tables<'activity_days'>): ActivityDay {
  return {
    date: row.log_date,
    provider: row.provider,
    activeKcal: row.active_kcal,
    restingKcal: row.resting_kcal,
    steps: row.steps,
    distanceM: row.distance_m,
    exerciseMinutes: row.exercise_minutes,
    standHours: row.stand_hours,
    flights: row.flights,
    moveGoalKcal: row.move_goal_kcal,
    exerciseGoalMin: row.exercise_goal_min,
    standGoalHr: row.stand_goal_hr,
    syncedAt: row.synced_at,
  }
}

function toSession(row: Tables<'activity_sessions'>): ActivitySession {
  return {
    id: row.id,
    provider: row.provider,
    date: row.log_date,
    kind: row.kind,
    kindLabel: row.kind_label,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationS: row.duration_s,
    activeKcal: row.active_kcal,
    distanceM: row.distance_m,
    avgHr: row.avg_hr,
    maxHr: row.max_hr,
    elevationM: row.elevation_m,
    hrZones: parseHrZones(row.hr_zones),
    sourceName: row.source_name,
  }
}

function toConnection(row: Tables<'health_connections'>): HealthConnection {
  return {
    provider: row.provider,
    connected: row.connected,
    permissions: row.permissions,
    deviceName: row.device_name,
    backfilledFrom: row.backfilled_from,
    lastSyncedAt: row.last_synced_at,
  }
}

function toBucket(row: SeriesRow): ActivityBucket {
  return {
    start: row.bucket_start,
    end: row.bucket_end,
    days: orZero(row.days),
    activeDays: orZero(row.active_days),
    activeKcal: num(row.active_kcal_avg),
    activeKcalTotal: orZero(row.active_kcal_total),
    restingKcal: num(row.resting_kcal_avg),
    burn: num(row.burn_avg),
    steps: num(row.steps_avg),
    stepsTotal: orZero(row.steps_total),
    stepsBest: orZero(row.steps_best),
    stepGoalDays: orZero(row.step_goal_days),
    stepGoal: orZero(row.step_goal),
    distanceTotalM: orZero(row.distance_total_m),
    exerciseMinutes: num(row.exercise_min_avg),
    standHours: num(row.stand_hours_avg),
    sessions: orZero(row.sessions),
    sessionKcal: orZero(row.session_kcal),
    sessionMinutes: orZero(row.session_minutes),
    eaten: num(row.eaten_avg),
    balance: num(row.balance_avg),
  }
}

function toSummary(row: SummaryRow): ActivitySummary {
  return {
    from: row.from_date,
    to: row.to_date,
    days: orZero(row.days),
    activeDays: orZero(row.active_days),
    activeKcal: num(row.active_kcal_avg),
    activeKcalTotal: orZero(row.active_kcal_total),
    restingKcal: num(row.resting_kcal_avg),
    restingKcalTotal: orZero(row.resting_kcal_total),
    burn: num(row.burn_avg),
    steps: num(row.steps_avg),
    stepsTotal: orZero(row.steps_total),
    stepsBest: orZero(row.steps_best),
    stepGoalDays: orZero(row.step_goal_days),
    stepGoal: orZero(row.step_goal),
    distanceTotalM: orZero(row.distance_total_m),
    exerciseMinutes: num(row.exercise_min_avg),
    exerciseMinutesTotal: orZero(row.exercise_min_total),
    standHours: num(row.stand_hours_avg),
    sessions: orZero(row.sessions),
    sessionKcal: orZero(row.session_kcal),
    sessionMinutes: orZero(row.session_minutes),
    walkingKcal: orZero(row.walking_kcal),
    eaten: num(row.eaten_avg),
    eatenTotal: orZero(row.eaten_total),
    balance: num(row.balance_avg),
    balanceDays: orZero(row.balance_days),
  }
}

/**
 * One day's movement, or null.
 *
 * Null is the ordinary answer for most dates: the watch was on the charger, the
 * account predates the connection, the day has not happened. Every caller
 * treats it as "nothing to show" rather than as zero — which is why this
 * returns the row and not a zero-filled shape.
 */
export function useActivityDay(date: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.activityDay(userId, date),
    queryFn: async (): Promise<ActivityDay | null> => {
      const row = unwrapMaybe(
        await supabase
          .from('activity_days')
          .select('*')
          .eq('user_id', userId)
          .eq('log_date', date)
          .maybeSingle(),
      )
      return row ? toDay(row) : null
    },
  })
}

/**
 * Warms a week of movement, alongside `usePrefetchDays`.
 *
 * The other query Today keys by the selected date, and therefore the other half
 * of the wait a tap on the strip used to cost — the ring's budget is
 * `goal + active - eaten`, so a day whose meals were ready and whose movement
 * was not would still have had to hold. That file carries the reasoning for the
 * whole approach; this is the same shape over one table.
 *
 * A day with no row is seeded as `null`, which is what `useActivityDay`
 * promises and what most dates genuinely are.
 */
export function usePrefetchActivityDays(from: string, to: string) {
  const userId = useUserId()
  const queryClient = useQueryClient()

  useEffect(() => {
    const dates = datesBetween(from, to)
    if (
      dates.every((date) => queryClient.getQueryData(keys.activityDay(userId, date)) !== undefined)
    ) {
      return
    }

    let cancelled = false
    ;(async () => {
      const rows = new Map(
        unwrap(
          await supabase
            .from('activity_days')
            .select('*')
            .eq('user_id', userId)
            .gte('log_date', from)
            .lte('log_date', to),
        ).map((row) => [row.log_date, toDay(row)]),
      )
      if (cancelled) return
      seedMissing(
        queryClient,
        dates.map((date) => [keys.activityDay(userId, date), rows.get(date) ?? null] as const),
      )
      // Silent, like the meals it runs beside: a warm-up that fails costs
      // nothing, because the day the user picks fetches itself.
    })().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [userId, from, to, queryClient])
}

/**
 * The workouts of one day, or of every day when `date` is null.
 *
 * Two callers, one query: the Activity tab wants today's, and History wants all
 * of them. Splitting these into two hooks would mean two cache keys holding the
 * same rows, and a session deleted from one list still showing in the other.
 */
export function useActivitySessions(date: string | null, limit = 100) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.activitySessions(userId, date),
    queryFn: async (): Promise<ActivitySession[]> => {
      const query = supabase
        .from('activity_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(limit)

      const rows = unwrap(await (date ? query.eq('log_date', date) : query))
      return rows.map(toSession)
    },
  })
}

export function useActivitySession(id: string | undefined) {
  const userId = useUserId()

  return useQuery({
    enabled: Boolean(id),
    queryKey: keys.activitySession(id ?? ''),
    queryFn: async (): Promise<ActivitySession | null> => {
      const row = unwrapMaybe(
        await supabase
          .from('activity_sessions')
          .select('*')
          .eq('user_id', userId)
          .eq('id', id ?? '')
          .maybeSingle(),
      )
      return row ? toSession(row) : null
    },
  })
}

/** Steps by hour for one day. Only the last month has any. */
export function useActivityHours(date: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.activityHours(userId, date),
    queryFn: async (): Promise<ActivityHour[]> =>
      unwrap(
        await supabase
          .from('activity_hours')
          .select('hour, steps, active_kcal, distance_m')
          .eq('user_id', userId)
          .eq('log_date', date)
          .order('hour'),
      ).map((row) => ({
        hour: row.hour,
        steps: row.steps,
        activeKcal: row.active_kcal,
        distanceM: row.distance_m,
      })),
  })
}

/** The columns of whichever Activity chart is on screen. */
export function useActivitySeries(range: TrendRange) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.activitySeries(userId, range),
    queryFn: async (): Promise<ActivityBucket[]> =>
      (unwrap(await supabase.rpc('activity_series', { p_range: range })) as SeriesRow[]).map(
        toBucket,
      ),
  })
}

/** The same range folded to one row: the tiles, and every footnote. */
export function useActivitySummary(range: TrendRange) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.activitySummary(userId, range),
    queryFn: async (): Promise<ActivitySummary | null> => {
      const rows = unwrap(
        await supabase.rpc('activity_summary', { p_range: range }),
      ) as SummaryRow[]
      const row = rows[0]
      return row ? toSummary(row) : null
    },
  })
}

/**
 * This account's health connection, or null when it has never had one.
 *
 * One row at most in practice. `maybeSingle` over a filter on `connected` would
 * be wrong: a disconnected row still holds `backfilled_from`, which is what
 * stops a reconnection re-reading a year it already has.
 */
export function useHealthConnection() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.healthConnection(userId),
    queryFn: async (): Promise<HealthConnection | null> => {
      const rows = unwrap(
        await supabase
          .from('health_connections')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1),
      )
      const row = rows[0]
      return row ? toConnection(row) : null
    },
  })
}

/**
 * Stop syncing, and forget the permission — but keep the history.
 *
 * The rows stay. They are history the same way a weigh-in is, and a user who
 * disconnects to stop the battery drain has not asked for their last six
 * months of runs to be deleted. What changes is that nothing writes any more
 * and the Activity tab goes back to its connect screen.
 *
 * `backfilled_from` deliberately survives, so reconnecting picks up where this
 * left off instead of re-reading a year the tables already hold.
 */
export function useDisconnectHealth() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (provider: ProviderId) => {
      unwrap(
        await supabase
          .from('health_connections')
          .update({ connected: false })
          .eq('user_id', userId)
          .eq('provider', provider)
          .select(),
      )
    },
    onSuccess: (_result, provider) => {
      track('Health Disconnected', { provider })
      // Null rather than left alone: a segment built on "reads Apple Health"
      // must not go on containing somebody who turned it off six months ago.
      setPersonProps({ health_provider: null })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.healthConnection(userId) })
    },
  })
}

/**
 * Wipe the generated data.
 *
 * Only ever offered for the `demo` provider, and it is a real delete rather
 * than a disconnect: made-up rows are not history, and leaving them in place
 * would put invented runs on a chart beside real ones the moment a developer
 * tested on a physical phone with the same account.
 */
export function useClearDemoActivity() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      /**
       * Hours FIRST, and scoped by the days they belong to.
       *
       * `activity_hours` has no `provider` column — it is only ever written
       * beside a day — so the demo rows have to be identified by the demo days
       * they were written with. That means reading those dates before deleting
       * the days, and it means this cannot be part of the parallel batch below.
       *
       * The first version deleted every hour the account had, on the reasoning
       * that an account with demo data has nothing else. That is not true and
       * was disproved on the first device it ran on: connecting Apple Health,
       * finding the store empty and then loading demo data leaves both, and
       * clearing the demo took the real hours with it.
       */
      const demoDays = unwrap(
        await supabase
          .from('activity_days')
          .select('log_date')
          .eq('user_id', userId)
          .eq('provider', 'demo'),
      ).map((row) => row.log_date)

      if (demoDays.length > 0) {
        await supabase
          .from('activity_hours')
          .delete()
          .eq('user_id', userId)
          .in('log_date', demoDays)
      }

      await Promise.all([
        supabase.from('activity_sessions').delete().eq('user_id', userId).eq('provider', 'demo'),
        supabase.from('activity_days').delete().eq('user_id', userId).eq('provider', 'demo'),
        supabase.from('health_connections').delete().eq('user_id', userId).eq('provider', 'demo'),
      ])
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.activityAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.healthConnection(userId) })
      // Generated movement was extending the budget, and a fortnight of days
      // just lost it. Both the ring and the week strip's dots read that budget.
      queryClient.invalidateQueries({ queryKey: keys.dayAll(userId) })
      queryClient.invalidateQueries({ queryKey: keys.dayMarksAll(userId) })
    },
  })
}

/** Yesterday, today, or any offset from today as `yyyy-MM-dd`. */
export function daysAgo(days: number): string {
  const at = new Date()
  at.setDate(at.getDate() - days)
  return dateKey(at)
}

/** Re-exported so a screen can ask a provider a question without reaching into lib. */
export { providerFor }
