import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import type { ActivitySession } from '@/data'
import { formatTime, ItemRow } from '@/features/shared'
import { ReplayMask } from '@/lib/replay-mask'
import { count, distance, duration } from './format'
import { showsDistance, workoutIcon, workoutKindKey } from './workoutKind'

export type SessionItemProps = {
  session: ActivitySession
  onPress?: () => void
}

/** What the row says, worked out once for the row and for its spoken label. */
function sessionRow(session: ActivitySession, t: TFunction<readonly ['activity', 'common']>) {
  const tags = [duration(session.durationS)]
  const far = showsDistance(session.kind) ? distance(session.distanceM) : null
  if (far) tags.push(far)
  return {
    title: session.kindLabel?.trim() || t(workoutKindKey(session.kind)),
    time: formatTime(session.startedAt),
    tags,
    kcal: count(session.activeKcal),
    unit: t('common:unit.kcal'),
  }
}

/**
 * What a screen reader says for the row when something else owns its tap.
 *
 * The row sits in a `ReplayMask`, whose `ph-no-capture` label is what a button
 * built from its children's labels would read out. `ItemRow` names its own
 * button; a swipeable row's button is `SwipeRow`'s, so it needs this instead.
 */
export function useSessionLabel() {
  const { t } = useTranslation(['activity', 'common'])
  return (session: ActivitySession) => {
    const row = sessionRow(session, t)
    return [row.title, `${row.kcal} ${row.unit}`, row.time, ...row.tags].join(', ')
  }
}

/**
 * A workout as a row of Today's day list, between the meals.
 *
 * It sits among food rows, so it takes their shape (the same tile, the time
 * first in the detail line) and differs only where it means something else: the
 * calories are burned, so they read in hibiscus.
 */
export function SessionItem({ session, onPress }: SessionItemProps) {
  const { t } = useTranslation(['activity', 'common'])
  const row = sessionRow(session, t)

  // A workout read from Apple Health or Health Connect: kept out of replays.
  return (
    <ReplayMask>
      <ItemRow
        title={row.title}
        icon={workoutIcon(session.kind)}
        detail={row.time}
        tags={row.tags}
        tagTone="hibiscus"
        value={row.kcal}
        unit={row.unit}
        valueTone="hibiscus"
        compact
        onPress={onPress}
      />
    </ReplayMask>
  )
}
