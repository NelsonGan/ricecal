import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSettings } from '@/data'
import { useGroupWorkout } from '@/data/groups'
import { WorkoutDetails } from '@/features/activity'
import { workoutKindKey } from '@/features/activity/workoutKind'
import { QueryNotice } from '@/features/social/components'
import { SessionExercises, SessionFigures } from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import { unitFor } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import { AppBar, Aside, Card, Icon, Screen, Skeleton, Tappable, Text } from '@/ui'
import { PersonAvatar, useOpenProfile } from './parts'

/**
 * A group member's workout, opened from its tile on the board or its card in
 * the chat, drawn as its own page draws it: the logger's figures and every set,
 * or a health store's session with its heart rate and route figures. The
 * owner's face heads it, and opens their feed. Read only: nothing here edits,
 * repeats or shares someone else's workout.
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
  const { t } = useTranslation(['groups', 'activity', 'workouts', 'common'])
  const back = useBack('/groups')
  const query = useGroupWorkout(groupId, source, id)
  const unit = unitFor(useSettings().data?.units)
  const view = query.data
  const openProfile = useOpenProfile()
  const colors = useThemeColors()
  const title = view?.workout
    ? view.workout.name
    : view?.session
      ? view.session.kindLabel?.trim() || t(workoutKindKey(view.session.kind))
      : t('workouts:detail.title')
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
        query.isError || query.fetchStatus === 'paused' ? (
          <QueryNotice
            error={query.isError}
            paused={query.fetchStatus === 'paused'}
            retry={() => query.refetch()}
          />
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
          <SessionFigures workout={view.workout} unit={unit} owner={false} />
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
