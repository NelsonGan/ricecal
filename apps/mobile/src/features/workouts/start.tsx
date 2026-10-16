import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSession } from '@/data/session'
import { track, type WorkoutSource } from '@/lib/analytics'
import { Dialog } from '@/ui'
import { removeWorkoutFromHealth } from './health'
import { doneSets, type ExercisePlan, type LiveWorkout, newWorkout } from './model'
import {
  clearActiveWorkout,
  getActiveWorkout,
  startActiveWorkout,
  useHasActiveWorkout,
} from './store'

/**
 * Starting and throwing away a workout, in one place so both are counted the
 * same way wherever they happen: the tab, a routine, a template, the exercise
 * page, a past workout's "repeat".
 */

export type StartInput = {
  name: string
  source: WorkoutSource
  plans?: ExercisePlan[]
  routineId?: string | null
}

/** "Evening workout", for a workout started from nothing. */
export function defaultWorkoutName(
  t: (
    key: 'workouts:start.morning' | 'workouts:start.afternoon' | 'workouts:start.evening',
  ) => string,
  at = new Date(),
): string {
  const hour = at.getHours()
  if (hour >= 4 && hour < 12) return t('workouts:start.morning')
  if (hour >= 12 && hour < 17) return t('workouts:start.afternoon')
  return t('workouts:start.evening')
}

export function discardWorkout(
  userId: string,
  workout: LiveWorkout | null = getActiveWorkout(userId),
): void {
  if (!workout) return
  track('Workout Discarded', {
    sets: doneSets(workout),
    minutes: Math.round((Date.now() - workout.startedAt) / 60000),
  })
  clearActiveWorkout(userId)
  // A copy can already be in Health: the app was killed after writing it and
  // before the server answered, and the workout came back as the running one.
  // Found by the workout's own id, so it is nothing when there is none.
  void removeWorkoutFromHealth(workout.healthWorkoutId, workout.id)
}

function begin(userId: string, input: StartInput): void {
  const workout = newWorkout({
    name: input.name,
    routineId: input.routineId,
    exercises: input.plans,
  })
  startActiveWorkout(userId, workout)
  track('Workout Started', { source: input.source, exercises: workout.exercises.length })
}

/**
 * Starts a workout and opens the logger. One already running is not silently
 * replaced: the user is asked, because the running one may be an hour of sets.
 * Render `sheet` wherever the hook is used.
 */
export function useWorkoutStarter() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const { userId } = useSession()
  // Whether one runs, not the workout itself: the screens that start one stay
  // mounted under the logger, and reading the document re-rendered each of
  // them on every keystroke in it.
  const running = useHasActiveWorkout(userId)
  const [pending, setPending] = useState<StartInput | null>(null)

  const open = () => router.push('/workout/active')

  const start = (input: StartInput) => {
    if (!userId) return
    if (getActiveWorkout(userId)) {
      setPending(input)
      return
    }
    begin(userId, input)
    open()
  }

  const sheet = (
    <Dialog
      visible={pending !== null}
      onClose={() => setPending(null)}
      title={t('workouts:start.replaceTitle')}
      description={t('workouts:start.replaceBody')}
      cancelLabel={t('common:action.keep')}
      actions={[
        {
          key: 'replace',
          label: t('workouts:start.replaceConfirm'),
          tone: 'danger',
          onPress: () => {
            // This closure is the one the dialog was answered from, so it still
            // holds the start that closing the dialog has since cleared.
            if (!userId || !pending) return
            discardWorkout(userId)
            begin(userId, pending)
            open()
          },
        },
      ]}
    />
  )

  return { start, sheet, running }
}
