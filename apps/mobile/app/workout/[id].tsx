import { format, parseISO } from 'date-fns'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  useDeleteWorkout,
  useSaveRoutine,
  useSettings,
  useWorkout,
  type WorkoutDetail,
  type WorkoutEntry,
} from '@/data'
import {
  ActionSheet,
  describeSet,
  distanceUnitFor,
  durationText,
  ExerciseArt,
  groupSplit,
  MuscleSplitBars,
  plansToRoutine,
  removeWorkoutFromHealth,
  SET_BADGE_KEY,
  showsVolume,
  trim,
  useExerciseLibrary,
  useWorkoutStarter,
  volume,
  weightField,
  workoutPlans,
} from '@/features/workouts'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { useOnline } from '@/lib/online'
import { UNIT_KEY, unitFor, type WeightUnit } from '@/lib/units'
import {
  AppBar,
  Card,
  ConfirmSheet,
  cn,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  Skeleton,
  Tappable,
  Text,
  useToast,
} from '@/ui'

/** One finished workout: what was done, set by set, and what it set a record for. */
export default function WorkoutScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const toast = useToast()
  const goBack = useBack('/workouts')
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: workout, isPending } = useWorkout(id)
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const remove = useDeleteWorkout()
  const online = useOnline()
  const saveRoutine = useSaveRoutine()
  const starter = useWorkoutStarter()
  const [menu, setMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <Screen
      header={
        <AppBar
          title={workout?.name ?? t('workouts:detail.title')}
          titleLines={2}
          onBack={goBack}
          backLabel={t('common:action.back')}
          action={
            workout ? (
              <IconButton
                size="sm"
                variant="neutral"
                accessibilityLabel={t('common:action.edit')}
                onPress={() => setMenu(true)}
              >
                <Icon set="ui" name="more-horizontal" size={20} />
              </IconButton>
            ) : undefined
          }
        />
      }
    >
      {isPending ? (
        <Card>
          <Skeleton className="h-[220px] w-full" />
        </Card>
      ) : !workout ? (
        <EmptyState
          title={t('workouts:detail.missing')}
          icon={{ set: 'body', name: 'stopwatch' }}
        />
      ) : (
        <WorkoutBody workout={workout} unit={unit} />
      )}

      {workout ? (
        <>
          <ActionSheet
            visible={menu}
            onClose={() => setMenu(false)}
            title={workout.name}
            actions={[
              {
                key: 'edit',
                label: t('workouts:detail.edit'),
                icon: { set: 'ui', name: 'edit' },
                onPress: () =>
                  router.push({ pathname: '/workout/edit/[id]', params: { id: workout.id } }),
              },
              {
                key: 'repeat',
                label: t('workouts:detail.repeat'),
                icon: { set: 'ui', name: 'redo' },
                onPress: () =>
                  starter.start({
                    name: workout.name,
                    source: 'repeat',
                    routineId: workout.routineId,
                    plans: workoutPlans(workout).map((plan) => ({
                      ...plan,
                      // Repeated as a plan: the same exercises and set counts,
                      // with last time's numbers in the PREVIOUS column rather
                      // than pre-ticked in the fields.
                      sets: plan.sets.map((set) => ({ kind: set.kind })),
                    })),
                  }),
              },
              {
                key: 'routine',
                label: t('workouts:detail.saveRoutine'),
                icon: { set: 'ui', name: 'bookmark' },
                onPress: async () => {
                  try {
                    await saveRoutine.mutateAsync({
                      name: workout.name,
                      notes: null,
                      exercises: plansToRoutine(workoutPlans(workout)),
                    })
                    toast.show({ title: t('workouts:detail.savedRoutine'), tone: 'success' })
                  } catch {
                    toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
                  }
                },
              },
              {
                key: 'delete',
                label: t('workouts:detail.delete'),
                icon: { set: 'ui', name: 'delete' },
                tone: 'danger',
                onPress: () => setConfirmDelete(true),
              },
            ]}
          />
          <ConfirmSheet
            visible={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={t('workouts:detail.deleteTitle')}
            description={
              workout.healthWorkoutId
                ? `${t('workouts:detail.deleteBody')} ${t('workouts:detail.deleteHealth')}`
                : t('workouts:detail.deleteBody')
            }
            confirmLabel={t('common:action.delete')}
            cancelLabel={t('common:action.keep')}
            onConfirm={async () => {
              // Offline the delete would pause rather than fail, and the sheet
              // would spin with no way out. Say why instead, and stay open.
              if (!online) {
                toast.show({ title: t('common:offline.title'), tone: 'error' })
                throw new Error('offline')
              }
              try {
                await remove.mutateAsync(workout.id)
              } catch (error) {
                toast.show({ title: t('common:offline.unreachableTitle'), tone: 'error' })
                throw error
              }
              await removeWorkoutFromHealth(workout.healthWorkoutId, workout.id)
              goBack()
            }}
          />
        </>
      ) : null}
      {starter.sheet}
    </Screen>
  )
}

function WorkoutBody({ workout, unit }: { workout: WorkoutDetail; unit: WeightUnit }) {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const library = useExerciseLibrary()
  const distanceUnit = distanceUnitFor(unit)
  const started = parseISO(workout.startedAt)

  const split = useMemo(
    () =>
      groupSplit(
        workout.entries.map((entry) => ({
          exerciseId: entry.exerciseId,
          sets: entry.sets.filter((set) => set.kind !== 'warmup').length,
        })),
        library.byId,
      ),
    [workout.entries, library.byId],
  )

  return (
    <>
      <Card contentClassName="gap-4">
        <Text variant="meta">
          {format(started, `${datePattern('weekdayDayMonth')}, ${datePattern('time')}`)}
        </Text>
        <View className="flex-row flex-wrap gap-y-3">
          <Figure
            label={t('workouts:logger.duration')}
            value={durationText(t, workout.durationS)}
          />
          {showsVolume(workout.entries.map((entry) => entry.tracking)) ? (
            <Figure
              label={t('workouts:logger.volume')}
              value={`${volume(workout.volumeKg, unit)} ${t(UNIT_KEY[unit])}`}
            />
          ) : null}
          <Figure label={t('workouts:logger.sets')} value={String(workout.setCount)} />
          {workout.prCount > 0 ? (
            <Figure label={t('workouts:detail.records')} value={String(workout.prCount)} trophy />
          ) : null}
          {workout.kcal ? (
            <Figure
              label={t('workouts:detail.kcalLabel')}
              value={t('workouts:detail.kcal', { value: workout.kcal })}
            />
          ) : null}
        </View>
        {workout.kcal ? <Text variant="caption">{t('workouts:detail.estimate')}</Text> : null}
        {workout.healthWorkoutId ? (
          <View className="flex-row items-center gap-2">
            <Icon set="body" name="heart-rate" size={18} />
            <Text variant="caption">{t('workouts:finish.health')}</Text>
          </View>
        ) : null}
        {workout.notes ? <Text variant="body">{workout.notes}</Text> : null}
      </Card>

      {split.length ? (
        <Card title={t('workouts:detail.muscles')}>
          <MuscleSplitBars
            rows={split.map((row) => ({ group: row.group, value: row.sets }))}
            format={(value) => t('workouts:stats.splitSets', { value: trim(value, 1) })}
          />
        </Card>
      ) : null}

      {workout.entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          category={library.byId(entry.exerciseId)?.category ?? 'fullBody'}
          unit={unit}
          distanceUnit={distanceUnit}
          onOpen={() =>
            router.push({ pathname: '/workout/exercise/[id]', params: { id: entry.exerciseId } })
          }
        />
      ))}
    </>
  )
}

function Figure({ label, value, trophy }: { label: string; value: string; trophy?: boolean }) {
  return (
    <View className="w-1/3 gap-0.5 pr-2">
      <Text variant="overlineSm">{label}</Text>
      <View className="flex-row items-center gap-1">
        {trophy ? <Icon set="system" name="trophy" size={18} /> : null}
        <Text variant="numeric" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    </View>
  )
}

function EntryCard({
  entry,
  category,
  unit,
  distanceUnit,
  onOpen,
}: {
  entry: WorkoutEntry
  category: Parameters<typeof ExerciseArt>[0]['category']
  unit: WeightUnit
  distanceUnit: ReturnType<typeof distanceUnitFor>
  onOpen: () => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  let working = 0

  return (
    <Card contentClassName="gap-3 px-4 py-4">
      <Tappable
        className="flex-row items-center gap-3"
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={entry.name}
      >
        <ExerciseArt exerciseId={entry.exerciseId} category={category} size={52} />
        <View className="min-w-0 flex-1">
          <Text variant="bodyStrong" numberOfLines={2}>
            {entry.name}
          </Text>
          {entry.notes ? (
            <Text variant="meta" numberOfLines={3}>
              {entry.notes}
            </Text>
          ) : null}
        </View>
        <Icon set="ui" name="chevron-right" size={18} />
      </Tappable>
      <View>
        {entry.sets.map((set, index) => {
          if (set.kind !== 'warmup') working += 1
          const badge = set.kind === 'normal' ? String(working) : t(SET_BADGE_KEY[set.kind])
          return (
            <View key={set.id}>
              {index > 0 ? <Divider /> : null}
              <View className="min-h-[40px] flex-row items-center gap-3 py-1.5">
                <Text
                  className={cn(
                    'w-[24px] text-center font-display text-[16px]',
                    set.kind === 'warmup'
                      ? 'text-kaya-ink'
                      : set.kind === 'normal'
                        ? 'text-ink'
                        : 'text-hibiscus-ink',
                  )}
                >
                  {badge}
                </Text>
                <Text variant="bodyStrong" className="flex-1">
                  {describeSet(set, entry.tracking, unit, distanceUnit, t(UNIT_KEY[unit]))}
                </Text>
                {set.e1rmKg && set.kind !== 'warmup' ? (
                  <Text variant="caption">
                    {t('workouts:detail.e1rm', {
                      value: `${weightField(set.e1rmKg, unit)} ${t(UNIT_KEY[unit])}`,
                    })}
                  </Text>
                ) : null}
                {set.records.length ? (
                  <View className="flex-row items-center gap-1 rounded-full bg-kaya-soft px-2 py-0.5">
                    <Icon set="system" name="trophy" size={14} />
                    <Text variant="caption" className="text-kaya-ink">
                      {set.records.length}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
    </Card>
  )
}
