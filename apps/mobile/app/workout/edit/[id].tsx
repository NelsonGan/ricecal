import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useWorkout, type WorkoutDetail } from '@/data'
import {
  apply,
  completeAll,
  defaultWorkoutName,
  doneSets,
  exerciseFromPlan,
  type LiveWorkout,
  newWorkout,
  timesError,
  toPlans,
  useWorkoutSave,
  WorkoutEditor,
  WorkoutFields,
  WorkoutMissing,
} from '@/features/workouts'
import { track } from '@/lib/analytics'
import { useBack } from '@/lib/navigation'
import { AppBar, Button, Card, Screen, Skeleton, useToast } from '@/ui'

/**
 * Editing a finished workout, or logging one after the fact (`id` = `new`).
 *
 * The same editor as the logger with the clock taken away: both times are
 * fields, every set counts whether or not it was ticked, and nothing rests.
 * Saving writes the whole workout again under its id, which is how
 * `save_workout` treats every save, and replaces its Apple Health copy.
 */
export default function EditWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const { data: saved, isPending } = useWorkout(isNew ? undefined : id)

  if (!isNew && isPending) {
    return (
      <Screen>
        <Card>
          <Skeleton className="h-[240px] w-full" />
        </Card>
      </Screen>
    )
  }
  if (!isNew && !saved) return <WorkoutMissing />
  return <Editor initial={isNew ? null : (saved ?? null)} />
}

/** A saved workout as the editor's document, every set already ticked. */
function fromSaved(workout: WorkoutDetail): LiveWorkout {
  const started = Date.parse(workout.startedAt)
  return {
    id: workout.id,
    name: workout.name,
    notes: workout.notes ?? '',
    startedAt: started,
    endedAt: Date.parse(workout.endedAt),
    routineId: workout.routineId,
    rest: null,
    healthWorkoutId: workout.healthWorkoutId,
    exercises: toPlans(workout.entries).map((plan) => {
      const exercise = exerciseFromPlan(plan)
      return {
        ...exercise,
        sets: exercise.sets.map((set) => ({ ...set, done: true, doneAt: started })),
      }
    }),
  }
}

function Editor({ initial }: { initial: WorkoutDetail | null }) {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const toast = useToast()
  const goBack = useBack('/workouts')
  const saveWorkout = useWorkoutSave()

  const [workout, dispatch] = useReducer(apply, initial, (from) => {
    if (from) return fromSaved(from)
    // A past workout starts as an hour ending now; both ends are a tap away.
    const now = Date.now()
    return {
      ...newWorkout({
        name: defaultWorkoutName(t, new Date(now - 60 * 60 * 1000)),
        startedAt: now - 60 * 60 * 1000,
      }),
      endedAt: now,
    }
  })
  const [saving, setSaving] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, for a past workout being logged
  useEffect(() => {
    if (!initial) track('Workout Started', { source: 'past', exercises: 0 })
  }, [])

  const startedAt = workout.startedAt
  const endedAt = workout.endedAt ?? Date.now()
  const error = timesError(t, startedAt, endedAt)

  const onSave = async () => {
    if (error || saving) return
    // Here every set with numbers in it counts: a past workout has no ticking,
    // and an edited one should not lose a set because a new row went unticked.
    const document = completeAll(workout, startedAt)
    if (doneSets(document) === 0) {
      toast.show({ title: t('workouts:finish.nothingTitle'), tone: 'error' })
      return
    }
    setSaving(true)
    try {
      const { payload, queued } = await saveWorkout(document, endedAt)
      toast.show({
        title: t('workouts:finish.saved'),
        description: queued ? t('workouts:finish.queued') : undefined,
        tone: 'success',
      })
      if (initial || queued) goBack()
      else router.replace({ pathname: '/workout/[id]', params: { id: payload.id } })
    } catch (failure) {
      console.warn('[workouts] edit save failed', failure)
      toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
      setSaving(false)
    }
  }

  return (
    <Screen
      // Set rows swipe to delete, so the scroll has to share the finger. See `gestureScroll`.
      gestureScroll
      header={
        <AppBar
          title={initial ? t('workouts:edit.title') : t('workouts:edit.newTitle')}
          onBack={goBack}
          backLabel={t('common:action.back')}
        />
      }
      footer={
        <Button fullWidth onPress={onSave} loading={saving} disabled={Boolean(error)}>
          {initial ? t('workouts:edit.save') : t('workouts:finish.save')}
        </Button>
      }
    >
      <WorkoutFields
        name={workout.name}
        notes={workout.notes}
        startedAt={startedAt}
        endedAt={endedAt}
        error={error}
        onName={(name) => dispatch({ type: 'rename', name })}
        onNotes={(notes) => dispatch({ type: 'notes', notes })}
        onStarted={(at) => dispatch({ type: 'times', startedAt: at })}
        onEnded={(at) => dispatch({ type: 'times', startedAt, endedAt: at })}
      />

      <WorkoutEditor workout={workout} dispatch={dispatch} mode={initial ? 'edit' : 'past'} />
    </Screen>
  )
}
