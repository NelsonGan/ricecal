import {
  addWatchInboxListener,
  addWatchPulseListener,
  addWatchStatusListener,
  publishWatchState,
  startWatchWorkout,
  takeWatchInbox,
  type WatchCommand,
  type WatchState,
  type WatchStatus,
  watchStatus,
} from '@modules/ricecal-watch'
import { useRouter } from 'expo-router'
import type { TFunction } from 'i18next'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState, Platform } from 'react-native'

import {
  queueHeartTrace,
  useHeardTraces,
  useHeartRateOutbox,
  useLastSets,
  useRoutines,
  useSession,
  useSettings,
} from '@/data'
import { track } from '@/lib/analytics'
import { announceNotice } from '@/lib/notifications'
import { UNIT_KEY, unitFor } from '@/lib/units'
import { useToast } from '@/ui'
import { distanceUnitFor } from './format'
import { loggerIsOpen } from './loggerOpen'
import { doneSets } from './model'
import { receivePulse } from './pulse'
import { discardWorkout } from './start'
import {
  clearActiveWorkout,
  dispatchWorkout,
  getActiveWorkout,
  getEndedWorkouts,
  recordEndedWorkout,
  startActiveWorkout,
  useActiveWorkout,
  useEndedWorkouts,
} from './store'
import { trackWorkoutFinished, useWorkoutSave } from './WorkoutForm'
import { applyWatchCommand, watchRoutines, watchWorkout } from './watch'

/** How long the state waits for typing to stop before it is sent. */
const PUBLISH_SETTLE_MS = 300
/**
 * A workout started on the phone this recently asks the watch to record it.
 * Older ones (the app reopened mid-workout) leave it to the person, who can
 * open the watch app, which picks the running workout up by itself.
 */
const ASK_WATCH_WITHIN_MS = 2 * 60 * 1000

/**
 * The Apple Watch app's phone half, mounted once in the tabs layout beside
 * `WorkoutEffects`. It does three things, all driven by the stored workout so
 * they hold across the app being killed:
 *
 *   publishes   what the watch draws: the running workout, the routines it
 *               can start, how the last workouts ended, and its words
 *   applies     the watch's commands, through the logger's own actions
 *   keeps       the heart rate trace the watch sends when its session ends,
 *               until the server has it (`useHeartRateOutbox`)
 *
 * iOS only, and idle until a watch with the app is paired: nothing is fetched
 * or sent for a phone without one.
 */
function useWatchSync(): void {
  const { t } = useTranslation(['workouts', 'activity', 'common'])
  const router = useRouter()
  const toast = useToast()
  const { userId } = useSession()
  const workout = useActiveWorkout(userId)
  const ended = useEndedWorkouts(userId)
  const heard = useHeardTraces(userId)
  const status = useWatchStatus()
  const watching = status.installed

  const settings = useSettings().data
  const defaultRestS = settings?.workout_rest_s ?? 90
  const unit = unitFor(settings?.units)
  const routines = useRoutines({ enabled: watching }).data
  // The running workout's last sets are the logger's own query, so this is
  // its cache rather than a fetch. The routines' are asked for only with a
  // watch to show them on.
  const workoutIds = useMemo(
    () => workout?.exercises.map((exercise) => exercise.exerciseId) ?? [],
    [workout?.exercises],
  )
  const previous = useLastSets(workoutIds).data
  const routineIds = useMemo(
    () =>
      watching
        ? (routines ?? []).flatMap((routine) => routine.exercises.map((entry) => entry.exercise_id))
        : [],
    [watching, routines],
  )
  const routinePrevious = useLastSets(routineIds).data

  useHeartRateOutbox()

  const labels = useMemo(() => watchLabels(t, unit), [t, unit])
  const routineList = useMemo(
    () => (watching ? watchRoutines(routines ?? [], routinePrevious, defaultRestS) : []),
    [watching, routines, routinePrevious, defaultRestS],
  )
  const current = useMemo(
    () => (workout ? watchWorkout(workout, previous, defaultRestS) : null),
    [workout, previous, defaultRestS],
  )

  // Publish, a moment after the last change, and only when what the watch
  // would draw changed: a refetch that answers the same last sets rebuilds
  // `current` without changing it. The revision is stamped as it goes, so the
  // watch can tell an older state from a newer one.
  const state = useMemo(
    (): Omit<WatchState, 'v' | 'rev'> => ({
      signedIn: Boolean(userId),
      unit,
      distanceUnit: distanceUnitFor(unit),
      workout: current,
      ended,
      heard,
      routines: routineList,
      labels,
    }),
    [userId, unit, current, ended, heard, routineList, labels],
  )
  const stateKey = useMemo(() => (watching ? JSON.stringify(state) : null), [watching, state])
  const latestState = useRef(state)
  latestState.current = state
  useEffect(() => {
    if (!stateKey) return
    const timer = setTimeout(
      () => publishWatchState({ v: 1, rev: Date.now(), ...latestState.current }),
      PUBLISH_SETTLE_MS,
    )
    return () => clearTimeout(timer)
  }, [stateKey])

  // Ask the watch to record a workout just started here. Once per workout per
  // launch, and not for one the watch started or is already recording.
  const asked = useRef<string | null>(null)
  const askId = workout && !workout.watch ? workout.id : null
  const askStarted = workout?.startedAt ?? 0
  useEffect(() => {
    if (!watching || !askId || asked.current === askId) return
    if (Date.now() - askStarted > ASK_WATCH_WITHIN_MS) return
    asked.current = askId
    void startWatchWorkout()
  }, [watching, askId, askStarted])

  // The watch's commands and traces. The watch sends every command the phone
  // has not confirmed, each time, so each list is applied in the order the
  // presses were made, from where the workout got to: a finish after the sets
  // it saves, a set after the press that added it. Whatever is not finished
  // here (the app killed mid-list) comes again in the watch's next list.
  const save = useWorkoutSave()
  const latest = useRef({ save, router, toast, t })
  latest.current = { save, router, toast, t }
  useEffect(() => {
    if (!userId || Platform.OS !== 'ios') return
    let alive = true
    let running: Promise<void> = Promise.resolve()

    const finish = async (endedAt: number) => {
      const document = getActiveWorkout(userId)
      if (!document) return
      const { save, router, toast, t } = latest.current
      if (doneSets(document) === 0) {
        discardWorkout(userId, document)
      } else {
        const result = await save(document, endedAt)
        trackWorkoutFinished(document, result)
        clearActiveWorkout(userId)
        recordEndedWorkout(userId, document.id, true, endedAt)
        toast.show({
          title: t('workouts:finish.saved'),
          description: result.queued ? t('workouts:finish.queued') : undefined,
          tone: 'success',
        })
      }
      // The logger holds the last document on screen; a workout finished on
      // the wrist should not stay there looking like it is still running.
      if (loggerIsOpen()) router.dismissTo('/workouts')
    }

    const apply = async (command: WatchCommand) => {
      const outcome = applyWatchCommand(getActiveWorkout(userId), command, {
        now: Date.now(),
        ended: getEndedWorkouts(userId),
      })
      switch (outcome.kind) {
        case 'actions':
          for (const action of outcome.actions) dispatchWorkout(userId, action)
          break
        case 'start': {
          startActiveWorkout(userId, outcome.workout)
          track('Workout Started', {
            source: outcome.workout.routineId ? 'routine' : 'empty',
            exercises: outcome.workout.exercises.length,
          })
          // Started on the wrist, with the phone in a pocket: say so, as the
          // way to follow it here. With the app open the bar over the tabs
          // says it, and the notice steps aside.
          const { t } = latest.current
          void announceNotice('started', {
            title: t('workouts:watch.startedTitle'),
            body: t('workouts:watch.startedBody', { name: outcome.workout.name }),
          })
          break
        }
        case 'finish':
          try {
            await finish(outcome.endedAt)
          } catch (failure) {
            // Refused for what it holds: it stays the running workout on
            // the phone, where the finish screen can say what is wrong.
            // Marked as applied, or the watch would go on drawing it as
            // finished while the phone still has it running.
            console.warn('[workouts] could not save a workout finished on the watch', failure)
            dispatchWorkout(userId, { type: 'watchApplied', seq: outcome.seq })
          }
          break
        case 'discard': {
          const document = getActiveWorkout(userId)
          if (document) discardWorkout(userId, document)
          if (loggerIsOpen()) latest.current.router.dismissTo('/workouts')
          break
        }
      }
    }

    const drain = async () => {
      for (const item of takeWatchInbox()) {
        if (!alive) return
        if (item.kind === 'heart') {
          queueHeartTrace(userId, item.trace)
          continue
        }
        for (const command of [...item.commands].sort((a, b) => a.seq - b.seq)) {
          if (!alive) return
          await apply(command)
        }
      }
    }
    const queue = () => {
      running = running.then(drain).catch((failure) => {
        console.warn('[workouts] could not apply what the watch sent', failure)
      })
    }

    queue()
    const inbox = addWatchInboxListener(queue)
    const pulse = addWatchPulseListener(receivePulse)
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') queue()
    })
    return () => {
      alive = false
      inbox()
      pulse()
      foreground.remove()
    }
  }, [userId])
}

/** Whether a watch with the app is paired, kept current. */
function useWatchStatus(): WatchStatus {
  const [status, setStatus] = useState(watchStatus)
  useEffect(() => {
    setStatus(watchStatus())
    const remove = addWatchStatusListener(setStatus)
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') setStatus(watchStatus())
    })
    return () => {
      remove()
      foreground.remove()
    }
  }, [])
  return status
}

/**
 * The watch's words, in the phone's language. The keys are the watch's
 * (`watch/ios/Labels.swift`), which falls back to its own English for any
 * missing.
 */
function watchLabels(
  t: TFunction<['workouts', 'activity', 'common']>,
  unit: ReturnType<typeof unitFor>,
): Record<string, string> {
  return {
    start: t('workouts:start.routine'),
    routines: t('workouts:routines.title'),
    noRoutines: t('workouts:watch.noRoutines'),
    openPhone: t('workouts:watch.openPhone'),
    set: t('workouts:logger.set'),
    reps: t('workouts:logger.reps'),
    time: t('workouts:logger.time'),
    weightUnit: t(UNIT_KEY[unit]),
    distanceUnit: distanceUnitFor(unit),
    warmup: t('workouts:logger.kindBadge.warmup'),
    drop: t('workouts:logger.kindBadge.drop'),
    failure: t('workouts:logger.kindBadge.failure'),
    completeSet: t('workouts:logger.completeSet'),
    rest: t('workouts:rest.title'),
    skip: t('workouts:rest.skip'),
    restMinus: t('workouts:rest.minus'),
    restPlus: t('workouts:rest.plus'),
    exercises: t('workouts:watch.exercises'),
    addSet: t('workouts:logger.addSet'),
    undo: t('workouts:watch.undo'),
    end: t('workouts:watch.end'),
    endTitle: t('workouts:watch.endTitle'),
    save: t('workouts:finish.save'),
    discard: t('workouts:logger.discard'),
    cancel: t('common:action.cancel'),
    nothingTitle: t('workouts:finish.nothingTitle'),
    saved: t('workouts:finish.saved'),
    allDone: t('workouts:watch.allDone'),
    upNext: t('workouts:watch.upNext'),
    empty: t('workouts:watch.empty'),
    syncing: t('workouts:watch.syncing'),
    previousSet: t('workouts:watch.previousSet'),
    nextSet: t('workouts:watch.nextSet'),
    heartRate: t('activity:workout.heartRate'),
    bpm: t('activity:workout.bpmUnit'),
    kcal: t('common:unit.kcal'),
    duration: t('workouts:logger.duration'),
    sets: t('workouts:logger.sets'),
    done: t('common:action.done'),
  }
}

/**
 * Signed out, the watch is told so, and stops showing the account's routines
 * and workout to whoever holds the phone next. Mounted at the root rather than
 * done when `WatchSync` unmounts: the tabs can unmount without anyone signing
 * out, and a signed-out state makes the watch throw away a recording.
 */
export function WatchSignOut(): null {
  const { userId, loading } = useSession()
  useEffect(() => {
    if (loading || userId || !watchStatus().installed) return
    publishWatchState({
      v: 1,
      rev: Date.now(),
      signedIn: false,
      unit: 'kg',
      distanceUnit: 'km',
      workout: null,
      ended: [],
      heard: [],
      routines: [],
      labels: {},
    })
  }, [loading, userId])
  return null
}

/**
 * The effects as a component of their own, rendering nothing, for the reason
 * `WorkoutEffects` is one: the document changes on every keystroke.
 */
export function WatchSync(): null {
  useWatchSync()
  return null
}
