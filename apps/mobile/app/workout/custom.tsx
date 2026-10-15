import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
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
} from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  Icon,
  IconButton,
  Radio,
  Screen,
  Skeleton,
  Text,
  TextField,
  useToast,
} from '@/ui'

/**
 * An exercise the catalogue does not have, named by the user.
 *
 * Its muscles are picked in order of how much the exercise works them, and the
 * first counts double: a split from a tap order is rough, and rough is enough
 * for it to take part in the muscle chart beside the built-in exercises.
 */
export default function CustomExerciseScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>()
  const custom = useCustomExercises()
  const existing = custom.data?.find((exercise) => exercise.id === params.id)

  // Editing waits for the exercise: the form reads it once, as its starting
  // values, and opened before the list had loaded it stayed empty for good.
  if (params.id && !existing && custom.isPending) {
    return (
      <Screen>
        <Card>
          <Skeleton className="h-[240px] w-full" />
        </Card>
      </Screen>
    )
  }
  return <Form key={existing?.id ?? 'new'} existing={existing} initialName={params.name ?? ''} />
}

function Form({
  existing,
  initialName,
}: {
  existing: CustomExercise | undefined
  initialName: string
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const goBack = useBack('/workout/exercises')
  const toast = useToast()
  const save = useSaveCustomExercise()
  const remove = useDeleteCustomExercise()

  const [name, setName] = useState(existing?.name ?? initialName)
  const [tracking, setTracking] = useState<Tracking>(existing?.tracking ?? 'weight_reps')
  const [category, setCategory] = useState<Category>((existing?.category as Category) ?? 'fullBody')
  const [equipment, setEquipment] = useState<Equipment>(
    (existing?.equipment as Equipment) ?? 'other',
  )
  const [muscles, setMuscles] = useState<Muscle[]>(
    existing ? rankedMuscles(existing.muscles).map((entry) => entry.muscle) : [],
  )
  const [taken, setTaken] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const split = () => {
    const weights = muscles.map((_, index) => (index === 0 ? 2 : 1))
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    return Object.fromEntries(muscles.map((muscle, index) => [muscle, weights[index] / total]))
  }

  const onSave = async () => {
    if (!name.trim()) return
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
      goBack()
    } catch (error) {
      if (isDuplicateName(error)) setTaken(true)
      else toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
    }
  }

  return (
    <Screen
      header={
        <AppBar
          title={existing ? t('workouts:custom.editTitle') : t('workouts:custom.title')}
          onBack={goBack}
          backLabel={t('common:action.back')}
          action={
            existing ? (
              <IconButton
                size="sm"
                variant="neutral"
                accessibilityLabel={t('workouts:custom.delete')}
                onPress={() => setConfirmDelete(true)}
              >
                <Icon set="ui" name="delete" size={20} />
              </IconButton>
            ) : undefined
          }
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
        <Text variant="meta">{t('workouts:custom.musclesHint')}</Text>
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

      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('workouts:custom.deleteTitle')}
        description={t('workouts:custom.deleteBody')}
        confirmLabel={t('common:action.delete')}
        cancelLabel={t('common:action.keep')}
        onConfirm={async () => {
          if (!existing) return
          try {
            await remove.mutateAsync(existing.id)
          } catch (error) {
            toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
            throw error
          }
          goBack()
        }}
      />
    </Screen>
  )
}
