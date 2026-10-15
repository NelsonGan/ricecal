import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useSettings } from '@/data'
import {
  completeAll,
  doneSets,
  durationText,
  liveTotals,
  Stat,
  StatStrip,
  showsVolume,
  timedSeconds,
  timesError,
  useLiveWorkout,
  useWorkoutSave,
  volumeText,
  WorkoutFields,
  WorkoutMissing,
} from '@/features/workouts'
import { track } from '@/lib/analytics'
import { unitFor } from '@/lib/units'
import { AppBar, Button, Card, Divider, Screen, Text, useToast } from '@/ui'

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
  const saveWorkout = useWorkoutSave()

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
  const [saving, setSaving] = useState(false)

  // "Tick them and save" ticks every set that has numbers in it, once, on the
  // way in, so what this screen summarises is what will be saved.
  // biome-ignore lint/correctness/useExhaustiveDependencies: on arrival only
  useEffect(() => {
    if (params.complete && workout) replace(completeAll(workout, Date.now()))
  }, [])

  const totals = useMemo(() => (workout ? liveTotals(workout) : null), [workout])

  if (!workout) return <WorkoutMissing />

  const durationS = Math.round((endedAt - startedAt) / 1000)
  const error = timesError(t, startedAt, endedAt)
  const exercises = workout.exercises.filter((exercise) => exercise.sets.some((set) => set.done))

  const onSave = async () => {
    if (error || saving) return
    setSaving(true)
    try {
      const document = { ...workout, name: name.trim() || workout.name, notes, startedAt }
      const { payload, queued, health } = await saveWorkout(document, endedAt)
      track('Workout Finished', {
        exercises: payload.exercises.length,
        sets: doneSets(document),
        duration_min: Math.round(durationS / 60),
        from_routine: Boolean(document.routineId),
        saved_to_health: Boolean(health.healthId),
        queued,
      })
      clear()
      toast.show({
        title: t('workouts:finish.saved'),
        description: queued
          ? t('workouts:finish.queued')
          : health.failed
            ? t('workouts:finish.healthFailed')
            : health.healthId
              ? t('workouts:finish.health')
              : undefined,
        tone: 'success',
      })
      router.dismissTo('/workouts')
      if (!queued) router.push({ pathname: '/workout/[id]', params: { id: payload.id } })
    } catch (failure) {
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
      <StatStrip>
        <Stat
          label={t('workouts:finish.duration')}
          value={durationText(t, Math.max(0, durationS))}
        />
        {showsVolume(workout.exercises.map((exercise) => exercise.tracking)) ? (
          <Stat
            label={t('workouts:logger.volume')}
            value={volumeText(t, totals?.volumeKg ?? 0, unit)}
          />
        ) : null}
        <Stat label={t('workouts:logger.sets')} value={String(totals?.done ?? 0)} />
      </StatStrip>

      <WorkoutFields
        name={name}
        notes={notes}
        startedAt={startedAt}
        endedAt={endedAt}
        error={error}
        openOn={params.pickEnd ? 'end' : undefined}
        onName={setName}
        onNotes={setNotes}
        onStarted={setStartedAt}
        onEnded={setEndedAt}
      />

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
    </Screen>
  )
}
