import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type IconRef, type Routine, useDeleteRoutine, useRoutines, useSaveRoutine } from '@/data'
import {
  apply,
  newWorkout,
  plansToRoutine,
  routinePlans,
  toPlans,
  useWorkoutStarter,
  WorkoutEditor,
  WorkoutMissing,
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
  const { t } = useTranslation(['common'])
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const routines = useRoutines()
  // Held while this page deletes the routine. The delete takes it out of the
  // list at once, and the editor, with the confirm sheet still spinning in it,
  // gave way to "gone" before the page went back.
  const [deleting, setDeleting] = useState<Routine | null>(null)
  const routine = routines.data?.find((entry) => entry.id === id) ?? deleting ?? undefined

  if (!isNew && !routine && routines.isPending) {
    // Offline with nothing cached the request is held, and a skeleton would
    // wait for it forever.
    if (routines.isPaused) {
      return (
        <Empty
          title={t('common:offline.title')}
          description={t('common:offline.body')}
          icon={{ set: 'ui', name: 'offline' }}
        />
      )
    }
    return (
      <Screen>
        <Card>
          <Skeleton className="h-[240px] w-full" />
        </Card>
      </Screen>
    )
  }
  if (!isNew && !routine) return <WorkoutMissing icon={{ set: 'system', name: 'guide-book' }} />
  return (
    <RoutineEditor key={routine?.id ?? 'new'} routine={routine ?? null} onDeleting={setDeleting} />
  )
}

/** The page with nothing in it but a way back. */
function Empty({
  title,
  description,
  icon,
}: {
  title: string
  description?: string
  icon: IconRef
}) {
  const { t } = useTranslation(['common'])
  const goBack = useBack('/workouts')
  return (
    <Screen header={<AppBar onBack={goBack} backLabel={t('common:action.back')} />}>
      <EmptyState title={title} description={description} icon={icon} />
    </Screen>
  )
}

function RoutineEditor({
  routine,
  onDeleting,
}: {
  routine: Routine | null
  /** Told the routine being deleted, and null if the delete fails. */
  onDeleting: (routine: Routine | null) => void
}) {
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
  const [draft, dispatch] = useReducer(apply, routine, (from) =>
    newWorkout({ name: from?.name ?? '', exercises: from ? routinePlans(from) : [] }),
  )
  const plans = useMemo(() => toPlans(draft.exercises), [draft.exercises])
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
      toast.show({ title: t('workouts:routines.saved'), tone: 'success' })
      if (!routine) router.replace({ pathname: '/workout/routine/[id]', params: { id: saved.id } })
      else goBack()
    } catch {
      toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
    }
  }

  return (
    <Screen
      // Set rows swipe to delete, so the scroll has to share the finger. See `gestureScroll`.
      gestureScroll
      header={
        <AppBar
          title={routine ? t('workouts:routines.edit') : t('workouts:routines.newTitle')}
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
          {routine ? t('common:action.save') : t('workouts:routines.save')}
        </Button>
      }
    >
      <Card contentClassName="gap-4">
        <TextField
          label={t('workouts:finish.name')}
          value={draft.name}
          onChangeText={(name) => dispatch({ type: 'rename', name })}
          placeholder={t('workouts:routines.namePlaceholder')}
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
          // What is on screen, unsaved edits included: starting from the
          // stored copy dropped a change made a moment ago without a word.
          onPress={() =>
            starter.start({
              name: draft.name.trim() || routine.name,
              source: 'routine',
              routineId: routine.id,
              plans,
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
          onDeleting(routine)
          try {
            await remove.mutateAsync(routine.id)
          } catch (error) {
            onDeleting(null)
            toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
            throw error
          }
          goBack()
        }}
      />
      {starter.sheet}
    </Screen>
  )
}
