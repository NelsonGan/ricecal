import { format } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { datePattern } from '@/lib/dates'
import { Dialog, type DialogAction } from '@/ui'
import { durationText } from './format'
import { STALE_AFTER_MS, useNow } from './live'
import { type LiveWorkout, lastActivityAt } from './model'

/** What "Still training?" chose for the save screen: the last set's time, or picking one. */
export type FinishParams = { endedAt?: string; pickEnd?: string }

/**
 * "Still training?", for the workout somebody forgot to finish, and not again
 * once it has been answered.
 *
 * Asked when a workout has been running for three hours, which no ordinary
 * session reaches and every forgotten one passes. The useful answer is the
 * first one: the workout really ended when the last set was ticked, and the
 * hours since are the drive home and dinner. So it offers that time by name,
 * then the choice of typing one, then carrying on or throwing it away.
 */
export function StaleWorkoutDialog({
  workout,
  onKeepGoing,
  onFinish,
  onDiscard,
}: {
  workout: LiveWorkout
  /** "Keep going", which is an answer to remember rather than a dismissal. */
  onKeepGoing: () => void
  /**
   * Finishing goes through the logger's own checks rather than straight to
   * the save screen: pushed directly, a workout typed for three hours and
   * never ticked saved as nothing and lost the sets.
   */
  onFinish: (params: FinishParams) => void
  /** Asks first, as the logger's own Discard does: this is hours of sets. */
  onDiscard: () => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const answered = workout.staleAnswered === true
  const now = useNow(60_000, !answered)
  const [closed, setClosed] = useState(false)
  const last = lastActivityAt(workout)
  const runningText = durationText(t, (Date.now() - workout.startedAt) / 1000)

  const actions: DialogAction[] = []
  if (last) {
    actions.push({
      key: 'last',
      label: t('workouts:stale.endAtLast', { time: format(last, datePattern('time')) }),
      onPress: () => onFinish({ endedAt: String(last) }),
    })
  }
  actions.push(
    {
      key: 'pick',
      label: t('workouts:stale.endAt'),
      tone: last ? 'secondary' : 'primary',
      onPress: () => onFinish({ pickEnd: '1' }),
    },
    {
      key: 'keep',
      label: t('workouts:stale.keepGoing'),
      tone: 'secondary',
      onPress: onKeepGoing,
    },
    {
      key: 'discard',
      label: t('workouts:stale.discard'),
      tone: 'danger',
      onPress: onDiscard,
    },
  )

  return (
    <Dialog
      visible={!answered && !closed && now - workout.startedAt > STALE_AFTER_MS}
      onClose={() => setClosed(true)}
      title={t('workouts:stale.title')}
      description={t('workouts:stale.body', { time: runningText })}
      cancelLabel={t('common:action.close')}
      actions={actions}
    />
  )
}

/**
 * "Discard workout?", from the logger's Discard, a finish with nothing to save
 * (`nothing`), and a workout still waiting on the phone to be sent.
 */
export function DiscardDialog({
  visible,
  nothing = false,
  onClose,
  onDiscard,
}: {
  visible: boolean
  nothing?: boolean
  onClose: () => void
  onDiscard: () => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={nothing ? t('workouts:finish.nothingTitle') : t('workouts:logger.discardTitle')}
      description={nothing ? t('workouts:finish.nothingBody') : t('workouts:logger.discardBody')}
      cancelLabel={t('common:action.keep')}
      actions={[
        {
          key: 'discard',
          label: t('workouts:logger.discardConfirm'),
          tone: 'danger',
          onPress: onDiscard,
        },
      ]}
    />
  )
}
