import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type Routine, useDeleteRoutine, useRoutines, useSaveRoutine } from '@/data'
import {
  type Action,
  apply,
  type LiveWorkout,
  liveToPlans,
  newWorkout,
  plansToRoutine,
  routinePlans,
  useWorkoutStarter,
  WorkoutEditor,
} from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  Skeleton,
  TextField,
  useToast,
} from '@/ui'

/**
 * A routine: a named plan of exercises and target sets that a workout starts
 * from. `id` = `new` for one being written.
 *
 * The same exercise editor the logger uses, without the ticks: a routine says
 * what to do, and the PREVIOUS column shows what was done last time.
 */
export default function RoutineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const routines = useRoutines()
  const routine = routines.data?.find((entry) => entry.id === id)

  if (!isNew && routines.isPending) {
    return (
      <Screen>
        <Card>
          <Skeleton className="h-[240px] w-full" />
        </Card>
      </Screen>
    )
  }
  if (!isNew && !routine) return <Missing />
  return <RoutineEditor key={routine?.id ?? 'new'} routine={routine ?? null} />
}

function Missing() {
  const { t } = useTranslation(['workouts', 'common'])
  const goBack = useBack('/workouts')
  return (
    <Screen header={<AppBar onBack={goBack} backLabel={t('common:action.back')} />}>
      <EmptyState
        title={t('workouts:detail.missing')}
        icon={{ set: 'system', name: 'guide-book' }}
      />
    </Screen>
  )
}

function RoutineEditor({ routine }: { routine: Routine | null }) {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const toast = useToast()
  const goBack = useBack('/workouts')
  const save = useSaveRoutine()
  const remove = useDeleteRoutine()
  const starter = useWorkoutStarter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notes, setNotes] = useState(routine?.notes ?? '')

  // The editor's document, borrowed from the logger. Its clock and id mean
  // nothing here; only the name and exercises are read back.
  const [draft, dispatch] = useReducer(
    (state: LiveWorkout, action: Action) => apply(state, action),
    routine,
    (from) => newWorkout({ name: from?.name ?? '', exercises: from ? routinePlans(from) : [] }),
  )
  const plans = useMemo(() => liveToPlans(draft.exercises), [draft.exercises])
  const nameError = !draft.name.trim()

  const onSave = async () => {
    if (nameError) return
    try {
      const saved = await save.mutateAsync({
        id: routine?.id,
        name: draft.name,
        notes,
        exercises: plansToRoutine(plans),
        templateId: routine?.templateId ?? null,
      })
      toast.show({ title: t('workouts:finish.saved'), tone: 'success' })
      if (!routine) router.replace({ pathname: '/workout/routine/[id]', params: { id: saved.id } })
      else goBack()
    } catch {
      toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
    }
  }

  return (
    <Screen
      header={
        <AppBar
          title={routine ? t('workouts:routines.edit') : t('workouts:routines.new')}
          onBack={goBack}
          backLabel={t('common:action.back')}
          action={
            routine ? (
              <IconButton
                size="sm"
                variant="neutral"
                accessibilityLabel={t('workouts:routines.delete')}
                onPress={() => setConfirmDelete(true)}
              >
                <Icon set="ui" name="delete" size={20} />
              </IconButton>
            ) : undefined
          }
        />
      }
      footer={
        <Button
          fullWidth
          onPress={onSave}
          loading={save.isPending}
          disabled={nameError || !plans.length}
        >
          {t('common:action.save')}
        </Button>
      }
    >
      <Card contentClassName="gap-4">
        <TextField
          label={t('workouts:finish.name')}
          value={draft.name}
          onChangeText={(name) => dispatch({ type: 'rename', name })}
          placeholder={t('workouts:logger.namePlaceholder')}
          maxLength={80}
        />
        <TextField
          label={t('workouts:finish.notes')}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={1000}
        />
      </Card>

      {routine ? (
        <Button
          variant="secondary"
          fullWidth
          onPress={() =>
            starter.start({
              name: routine.name,
              source: 'routine',
              routineId: routine.id,
              plans: routinePlans(routine),
            })
          }
        >
          {t('workouts:start.routine')}
        </Button>
      ) : null}

      <WorkoutEditor workout={draft} dispatch={dispatch} mode="plan" />

      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('workouts:routines.deleteTitle')}
        description={t('workouts:routines.deleteBody')}
        confirmLabel={t('common:action.delete')}
        cancelLabel={t('common:action.keep')}
        onConfirm={async () => {
          if (!routine) return
          await remove.mutateAsync(routine.id)
          goBack()
        }}
      />
      {starter.sheet}
    </Screen>
  )
}
