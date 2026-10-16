import { useLocalSearchParams } from 'expo-router'
import { useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useWorkout, type WorkoutDetail } from '@/data'
import {
  apply,
  completeAll,
  doneSets,
  exerciseFromPlan,
  type LiveWorkout,
  timesError,
  toPlans,
  unavailableState,
  useLeaveGuard,
  useWorkoutSave,
  WorkoutEditor,
  WorkoutFields,
  WorkoutUnavailable,
} from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import { AppBar, Button, Screen, useToast } from '@/ui'

/**
 * Editing a finished workout.
 *
 * The same editor as the logger with the clock taken away: both times are
 * fields, every set counts whether or not it was ticked, and nothing rests.
 * Saving writes the whole workout again under its id, which is how
 * `save_workout` treats every save, and replaces its Apple Health copy.
 *
 * It also logged a past workout once (`id` = `new`), which was taken out: a
 * forgotten session is a workout started and finished with its times moved.
 */
export default function EditWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useWorkout(id)
  const saved = query.data

  if (!saved) return <WorkoutUnavailable state={unavailableState(query)} />
  // Keyed by the route's id: a link that reuses this screen for another
  // workout kept the first one's document in the reducer and saved it under
  // the first one's id.
  return <Editor key={id} initial={saved} />
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
    filed: { startedAt: started, date: workout.date },
    exercises: toPlans(workout.entries).map((plan, index) => {
      const exercise = exerciseFromPlan(plan)
      // RPE is put back here rather than carried by the plan: a plan also
      // starts routines and repeats, which must not arrive already rated.
      const saved = workout.entries[index].sets
      return {
        ...exercise,
        sets: exercise.sets.map((set, at) => ({
          ...set,
          rpe: saved[at]?.rpe ?? null,
          done: true,
          doneAt: started,
        })),
      }
    }),
  }
}

function Editor({ initial }: { initial: WorkoutDetail }) {
  const { t } = useTranslation(['workouts', 'common'])
  const toast = useToast()
  const goBack = useBack('/workouts')
  const saveWorkout = useWorkoutSave()

  const [workout, dispatch] = useReducer(apply, initial, fromSaved)
  const [saving, setSaving] = useState(false)
  // Any dispatch makes a new document, so the first one is "nothing changed".
  const [opened] = useState(workout)
  const guard = useLeaveGuard({ busy: saving, dirty: workout !== opened })

  const startedAt = workout.startedAt
  const endedAt = workout.endedAt ?? Date.now()
  const error = timesError(t, startedAt, endedAt)

  const onSave = async () => {
    if (error || saving) return
    // Here every set with numbers in it counts: an edited workout should not
    // lose a set because a new row went unticked.
    const document = completeAll(workout, startedAt)
    if (doneSets(document) === 0) {
      toast.show({ title: t('workouts:finish.nothingTitle'), tone: 'error' })
      return
    }
    setSaving(true)
    try {
      const { queued } = await saveWorkout(document, endedAt, {
        workout: fromSaved(initial),
        endedAt: Date.parse(initial.endedAt),
        kcal: initial.kcal,
      })
      toast.show({
        title: t('workouts:finish.saved'),
        description: queued ? t('workouts:finish.queued') : undefined,
        tone: 'success',
      })
      guard.leave(goBack)
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
          title={t('workouts:edit.title')}
          onBack={goBack}
          backDisabled={saving}
          backLabel={t('common:action.back')}
        />
      }
      footer={
        <Button fullWidth onPress={onSave} loading={saving} disabled={Boolean(error)}>
          {t('workouts:edit.save')}
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

      <WorkoutEditor workout={workout} dispatch={dispatch} mode="edit" />
      {guard.dialog}
    </Screen>
  )
}
