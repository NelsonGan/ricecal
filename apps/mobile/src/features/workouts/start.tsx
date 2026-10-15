import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { track, type WorkoutSource } from '@/lib/analytics'
import { ConfirmSheet } from '@/ui'
import { useLiveWorkout } from './live'
import { doneSets, type ExercisePlan, type LiveWorkout, newWorkout } from './model'
import { clearActiveWorkout, getActiveWorkout, startActiveWorkout } from './store'

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
  const { userId, workout } = useLiveWorkout()
  const [pending, setPending] = useState<StartInput | null>(null)

  const open = () => router.push('/workout/active')

  const start = (input: StartInput) => {
    if (!userId) return
    if (workout) {
      setPending(input)
      return
    }
    begin(userId, input)
    open()
  }

  const sheet = (
    <ConfirmSheet
      visible={pending !== null}
      onClose={() => setPending(null)}
      title={t('workouts:start.replaceTitle')}
      description={t('workouts:start.replaceBody')}
      confirmLabel={t('workouts:start.replaceConfirm')}
      cancelLabel={t('common:action.keep')}
      onConfirm={async () => {
        if (!userId || !pending) return
        discardWorkout(userId)
        begin(userId, pending)
        setPending(null)
        open()
      }}
    />
  )

  return { start, sheet, running: workout }
}
