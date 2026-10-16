import { useTranslation } from 'react-i18next'

import { useHealthConnection, type WorkoutSummary } from '@/data'
import { formatTime, ItemRow } from '@/features/shared'
import { exerciseIcon } from './ExerciseArt'
import { durationText } from './format'

/**
 * A logged workout as a row of Today's day list, between the meals, in the
 * shape `SessionItem` gives a health-store session: the time first, then a
 * figure on the right.
 *
 * The calories burned, in hibiscus, only when the workout was saved to Apple
 * Health and Health is read back, because that is the only way its energy
 * reaches the budget (see "Workouts and the budget" in the README). Saving to
 * Health works with reading switched off, and then the energy never comes
 * back. Otherwise its length: a burn figure beside a ring that did not move
 * reads as a bug.
 */
export function WorkoutItem({
  workout,
  onPress,
}: {
  workout: WorkoutSummary
  onPress: () => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const first = workout.exercises[0]
  const reading = useHealthConnection().data?.connected === true
  const counted = workout.healthWorkoutId && reading ? workout.kcal : null

  return (
    <ItemRow
      title={workout.name}
      icon={exerciseIcon(first?.exerciseId ?? '')}
      // The length moves to the right when there is no burn to show there,
      // rather than being said twice.
      detail={[
        formatTime(workout.startedAt),
        counted ? durationText(t, workout.durationS) : null,
        t('workouts:history.sets', { count: workout.setCount }),
      ]
        .filter(Boolean)
        .join(' · ')}
      value={counted ? counted : Math.round(workout.durationS / 60)}
      unit={counted ? t('common:unit.kcal') : t('workouts:history.minutes')}
      valueTone={counted ? 'hibiscus' : 'ink'}
      compact
      onPress={onPress}
    />
  )
}
