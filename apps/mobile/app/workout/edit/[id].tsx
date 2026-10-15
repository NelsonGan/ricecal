import { format } from 'date-fns'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useCurrentWeight, useSaveWorkout, useWorkout, type WorkoutDetail } from '@/data'
import {
  type Action,
  apply,
  completeAll,
  defaultWorkoutName,
  doneSets,
  estimateKcal,
  exerciseFromPlan,
  type LiveWorkout,
  newWorkout,
  removeWorkoutFromHealth,
  syncWorkoutToHealth,
  toPayload,
  WhenSheet,
  WorkoutEditor,
  workoutPlans,
} from '@/features/workouts'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  ListRow,
  Screen,
  Skeleton,
  Text,
  TextField,
  useToast,
} from '@/ui'

const DAY_MS = 24 * 60 * 60 * 1000

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
  if (!isNew && !saved) return <Missing />
  return <Editor initial={isNew ? null : (saved ?? null)} />
}

function Missing() {
  const { t } = useTranslation(['workouts', 'common'])
  const goBack = useBack('/workouts')
  return (
    <Screen header={<AppBar onBack={goBack} backLabel={t('common:action.back')} />}>
      <EmptyState title={t('workouts:detail.missing')} icon={{ set: 'body', name: 'stopwatch' }} />
    </Screen>
  )
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
    exercises: workoutPlans(workout).map((plan) => {
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
  const save = useSaveWorkout()
  const bodyKg = useCurrentWeight()

  const [workout, dispatch] = useReducer(
    (state: LiveWorkout, action: Action) => apply(state, action),
    initial,
    (from) => {
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
    },
  )
  const [picking, setPicking] = useState<'start' | 'end' | null>(null)
  const [saving, setSaving] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, for a past workout being logged
  useEffect(() => {
    if (!initial) track('Workout Started', { source: 'past', exercises: 0 })
  }, [])

  const startedAt = workout.startedAt
  const endedAt = workout.endedAt ?? Date.now()
  const error =
    endedAt <= startedAt
      ? t('workouts:finish.endBeforeStart')
      : endedAt - startedAt > DAY_MS
        ? t('workouts:finish.tooLong')
        : null
  const when = (at: number) =>
    format(at, `${datePattern('weekdayDayMonth')}, ${datePattern('time')}`)

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
    let healthCopy: string | null = null
    try {
      const durationS = Math.round((endedAt - startedAt) / 1000)
      const kcal = estimateKcal(document, durationS, bodyKg)
      const health = await syncWorkoutToHealth(document, endedAt, kcal)
      if (health.healthId !== workout.healthWorkoutId) healthCopy = health.healthId
      const payload = toPayload(document, endedAt, { kcal, healthWorkoutId: health.healthId })
      const result = await save.mutateAsync(payload)
      toast.show({
        title: t('workouts:finish.saved'),
        description: result.queued ? t('workouts:finish.queued') : undefined,
        tone: 'success',
      })
      if (initial || result.queued) goBack()
      else router.replace({ pathname: '/workout/[id]', params: { id: payload.id } })
    } catch (failure) {
      // As on the finish screen: a Health copy the save did not follow is
      // taken back out, so a retry does not leave two.
      if (healthCopy) void removeWorkoutFromHealth(healthCopy, workout.id)
      console.warn('[workouts] edit save failed', failure)
      toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
      setSaving(false)
    }
  }

  return (
    <Screen
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
      <Card contentClassName="gap-4">
        <TextField
          label={t('workouts:finish.name')}
          value={workout.name}
          onChangeText={(name) => dispatch({ type: 'rename', name })}
          placeholder={t('workouts:logger.namePlaceholder')}
          maxLength={80}
        />
        <TextField
          label={t('workouts:finish.notes')}
          value={workout.notes}
          onChangeText={(notes) => dispatch({ type: 'notes', notes })}
          placeholder={t('workouts:finish.notesPlaceholder')}
          multiline
          maxLength={2000}
        />
      </Card>

      <Card title={t('workouts:finish.when')} contentClassName="gap-0 px-5 py-1">
        <ListRow
          title={t('workouts:finish.started')}
          subtitle={when(startedAt)}
          onPress={() => setPicking('start')}
        />
        <ListRow
          title={t('workouts:finish.ended')}
          subtitle={when(endedAt)}
          onPress={() => setPicking('end')}
          divider={false}
        />
      </Card>
      {error ? (
        <View className="px-1">
          <Text variant="meta" className="text-hibiscus-ink">
            {error}
          </Text>
        </View>
      ) : null}

      <WorkoutEditor workout={workout} dispatch={dispatch} mode={initial ? 'edit' : 'past'} />

      <WhenSheet
        visible={picking !== null}
        title={picking === 'start' ? t('workouts:finish.started') : t('workouts:finish.ended')}
        value={picking === 'start' ? startedAt : endedAt}
        onClose={() => setPicking(null)}
        onPick={(at) =>
          picking === 'start'
            ? dispatch({ type: 'times', startedAt: at })
            : dispatch({ type: 'times', startedAt, endedAt: at })
        }
      />
    </Screen>
  )
}
