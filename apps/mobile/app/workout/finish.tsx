import { format } from 'date-fns'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useCurrentWeight, useSaveWorkout, useSettings } from '@/data'
import {
  completeAll,
  doneSets,
  estimateKcal,
  hoursMinutes,
  liveTotals,
  removeWorkoutFromHealth,
  showsVolume,
  syncWorkoutToHealth,
  timedSeconds,
  toPayload,
  useLiveWorkout,
  volume,
  WhenSheet,
} from '@/features/workouts'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { UNIT_KEY, unitFor } from '@/lib/units'
import {
  AppBar,
  Button,
  Card,
  Divider,
  EmptyState,
  ListRow,
  Screen,
  Text,
  TextField,
  useToast,
} from '@/ui'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Saving a finished workout: its name, a note, and when it really started and
 * ended.
 *
 * The end time is the moment Finish was pressed unless it says otherwise, and
 * it can say otherwise: a workout finished from the "still training?" prompt
 * arrives with the time of its last set, and `pickEnd` opens straight onto the
 * picker. Both times can be moved, because the commonest way to log a workout
 * wrong is to start it in the car park.
 */
export default function FinishWorkoutScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const toast = useToast()
  const params = useLocalSearchParams<{ complete?: string; endedAt?: string; pickEnd?: string }>()
  const { workout: current, replace, clear } = useLiveWorkout()
  // Saving clears the workout and then leaves; the last document is drawn
  // until the screen has gone, rather than a <Redirect> racing the navigation.
  const lastSeen = useRef(current)
  if (current) lastSeen.current = current
  const workout = current ?? lastSeen.current
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const bodyKg = useCurrentWeight()
  const save = useSaveWorkout()

  const [name, setName] = useState(workout?.name ?? '')
  const [notes, setNotes] = useState(workout?.notes ?? '')
  const [endedAt, setEndedAt] = useState(() => {
    const given = Number(params.endedAt)
    return Number.isFinite(given) && given > 0 ? given : Date.now()
  })
  // A sport is logged as one timed set, usually after the game: "Badminton,
  // 60:00", then Finish a minute later. The workout opens as the hour the set
  // says rather than that minute, so its times, its energy and its Apple
  // Health copy agree with what was typed.
  const [startedAt, setStartedAt] = useState(() => {
    const started = workout?.startedAt ?? Date.now()
    const timedS = workout ? timedSeconds(workout) : 0
    return Math.min(started, endedAt - timedS * 1000)
  })
  const [picking, setPicking] = useState<'start' | 'end' | null>(params.pickEnd ? 'end' : null)
  const [saving, setSaving] = useState(false)

  // "Tick them and save" ticks every set that has numbers in it, once, on the
  // way in, so what this screen summarises is what will be saved.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on arrival only
  useEffect(() => {
    if (params.complete && workout) replace(completeAll(workout, Date.now()))
  }, [])

  const totals = useMemo(() => (workout ? liveTotals(workout) : null), [workout])

  if (!workout) return <Missing />

  const durationS = Math.round((endedAt - startedAt) / 1000)
  const error =
    endedAt <= startedAt
      ? t('workouts:finish.endBeforeStart')
      : endedAt - startedAt > DAY_MS
        ? t('workouts:finish.tooLong')
        : null
  const span = hoursMinutes(Math.max(0, durationS))
  const exercises = workout.exercises.filter((exercise) => exercise.sets.some((set) => set.done))

  const onSave = async () => {
    if (error || saving) return
    setSaving(true)
    let healthCopy: string | null = null
    try {
      const document = { ...workout, name: name.trim() || workout.name, notes, startedAt }
      const kcal = estimateKcal(document, durationS, bodyKg)
      const health = await syncWorkoutToHealth(document, endedAt, kcal)
      healthCopy = health.healthId
      const payload = toPayload(document, endedAt, { kcal, healthWorkoutId: health.healthId })
      const result = await save.mutateAsync(payload)
      track('Workout Finished', {
        exercises: payload.exercises.length,
        sets: doneSets(document),
        duration_min: Math.round(durationS / 60),
        from_routine: Boolean(document.routineId),
        saved_to_health: Boolean(health.healthId),
        queued: result.queued,
      })
      clear()
      toast.show({
        title: t('workouts:finish.saved'),
        description: result.queued
          ? t('workouts:finish.queued')
          : health.failed
            ? t('workouts:finish.healthFailed')
            : health.healthId
              ? t('workouts:finish.health')
              : undefined,
        tone: 'success',
      })
      router.dismissTo('/workouts')
      if (!result.queued) {
        router.push({ pathname: '/workout/[id]', params: { id: payload.id } })
      }
    } catch (failure) {
      // The Health copy went in and the workout did not. Take the copy back
      // out, or pressing Save again puts a second one beside it.
      if (healthCopy) void removeWorkoutFromHealth(healthCopy, workout.id)
      console.warn('[workouts] save failed', failure)
      toast.show({ title: t('workouts:finish.failed'), tone: 'error' })
      setSaving(false)
    }
  }

  return (
    <Screen
      header={
        <AppBar
          title={t('workouts:finish.title')}
          onBack={() => router.back()}
          backLabel={t('common:action.back')}
        />
      }
      footer={
        <Button fullWidth onPress={onSave} loading={saving} disabled={Boolean(error)}>
          {t('workouts:finish.save')}
        </Button>
      }
    >
      <View className="flex-row rounded-card bg-surface px-4 py-3">
        <Summary
          label={t('workouts:finish.duration')}
          value={
            span.hours > 0
              ? t('workouts:duration.hoursMinutes', span)
              : t('workouts:duration.minutes', { minutes: span.minutes })
          }
        />
        {showsVolume(workout.exercises.map((exercise) => exercise.tracking)) ? (
          <Summary
            label={t('workouts:logger.volume')}
            value={`${volume(totals?.volumeKg ?? 0, unit)} ${t(UNIT_KEY[unit])}`}
          />
        ) : null}
        <Summary label={t('workouts:logger.sets')} value={String(totals?.done ?? 0)} />
      </View>

      <Card contentClassName="gap-4">
        <TextField
          label={t('workouts:finish.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('workouts:logger.namePlaceholder')}
          maxLength={80}
        />
        <TextField
          label={t('workouts:finish.notes')}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('workouts:finish.notesPlaceholder')}
          multiline
          maxLength={2000}
        />
      </Card>

      <Card title={t('workouts:finish.when')} contentClassName="gap-0 px-5 py-1">
        <ListRow
          title={t('workouts:finish.started')}
          subtitle={format(startedAt, `${datePattern('weekdayDayMonth')}, ${datePattern('time')}`)}
          onPress={() => setPicking('start')}
        />
        <ListRow
          title={t('workouts:finish.ended')}
          subtitle={format(endedAt, `${datePattern('weekdayDayMonth')}, ${datePattern('time')}`)}
          onPress={() => setPicking('end')}
          divider={false}
        />
      </Card>
      {error ? (
        <Text variant="meta" className="px-1 text-hibiscus-ink">
          {error}
        </Text>
      ) : null}

      <Card title={t('workouts:detail.exercises')} contentClassName="gap-2">
        {exercises.map((exercise, index) => (
          <View key={exercise.key}>
            {index > 0 ? <Divider /> : null}
            <View className="flex-row items-center justify-between py-2">
              <Text variant="bodyStrong" className="flex-1" numberOfLines={1}>
                {exercise.name}
              </Text>
              <Text variant="meta">
                {t('workouts:history.sets', {
                  count: exercise.sets.filter((set) => set.done).length,
                })}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <WhenSheet
        visible={picking !== null}
        title={picking === 'start' ? t('workouts:finish.started') : t('workouts:finish.ended')}
        value={picking === 'start' ? startedAt : endedAt}
        onClose={() => setPicking(null)}
        onPick={(at) => (picking === 'start' ? setStartedAt(at) : setEndedAt(at))}
      />
    </Screen>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text variant="overlineSm">{label}</Text>
      <Text variant="numeric" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  )
}

/** Opened with nothing to finish: the workout was already saved or discarded. */
function Missing() {
  const { t } = useTranslation(['workouts', 'common'])
  const goBack = useBack('/workouts')
  return (
    <Screen header={<AppBar onBack={goBack} backLabel={t('common:action.back')} />}>
      <EmptyState title={t('workouts:detail.missing')} icon={{ set: 'body', name: 'stopwatch' }} />
    </Screen>
  )
}
