import { onlineManager, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'

import type { Tables } from '@/lib/database.types'
import { createJsonStore } from '@/lib/jsonStore'
import { supabase } from '@/lib/supabase'
import { TIMED_OUT, withDeadline } from './client'
import { keys } from './keys'
import { useSession } from './session'

/**
 * A workout's heart rate, as the Apple Watch app recorded it.
 *
 * The watch hands its trace to the phone once its session has ended, which is
 * usually after the workout was saved and sometimes before: a workout finished
 * on the watch sends the finish and the trace together, and a phone with no
 * signal holds the workout in its outbox. So a trace waits here, on the phone,
 * and `save_workout_heart_rate` is asked again until the workout it belongs to
 * is on the server. That function answers `missing` rather than failing while
 * the workout is not there yet.
 *
 * Per account, for the reason the workout outbox is.
 */

/** A trace as the workout page reads it. */
export type WorkoutHeartRate = {
  /** ISO time of the first reading. */
  startedAt: string
  intervalS: number
  /** One reading every `intervalS` seconds, null where the watch read nothing. */
  bpm: (number | null)[]
  /** Null when the watch recorded the workout but read no pulse. */
  avgBpm: number | null
  maxBpm: number | null
  minBpm: number | null
  activeKcal: number | null
}

export const HEART_RATE_COLUMNS =
  'started_at, interval_s, bpm, avg_bpm, max_bpm, min_bpm, active_kcal' as const

type HeartRow = Pick<
  Tables<'workout_heart_rates'>,
  'started_at' | 'interval_s' | 'bpm' | 'avg_bpm' | 'max_bpm' | 'min_bpm' | 'active_kcal'
>

export function toHeartRate(row: HeartRow | null): WorkoutHeartRate | null {
  if (!row) return null
  return {
    startedAt: row.started_at,
    intervalS: row.interval_s,
    bpm: Array.isArray(row.bpm)
      ? row.bpm.map((value) => (value === null ? null : Number(value)))
      : [],
    avgBpm: row.avg_bpm,
    maxBpm: row.max_bpm,
    minBpm: row.min_bpm,
    activeKcal: row.active_kcal,
  }
}

/** A trace as the watch sends it. */
export type HeartTrace = {
  workoutId: string
  /** Epoch ms of the first reading. */
  startedAt: number
  intervalS: number
  bpm: (number | null)[]
  activeKcal: number | null
  /** The HKWorkout the watch saved, if it saved one. */
  healthWorkoutId: string | null
}

type Waiting = { trace: HeartTrace; receivedAt: number }

const EMPTY: Waiting[] = []
const store = createJsonStore<Waiting[]>('ricecal-heart-outbox', (stored) =>
  Array.isArray(stored) ? (stored as Waiting[]) : EMPTY,
)
const keyFor = (userId: string) => `outbox:${userId}`

/**
 * How long a trace waits for its workout. A week covers a phone left offline
 * with the workout queued; past it the workout was discarded, and the trace
 * belongs to nothing.
 */
const WAIT_MS = 7 * 24 * 60 * 60 * 1000
/** How often a trace whose workout is still missing is asked about again. */
const RETRY_MS = 30_000
const SEND_TIMEOUT_MS = 15_000

export function getHeartOutbox(userId: string): Waiting[] {
  return store.get(keyFor(userId))
}

function write(userId: string, waiting: Waiting[]): void {
  store.set(keyFor(userId), waiting.length ? waiting : null)
}

/**
 * The workouts whose trace this phone has received, the newest few, which the
 * watch is told so it stops sending them. A trace is sent again until it is
 * on this list, because the phone can lose one it had not yet stored.
 */
const HEARD_KEPT = 20
const NONE_HEARD: string[] = []
const heard = createJsonStore<string[]>('ricecal-heart-heard', (stored) =>
  Array.isArray(stored) ? (stored as string[]) : NONE_HEARD,
)
const heardKey = (userId: string) => `heard:${userId}`

export function useHeardTraces(userId: string | null | undefined): string[] {
  return heard.useValue(heardKey(userId ?? ''), (list) => (userId ? list : NONE_HEARD))
}

/** Keep a trace until the server has it, replacing an earlier one for the same workout. */
export function queueHeartTrace(userId: string, trace: HeartTrace, now = Date.now()): void {
  write(userId, [
    ...getHeartOutbox(userId).filter((entry) => entry.trace.workoutId !== trace.workoutId),
    { trace, receivedAt: now },
  ])
  const list = heard.get(heardKey(userId)).filter((id) => id !== trace.workoutId)
  heard.set(heardKey(userId), [...list, trace.workoutId].slice(-HEARD_KEPT))
  flushHeart?.()
}

export function forgetHeartOutbox(userId: string): void {
  write(userId, [])
  heard.set(heardKey(userId), null)
}

/** Whether a reply is final for this trace: saved, or refused for what it says. */
export function heartReplyIsFinal(
  reply: { data: unknown; error: { code?: string } | null },
  waiting: Waiting,
  now = Date.now(),
): 'done' | 'wait' | 'stop' {
  if (reply.error) {
    // Class 22 or 23 is the trace itself being refused; nothing changes that.
    return /^2[23]/.test(reply.error.code ?? '') ? 'done' : 'stop'
  }
  if (reply.data === 'missing') return now - waiting.receivedAt > WAIT_MS ? 'done' : 'wait'
  return 'done'
}

let flushHeart: (() => void) | null = null

/**
 * Sends the waiting traces: on mount, on reconnecting, on returning to the
 * foreground, when a trace arrives, and every half minute while one is still
 * waiting for its workout. Mounted once, in the tabs layout.
 */
export function useHeartRateOutbox(): void {
  const { userId } = useSession()
  const queryClient = useQueryClient()
  const sending = useRef(false)
  const again = useRef(false)

  useEffect(() => {
    if (!userId) return
    let alive = true
    let retry: ReturnType<typeof setTimeout> | null = null

    const flush = async () => {
      if (!alive || !onlineManager.isOnline()) return
      if (sending.current) {
        again.current = true
        return
      }
      const waiting = getHeartOutbox(userId)
      if (!waiting.length) return
      sending.current = true
      let anyWaiting = false
      try {
        for (const entry of waiting) {
          if (!alive) break
          const { trace } = entry
          const reply = await withDeadline(
            supabase.rpc('save_workout_heart_rate', {
              p_trace: {
                workout_id: trace.workoutId,
                started_at: new Date(trace.startedAt).toISOString(),
                interval_s: trace.intervalS,
                bpm: trace.bpm,
                active_kcal: trace.activeKcal,
                health_workout_id: trace.healthWorkoutId,
              },
            }),
            SEND_TIMEOUT_MS,
          )
          if (reply === TIMED_OUT) break
          const outcome = heartReplyIsFinal(reply, entry)
          if (outcome === 'stop') break
          if (outcome === 'wait') {
            anyWaiting = true
            continue
          }
          // Only this copy: a newer trace for the same workout may have
          // arrived while this one was in flight.
          write(
            userId,
            getHeartOutbox(userId).filter((queued) => queued !== entry),
          )
          if (reply.data === 'saved') {
            queryClient.invalidateQueries({ queryKey: keys.workout(userId, trace.workoutId) })
          } else if (reply.error) {
            console.warn('[workouts] the server refused a heart rate trace', reply.error)
          }
        }
      } finally {
        sending.current = false
        if (retry) clearTimeout(retry)
        retry = anyWaiting && alive ? setTimeout(flush, RETRY_MS) : null
        if (again.current) {
          again.current = false
          flushHeart?.()
        }
      }
    }

    flush()
    flushHeart = flush
    const online = onlineManager.subscribe((isOnline) => {
      if (isOnline) flush()
    })
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') flush()
    })
    return () => {
      alive = false
      if (retry) clearTimeout(retry)
      if (flushHeart === flush) flushHeart = null
      online()
      foreground.remove()
    }
  }, [userId, queryClient])
}
