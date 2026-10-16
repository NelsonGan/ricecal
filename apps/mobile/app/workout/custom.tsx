import { useLocalSearchParams } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type CustomExercise,
  isDuplicateName,
  useCustomExercises,
  useDeleteCustomExercise,
  useSaveCustomExercise,
} from '@/data'
import {
  asCategory,
  asEquipment,
  CATEGORIES,
  CATEGORY_KEY,
  type Category,
  EQUIPMENT,
  EQUIPMENT_KEY,
  type Equipment,
  MUSCLE_KEY,
  MUSCLES,
  type Muscle,
  rankedMuscles,
  TRACKING_KEY,
  TRACKINGS,
  type Tracking,
  unavailableState,
  useDeleteConfirm,
  useLeaveGuard,
  WorkoutUnavailable,
} from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import { useOnline } from '@/lib/online'
import { AppBar, Button, Card, Chip, Radio, Screen, TextField, useToast } from '@/ui'

/**
 * An exercise the catalogue does not have, named by the user.
 *
 * Its muscles are picked in order of how much the exercise works them, and the
 * first counts double: a split from a tap order is rough, and rough is enough
 * for it to take part in the muscle chart beside the built-in exercises.
 */
export default function CustomExerciseScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const params = useLocalSearchParams<{ id?: string; name?: string }>()
  const custom = useCustomExercises()
  // Held while this page deletes the exercise. The refetch after the delete
  // drops it from the list, and the form remounted as "New exercise" while
  // the page was still going back.
  const [deleting, setDeleting] = useState<CustomExercise | null>(null)
  const existing =
    custom.data?.find((exercise) => exercise.id === params.id) ?? deleting ?? undefined

  if (params.id && !existing) {
    // Editing waits for the exercise: the form reads it once, as its starting
    // values, and opened before the list had loaded it stayed empty for good.
    // Never the blank form: an id it cannot find saved as a brand new
    // exercise beside the one that was meant.
    return (
      <WorkoutUnavailable
        state={unavailableState(custom)}
        title={t('workouts:exercise.missing')}
        icon={{ set: 'body', name: 'dumbbell' }}
        fallback="/workout/exercises"
      />
    )
  }
  return (
    <Form
      key={existing?.id ?? 'new'}
      existing={existing}
      initialName={params.name ?? ''}
      onDeleting={setDeleting}
    />
  )
}

function Form({
  existing,
  initialName,
  onDeleting,
}: {
  existing: CustomExercise | undefined
  initialName: string
  /** Told the exercise being deleted, and null if the delete fails. */
  onDeleting: (exercise: CustomExercise | null) => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const goBack = useBack('/workout/exercises')
  const toast = useToast()
  const save = useSaveCustomExercise()
  const remove = useDeleteCustomExercise()
  const online = useOnline()
  const busy = save.isPending || remove.isPending
  const guard = useLeaveGuard({ busy, dirty: false })
  // Set before the first await: a second tap in the same frame, before
  // `isPending` had rendered, saved the exercise twice.
  const saving = useRef(false)

  const [name, setName] = useState(existing?.name ?? initialName)
  const [tracking, setTracking] = useState<Tracking>(existing?.tracking ?? 'weight_reps')
  const [category, setCategory] = useState<Category>(
    existing ? asCategory(existing.category) : 'fullBody',
  )
  const [equipment, setEquipment] = useState<Equipment>(
    existing ? asEquipment(existing.equipment) : 'other',
  )
  const [muscles, setMuscles] = useState<Muscle[]>(
    existing ? rankedMuscles(existing.muscles).map((entry) => entry.muscle) : [],
  )
  const [taken, setTaken] = useState(false)
  const confirmDelete = useDeleteConfirm({
    item: existing,
    title: t('workouts:custom.deleteTitle'),
    description: t('workouts:custom.deleteBody'),
    remove: (exercise) => remove.mutateAsync(exercise.id),
    hold: onDeleting,
    failed: t('workouts:finish.failed'),
    done: () => guard.leave(goBack),
  })

  const split = () => {
    const weights = muscles.map((_, index) => (index === 0 ? 2 : 1))
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    return Object.fromEntries(muscles.map((muscle, index) => [muscle, weights[index] / total]))
  }

  const onSave = async () => {
    if (!name.trim() || saving.current) return
    // Offline the save pauses rather than fails, and leaving is held while it runs.
    if (!online) {
      toast.show({ title: t('common:offline.title'), tone: 'error' })
      return
    }
    saving.current = true
    setTaken(false)
    try {
      await save.mutateAsync({
        id: existing?.id,
        name,
        tracking,
        category,
        equipment,
        muscles: split(),
      })
      guard.leave(goBack)
    } catch (error) {
      if (isDuplicateName(error)) setTaken(true)
      else toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
    } finally {
      saving.current = false
    }
  }

  return (
    <Screen
      header={
        <AppBar
          title={existing ? t('workouts:custom.editTitle') : t('workouts:custom.title')}
          onBack={goBack}
          backDisabled={busy}
          backLabel={t('common:action.back')}
          action={existing ? confirmDelete.button(t('workouts:custom.delete')) : undefined}
        />
      }
      footer={
        <Button fullWidth onPress={onSave} loading={save.isPending} disabled={!name.trim()}>
          {t('workouts:custom.save')}
        </Button>
      }
    >
      <Card contentClassName="gap-4">
        <TextField
          label={t('workouts:custom.name')}
          value={name}
          onChangeText={(next) => {
            setName(next)
            setTaken(false)
          }}
          placeholder={t('workouts:custom.namePlaceholder')}
          maxLength={80}
          error={taken ? t('workouts:custom.taken') : undefined}
        />
      </Card>

      <Card title={t('workouts:custom.tracking')} contentClassName="gap-1">
        {TRACKINGS.map((value) => (
          <Radio
            key={value}
            checked={tracking === value}
            onChange={() => setTracking(value)}
            label={t(TRACKING_KEY[value])}
          />
        ))}
      </Card>

      <Card title={t('workouts:custom.category')}>
        <View className="flex-row flex-wrap gap-2">
          {CATEGORIES.map((value) => (
            <Chip key={value} selected={category === value} onPress={() => setCategory(value)}>
              {t(CATEGORY_KEY[value])}
            </Chip>
          ))}
        </View>
      </Card>

      <Card title={t('workouts:custom.equipment')}>
        <View className="flex-row flex-wrap gap-2">
          {EQUIPMENT.map((value) => (
            <Chip key={value} selected={equipment === value} onPress={() => setEquipment(value)}>
              {t(EQUIPMENT_KEY[value])}
            </Chip>
          ))}
        </View>
      </Card>

      <Card title={t('workouts:custom.muscles')} contentClassName="gap-3">
        <View className="flex-row flex-wrap gap-2">
          {MUSCLES.map((value) => {
            const order = muscles.indexOf(value)
            return (
              <Chip
                key={value}
                selected={order >= 0}
                onPress={() =>
                  setMuscles((current) =>
                    current.includes(value)
                      ? current.filter((entry) => entry !== value)
                      : [...current, value],
                  )
                }
              >
                {order === 0 ? `★ ${t(MUSCLE_KEY[value])}` : t(MUSCLE_KEY[value])}
              </Chip>
            )
          })}
        </View>
      </Card>

      {confirmDelete.dialog}
    </Screen>
  )
}
