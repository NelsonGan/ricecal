import {
  addWorkoutActionListener,
  endWorkoutActivity,
  startWorkoutActivity,
  takeWorkoutActions,
  type WorkoutActivityState,
} from '@modules/ricecal-widgets'
import * as Haptics from 'expo-haptics'
import type { TFunction } from 'i18next'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState } from 'react-native'
import { type LastSet, useLastSets, useSettings } from '@/data'
import { cancelNotice, scheduleNoticeAt } from '@/lib/notifications'
import { STALE_AFTER_MS, useLiveWorkout } from './live'
import {
  isLoggable,
  type LiveExercise,
  type LiveSet,
  type LiveWorkout,
  liveTotals,
  restAfter,
  type SetHint,
  setHints,
  supersetRuns,
  tickedSet,
} from './model'
import { getActiveWorkout } from './store'

/** How late a rest's end can be noticed and still be news worth a buzz. */
const OVERDUE_MS = 1500
/**
 * How long the Live Activity waits for typing to stop before it redraws.
 * The next set's figures change a keystroke at a time, and ActivityKit
 * throttles an app that updates that often.
 */
const ACTIVITY_SETTLE_MS = 400

/**
 * What a running workout does outside its own screen. Mounted once, in the
 * tabs layout, because the logger is often not on screen while it matters: the
 * phone is locked between sets, or the user has minimised it to check Today.
 *
 * Three things, all of which follow the stored document rather than a screen's
 * state, so they are right after the app is killed and reopened:
 *
 *   the rest timer   a notification booked for the moment it ends, because a
 *                    suspended app cannot post one when the time comes, and a
 *                    haptic when it ends with the app open
 *   a forgotten one  "still training?", booked for three hours after the start
 *   Live Activity    the lock screen and Dynamic Island, on iOS, and the
 *                    buttons pressed on it
 */
function useWorkoutEffects(): void {
  const { t } = useTranslation(['workouts'])
  const { userId, workout, dispatch } = useLiveWorkout()
  const settingsQuery = useSettings()
  const defaultRestS = settingsQuery.data?.workout_rest_s ?? 90
  // Last time's sets, for what an empty set offers to the activity's tick.
  // The logger asks for the same key, so this is its cache rather than a fetch.
  const ids = useMemo(
    () => workout?.exercises.map((exercise) => exercise.exerciseId) ?? [],
    [workout?.exercises],
  )
  const lastSets = useLastSets(ids)
  const previous = lastSets.data
  // Whether what a lock-screen tick needs has arrived: last time's sets, for
  // what an empty set offers, and the settings, for the rest it starts. Or
  // will not arrive, offline. Drained before then, a tick on an empty set
  // found nothing to fill it with.
  const settled = (query: { data?: unknown; fetchStatus: string; isError: boolean }) =>
    query.data !== undefined || query.isError || query.fetchStatus === 'paused'
  const ready = settled(settingsQuery) && (ids.length === 0 || settled(lastSets))
  // Whether presses queued on the lock screen while the app was not running
  // have been applied. Until then the notice and the activity are left alone:
  // written from the document as it was before the presses, they rebooked a
  // skipped rest's notice and drew the old state over the button's own.
  const [drained, setDrained] = useState(false)
  // Bumped after lock-screen ticks are applied. The intent books the notice
  // for the rest it expects; a tick the app then refused, or one that started
  // no rest, leaves the rest as it was, so the effect below would not run and
  // that notice would fire with no rest behind it.
  const [rebook, setRebook] = useState(0)

  // The rest-over notice, rebooked whenever the rest changes. Its identifier
  // is fixed, so booking it replaces the last one rather than adding another.
  const restKey = workout?.rest ? `${workout.id}:${workout.rest.endsAt}` : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the rest itself, not on every edit to the workout around it
  useEffect(() => {
    void rebook
    if (!drained) return
    if (!workout?.rest) {
      cancelNotice('rest')
      return
    }
    const rest = workout.rest
    const exercise = workout.exercises.find((entry) => entry.key === rest.exerciseKey)
    scheduleNoticeAt(rest.endsAt, 'rest', {
      title: t('workouts:rest.over'),
      body: t('workouts:rest.overBody', { name: exercise?.name ?? workout.name }),
    })

    // With the app open the countdown on screen is the notice; the end gets a
    // haptic and the timer clears itself.
    const timer = setTimeout(
      () => {
        // Only for a rest that ends while someone is looking: one that ended
        // with the app in the background buzzed as it opened.
        if (Date.now() - rest.endsAt < OVERDUE_MS) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        }
        dispatch({ type: 'stopRest' })
      },
      Math.max(0, rest.endsAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [restKey, drained, rebook])

  // "Still training?", once per workout, three hours in.
  const workoutId = workout?.id ?? null
  const startedAt = workout?.startedAt ?? null
  useEffect(() => {
    if (!workoutId || startedAt === null) {
      cancelNotice('workout')
      return
    }
    scheduleNoticeAt(startedAt + STALE_AFTER_MS, 'workout', {
      title: t('workouts:stale.pushTitle'),
      body: t('workouts:stale.pushBody'),
    })
  }, [workoutId, startedAt, t])

  // The Live Activity: started with the workout, updated as it moves, ended
  // with it. A start for the workout already showing updates it. The native
  // side ignores both where Live Activities do not exist (Android, iOS before
  // 16.2, a user who switched them off).
  const live = useRef<string | null>(null)
  const state = workout ? activityState(workout, previous, defaultRestS, t) : null
  const stateKey = state ? JSON.stringify(state) : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the serialised state
  useEffect(() => {
    if (!state) {
      // Every time, not only after one this mount started: an activity left
      // by a crash, or by the last launch, belongs to no workout now.
      endWorkoutActivity()
      live.current = null
      return
    }
    if (!drained) return
    if (live.current !== state.id) {
      startWorkoutActivity(state)
      live.current = state.id
      return
    }
    const timer = setTimeout(() => startWorkoutActivity(state), ACTIVITY_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [stateKey, drained])

  // The activity's buttons. Pressed with the app running, the intent says so
  // and they are applied at once; pressed with it closed, they wait in the
  // queue for the launch, or the return to the foreground, that follows.
  const latest = useRef({ userId, previous, defaultRestS, dispatch })
  latest.current = { userId, previous, defaultRestS, dispatch }
  useEffect(() => {
    if (!ready) return
    const drain = () => {
      const { userId, previous, defaultRestS, dispatch } = latest.current
      if (!userId) return
      let anyTick = false
      for (const action of takeWorkoutActions()) {
        // Read fresh for each: the one before it may have changed it.
        const workout = getActiveWorkout(userId)
        if (!workout || action.workoutId !== workout.id) continue
        switch (action.type) {
          case 'skipRest':
            dispatch({ type: 'stopRest' })
            break
          case 'restMinus':
          case 'restPlus':
            dispatch({
              type: 'adjustRest',
              byS: action.type === 'restPlus' ? 15 : -15,
              at: Date.now(),
            })
            break
          case 'completeSet': {
            anyTick = true
            const exercise = workout.exercises.find((entry) => entry.key === action.exerciseKey)
            const set = exercise?.sets.find((entry) => entry.id === action.setId)
            if (!exercise || !set || set.done) break
            // The same test the logger's own tick makes: a set with nothing
            // in it and nothing to offer is not a set.
            const fill = hintFor(exercise, set, previous)
            if (!isLoggable(tickedSet(set, action.at, fill), exercise.tracking)) break
            dispatch({ type: 'completeSet', key: exercise.key, setId: set.id, at: action.at, fill })
            const rest = restAfter(workout, exercise, defaultRestS, set.id)
            // A press taken long after it was made starts no rest that would
            // already be over: it only buzzed "rest over" as the app opened.
            if (rest > 0 && action.at + rest * 1000 > Date.now()) {
              dispatch({
                type: 'startRest',
                exerciseKey: exercise.key,
                totalS: rest,
                at: action.at,
              })
            }
            break
          }
        }
      }
      if (anyTick) setRebook((count) => count + 1)
    }
    drain()
    setDrained(true)
    const remove = addWorkoutActionListener(drain)
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') drain()
    })
    return () => {
      remove()
      foreground.remove()
    }
  }, [ready])

  // Signing out unmounts this. Nothing of the workout may outlive the account
  // on the phone: the next person to sign in must not see it on the lock
  // screen or be told their rest is over.
  useEffect(
    () => () => {
      cancelNotice('rest')
      cancelNotice('workout')
      endWorkoutActivity()
    },
    [],
  )
}

/**
 * The effects as a component of their own, rendering nothing, so the document
 * they read changing on every keystroke re-renders this and not the navigator
 * it sits beside.
 */
export function WorkoutEffects(): null {
  useWorkoutEffects()
  return null
}

/** What `set` offers when ticked empty: the figures above it, or last time's. */
function hintFor(
  exercise: LiveExercise,
  set: LiveSet,
  previous: Record<string, LastSet[]> | undefined,
): SetHint {
  const index = exercise.sets.findIndex((entry) => entry.id === set.id)
  return setHints(exercise.sets, previous?.[exercise.exerciseId])[index]
}

/**
 * The set to do next: the first not ticked, in the order a workout is done.
 * A superset is the run of exercises sharing its number, done a round at a
 * time, so after A1 comes B1 rather than A2.
 */
function nextSet(workout: LiveWorkout): { exercise: LiveExercise; set: LiveSet } | null {
  for (const round of supersetRuns(workout.exercises)) {
    const rounds = Math.max(...round.map((exercise) => exercise.sets.length))
    for (let index = 0; index < rounds; index++) {
      for (const exercise of round) {
        const set = exercise.sets[index]
        if (set && !set.done) return { exercise, set }
      }
    }
  }
  return null
}

/**
 * What the lock screen shows: the workout, how long it has run (the widget
 * counts that itself, from the start), the exercise and set to do next, and the
 * rest countdown if one is running. The next set is named by its keys, and
 * whether it has numbers to tick decides whether the tick button is drawn.
 *
 * It also carries the words the buttons need and cannot translate themselves:
 * their VoiceOver names, and the "rest is over" notice they rebook.
 */
function activityState(
  workout: LiveWorkout,
  previous: Record<string, LastSet[]> | undefined,
  defaultRestS: number,
  t: TFunction<['workouts']>,
): WorkoutActivityState {
  const { sets: total, done } = liveTotals(workout)
  const next = nextSet(workout)
  const last = workout.exercises[workout.exercises.length - 1]
  const filled = next && tickedSet(next.set, 0, hintFor(next.exercise, next.set, previous))
  // The notice names the exercise of the rest it ends: the running one, or
  // the one a tick would start.
  const resting = workout.rest
    ? workout.exercises.find((exercise) => exercise.key === workout.rest?.exerciseKey)
    : next?.exercise
  return {
    id: workout.id,
    name: workout.name,
    startedAt: workout.startedAt,
    exercise: next?.exercise.name ?? last?.name ?? '',
    set: next ? `${next.exercise.sets.indexOf(next.set) + 1}/${next.exercise.sets.length}` : '',
    done,
    total,
    restEndsAt: workout.rest?.endsAt ?? null,
    restTotalS: workout.rest?.totalS ?? null,
    exerciseKey: next?.exercise.key ?? null,
    setId: next?.set.id ?? null,
    canComplete: Boolean(filled && next && isLoggable(filled, next.exercise.tracking)),
    restAfterS: next ? restAfter(workout, next.exercise, defaultRestS, next.set.id) || null : null,
    restTitle: t('workouts:rest.over'),
    restBody: t('workouts:rest.overBody', { name: resting?.name ?? workout.name }),
    tickRestBody: t('workouts:rest.overBody', { name: next?.exercise.name ?? workout.name }),
    labels: {
      complete: t('workouts:logger.completeSet'),
      less: t('workouts:rest.minus'),
      more: t('workouts:rest.plus'),
      skip: t('workouts:rest.skip'),
    },
  }
}
