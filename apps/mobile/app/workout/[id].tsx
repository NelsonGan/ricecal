import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share } from 'react-native'

import {
  useDeleteWorkout,
  useSaveRoutine,
  useSettings,
  useWorkout,
  type WorkoutDetail,
} from '@/data'
import { useWorkoutPost } from '@/data/social'
import {
  ActionSheet,
  distanceUnitFor,
  plansToRoutine,
  removeWorkoutFromHealth,
  SessionExercises,
  SessionFigures,
  toPlans,
  unavailableState,
  useDeleteConfirm,
  useRoutineGate,
  useWorkoutStarter,
  WorkoutUnavailable,
  workoutShareText,
} from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import { unitFor } from '@/lib/units'
import { AppBar, Aside, Icon, IconButton, Screen, useToast } from '@/ui'

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
      <SessionFigures workout={workout} unit={unit} />
      {/* With two panes the session's figures are the first, and the exercises
          set by set the second. See `Aside`. */}
      <Aside>
        <SessionExercises workout={workout} unit={unit} />
      </Aside>

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
