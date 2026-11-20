import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type ActivitySession, useActivitySession, useDeleteActivitySession } from '@/data'
import { WorkoutDetails } from '@/features/activity'
import { useDeleteConfirm } from '@/features/workouts'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, EmptyState, Screen, Skeleton } from '@/ui'

export default function WorkoutScreen() {
  const { t } = useTranslation(['activity', 'common'])
  const goBack = useBack('/today')
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data, isPending } = useActivitySession(id)
  const remove = useDeleteActivitySession()
  // Held while the delete runs, as on a logged workout's page: the delete
  // drops this query, and "no longer in your health app" would flash up under
  // the closing dialog.
  const [deleting, setDeleting] = useState<ActivitySession | null>(null)
  const session = deleting ?? data
  const confirmDelete = useDeleteConfirm({
    item: session,
    title: t('activity:workout.deleteTitle'),
    description: t('activity:workout.deleteBody', {
      provider: t(`activity:provider.${session?.provider ?? 'apple_health'}`),
    }),
    remove: (gone) => remove.mutateAsync(gone.id),
    hold: setDeleting,
    failed: t('common:offline.unreachableTitle'),
    done: goBack,
  })

  return (
    <Screen
      header={
        <AppBar
          title={t('activity:kind.other')}
          onBack={goBack}
          backLabel={t('common:action.back')}
          action={session ? confirmDelete.button(t('activity:workout.delete')) : undefined}
        />
      }
    >
      {isPending && !session ? (
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
      {confirmDelete.dialog}
    </Screen>
  )
}
