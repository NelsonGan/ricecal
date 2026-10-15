import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useRoutines, useSaveRoutine } from '@/data'
import {
  ExerciseArt,
  exerciseById,
  LEVEL_KEY,
  shortClock,
  templateById,
  templateDescriptionKey,
  templateNameKey,
  templatePlans,
  templateRoutine,
  useWorkoutStarter,
  WorkoutMissing,
} from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import { AppBar, Badge, Button, Card, Divider, Screen, Text, useToast } from '@/ui'

/**
 * One built-in template: its exercises and sets, and the two things to do with
 * it, start it now or keep it as a routine to edit.
 */
export default function TemplateScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const toast = useToast()
  const goBack = useBack('/workout/templates')
  const { id } = useLocalSearchParams<{ id: string }>()
  const template = templateById(id ?? '')
  const routines = useRoutines().data ?? []
  const save = useSaveRoutine()
  const starter = useWorkoutStarter()

  if (!template) return <WorkoutMissing icon={{ set: 'system', name: 'guide-book' }} />

  const name = t(templateNameKey(template.id))
  const existing = routines.find((routine) => routine.templateId === template.id)

  return (
    <Screen
      header={<AppBar title={name} onBack={goBack} backLabel={t('common:action.back')} />}
      footer={
        <View className="gap-2.5">
          <Button
            fullWidth
            onPress={() =>
              starter.start({ name, source: 'template', plans: templatePlans(template) })
            }
          >
            {t('workouts:explore.start')}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            loading={save.isPending}
            onPress={async () => {
              if (existing) {
                router.push({ pathname: '/workout/routine/[id]', params: { id: existing.id } })
                return
              }
              try {
                const routine = await save.mutateAsync({
                  name,
                  notes: null,
                  exercises: templateRoutine(template),
                  templateId: template.id,
                })
                toast.show({ title: t('workouts:explore.added'), tone: 'success' })
                router.push({ pathname: '/workout/routine/[id]', params: { id: routine.id } })
              } catch {
                toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
              }
            }}
          >
            {existing ? t('workouts:routines.edit') : t('workouts:explore.add')}
          </Button>
        </View>
      }
    >
      <Card contentClassName="gap-2">
        <Text variant="body">{t(templateDescriptionKey(template.id))}</Text>
        <View className="flex-row gap-1.5">
          <Badge size="sm" tone="neutral">
            {t(LEVEL_KEY[template.level])}
          </Badge>
          <Badge size="sm" tone="neutral">
            {t('workouts:routines.exercises', { count: template.exercises.length })}
          </Badge>
        </View>
      </Card>

      <Card contentClassName="gap-0">
        {template.exercises.map((entry, index) => {
          const exercise = exerciseById(entry.id)
          if (!exercise) return null
          const working = entry.sets.filter((set) => set.kind !== 'warmup')
          const warmups = entry.sets.length - working.length
          const target = working[0]
          const shape =
            target?.durationS != null
              ? `${working.length} × ${shortClock(target.durationS)}`
              : `${working.length} × ${target?.reps ?? ''}`
          return (
            // A template may list an exercise twice, so the position is part of its identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, never reordered
            <View key={`${entry.id}-${index}`}>
              {index > 0 ? <Divider /> : null}
              <View className="flex-row items-center gap-3 py-3">
                <ExerciseArt exerciseId={exercise.id} category={exercise.category} size={52} />
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {exercise.name}
                  </Text>
                  <Text variant="meta">
                    {warmups ? `${t('workouts:logger.kind.warmup')} ${warmups} · ${shape}` : shape}
                  </Text>
                </View>
                {entry.restS > 0 ? (
                  <Text variant="caption">
                    {t('workouts:logger.rest', { time: shortClock(entry.restS) })}
                  </Text>
                ) : null}
              </View>
            </View>
          )
        })}
      </Card>
      {starter.sheet}
    </Screen>
  )
}
