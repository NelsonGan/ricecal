import { format } from 'date-fns'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type IconRef, useCurrentWeight, useSaveWorkout } from '@/data'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, EmptyState, ListRow, Screen, Text, TextField } from '@/ui'
import { estimateKcal } from './energy'
import { removeWorkoutFromHealth, syncWorkoutToHealth } from './health'
import { type LiveWorkout, toPayload } from './model'
import { WhenSheet } from './WhenSheet'

/**
 * What the finish screen and the edit screen share: a workout's name and note,
 * when it started and ended, and how it is saved.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Why these times cannot be saved, or null. The table checks the same two things. */
export function timesError(
  t: TFunction<['workouts', 'common']>,
  startedAt: number,
  endedAt: number,
): string | null {
  if (endedAt <= startedAt) return t('workouts:finish.endBeforeStart')
  if (endedAt - startedAt > DAY_MS) return t('workouts:finish.tooLong')
  return null
}

/**
 * The name and note, and both times, each a tap from its picker. `openOn`
 * opens straight onto the end time: "still training?" sends the user here to
 * set it.
 */
export function WorkoutFields({
  name,
  notes,
  startedAt,
  endedAt,
  error,
  openOn,
  onName,
  onNotes,
  onStarted,
  onEnded,
}: {
  name: string
  notes: string
  startedAt: number
  endedAt: number
  error: string | null
  openOn?: 'end'
  onName: (name: string) => void
  onNotes: (notes: string) => void
  onStarted: (at: number) => void
  onEnded: (at: number) => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const [picking, setPicking] = useState<'start' | 'end' | null>(openOn ?? null)
  const when = (at: number) =>
    format(at, `${datePattern('weekdayDayMonth')}, ${datePattern('time')}`)

  return (
    <>
      <Card contentClassName="gap-4">
        <TextField
          label={t('workouts:finish.name')}
          value={name}
          onChangeText={onName}
          placeholder={t('workouts:logger.namePlaceholder')}
          maxLength={80}
        />
        <TextField
          label={t('workouts:finish.notes')}
          value={notes}
          onChangeText={onNotes}
          placeholder={t('workouts:finish.notesPlaceholder')}
          multiline
          maxLength={2000}
        />
      </Card>

      <Card title={t('workouts:finish.when')} contentClassName="gap-0 px-5 py-1">
        <ListRow
          title={t('workouts:finish.started')}
          subtitle={when(startedAt)}
          onPress={() => setPicking('start')}
        />
        <ListRow
          title={t('workouts:finish.ended')}
          subtitle={when(endedAt)}
          onPress={() => setPicking('end')}
          divider={false}
        />
      </Card>
      {error ? (
        <Text variant="meta" className="px-1 text-hibiscus-ink">
          {error}
        </Text>
      ) : null}

      <WhenSheet
        visible={picking !== null}
        title={picking === 'start' ? t('workouts:finish.started') : t('workouts:finish.ended')}
        value={picking === 'start' ? startedAt : endedAt}
        onClose={() => setPicking(null)}
        onPick={(at) => (picking === 'start' ? onStarted(at) : onEnded(at))}
      />
    </>
  )
}

/**
 * Saving a workout, from either screen: its energy estimate, its Apple Health
 * copy, then the server, or the outbox when the server cannot be reached.
 *
 * A Health copy that went in when the save then failed is taken back out, or
 * pressing Save again would leave two. Throws on a save the server refused.
 */
export function useWorkoutSave() {
  const save = useSaveWorkout()
  const bodyKg = useCurrentWeight()

  const run = async (document: LiveWorkout, endedAt: number) => {
    const durationS = Math.round((endedAt - document.startedAt) / 1000)
    const kcal = estimateKcal(document, durationS, bodyKg)
    let healthCopy: string | null = null
    try {
      const health = await syncWorkoutToHealth(document, endedAt, kcal)
      if (health.healthId !== document.healthWorkoutId) healthCopy = health.healthId
      const payload = toPayload(document, endedAt, { kcal, healthWorkoutId: health.healthId })
      const result = await save.mutateAsync(payload)
      return { payload, queued: result.queued, health, durationS }
    } catch (failure) {
      if (healthCopy) void removeWorkoutFromHealth(healthCopy, document.id)
      throw failure
    }
  }

  return run
}

/** A workout screen opened with nothing to show: saved, discarded or deleted since. */
export function WorkoutMissing({ icon = { set: 'body', name: 'stopwatch' } }: { icon?: IconRef }) {
  const { t } = useTranslation(['workouts', 'common'])
  const goBack = useBack('/workouts')
  return (
    <Screen header={<AppBar onBack={goBack} backLabel={t('common:action.back')} />}>
      <EmptyState title={t('workouts:detail.missing')} icon={icon} />
    </Screen>
  )
}
