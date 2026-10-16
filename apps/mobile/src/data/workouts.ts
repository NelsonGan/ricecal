import {
  keepPreviousData,
  onlineManager,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { removeWorkoutFromHealth } from '@/features/workouts/health'
import { setVolume } from '@/features/workouts/model'
import { track } from '@/lib/analytics'
import type { Enums, Json, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { everyRow, TIMED_OUT, unwrap, unwrapMaybe, withDeadline } from './client'
import { keys } from './keys'
import { useUserId } from './session'
import { dequeueWorkout, enqueueWorkout, getOutbox, type WorkoutDocument } from './workout-outbox'

/**
 * Workouts the user logged, routines and custom exercises: the read and write
 * side of the Workouts tab.
 *
 * Every number here comes from Postgres (`96_workouts.sql`): a workout's
 * volume, its records, an exercise's bests and history, the weekly bars and
 * the streak. The phone sums nothing it has saved.
 */

type Tracking = Enums<'exercise_tracking'>
type SetKind = Enums<'workout_set_kind'>

export type WorkoutSummary = {
  id: string
  name: string
  notes: string | null
  startedAt: string
  endedAt: string
  durationS: number
  date: string
  routineId: string | null
  kcal: number | null
  healthWorkoutId: string | null
  setCount: number
  volumeKg: number
  prCount: number
  exercises: { exerciseId: string; name: string; sets: number }[]
  /** Finished on the phone, still waiting in the outbox for the server. */
  pending?: boolean
}

type WorkoutSet = {
  id: string
  position: number
  kind: SetKind
  weightKg: number | null
  reps: number | null
  durationS: number | null
  distanceM: number | null
  rpe: number | null
  volumeKg: number | null
  e1rmKg: number | null
  records: ('weight' | 'e1rm' | 'volume' | 'reps' | 'duration' | 'distance')[]
}

export type WorkoutEntry = {
  id: string
  position: number
  exerciseId: string
  name: string
  tracking: Tracking
  superset: number | null
  restS: number | null
  notes: string | null
  sets: WorkoutSet[]
}

export type WorkoutDetail = WorkoutSummary & { entries: WorkoutEntry[] }

const num = (value: number | string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value)

type SummaryRow = Tables<'workout_summaries'>

/** A summary row as `toSummary` reads it, which Today's narrower select also is. */
type SummaryFields = Omit<SummaryRow, 'pr_count' | 'created_at' | 'updated_at'> & {
  pr_count?: number | null
}

function toSummary(row: SummaryFields): WorkoutSummary {
  const exercises = Array.isArray(row.exercises) ? row.exercises : []
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    notes: row.notes,
    startedAt: row.started_at ?? '',
    endedAt: row.ended_at ?? '',
    durationS: row.duration_s ?? 0,
    date: row.log_date ?? '',
    routineId: row.routine_id,
    kcal: row.kcal,
    healthWorkoutId: row.health_workout_id,
    setCount: row.set_count ?? 0,
    volumeKg: num(row.volume_kg) ?? 0,
    prCount: row.pr_count ?? 0,
    exercises: exercises.map((value) => {
      const entry = value as { exercise_id: string; exercise_name: string; sets: number }
      return {
        exerciseId: entry.exercise_id,
        name: entry.exercise_name,
        sets: Number(entry.sets) || 0,
      }
    }),
  }
}

/** How long a workout on the phone ran, as the server will work it out. */
const queuedDuration = (document: WorkoutDocument) =>
  Math.max(0, Math.round((Date.parse(document.ended_at) - Date.parse(document.started_at)) / 1000))

/**
 * An outbox document drawn as a history row. Its figures are the phone's own
 * until the server has it, which is the one place this file sums anything,
 * and it is said on the row: the card reads "Waiting to sync".
 */
export function summaryFromDocument(document: WorkoutDocument): WorkoutSummary {
  let volumeKg = 0
  let setCount = 0
  for (const exercise of document.exercises) {
    for (const set of exercise.sets) {
      setCount += 1
      volumeKg += setVolume({ weightKg: set.weight_kg, reps: set.reps }, exercise.tracking) ?? 0
    }
  }
  return {
    id: document.id,
    name: document.name,
    notes: document.notes,
    startedAt: document.started_at,
    endedAt: document.ended_at,
    durationS: queuedDuration(document),
    date: document.log_date,
    routineId: document.routine_id,
    kcal: document.kcal,
    healthWorkoutId: document.health_workout_id,
    setCount,
    volumeKg,
    prCount: 0,
    exercises: document.exercises.map((exercise) => ({
      exerciseId: exercise.exercise_id,
      name: exercise.exercise_name,
      sets: exercise.sets.length,
    })),
    pending: true,
  }
}

/**
 * A save on this phone invalidates these, so they can sit for a while. Not
 * forever: a workout logged on a second phone changes them too, and never
 * stale they kept that phone's old bests and PREVIOUS column until this one
 * saved. Five minutes, because the default thirty seconds refetched them every
 * time the logger was reopened between sets.
 */
const UNTIL_SAVED = 5 * 60_000

/**
 * How long a read keyed by one workout, exercise, day or range stays cached
 * once nothing shows it. The default is forever, which wrote every workout
 * ever opened into the persisted cache; a day keeps today's offline reopen.
 */
const KEPT_A_DAY = 24 * 60 * 60_000

/** Every summary column but `pr_count`, which scores the whole history to count one workout's records. */
const SUMMARY_WITHOUT_RECORDS =
  'id, user_id, name, notes, started_at, ended_at, duration_s, log_date, routine_id, kcal, health_workout_id, set_count, volume_kg, exercises'

const PAGE = 20

/** Every workout, newest first, a page at a time. */
export function useWorkouts() {
  const userId = useUserId()

  return useInfiniteQuery({
    queryKey: keys.workouts(userId),
    // Every loaded page is fetched again on a refetch, each one scoring
    // records, and the tab was refetching on every visit.
    staleTime: UNTIL_SAVED,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<WorkoutSummary[]> =>
      unwrap(await supabase.rpc('workout_history', { p_offset: pageParam, p_limit: PAGE })).map(
        toSummary,
      ),
    getNextPageParam: (last, pages) => (last.length < PAGE ? undefined : pages.length * PAGE),
  })
}

/** One day's workouts, for Today. */
export function useWorkoutsOn(date: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.workoutsOn(userId, date),
    gcTime: KEPT_A_DAY,
    queryFn: async (): Promise<WorkoutSummary[]> =>
      unwrap(
        await supabase
          .from('workout_summaries')
          // Today's row shows no records, and leaving the count out lets the
          // planner skip scoring them: 0.3 ms rather than 270 on a long history.
          .select(SUMMARY_WITHOUT_RECORDS)
          .eq('user_id', userId)
          .eq('log_date', date)
          .order('started_at', { ascending: true }),
      ).map(toSummary),
  })
}

/** One workout, with every exercise and set and which sets set a record. */
export function useWorkout(id: string | undefined) {
  const userId = useUserId()

  return useQuery({
    enabled: Boolean(id),
    queryKey: keys.workout(userId, id ?? ''),
    // A saved workout changes only through a save or a delete here, which
    // invalidate it.
    staleTime: UNTIL_SAVED,
    gcTime: KEPT_A_DAY,
    queryFn: async (): Promise<WorkoutDetail | null> => {
      const [summary, entries, sets] = await Promise.all([
        // The record count comes from the sets below, which carry the flags,
        // so the summary leaves it out. And `in` rather than `eq`: on `id = x`
        // the planner kept scoring the whole history for the column nobody
        // asked for, and on `id = any(...)` it drops it.
        supabase
          .from('workout_summaries')
          .select(SUMMARY_WITHOUT_RECORDS)
          .in('id', [id ?? ''])
          .maybeSingle(),
        supabase
          .from('workout_exercises')
          .select('*')
          .eq('workout_id', id ?? '')
          .order('position'),
        supabase
          .from('workout_set_details')
          .select('*')
          .eq('workout_id', id ?? '')
          .order('exercise_position')
          .order('position'),
      ])
      const row = unwrapMaybe(summary)
      if (!row) return null
      const setRows = unwrap(sets)
      return {
        ...toSummary({
          ...row,
          pr_count: setRows.filter((set) => recordsOf(set).length > 0).length,
        }),
        entries: unwrap(entries).map((entry) => ({
          id: entry.id,
          position: entry.position,
          exerciseId: entry.exercise_id,
          name: entry.exercise_name,
          tracking: entry.tracking,
          superset: entry.superset,
          restS: entry.rest_s,
          notes: entry.notes,
          sets: setRows
            .filter((set) => set.workout_exercise_id === entry.id)
            .map((set) => ({
              id: set.id ?? '',
              position: set.position ?? 0,
              kind: set.kind ?? 'normal',
              weightKg: num(set.weight_kg),
              reps: set.reps,
              durationS: set.duration_s,
              distanceM: num(set.distance_m),
              rpe: num(set.rpe),
              volumeKg: num(set.volume_kg),
              e1rmKg: num(set.e1rm_kg),
              records: recordsOf(set),
            })),
        })),
      }
    },
  })
}

const recordsOf = (set: Tables<'workout_set_details'>): WorkoutSet['records'] =>
  [
    set.is_weight_pr && ('weight' as const),
    set.is_e1rm_pr && ('e1rm' as const),
    set.is_volume_pr && ('volume' as const),
    set.is_reps_pr && ('reps' as const),
    set.is_duration_pr && ('duration' as const),
    set.is_distance_pr && ('distance' as const),
  ].filter((record): record is WorkoutSet['records'][number] => Boolean(record))

/** The days with a workout between two dates, for the calendar. */
export function useWorkoutDates(from: string, to: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.workoutDates(userId, from, to),
    gcTime: KEPT_A_DAY,
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = unwrap(
        await supabase
          .from('workouts')
          .select('log_date')
          .eq('user_id', userId)
          .gte('log_date', from)
          .lte('log_date', to),
      )
      const out: Record<string, number> = {}
      for (const row of rows) out[row.log_date] = (out[row.log_date] ?? 0) + 1
      return out
    },
  })
}

export type WorkoutOverview = {
  totalWorkouts: number
  weekStreak: number
  thisWeekWorkouts: number
  thisWeekSeconds: number
  thisWeekVolumeKg: number
}

export function useWorkoutOverview() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.workoutOverview(userId),
    queryFn: async (): Promise<WorkoutOverview> => {
      const [row] = unwrap(await supabase.rpc('workout_overview'))
      return {
        totalWorkouts: row?.total_workouts ?? 0,
        weekStreak: row?.week_streak ?? 0,
        thisWeekWorkouts: row?.this_week_workouts ?? 0,
        thisWeekSeconds: row?.this_week_seconds ?? 0,
        thisWeekVolumeKg: num(row?.this_week_volume_kg) ?? 0,
      }
    },
  })
}

export type WorkoutWeek = {
  week: string
  workouts: number
  durationS: number
  volumeKg: number
  sets: number
}

export function useWorkoutWeeks(weeks = 12) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.workoutWeeks(userId, weeks),
    queryFn: async (): Promise<WorkoutWeek[]> =>
      unwrap(await supabase.rpc('workout_weeks', { p_weeks: weeks })).map((row) => ({
        week: row.week,
        workouts: row.workouts,
        durationS: row.duration_s,
        volumeKg: num(row.volume_kg) ?? 0,
        sets: row.sets,
      })),
  })
}

type ExerciseTotal = { exerciseId: string; sets: number }

/** Working sets per exercise between two dates: what the muscle split is drawn from. */
export function useExerciseTotals(from: string, to: string) {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.exerciseTotals(userId, from, to),
    gcTime: KEPT_A_DAY,
    queryFn: async (): Promise<ExerciseTotal[]> =>
      unwrap(await supabase.rpc('workout_exercise_totals', { p_from: from, p_to: to })).map(
        (row) => ({ exerciseId: row.exercise_id, sets: row.sets }),
      ),
  })
}

export type ExerciseBests = {
  exerciseId: string
  name: string
  tracking: Tracking
  workouts: number
  lastAt: string | null
  bestWeightKg: number | null
  bestWeightReps: number | null
  bestE1rmKg: number | null
  bestSetVolumeKg: number | null
  bestSessionVolumeKg: number | null
  bestReps: number | null
  bestDurationS: number | null
  bestDistanceM: number | null
  totalVolumeKg: number
}

/**
 * Personal bests: one exercise's, or every exercise's when the id is null.
 * The logger reads the whole list to say "new record" the moment a set beats
 * one, so it is fetched once per workout and kept.
 */
export function useExerciseBests(exerciseId: string | null, options?: { enabled?: boolean }) {
  const userId = useUserId()

  return useQuery({
    enabled: options?.enabled ?? true,
    staleTime: UNTIL_SAVED,
    // The whole list is the logger's and stays; one exercise's is a page's.
    gcTime: exerciseId ? KEPT_A_DAY : Number.POSITIVE_INFINITY,
    queryKey: keys.exerciseBests(userId, exerciseId),
    queryFn: async (): Promise<ExerciseBests[]> =>
      unwrap(
        await supabase.rpc('exercise_bests', exerciseId ? { p_exercise_id: exerciseId } : {}),
      ).map((row) => ({
        exerciseId: row.exercise_id,
        name: row.exercise_name,
        tracking: row.tracking,
        workouts: row.workouts,
        lastAt: row.last_at,
        bestWeightKg: num(row.best_weight_kg),
        bestWeightReps: row.best_weight_reps,
        bestE1rmKg: num(row.best_e1rm_kg),
        bestSetVolumeKg: num(row.best_set_volume_kg),
        bestSessionVolumeKg: num(row.best_session_volume_kg),
        bestReps: row.best_reps,
        bestDurationS: row.best_duration_s,
        bestDistanceM: num(row.best_distance_m),
        totalVolumeKg: num(row.total_volume_kg) ?? 0,
      })),
  })
}

export type RepBest = { reps: number; weightKg: number; at: string }

/**
 * The heaviest weight for each number of reps, keeping only the counts a
 * heavier set at more reps has not beaten (`exercise_rep_bests`).
 */
export function useExerciseRepBests(exerciseId: string | undefined) {
  const userId = useUserId()

  // The default staleness, like the history under it: only the exercise page
  // reads this, and a workout logged on another device should reach it.
  return useQuery({
    enabled: Boolean(exerciseId),
    queryKey: keys.exerciseRepBests(userId, exerciseId ?? ''),
    gcTime: KEPT_A_DAY,
    queryFn: async (): Promise<RepBest[]> =>
      unwrap(await supabase.rpc('exercise_rep_bests', { p_exercise_id: exerciseId ?? '' })).map(
        (row) => ({ reps: row.reps, weightKg: Number(row.weight_kg), at: row.started_at }),
      ),
  })
}

export type ExerciseSession = {
  workoutId: string
  workoutName: string
  startedAt: string
  sets: {
    kind: SetKind
    weightKg: number | null
    reps: number | null
    durationS: number | null
    distanceM: number | null
    isPr: boolean
  }[]
  bestWeightKg: number | null
  bestE1rmKg: number | null
  volumeKg: number
  durationS: number
  distanceM: number | null
}

/**
 * Sessions of one exercise fetched at once: the chart draws twenty and the list
 * shows ten more at a time. Two hundred was most of a persisted cache entry
 * nobody scrolled to.
 */
const HISTORY_LIMIT = 50

export function useExerciseHistory(exerciseId: string | undefined) {
  const userId = useUserId()

  return useQuery({
    enabled: Boolean(exerciseId),
    queryKey: keys.exerciseHistory(userId, exerciseId ?? ''),
    gcTime: KEPT_A_DAY,
    queryFn: async (): Promise<ExerciseSession[]> =>
      unwrap(
        await supabase.rpc('exercise_history', {
          p_exercise_id: exerciseId ?? '',
          p_limit: HISTORY_LIMIT,
        }),
      ).map((row) => ({
        workoutId: row.workout_id,
        workoutName: row.workout_name,
        startedAt: row.started_at,
        sets: (Array.isArray(row.sets) ? row.sets : []).map((value) => {
          const set = value as Record<string, Json>
          return {
            kind: (set.kind as SetKind) ?? 'normal',
            weightKg: num(set.weight_kg as number | null),
            reps: num(set.reps as number | null),
            durationS: num(set.duration_s as number | null),
            distanceM: num(set.distance_m as number | null),
            isPr: Boolean(set.is_pr),
          }
        }),
        bestWeightKg: num(row.best_weight_kg),
        bestE1rmKg: num(row.best_e1rm_kg),
        volumeKg: num(row.volume_kg) ?? 0,
        durationS: row.duration_s,
        distanceM: num(row.distance_m),
      })),
  })
}

export type LastSet = {
  kind: SetKind
  weightKg: number | null
  reps: number | null
  durationS: number | null
  distanceM: number | null
}

/**
 * What each exercise was last time, set by set: the PREVIOUS column. The ids
 * are sorted into the key, so adding an exercise to the workout asks again
 * while reordering does not.
 */
export function useLastSets(exerciseIds: readonly string[]) {
  const userId = useUserId()
  const sorted = [...new Set(exerciseIds)].sort()

  return useQuery({
    enabled: sorted.length > 0,
    staleTime: UNTIL_SAVED,
    // Adding an exercise changes the key. Without this every PREVIOUS column
    // emptied until the new answer landed.
    placeholderData: keepPreviousData,
    // Every mix of exercises is a key of its own, and kept forever each one
    // was written into the persisted cache again on every change.
    gcTime: KEPT_A_DAY,
    queryKey: keys.lastSets(userId, sorted.join(',')),
    queryFn: async (): Promise<Record<string, LastSet[]>> => {
      const rows = unwrap(await supabase.rpc('exercise_last_sets', { p_exercise_ids: sorted }))
      const out: Record<string, LastSet[]> = {}
      for (const row of rows) {
        out[row.exercise_id] ??= []
        out[row.exercise_id].push({
          kind: row.kind,
          weightKg: num(row.weight_kg),
          reps: row.reps,
          durationS: row.duration_s,
          distanceM: num(row.distance_m),
        })
      }
      return out
    },
  })
}

// ---------------------------------------------------------------------------
// Saving.
// ---------------------------------------------------------------------------

/**
 * Whether a failed save was refused for what it says, rather than for when or
 * by whom it was sent. Only the SQLSTATE classes about the data itself count:
 * 22 (a value out of range) and 23 (a constraint). Everything else with a code
 * passes on a later try, and treating it as final lost workouts: an expired
 * token (`PGRST301`), a refresh that failed on a weak signal so the request
 * went out as anon (`42501`), a timeout (`57014`), the database flipped read
 * only (`25006`).
 */
export function wasRefused(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  return typeof code === 'string' && /^2[23][0-9A-Z]{3}$/.test(code)
}

/**
 * Queued workouts the server refused since the app started. They stay in the
 * outbox, because a refused workout is still a workout somebody did, and are
 * tried again on the next launch rather than on every foreground.
 */
const refusedThisLaunch = new Set<string>()

/** The mounted outbox's send, for a retry the user asks for. */
let flushOutbox: (() => void) | null = null

/**
 * Send a queued workout again now, including one the server refused this
 * launch. Asked for from its row, which otherwise said "Waiting to sync" until
 * the next launch with nothing to do about it.
 */
export function retryQueuedWorkout(id: string): void {
  refusedThisLaunch.delete(id)
  flushOutbox?.()
}

/** The social reads a workout can change: its post, where that post is drawn, and the counts. */
const WORKOUT_SOCIAL = new Set([
  'social_feed',
  'social_profile_posts',
  'social_post',
  'social_profile',
  'social_workout_count',
  'workoutPost',
])

function invalidateWorkouts(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  { social = false }: { social?: boolean } = {},
): void {
  queryClient.invalidateQueries({ queryKey: keys.workoutsAll(userId) })
  // `save_workout` moves a routine's "last done".
  queryClient.invalidateQueries({ queryKey: keys.routines(userId) })
  // Only when the server took a workout, which may have posted it, and only
  // the reads it can change, marked stale rather than refetched: the Feed tab
  // stays mounted, and every save refetched all its loaded pages, the profile,
  // the notifications and the comments. The tab refetches stale reads when it
  // is next shown.
  if (social) {
    queryClient.invalidateQueries({
      queryKey: keys.social(userId),
      predicate: (query) => WORKOUT_SOCIAL.has(String(query.queryKey[2])),
      refetchType: 'none',
    })
  }
}

type WorkoutSaveResult = { queued: boolean }

/**
 * How long a save waits for an answer before the workout goes to the outbox.
 * Nothing else limits it: on a gym's weak signal the phone still counts as
 * online, and the finish screen spun until the OS gave up, which on Android
 * may be never. The id is the phone's, so a late commit is harmless.
 */
export const SAVE_TIMEOUT_MS = 15_000

/**
 * A request with the save's deadline, as a throw: a token refresh on a weak
 * signal can wait forever, and a spinner or the import's progress bar sat
 * still with no way to retry.
 */
export async function bounded<T>(work: PromiseLike<T>): Promise<T> {
  const answer = await withDeadline(work, SAVE_TIMEOUT_MS)
  if (answer === TIMED_OUT) throw new Error('timed out')
  return answer
}

/**
 * The request in flight for each workout id, whoever sent it: a save, the
 * outbox or a delete. Each waits for the one before it and the outbox skips
 * an id that is in flight. Registered one way only, a queued copy the outbox
 * sent beside a newer save could land last and put the old workout back, and
 * one sent beside a delete brought the deleted workout back.
 */
const sendingIds = new Map<string, Promise<unknown>>()
const settledSend = (id: string) => sendingIds.get(id)?.catch(() => {}) ?? Promise.resolve()

/** Registers `request` as the one in flight for `id` until it settles. */
function inFlight<T>(id: string, request: Promise<T>): Promise<T> {
  sendingIds.set(id, request)
  void request
    .finally(() => {
      if (sendingIds.get(id) === request) sendingIds.delete(id)
    })
    .catch(() => {})
  return request
}

/** One save request, bounded by `SAVE_TIMEOUT_MS` at the fetch. The import sends through it too. */
export async function sendWorkout(document: WorkoutDocument) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS)
  try {
    return await supabase
      .rpc('save_workout', { p_workout: document as unknown as Json })
      .abortSignal(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Save a finished (or edited) workout.
 *
 * `networkMode: 'always'` because this must never pause: a paused mutation is
 * one that vanishes when the app is killed. With no connection it goes
 * straight to the outbox, and an answer that never comes back sends it there
 * too, so the caller can always close the logger knowing the workout is kept.
 */
export function useSaveWorkout() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    networkMode: 'always',
    mutationFn: async (document: WorkoutDocument): Promise<WorkoutSaveResult> => {
      // Queued first and kept until the server answers, so nothing between
      // here and that answer (a token refresh that hangs, the app killed) can
      // lose it. Taken out again only once the server has it, or refused it.
      const before = getOutbox(userId).find((queued) => queued.id === document.id)
      enqueueWorkout(userId, document)
      if (!onlineManager.isOnline()) return { queued: true }
      const request = inFlight(
        document.id,
        settledSend(document.id).then(() => sendWorkout(document)),
      )
      let late = false
      void request.then(
        ({ error }) => {
          if (error) return
          // A reply after the deadline still clears the copy it sent, and
          // refreshes the lists the screen that asked has stopped waiting for.
          dequeueWorkout(userId, document.id, document)
          if (late) invalidateWorkouts(queryClient, userId, { social: true })
        },
        () => {},
      )
      const answer = await withDeadline(request, SAVE_TIMEOUT_MS)
      if (answer === TIMED_OUT) {
        late = true
        return { queued: true }
      }
      if (answer.error) {
        // Refused for what it says: stay on the finish screen, where the
        // workout is still the running one and can be fixed. An abort or a
        // lost connection has no SQLSTATE and stays queued.
        if (wasRefused(answer.error)) {
          dequeueWorkout(userId, document.id, document)
          if (before) enqueueWorkout(userId, before)
          throw answer.error
        }
        return { queued: true }
      }
      return { queued: false }
    },
    onSettled: (result) =>
      invalidateWorkouts(queryClient, userId, { social: result?.queued === false }),
  })
}

/**
 * Sends whatever the outbox holds: on mount, whenever the phone comes back
 * online, and whenever the app returns to the foreground. Mounted once, in the
 * tabs layout.
 */
export function useWorkoutOutbox(): void {
  const userId = useUserId()
  const queryClient = useQueryClient()
  const sending = useRef(false)
  // A flush asked for while one runs, which runs once more when it ends:
  // returned from silently, a retry tapped mid-flush did nothing.
  const again = useRef(false)

  useEffect(() => {
    let alive = true

    const flush = async () => {
      if (!onlineManager.isOnline()) return
      if (sending.current) {
        again.current = true
        return
      }
      const queued = getOutbox(userId).filter((document) => !refusedThisLaunch.has(document.id))
      if (!queued.length) return
      sending.current = true
      let sent = 0
      try {
        // Without a session the request goes out as anon and is refused for
        // that, not for the workout. Wait for the session to come back. With
        // a deadline: a token refresh on a weak signal can wait forever.
        const session = await withDeadline(supabase.auth.getSession(), SAVE_TIMEOUT_MS)
        if (session === TIMED_OUT || !session.data.session) return
        for (const document of queued) {
          if (!alive) break
          // A save or a delete of it is in flight, and answers for it.
          if (sendingIds.has(document.id)) continue
          const answer = await withDeadline(
            inFlight(document.id, sendWorkout(document)),
            SAVE_TIMEOUT_MS,
          )
          if (answer === TIMED_OUT) break
          const { error } = answer
          if (!error) {
            // Only if it is still the copy that was sent: an edit queued while
            // this one was in flight must not be cleared by its reply.
            dequeueWorkout(userId, document.id, document)
            sent += 1
          } else if (wasRefused(error)) {
            console.warn('[workouts] the server refused a queued workout', error)
            refusedThisLaunch.add(document.id)
          } else {
            break
          }
        }
      } finally {
        sending.current = false
        if (sent) invalidateWorkouts(queryClient, userId, { social: true })
        if (again.current) {
          again.current = false
          // The mounted flush, which after an account change is not this one.
          flushOutbox?.()
        }
      }
    }

    flush()
    flushOutbox = flush
    const online = onlineManager.subscribe((isOnline) => {
      if (isOnline) flush()
    })
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') flush()
    })
    return () => {
      alive = false
      if (flushOutbox === flush) flushOutbox = null
      online()
      foreground.remove()
    }
  }, [userId, queryClient])
}

/**
 * Stop sending a queued workout. Its Apple Health copy goes only if the
 * server has no workout under its id: a queued edit of a saved workout shows
 * as waiting too, and discarding the edit must not take the saved workout's
 * Health copy, and its energy in the budget, with it.
 */
export async function discardQueuedWorkout(userId: string, id: string): Promise<void> {
  await settledSend(id)
  const document = getOutbox(userId).find((queued) => queued.id === id)
  dequeueWorkout(userId, id)
  if (!document) return
  const answer = await withDeadline(
    supabase.from('workouts').select('id').eq('id', id).maybeSingle(),
    SAVE_TIMEOUT_MS,
  )
  // Unknown is not "none": leave the copy rather than risk the saved one's.
  if (answer === TIMED_OUT || answer.error || answer.data) return
  await removeWorkoutFromHealth(document.health_workout_id, document.id)
}

export function useDeleteWorkout() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await settledSend(id)
      // Out of the outbox before the delete is sent, so a flush cannot send a
      // queued copy behind it and bring the workout back. A queued edit of a
      // workout being deleted is not worth keeping if the delete fails.
      dequeueWorkout(userId, id)
      const { error } = await bounded(
        inFlight(
          id,
          Promise.resolve(supabase.from('workouts').delete().eq('id', id).eq('user_id', userId)),
        ),
      )
      if (error) throw error
    },
    onSuccess: async () => {
      // Its post went with it. Reset rather than invalidate, as deleting a
      // meal does: a profile or post screen opened again within the cache's
      // minute would otherwise draw the deleted card until its refetch landed.
      await queryClient.cancelQueries({ queryKey: keys.social(userId) })
      queryClient.resetQueries({ queryKey: keys.social(userId) })
    },
    onSettled: () => invalidateWorkouts(queryClient, userId),
  })
}

// ---------------------------------------------------------------------------
// Routines.
// ---------------------------------------------------------------------------

export type RoutineSet = {
  kind?: SetKind
  weight_kg?: number | null
  reps?: number | null
  duration_s?: number | null
  distance_m?: number | null
}

export type RoutineExercise = {
  exercise_id: string
  exercise_name: string
  tracking: Tracking
  rest_s?: number | null
  superset?: number | null
  notes?: string | null
  sets: RoutineSet[]
}

export type Routine = {
  id: string
  name: string
  notes: string | null
  exercises: RoutineExercise[]
  templateId: string | null
  position: number
  lastUsedAt: string | null
}

function toRoutine(row: Tables<'workout_routines'>): Routine {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    exercises: (Array.isArray(row.exercises) ? row.exercises : []) as unknown as RoutineExercise[],
    templateId: row.template_id,
    position: row.position,
    lastUsedAt: row.last_used_at,
  }
}

export function useRoutines() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.routines(userId),
    queryFn: async (): Promise<Routine[]> =>
      unwrap(
        await supabase
          .from('workout_routines')
          .select('*')
          .eq('user_id', userId)
          .order('position')
          .order('created_at'),
      ).map(toRoutine),
  })
}

type RoutineInput = {
  id?: string
  name: string
  notes: string | null
  exercises: RoutineExercise[]
  templateId?: string | null
}

export function useSaveRoutine() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RoutineInput): Promise<Routine> => {
      const values = {
        name: input.name.trim(),
        notes: input.notes?.trim() || null,
        exercises: input.exercises as unknown as Json,
        template_id: input.templateId ?? null,
      }
      // New routines go to the end of the user's own order.
      const existing = queryClient.getQueryData<Routine[]>(keys.routines(userId)) ?? []
      const position = existing.reduce((max, routine) => Math.max(max, routine.position + 1), 0)
      const query = input.id
        ? supabase.from('workout_routines').update(values).eq('id', input.id).eq('user_id', userId)
        : supabase.from('workout_routines').insert({ ...values, user_id: userId, position })
      const { data, error } = await query.select('*').single()
      if (error) throw error
      return toRoutine(data)
    },
    onSuccess: (routine, input) =>
      track('Routine Saved', {
        is_new: !input.id,
        exercises: routine.exercises.length,
        from_template: Boolean(input.templateId),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.routines(userId) }),
  })
}

export function useDeleteRoutine() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('workout_routines')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keys.routines(userId) })
      const previous = queryClient.getQueryData<Routine[]>(keys.routines(userId))
      if (previous) {
        queryClient.setQueryData(
          keys.routines(userId),
          previous.filter((routine) => routine.id !== id),
        )
      }
      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(keys.routines(userId), context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.routines(userId) }),
  })
}

// ---------------------------------------------------------------------------
// Custom exercises.
// ---------------------------------------------------------------------------

export type CustomExercise = {
  id: string
  name: string
  tracking: Tracking
  equipment: string
  category: string
  muscles: Record<string, number>
}

const toCustomExercise = (row: Tables<'custom_exercises'>): CustomExercise => ({
  id: row.id,
  name: row.name,
  tracking: row.tracking,
  equipment: row.equipment,
  category: row.category,
  muscles: (row.muscles ?? {}) as Record<string, number>,
})

export function useCustomExercises() {
  const userId = useUserId()

  return useQuery({
    queryKey: keys.customExercises(userId),
    queryFn: async (): Promise<CustomExercise[]> =>
      unwrap(
        await supabase.from('custom_exercises').select('*').eq('user_id', userId).order('name'),
      ).map(toCustomExercise),
  })
}

type CustomExerciseInput = Omit<CustomExercise, 'id'> & { id?: string }

export function useSaveCustomExercise() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CustomExerciseInput): Promise<CustomExercise> => {
      const values = {
        name: input.name.trim(),
        tracking: input.tracking,
        equipment: input.equipment,
        category: input.category,
        muscles: input.muscles as Json,
      }
      const query = input.id
        ? supabase.from('custom_exercises').update(values).eq('id', input.id).eq('user_id', userId)
        : supabase.from('custom_exercises').insert({ ...values, user_id: userId })
      const { data, error } = await query.select('*').single()
      if (error) throw error
      return toCustomExercise(data)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.customExercises(userId) }),
  })
}

export function useDeleteCustomExercise() {
  const userId = useUserId()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_exercises')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.customExercises(userId) }),
  })
}

/** Whether a custom exercise name is taken (the unique index's own error). */
export function isDuplicateName(error: unknown): boolean {
  return (error as { code?: string })?.code === '23505'
}

/** One saved set with its workout, for the CSV export. */
export type ExportRow = {
  workoutId: string
  workoutName: string
  workoutNotes: string | null
  startedAt: string
  durationS: number
  exerciseName: string
  exerciseNotes: string | null
  exercisePosition: number
  setPosition: number
  kind: SetKind
  weightKg: number | null
  reps: number | null
  setDurationS: number | null
  distanceM: number | null
  rpe: number | null
}

/**
 * Every set the user has saved, oldest workout first, for "Export workouts".
 * A one-off read rather than a query: it is asked for once, on a tap, and
 * caching a whole history would only fill the persisted cache.
 *
 * Workouts still in the outbox are included, newer than any copy on the
 * server: the history list already shows them, so an export without them
 * would be missing the session the user just finished in a basement.
 */
export async function fetchWorkoutExport(userId: string): Promise<ExportRow[]> {
  const workouts = new Map<string, { name: string; notes: string | null; durationS: number }>()
  // Three independent reads, side by side: on a long history each is many pages.
  const [saved, noted, sets] = await Promise.all([
    everyRow((from, to) =>
      supabase
        .from('workouts')
        .select('id, name, notes, duration_s')
        .eq('user_id', userId)
        // By id as well: rows tied on the start could swap places between pages.
        .order('started_at')
        .order('id')
        .range(from, to),
    ),
    everyRow((from, to) =>
      supabase
        .from('workout_exercises')
        .select('id, notes')
        .eq('user_id', userId)
        .not('notes', 'is', null)
        .order('id')
        .range(from, to),
    ),
    everyRow((from, to) =>
      supabase
        .from('workout_set_values')
        .select(
          'workout_id, workout_exercise_id, started_at, exercise_name, exercise_position, position, kind, weight_kg, reps, duration_s, distance_m, rpe',
        )
        .eq('user_id', userId)
        .order('started_at')
        .order('workout_id')
        .order('exercise_position')
        .order('position')
        .range(from, to),
    ),
  ])
  for (const row of saved) {
    workouts.set(row.id, { name: row.name, notes: row.notes, durationS: row.duration_s ?? 0 })
  }
  const notes = new Map(noted.map((row) => [row.id, row.notes]))
  const queued = getOutbox(userId)
  const pending = new Set(queued.map((document) => document.id))

  const rows: ExportRow[] = []
  for (const set of sets) {
    const workoutId = set.workout_id ?? ''
    if (pending.has(workoutId)) continue
    // A workout saved between the reads has sets but no row here. The
    // sets are the data, so they go out with a blank name rather than not at all.
    const workout = workouts.get(workoutId)
    rows.push({
      workoutId,
      workoutName: workout?.name ?? '',
      workoutNotes: workout?.notes ?? null,
      startedAt: set.started_at ?? '',
      durationS: workout?.durationS ?? 0,
      exerciseName: set.exercise_name ?? '',
      exerciseNotes: notes.get(set.workout_exercise_id ?? '') ?? null,
      exercisePosition: set.exercise_position ?? 0,
      setPosition: set.position ?? 0,
      kind: set.kind ?? 'normal',
      weightKg: num(set.weight_kg),
      reps: set.reps,
      setDurationS: set.duration_s,
      distanceM: num(set.distance_m),
      rpe: num(set.rpe),
    })
  }

  for (const document of queued) {
    const durationS = queuedDuration(document)
    document.exercises.forEach((exercise, exercisePosition) => {
      exercise.sets.forEach((set, setPosition) => {
        rows.push({
          workoutId: document.id,
          workoutName: document.name,
          workoutNotes: document.notes,
          startedAt: document.started_at,
          durationS,
          exerciseName: exercise.exercise_name,
          exerciseNotes: exercise.notes,
          exercisePosition,
          setPosition,
          kind: set.kind,
          weightKg: set.weight_kg,
          reps: set.reps,
          setDurationS: set.duration_s,
          distanceM: set.distance_m,
          rpe: set.rpe,
        })
      })
    })
  }
  // The queued ones are appended above; one sort puts them in the history's order.
  return rows.sort(
    (a, b) =>
      Date.parse(a.startedAt) - Date.parse(b.startedAt) ||
      a.workoutId.localeCompare(b.workoutId) ||
      a.exercisePosition - b.exercisePosition ||
      a.setPosition - b.setPosition,
  )
}
