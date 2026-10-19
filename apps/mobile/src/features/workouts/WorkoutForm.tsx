import { format } from 'date-fns'
import type { Href } from 'expo-router'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type IconRef, requestHealthSync, useSaveWorkout } from '@/data'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Card,
  cn,
  EmptyState,
  ListRow,
  Screen,
  Skeleton,
  Text,
  TextField,
  useHeld,
} from '@/ui'
import { workoutBurn } from './burn'
import { useEnergyBody } from './energyBody'
import { type HealthOutcome, removeWorkoutFromHealth, syncWorkoutToHealth } from './health'
import { doneSets, type LiveWorkout, toPayload } from './model'
import { watchEnergy } from './pulse'
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
  // Which time the sheet is about, kept while it closes: `picking` clears
  // first, and the title turned from "Started" to "Finished" on the way down.
  const shown = useHeld(picking, picking !== null) ?? 'start'
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

      <Card title={t('workouts:finish.when')} contentClassName="gap-0">
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
        title={shown === 'start' ? t('workouts:finish.started') : t('workouts:finish.ended')}
        value={shown === 'start' ? startedAt : endedAt}
        onClose={() => setPicking(null)}
        onPick={(at) => (picking === 'start' ? onStarted(at) : onEnded(at))}
      />
    </>
  )
}

/** A saved workout as it was before an edit, to put back in Health if the edit is refused. */
type SavedVersion = { workout: LiveWorkout; endedAt: number; kcal: number | null }

/**
 * Saving a workout, from either screen: its energy estimate, its Apple Health
 * copy, then the server, or the outbox when the server cannot be reached.
 * Throws on a save the server refused.
 *
 * Health is written first, replacing whatever copy was there, so a refusal
 * undoes it: a new workout's copy is taken out, or pressing Save again would
 * leave two, and an edit's `previous` version is written back, since the
 * server still holds that one and its copy went to make room.
 */
export function useWorkoutSave() {
  const save = useSaveWorkout()
  const body = useEnergyBody()

  const run = async (document: LiveWorkout, endedAt: number, previous?: SavedVersion) => {
    const durationS = Math.round((endedAt - document.startedAt) / 1000)
    // What the watch measured, for a workout it recorded (the server replaces
    // it with the trace's when that lands); an estimate otherwise. The same
    // rule the logger and the finish screen show it by.
    const watched = document.watch?.kcal ?? watchEnergy(document.id)
    const kcal = workoutBurn(document, durationS, body, watched).kcal
    let health: HealthOutcome | null = null
    try {
      health = await syncWorkoutToHealth(document, endedAt, kcal)
      const payload = toPayload(document, endedAt, { kcal, healthWorkoutId: health.healthId })
      const result = await save.mutateAsync(payload)
      // The copy's energy is in Health now, so the budget can count it.
      if (health.replaced && health.healthId) requestHealthSync()
      return { payload, queued: result.queued, health, durationS }
    } catch (failure) {
      // Awaited: a retry tapped at once could otherwise have its own new copy
      // be the one this removes.
      if (health?.replaced) {
        if (previous) await syncWorkoutToHealth(previous.workout, previous.endedAt, previous.kcal)
        else await removeWorkoutFromHealth(health.healthId, document.id)
      }
      throw failure
    }
  }

  return run
}

/**
 * `Workout Finished`, once per new workout saved from the finish screen. An
 * edit of a saved one is not counted.
 */
export function trackWorkoutFinished(
  document: LiveWorkout,
  { payload, queued, health, durationS }: Awaited<ReturnType<ReturnType<typeof useWorkoutSave>>>,
) {
  track('Workout Finished', {
    exercises: payload.exercises.length,
    sets: doneSets(document),
    duration_min: Math.round(durationS / 60),
    from_routine: Boolean(document.routineId),
    saved_to_health: Boolean(health.healthId),
    queued,
  })
}

/** What a page says when its data did not come: offline, or unreachable. */
export const NOT_LOADED = {
  offline: {
    title: 'common:offline.title',
    body: 'common:offline.body',
    icon: { set: 'ui', name: 'offline' },
  },
  unreachable: {
    title: 'common:offline.unreachableTitle',
    body: 'common:offline.unreachableBody',
    icon: { set: 'ui', name: 'warning' },
  },
} as const

type Unavailable = 'loading' | keyof typeof NOT_LOADED | 'missing'

/**
 * Which `WorkoutUnavailable` a page waiting on these queries draws: offline if
 * any is held, loading while any runs, unreachable if any failed, and
 * otherwise what it asked for is not there.
 */
export function unavailableState(
  ...queries: { isPending: boolean; isPaused: boolean; isError: boolean }[]
): Unavailable {
  if (queries.some((query) => query.isPending && query.isPaused)) return 'offline'
  if (queries.some((query) => query.isPending)) return 'loading'
  return queries.some((query) => query.isError) ? 'unreachable' : 'missing'
}

/**
 * A workout screen with nothing to draw, always with a way back: still
 * loading, offline with nothing cached (the request is held rather than
 * failed, so a skeleton would wait forever), unreachable, or missing because
 * it was saved, discarded or deleted since.
 */
export function WorkoutUnavailable({
  state = 'missing',
  heading,
  title,
  icon = { set: 'body', name: 'stopwatch' },
  fallback = '/workouts',
  skeleton = 'h-[240px]',
}: {
  state?: Unavailable
  /** The app bar's title, for a page that names itself while it loads. */
  heading?: string
  /** What is missing, when it is not a workout. */
  title?: string
  icon?: IconRef
  fallback?: Href
  /** The placeholder's height class, roughly the page it stands in for. */
  skeleton?: string
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const goBack = useBack(fallback)
  return (
    <Screen header={<AppBar title={heading} onBack={goBack} backLabel={t('common:action.back')} />}>
      {state === 'loading' ? (
        <Card>
          <Skeleton className={cn(skeleton, 'w-full')} />
        </Card>
      ) : state === 'missing' ? (
        <EmptyState title={title ?? t('workouts:detail.missing')} icon={icon} />
      ) : (
        <EmptyState
          title={t(NOT_LOADED[state].title)}
          description={t(NOT_LOADED[state].body)}
          icon={NOT_LOADED[state].icon}
        />
      )}
    </Screen>
  )
}
