import { format } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { datePattern } from '@/lib/dates'
import { ActionSheet, type SheetAction } from './ActionSheet'
import { hoursMinutes } from './format'
import { useLiveWorkout } from './live'
import { lastActivityAt } from './model'
import { discardWorkout } from './start'

/**
 * "Still training?", for the workout somebody forgot to finish.
 *
 * Asked when a workout has been running for three hours, which no ordinary
 * session reaches and every forgotten one passes. The useful answer is the
 * first one: the workout really ended when the last set was ticked, and the
 * hours since are the drive home and dinner. So it offers that time by name,
 * then the choice of typing one, then carrying on or throwing it away.
 */
export function StaleWorkoutSheet({
  visible,
  onClose,
  onKeepGoing,
}: {
  visible: boolean
  onClose: () => void
  /** "Keep going", which is an answer to remember rather than a dismissal. */
  onKeepGoing: () => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const { userId, workout } = useLiveWorkout()
  if (!workout) return null

  const last = lastActivityAt(workout)
  const running = hoursMinutes((Date.now() - workout.startedAt) / 1000)
  const runningText =
    running.hours > 0
      ? t('workouts:duration.hoursMinutes', running)
      : t('workouts:duration.minutes', { minutes: running.minutes })

  const actions: SheetAction[] = []
  if (last) {
    actions.push({
      key: 'last',
      label: t('workouts:stale.endAtLast', { time: format(last, datePattern('time')) }),
      icon: { set: 'system', name: 'clock' },
      onPress: () =>
        router.push({ pathname: '/workout/finish', params: { endedAt: String(last) } }),
    })
  }
  actions.push(
    {
      key: 'pick',
      label: t('workouts:stale.endAt'),
      icon: { set: 'ui', name: 'edit' },
      onPress: () => router.push({ pathname: '/workout/finish', params: { pickEnd: '1' } }),
    },
    {
      key: 'keep',
      label: t('workouts:stale.keepGoing'),
      icon: { set: 'body', name: 'dumbbell' },
      onPress: onKeepGoing,
    },
    {
      key: 'discard',
      label: t('workouts:stale.discard'),
      icon: { set: 'ui', name: 'delete' },
      tone: 'danger',
      onPress: () => {
        if (userId) discardWorkout(userId, workout)
        router.dismissTo('/workouts')
      },
    },
  )

  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={t('workouts:stale.title')}
      description={t('workouts:stale.body', { time: runningText })}
      actions={actions}
    />
  )
}
