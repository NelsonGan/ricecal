import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useExerciseBests, useSettings, useWorkoutOverview } from '@/data'
import {
  describeSet,
  distanceUnitFor,
  doneSets,
  durationText,
  ExerciseArt,
  estimatedOneRepMax,
  type LiveExercise,
  type LiveSet,
  liveTotals,
  RECORD_KEY,
  type RecordKind,
  recordSets,
  Stat,
  setVolume,
  shortClock,
  showsVolume,
  timedSeconds,
  timesError,
  useExerciseLibrary,
  useLiveWorkout,
  useWorkoutSave,
  volumeText,
  WorkoutFields,
  WorkoutMissing,
  weightText,
} from '@/features/workouts'
import { track } from '@/lib/analytics'
import { UNIT_KEY, unitFor } from '@/lib/units'
import { AppBar, Button, Card, Divider, Icon, Screen, Text, useToast } from '@/ui'

/**
 * Saving a finished workout: a moment to see what it came to, then its name, a
 * note, and when it really started and ended.
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
  const params = useLocalSearchParams<{ endedAt?: string; pickEnd?: string }>()
  const { workout: current, clear } = useLiveWorkout()
  // Saving clears the workout and then leaves; the last document is drawn
  // until the screen has gone, rather than a <Redirect> racing the navigation.
  const lastSeen = useRef(current)
  if (current) lastSeen.current = current
  const workout = current ?? lastSeen.current
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const distanceUnit = distanceUnitFor(unit)
  const saveWorkout = useWorkoutSave()
  const library = useExerciseLibrary()
  const overview = useWorkoutOverview().data
  const bests = useExerciseBests(null).data

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

  const totals = useMemo(() => (workout ? liveTotals(workout) : null), [workout])
  const exercises = useMemo(
    () => workout?.exercises.filter((exercise) => exercise.sets.some((set) => set.done)) ?? [],
    [workout],
  )
  // One line per exercise that set a record, for its most telling kind. The
  // same rule the logger's trophies follow (`records.ts`), against the bests
  // as they stood before this workout.
  const records = useMemo(() => {
    const byId = new Map((bests ?? []).map((entry) => [entry.exerciseId, entry]))
    return exercises.flatMap((exercise) => {
      const marked = recordSets(exercise, byId.get(exercise.exerciseId))
      for (const kind of RECORD_ORDER) {
        const set = exercise.sets.find((entry) => marked.get(entry.id)?.includes(kind))
        if (set) return [{ exercise, set, kind }]
      }
      return []
    })
  }, [exercises, bests])

  if (!workout) return <WorkoutMissing />

  const durationS = Math.round((endedAt - startedAt) / 1000)
  const error = timesError(t, startedAt, endedAt)
  const unitLabel = t(UNIT_KEY[unit])

  const recordValue = (kind: RecordKind, set: LiveSet, exercise: LiveExercise): string => {
    switch (kind) {
      case 'e1rm':
        return weightText(t, estimatedOneRepMax(set.weightKg, set.reps), unit)
      case 'volume':
        return volumeText(t, setVolume(set, exercise.tracking) ?? 0, unit)
      case 'duration':
        return shortClock(set.durationS ?? 0)
      default:
        return describeSet(set, exercise.tracking, unit, distanceUnit, unitLabel)
    }
  }

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
      {/* The session in one card: that it is done, then what it came to. */}
      <Card tone="kaya" contentClassName="gap-4">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="title" numberOfLines={2}>
              {t('workouts:finish.complete')}
            </Text>
            {overview ? (
              <Text variant="meta" className="text-kaya-ink">
                {t('workouts:finish.total', { count: overview.totalWorkouts + 1 })}
              </Text>
            ) : null}
          </View>
          <Icon set="system" name="trophy" size={64} />
        </View>
        <View className="flex-row">
          <View className="flex-1">
            <Stat
              label={t('workouts:finish.duration')}
              value={durationText(t, Math.max(0, durationS))}
            />
          </View>
          {showsVolume(workout.exercises.map((exercise) => exercise.tracking)) &&
          (totals?.volumeKg ?? 0) > 0 ? (
            <View className="flex-1">
              <Stat
                label={t('workouts:logger.volume')}
                value={volumeText(t, totals?.volumeKg ?? 0, unit)}
              />
            </View>
          ) : null}
          <View className="flex-1">
            <Stat label={t('workouts:logger.sets')} value={String(totals?.done ?? 0)} />
          </View>
        </View>
      </Card>

      {records.length ? (
        <Card title={t('workouts:detail.records')} contentClassName="gap-2">
          {records.map(({ exercise, set, kind }) => (
            <View
              key={exercise.key}
              className="flex-row items-center gap-3 rounded-md bg-kaya-soft px-3 py-2.5"
            >
              <Icon set="system" name="trophy" size={28} />
              <View className="min-w-0 flex-1">
                <Text variant="label" numberOfLines={1}>
                  {exercise.name}
                </Text>
                <Text variant="caption" numberOfLines={1}>
                  {t(RECORD_KEY[kind])}
                </Text>
              </View>
              <Text variant="bodyStrong" className="text-kaya-ink">
                {recordValue(kind, set, exercise)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

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

      <Card title={t('workouts:detail.exercises')} contentClassName="gap-0">
        {exercises.map((exercise, index) => {
          const done = exercise.sets.filter((set) => set.done)
          const best = bestSet(exercise)
          return (
            <View key={exercise.key}>
              {index > 0 ? <Divider /> : null}
              <View className="flex-row items-center gap-3 py-2.5">
                <ExerciseArt
                  exerciseId={exercise.exerciseId}
                  category={library.byId(exercise.exerciseId)?.category}
                  size={44}
                />
                <View className="min-w-0 flex-1">
                  <Text variant="label" numberOfLines={2}>
                    {exercise.name}
                  </Text>
                  <Text variant="caption">
                    {t('workouts:history.sets', { count: done.length })}
                  </Text>
                </View>
                {best ? (
                  <View className="items-end">
                    <Text variant="micro">{t('workouts:finish.best')}</Text>
                    <Text variant="label" className="text-pandan-ink">
                      {describeSet(best, exercise.tracking, unit, distanceUnit, unitLabel)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          )
        })}
      </Card>
    </Screen>
  )
}

/** Which record a line shows when a set took several: the one people quote. */
const RECORD_ORDER: readonly RecordKind[] = ['weight', 'reps', 'duration', 'e1rm', 'volume']

/**
 * The set an exercise is remembered by: the heaviest, or for an exercise with
 * no weight, the most reps, the longest or the furthest. Warm-ups only when
 * there is nothing else.
 */
function bestSet(exercise: LiveExercise): LiveSet | null {
  const done = exercise.sets.filter((set) => set.done)
  const working = done.filter((set) => set.kind !== 'warmup')
  const pool = working.length ? working : done
  const score = (set: LiveSet): [number, number] => {
    switch (exercise.tracking) {
      case 'weight_reps':
      case 'weighted_reps':
      case 'weight_distance':
        return [set.weightKg ?? 0, set.reps ?? set.distanceM ?? 0]
      case 'duration':
        return [set.durationS ?? 0, 0]
      case 'distance_duration':
        return [set.distanceM ?? 0, set.durationS ?? 0]
      default:
        return [set.reps ?? 0, 0]
    }
  }
  let best: LiveSet | null = null
  for (const set of pool) {
    if (!best) {
      best = set
      continue
    }
    const [a, b] = score(set)
    const [c, d] = score(best)
    if (a > c || (a === c && b > d)) best = set
  }
  return best
}
