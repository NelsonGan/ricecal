import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { useActivitySession } from '@/data'
import { WorkoutDetails } from '@/features/activity'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, EmptyState, Screen, Skeleton } from '@/ui'

export default function WorkoutScreen() {
  const { t } = useTranslation(['activity', 'common'])
  const goBack = useBack('/today')
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: session, isPending } = useActivitySession(id)
  return (
    <Screen
      header={
        <AppBar
          title={t('activity:kind.other')}
          onBack={goBack}
          backLabel={t('common:action.back')}
        />
      }
    >
      {isPending ? (
        <>
          <Skeleton className="h-[270px] w-full rounded-card" />
          <Card>
            <Skeleton className="h-[160px] w-full" />
          </Card>
        </>
      ) : session ? (
        <WorkoutDetails session={session} />
      ) : (
        <EmptyState
          title={t('activity:workout.missing')}
          icon={{ set: 'body', name: 'stopwatch' }}
        />
      )}
    </Screen>
  )
}
