import {
  addWorkoutActionListener,
  endWorkoutActivity,
  startWorkoutActivity,
  takeWorkoutActions,
  updateWorkoutActivity,
  type WorkoutActivityState,
} from '@modules/ricecal-widgets'
import * as Haptics from 'expo-haptics'
import { useEffect, useMemo, useRef } from 'react'
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
  restAfter,
  type SetHint,
  setHints,
} from './model'

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
export function useWorkoutEffects(): void {
  const { t } = useTranslation(['workouts'])
  const { workout, dispatch } = useLiveWorkout()
  const { data: settings } = useSettings()
  const defaultRestS = settings?.workout_rest_s ?? 90
  // Last time's sets, for what an empty set offers to the activity's tick.
  // The logger asks for the same key, so this is its cache rather than a fetch.
  const ids = useMemo(
    () => workout?.exercises.map((exercise) => exercise.exerciseId) ?? [],
    [workout?.exercises],
  )
  const previous = useLastSets(ids).data

  // The rest-over notice, rebooked whenever the rest changes. Its identifier
  // is fixed, so booking it replaces the last one rather than adding another.
  const restKey = workout?.rest ? `${workout.id}:${workout.rest.endsAt}` : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the rest itself, not on every edit to the workout around it
  useEffect(() => {
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        dispatch({ type: 'stopRest' })
      },
      Math.max(0, rest.endsAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [restKey])

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
  // with it. The native side ignores all three where Live Activities do not
  // exist (Android, iOS before 16.2, a user who switched them off).
  const live = useRef<string | null>(null)
  const state = workout ? activityState(workout, previous, defaultRestS) : null
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
    if (live.current !== state.id) {
      startWorkoutActivity(state)
      live.current = state.id
    } else {
      updateWorkoutActivity(state)
    }
  }, [stateKey])

  // The activity's buttons. Pressed with the app running, the intent says so
  // and they are applied at once; pressed with it closed, they wait in the
  // queue for the launch, or the return to the foreground, that follows.
  const latest = useRef({ workout, previous, defaultRestS, dispatch })
  latest.current = { workout, previous, defaultRestS, dispatch }
  useEffect(() => {
    const drain = () => {
      const { workout, previous, defaultRestS, dispatch } = latest.current
      for (const action of takeWorkoutActions()) {
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
            const exercise = workout.exercises.find((entry) => entry.key === action.exerciseKey)
            const set = exercise?.sets.find((entry) => entry.id === action.setId)
            if (!exercise || !set || set.done) break
            const fill = hintFor(exercise, set, previous)
            dispatch({ type: 'completeSet', key: exercise.key, setId: set.id, at: action.at, fill })
            const rest = restAfter(workout, exercise, defaultRestS)
            if (rest > 0) {
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
    }
    drain()
    const remove = addWorkoutActionListener(drain)
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') drain()
    })
    return () => {
      remove()
      foreground.remove()
    }
  }, [])

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
 * What the lock screen shows: the workout, how long it has run (the widget
 * counts that itself, from the start), the exercise and set to do next, and the
 * rest countdown if one is running. The next set is named by its keys, and
 * whether it has numbers to tick decides whether the tick button is drawn.
 */
function activityState(
  workout: LiveWorkout,
  previous: Record<string, LastSet[]> | undefined,
  defaultRestS: number,
): WorkoutActivityState {
  let exerciseName = ''
  let setLabel = ''
  let done = 0
  let total = 0
  for (const exercise of workout.exercises) {
    total += exercise.sets.length
    done += exercise.sets.filter((set) => set.done).length
  }
  const next = workout.exercises.find((exercise) => exercise.sets.some((set) => !set.done))
  const nextSet = next?.sets.find((set) => !set.done) ?? null
  if (next && nextSet) {
    exerciseName = next.name
    setLabel = `${next.sets.indexOf(nextSet) + 1}/${next.sets.length}`
  } else if (workout.exercises.length) {
    exerciseName = workout.exercises[workout.exercises.length - 1].name
    setLabel = ''
  }
  const fill = next && nextSet ? hintFor(next, nextSet, previous) : null
  const canComplete =
    next && nextSet && fill
      ? isLoggable(
          {
            weightKg: nextSet.weightKg ?? fill.weightKg,
            reps: nextSet.reps ?? fill.reps,
            durationS: nextSet.durationS ?? fill.durationS,
            distanceM: nextSet.distanceM ?? fill.distanceM,
          },
          next.tracking,
        )
      : false
  return {
    id: workout.id,
    name: workout.name,
    startedAt: workout.startedAt,
    exercise: exerciseName,
    set: setLabel,
    done,
    total,
    restEndsAt: workout.rest?.endsAt ?? null,
    restTotalS: workout.rest?.totalS ?? null,
    exerciseKey: next?.key ?? null,
    setId: nextSet?.id ?? null,
    canComplete,
    restAfterS: next ? restAfter(workout, next, defaultRestS) || null : null,
  }
}
