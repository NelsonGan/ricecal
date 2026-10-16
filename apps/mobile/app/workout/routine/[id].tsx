import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextInput } from 'react-native'

import { isRoutineLimit, type Routine, useDeleteRoutine, useRoutines, useSaveRoutine } from '@/data'
import {
  apply,
  newWorkout,
  plansToRoutine,
  routinePlans,
  toPlans,
  unavailableState,
  useDeleteConfirm,
  useLeaveGuard,
  useRoutineGate,
  WorkoutEditor,
  WorkoutUnavailable,
} from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import { useOnline } from '@/lib/online'
import { AppBar, Button, Screen, Sheet, TextField, useToast } from '@/ui'

/**
 * A routine: a named plan of exercises and target sets that a workout starts
 * from. `id` = `new` for one being written.
 *
 * The same exercise editor the logger uses, without the ticks: a routine says
 * what to do, and the PREVIOUS column shows what was done last time. The page
 * is only the plan; its name and note are asked for when it is saved. There is
 * no Start here: the routine's row on the Workouts tab already has one.
 */
export default function RoutineScreen() {
  const { t } = useTranslation(['workouts'])
  const { id } = useLocalSearchParams<{ id: string }>()
  const isNew = id === 'new'
  const routines = useRoutines()
  // Held while this page deletes the routine. The delete takes it out of the
  // list at once, and the editor, with the confirm sheet still spinning in it,
  // gave way to "gone" before the page went back.
  const [deleting, setDeleting] = useState<Routine | null>(null)
  const routine = routines.data?.find((entry) => entry.id === id) ?? deleting ?? undefined

  if (!isNew && !routine) {
    return (
      <WorkoutUnavailable
        state={unavailableState(routines)}
        title={t('workouts:routines.missing')}
        icon={{ set: 'system', name: 'guide-book' }}
      />
    )
  }
  return (
    <RoutineEditor key={routine?.id ?? 'new'} routine={routine ?? null} onDeleting={setDeleting} />
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
  const online = useOnline()
  const routineGate = useRoutineGate()
  const [notes, setNotes] = useState(routine?.notes ?? '')

  // The editor's document, borrowed from the logger. Its clock and id mean
  // nothing here; only the name and exercises are read back.
  const [draft, dispatch] = useReducer(apply, routine, (from) =>
    newWorkout({ name: from?.name ?? '', exercises: from ? routinePlans(from) : [] }),
  )
  const plans = useMemo(() => toPlans(draft.exercises), [draft.exercises])
  const nameError = !draft.name.trim()
  // Any dispatch makes a new draft, so the first one is "nothing changed".
  const [opened] = useState(draft)
  const busy = save.isPending || remove.isPending
  const guard = useLeaveGuard({
    busy,
    dirty: draft !== opened || notes !== (routine?.notes ?? ''),
  })
  // A second tap before `isPending` had rendered saved a new routine twice.
  const saving = useRef(false)
  // The name and note are asked for on Save, in a card over the exercises,
  // so the page itself is only the plan.
  const [naming, setNaming] = useState(false)
  const nameField = useRef<TextInput>(null)
  const confirmDelete = useDeleteConfirm({
    item: routine,
    title: t('workouts:routines.deleteTitle'),
    description: t('workouts:routines.deleteBody'),
    remove: (gone) => remove.mutateAsync(gone.id),
    hold: onDeleting,
    failed: t('workouts:finish.failed'),
    done: () => guard.leave(goBack),
  })

  const onSave = async () => {
    if (nameError || saving.current) return
    // Offline the save pauses rather than fails, and leaving is held while it runs.
    if (!online) {
      toast.show({ title: t('common:offline.title'), tone: 'error' })
      return
    }
    saving.current = true
    try {
      const saved = await save.mutateAsync({
        id: routine?.id,
        name: draft.name,
        notes,
        exercises: plansToRoutine(plans),
        templateId: routine?.templateId ?? null,
      })
      toast.show({ title: t('workouts:routines.saved'), tone: 'success' })
      setNaming(false)
      guard.leave(() => {
        if (!routine) {
          router.replace({ pathname: '/workout/routine/[id]', params: { id: saved.id } })
        } else goBack()
      })
    } catch (error) {
      // A fourth routine on a free account: the New button checks first, so
      // this is one added on another phone while the page was open. The name
      // card is a native modal, and the paywall would open behind it.
      if (isRoutineLimit(error)) {
        setNaming(false)
        routineGate.refused(error)
      } else toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
    } finally {
      saving.current = false
    }
  }

  return (
    <Screen
      // Set rows swipe to delete, so the scroll has to share the finger. See `gestureScroll`.
      gestureScroll
      header={
        <AppBar
          title={draft.name.trim() || t('workouts:routines.newTitle')}
          onBack={goBack}
          backDisabled={busy}
          backLabel={t('common:action.back')}
          action={routine ? confirmDelete.button(t('workouts:routines.delete')) : undefined}
        />
      }
      footer={
        <Button fullWidth onPress={() => setNaming(true)} disabled={!plans.length}>
          {routine ? t('common:action.save') : t('workouts:routines.save')}
        </Button>
      }
    >
      <WorkoutEditor workout={draft} dispatch={dispatch} mode="plan" />

      {confirmDelete.dialog}
      <Sheet
        placement="center"
        visible={naming}
        onClose={() => setNaming(false)}
        dismissible={!save.isPending}
        onShow={() => nameField.current?.focus()}
        closeLabel={t('common:action.cancel')}
        title={routine ? t('workouts:routines.edit') : t('workouts:routines.newTitle')}
        // Two fields and a button: a scroll view here jumped the field off the
        // top on the keyboard's first open (see the README's sheet traps).
        scrollable={false}
        footer={
          <Button fullWidth onPress={onSave} loading={save.isPending} disabled={nameError}>
            {routine ? t('common:action.save') : t('workouts:routines.save')}
          </Button>
        }
      >
        <TextField
          ref={nameField}
          label={t('workouts:finish.name')}
          value={draft.name}
          onChangeText={(name) => dispatch({ type: 'rename', name })}
          placeholder={t('workouts:routines.namePlaceholder')}
          maxLength={80}
          returnKeyType="done"
        />
        <TextField
          label={t('workouts:finish.notes')}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={1000}
        />
      </Sheet>
      {guard.dialog}
    </Screen>
  )
}
