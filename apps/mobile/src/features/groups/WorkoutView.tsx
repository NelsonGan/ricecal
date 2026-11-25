import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSettings, useUserId, type WorkoutDetail } from '@/data'
import type { ActivitySession } from '@/data/activity'
import { type GroupPerson, useGroupWorkout } from '@/data/groups'
import { WorkoutDetails } from '@/features/activity'
import { workoutKindKey } from '@/features/activity/workoutKind'
import { QueryNotice } from '@/features/social/components'
import { SessionExercises, SessionFigures } from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import { unitFor } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { AppBar, Aside, Card, Icon, Screen, Skeleton, Tappable, Text } from '@/ui'
import { PersonAvatar, useOpenProfile } from './parts'

export type SharedWorkoutData = {
  owner: GroupPerson
} & (
  | { workout: WorkoutDetail; session?: undefined }
  | { session: ActivitySession; workout?: undefined }
)

/**
 * A read-only workout detail view shared between group workouts (board tile or
 * chat card) and feed workout posts: the logger's figures, heart rate trace,
 * muscles worked and every set, or a health store's session. The owner's face
 * sits in a pill under the title and opens their feed profile.
 */
export function SharedWorkoutView({
  view,
  isError,
  paused,
  retry,
}: {
  view: SharedWorkoutData | undefined
  isError: boolean
  paused: boolean
  retry: () => void
}) {
  const { t } = useTranslation(['groups', 'activity', 'workouts', 'common'])
  const back = useBack('/social')
  const viewer = useUserId()
  const unit = unitFor(useSettings().data?.units)
  const openProfile = useOpenProfile()
  const colors = useThemeColors()
  const title = view?.workout
    ? view.workout.name
    : view?.session
      ? view.session.kindLabel?.trim() || t(workoutKindKey(view.session.kind))
      : t('workouts:detail.title')
  const isOwner = view?.owner.id === viewer
  return (
    <Screen
      header={
        <AppBar
          onBack={back}
          backLabel={t('common:action.back')}
          titleContent={
            // Whose workout it is sits under its name, as a pill that opens
            // their feed, rather than a row of its own above the figures.
            <View className="items-center gap-1">
              <Text variant="subtitle" className="text-center" numberOfLines={2}>
                {title}
              </Text>
              {view ? (
                <Tappable
                  onPress={() => openProfile(view.owner.id)}
                  className="flex-row items-center gap-1.5 rounded-full bg-surface-alt py-1 pl-1 pr-2.5"
                  accessibilityRole="button"
                  accessibilityLabel={t('groups:openProfile', { name: view.owner.name })}
                >
                  <PersonAvatar person={view.owner} size="xs" />
                  <Text variant="caption" numberOfLines={1} className="text-ink">
                    {view.owner.name}
                  </Text>
                  <Icon set="ui" name="chevron-right" size={12} tintColor={colors.muted} />
                </Tappable>
              ) : null}
            </View>
          }
        />
      }
    >
      {!view ? (
        isError || paused ? (
          <QueryNotice error={isError} paused={paused} retry={retry} />
        ) : (
          <>
            <Skeleton className="h-[220px] w-full rounded-card" />
            <Card>
              <Skeleton className="h-[160px] w-full" />
            </Card>
          </>
        )
      ) : view.workout ? (
        <>
          <SessionFigures workout={view.workout} unit={unit} owner={isOwner} />
          <Aside>
            <SessionExercises workout={view.workout} unit={unit} />
          </Aside>
        </>
      ) : (
        <WorkoutDetails session={view.session} />
      )}
    </Screen>
  )
}

/**
 * A group member's workout, opened from its tile on the board or its card in
 * the chat, drawn as its own page draws it: the logger's figures and every set,
 * or a health store's session with its heart rate and route figures. Read only:
 * nothing here edits, repeats or shares someone else's workout.
 */
export function GroupWorkoutScreen({
  groupId,
  source,
  id,
}: {
  groupId: string
  source: 'workout' | 'activity'
  id: string
}) {
  const query = useGroupWorkout(groupId, source, id)
  return (
    <SharedWorkoutView
      view={query.data}
      isError={query.isError}
      paused={query.fetchStatus === 'paused'}
      retry={() => query.refetch()}
    />
  )
}
