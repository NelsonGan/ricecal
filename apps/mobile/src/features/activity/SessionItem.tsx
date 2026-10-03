import { useTranslation } from 'react-i18next'

import type { ActivitySession } from '@/data'
import { formatTime, ItemRow } from '@/features/shared'
import { count, distance, duration } from './format'
import { showsDistance, workoutIcon, workoutKindKey } from './workoutKind'

export type SessionItemProps = {
  session: ActivitySession
  onPress?: () => void
}

/**
 * A workout as a row of Today's day list, between the meals.
 *
 * Not `SessionRow`, which is drawn for a list of workouts: a smaller icon, its
 * own divider and the figure stacked over its unit. Here it sits among food
 * rows, so it takes their shape (the same tile, the time first in the detail
 * line, the figure and unit on one line) and differs only where it means
 * something else: the calories are burned, so they read in hibiscus.
 */
export function SessionItem({ session, onPress }: SessionItemProps) {
  const { t } = useTranslation(['activity', 'common'])

  const parts = [formatTime(session.startedAt), duration(session.durationS)]
  const far = showsDistance(session.kind) ? distance(session.distanceM) : null
  if (far) parts.push(far)

  return (
    <ItemRow
      title={session.kindLabel ?? t(workoutKindKey(session.kind))}
      icon={workoutIcon(session.kind)}
      detail={parts.join(' · ')}
      value={count(session.activeKcal)}
      unit={t('common:unit.kcal')}
      valueTone="hibiscus"
      onPress={onPress}
    />
  )
}
