import {
  endWorkoutActivity,
  startWorkoutActivity,
  updateWorkoutActivity,
  type WorkoutActivityState,
} from '@modules/ricecal-widgets'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cancelNotice, scheduleNoticeAt } from '@/lib/notifications'
import { STALE_AFTER_MS, useLiveWorkout } from './live'
import type { LiveWorkout } from './model'

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
 *   Live Activity    the lock screen and Dynamic Island, on iOS
 */
export function useWorkoutEffects(): void {
  const { t } = useTranslation(['workouts'])
  const { workout, dispatch } = useLiveWorkout()

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
  const state = workout ? activityState(workout) : null
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

/**
 * What the lock screen shows: the workout, how long it has run (the widget
 * counts that itself, from the start), the exercise and set to do next, and the
 * rest countdown if one is running.
 */
function activityState(workout: LiveWorkout): WorkoutActivityState {
  let exerciseName = ''
  let setLabel = ''
  let done = 0
  let total = 0
  for (const exercise of workout.exercises) {
    total += exercise.sets.length
    done += exercise.sets.filter((set) => set.done).length
  }
  const next = workout.exercises.find((exercise) => exercise.sets.some((set) => !set.done))
  if (next) {
    exerciseName = next.name
    const index = next.sets.findIndex((set) => !set.done)
    setLabel = `${index + 1}/${next.sets.length}`
  } else if (workout.exercises.length) {
    exerciseName = workout.exercises[workout.exercises.length - 1].name
    setLabel = ''
  }
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
  }
}
