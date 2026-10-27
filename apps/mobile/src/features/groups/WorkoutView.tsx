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
import { AppBar, Aside, Card, Screen, Skeleton, Text } from '@/ui'
import { PersonAvatarLink } from './parts'

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
  const title = view?.workout
    ? view.workout.name
    : view?.session
      ? view.session.kindLabel?.trim() || t(workoutKindKey(view.session.kind))
      : t('workouts:detail.title')
  return (
    <Screen
      header={
        <AppBar title={title} titleLines={2} onBack={back} backLabel={t('common:action.back')} />
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
      ) : (
        <>
          <View className="flex-row items-center gap-md">
            <PersonAvatarLink person={view.owner} />
            <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
              {view.owner.name}
            </Text>
          </View>
          {view.workout ? (
            <>
              <SessionFigures workout={view.workout} unit={unit} owner={false} />
              <Aside>
                <SessionExercises workout={view.workout} unit={unit} />
              </Aside>
            </>
          ) : (
            <WorkoutDetails session={view.session} />
          )}
        </>
      )}
    </Screen>
  )
}
