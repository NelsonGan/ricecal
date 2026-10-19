import { format, parseISO } from 'date-fns'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share, View } from 'react-native'

import {
  useDeleteWorkout,
  useProfile,
  useSaveRoutine,
  useSettings,
  useWorkout,
  type WorkoutDetail,
  type WorkoutEntry,
} from '@/data'
import { useWorkoutPost } from '@/data/social'
import { HeartRateCard } from '@/features/activity'
import {
  ActionSheet,
  burnNote,
  describeSet,
  distanceUnitFor,
  durationText,
  ExerciseArt,
  groupSplit,
  MuscleSplitBars,
  PulseLine,
  plansToRoutine,
  RowChevron,
  removeWorkoutFromHealth,
  Stat,
  StatGrid,
  StatNote,
  setBadges,
  showsVolume,
  toPlans,
  traceZones,
  unavailableState,
  useDeleteConfirm,
  useExerciseLibrary,
  useRoutineGate,
  useWorkoutStarter,
  volumeText,
  WorkoutUnavailable,
  workoutShareText,
} from '@/features/workouts'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { ageFrom } from '@/lib/nutrition'
import { UNIT_KEY, unitFor, type WeightUnit } from '@/lib/units'
import {
  AppBar,
  Badge,
  Card,
  cn,
  Divided,
  Icon,
  IconButton,
  Screen,
  Tappable,
  Text,
  useToast,
} from '@/ui'

/** One finished workout: what was done, set by set, and what it set a record for. */
export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  // Keyed by id, so a link that reuses this screen for another one starts
  // clean rather than carrying the last one's menus and held state.
  return <WorkoutPage key={id} id={id} />
}

function WorkoutPage({ id }: { id: string }) {
  const { t } = useTranslation(['workouts', 'common', 'social'])
  const router = useRouter()
  const toast = useToast()
  const goBack = useBack('/workouts')
  const query = useWorkout(id)
  // Whether it is on the feed already, so the menu offers Edit post rather
  // than a second share. Unknown (offline, still loading) offers Share, and the
  // server answers a second share with the post it has.
  const feedPost = useWorkoutPost(id).data ?? null
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const remove = useDeleteWorkout()
  const saveRoutine = useSaveRoutine()
  const routineGate = useRoutineGate()
  const starter = useWorkoutStarter()
  const [menu, setMenu] = useState(false)
  // Held from the moment a delete starts. The delete refetches this query to
  // nothing before the page has gone back, and "This workout is gone" flashed
  // up while the confirm sheet, rendered from the workout, unmounted under it.
  const [deleting, setDeleting] = useState<WorkoutDetail | null>(null)
  const workout = deleting ?? query.data
  const confirmDelete = useDeleteConfirm({
    item: workout,
    title: t('workouts:detail.deleteTitle'),
    description: workout?.healthWorkoutId
      ? `${t('workouts:detail.deleteBody')} ${t('workouts:detail.deleteHealth')}`
      : t('workouts:detail.deleteBody'),
    remove: (gone) => remove.mutateAsync(gone.id),
    hold: setDeleting,
    failed: t('common:offline.unreachableTitle'),
    done: async (gone) => {
      await removeWorkoutFromHealth(gone.healthWorkoutId, gone.id)
      goBack()
    },
  })

  if (!workout) {
    return (
      <WorkoutUnavailable
        state={unavailableState(query)}
        heading={t('workouts:detail.title')}
        skeleton="h-[220px]"
      />
    )
  }

  return (
    <Screen
      header={
        <AppBar
          title={workout.name}
          titleLines={2}
          onBack={goBack}
          backLabel={t('common:action.back')}
          action={
            <IconButton
              size="sm"
              variant="neutral"
              accessibilityLabel={t('workouts:logger.menuFor', { name: workout.name })}
              onPress={() => setMenu(true)}
            >
              <Icon set="ui" name="more-horizontal" size={20} />
            </IconButton>
          }
        />
      }
    >
      <WorkoutBody workout={workout} unit={unit} />

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
                plans: toPlans(workout.entries).map((plan) => ({
                  ...plan,
                  // Repeated as a plan: the same exercises and set counts,
                  // with last time's numbers in the PREVIOUS column rather
                  // than pre-ticked in the fields.
                  sets: plan.sets.map((set) => ({ kind: set.kind })),
                })),
              }),
          },
          {
            key: 'feed',
            label: t(feedPost ? 'social:editPost' : 'social:share'),
            icon: { set: 'system', name: 'users-group' },
            onPress: () =>
              router.push({
                pathname: '/social/compose',
                params: feedPost ? { postId: feedPost } : { workoutId: id },
              }),
          },
          {
            key: 'share',
            label: t('workouts:detail.share'),
            icon: { set: 'ui', name: 'share' },
            onPress: () => {
              Share.share({
                message: workoutShareText(t, workout, unit, distanceUnitFor(unit)),
              }).catch(() => {})
            },
          },
          {
            key: 'routine',
            label: t('workouts:detail.saveRoutine'),
            icon: { set: 'ui', name: 'bookmark' },
            onPress: async () => {
              if (!routineGate.allowNew()) return
              try {
                await saveRoutine.mutateAsync({
                  name: workout.name,
                  notes: null,
                  exercises: plansToRoutine(toPlans(workout.entries)),
                })
                toast.show({ title: t('workouts:detail.savedRoutine'), tone: 'success' })
              } catch (error) {
                if (!routineGate.refused(error)) {
                  toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
                }
              }
            },
          },
          {
            key: 'delete',
            label: t('workouts:detail.delete'),
            icon: { set: 'ui', name: 'delete' },
            tone: 'danger',
            onPress: confirmDelete.open,
          },
        ]}
      />
      {confirmDelete.dialog}
      {starter.dialog}
    </Screen>
  )
}

function WorkoutBody({ workout, unit }: { workout: WorkoutDetail; unit: WeightUnit }) {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const library = useExerciseLibrary()
  const distanceUnit = distanceUnitFor(unit)
  const started = parseISO(workout.startedAt)
  const birthDate = useProfile().data?.birth_date ?? null
  const heart = workout.heartRate ?? null
  const [noteOpen, setNoteOpen] = useState(false)
  // A trace means the watch recorded it, and the burn is what it measured (the
  // edit screen's rule too). Anything else is the estimate the phone saved.
  const burnSource = heart ? 'watch' : 'estimate'
  const note = burnNote(t, burnSource, true)
  const zones = useMemo(
    () => (heart ? traceZones(heart, birthDate ? ageFrom(birthDate) : null) : null),
    [heart, birthDate],
  )

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
        <StatGrid>
          <Stat label={t('workouts:logger.duration')} value={durationText(t, workout.durationS)} />
          {/* A bodyweight session is a weighted exercise with nothing added. */}
          {showsVolume(workout.entries.map((entry) => entry.tracking)) && workout.volumeKg > 0 ? (
            <Stat
              label={t('workouts:logger.volume')}
              value={volumeText(t, workout.volumeKg, unit)}
            />
          ) : null}
          <Stat label={t('workouts:logger.sets')} value={String(workout.setCount)} />
          {workout.prCount > 0 ? (
            <Stat
              label={t('workouts:detail.records')}
              value={String(workout.prCount)}
              icon={{ set: 'system', name: 'trophy' }}
            />
          ) : null}
          {workout.kcal ? (
            <Stat
              label={t('workouts:detail.kcalLabel')}
              value={t('workouts:detail.kcal', { value: workout.kcal })}
              onPress={() => setNoteOpen((open) => !open)}
              accessibilityHint={note}
            />
          ) : null}
        </StatGrid>
        {noteOpen && workout.kcal ? (
          <StatNote text={note} onClose={() => setNoteOpen(false)} inCard />
        ) : null}
        {workout.notes ? <Text variant="body">{workout.notes}</Text> : null}
      </Card>

      {heart && heart.avgBpm !== null ? (
        <HeartRateCard
          avgHr={heart.avgBpm}
          maxHr={heart.maxBpm}
          zones={zones}
          chart={<PulseLine heart={heart} />}
        />
      ) : null}

      {split.length ? (
        <Card title={t('workouts:detail.muscles')}>
          <MuscleSplitBars rows={split} />
        </Card>
      ) : null}

      {workout.entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          category={library.byId(entry.exerciseId)?.category}
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
  const badges = setBadges(entry.sets, t)

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
        <RowChevron />
      </Tappable>
      <View>
        <Divided>
          {entry.sets.map((set, index) => (
            <View key={set.id} className="min-h-[40px] flex-row items-center gap-3 py-1.5">
              <Text
                className={cn('w-[24px] text-center font-display text-[16px]', badges[index].tone)}
              >
                {badges[index].label}
              </Text>
              <Text variant="bodyStrong" className="flex-1">
                {describeSet(set, entry.tracking, unit, distanceUnit, t(UNIT_KEY[unit]))}
              </Text>
              {set.rpe !== null ? (
                <Text variant="caption">{t('workouts:logger.rpeValue', { value: set.rpe })}</Text>
              ) : null}
              {set.records.length ? (
                <Badge tone="kaya" size="sm" className="gap-1 self-center">
                  <Icon set="system" name="trophy" size={14} />
                  <Text variant="caption" className="text-kaya-ink">
                    {set.records.length}
                  </Text>
                </Badge>
              ) : null}
            </View>
          ))}
        </Divided>
      </View>
    </Card>
  )
}
