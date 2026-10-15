import { format, parseISO } from 'date-fns'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type ExerciseBests,
  type ExerciseSession,
  useExerciseBests,
  useExerciseHistory,
  useSettings,
} from '@/data'
import { TrendLine } from '@/features/progress'
import {
  CATEGORY_KEY,
  type DistanceUnit,
  describeSet,
  distanceField,
  distanceUnitFor,
  EQUIPMENT_KEY,
  ExerciseArt,
  LEVEL_KEY,
  type LibraryExercise,
  MUSCLE_KEY,
  planFor,
  rankedMuscles,
  SET_BADGE_KEY,
  shortClock,
  TRACKING_KEY,
  useExerciseLibrary,
  useLiveWorkout,
  useWorkoutStarter,
  volume,
  weightField,
} from '@/features/workouts'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { UNIT_KEY, unitFor, type WeightUnit } from '@/lib/units'
import {
  AppBar,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  Skeleton,
  Tappable,
  Text,
} from '@/ui'

type Metric = 'e1rm' | 'heaviest' | 'volume' | 'reps' | 'duration' | 'distance'

/** Which progress lines an exercise can draw, from what its sets record. */
function metricsFor(exercise: LibraryExercise): Metric[] {
  switch (exercise.tracking) {
    case 'weight_reps':
      return ['e1rm', 'heaviest', 'volume']
    case 'weighted_reps':
      return ['reps', 'heaviest', 'volume']
    case 'reps':
    case 'assisted_reps':
      return ['reps']
    case 'duration':
      return ['duration']
    case 'distance_duration':
      return ['distance', 'duration']
    case 'weight_distance':
      return ['heaviest', 'distance']
  }
}

const METRIC_KEY = {
  e1rm: 'workouts:exercise.chart.e1rm',
  heaviest: 'workouts:exercise.chart.heaviest',
  volume: 'workouts:exercise.chart.volume',
  reps: 'workouts:exercise.chart.reps',
  duration: 'workouts:exercise.chart.duration',
  distance: 'workouts:exercise.chart.distance',
} as const satisfies Record<Metric, string>

/**
 * One exercise: what it is and works, how the user's numbers on it have moved,
 * their bests, and every session they did it in.
 */
export default function ExerciseScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const goBack = useBack('/workouts')
  const { id } = useLocalSearchParams<{ id: string }>()
  const library = useExerciseLibrary()
  const known = library.byId(id ?? '')
  const history = useExerciseHistory(id)
  const bests = useExerciseBests(id ?? null)
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const starter = useWorkoutStarter()
  const { workout: running, dispatch } = useLiveWorkout()

  // A custom exercise that has been deleted, or a retired id, still has a
  // history, under the name and tracking it was saved with. It is drawn from
  // those, with no drawing and no muscles to show.
  const saved = bests.data?.[0]
  const exercise: LibraryExercise | undefined =
    known ??
    (saved
      ? {
          id: saved.exerciseId,
          name: saved.name,
          category: 'fullBody',
          tracking: saved.tracking,
          equipment: 'other',
          level: 'beginner',
          muscles: {},
          custom: false,
        }
      : undefined)
  const name = exercise?.name ?? ''
  const plan = exercise ? planFor(exercise) : null

  return (
    <Screen
      header={
        <AppBar
          title={name}
          titleLines={2}
          onBack={goBack}
          backLabel={t('common:action.back')}
          action={
            exercise?.custom ? (
              <IconButton
                size="sm"
                variant="neutral"
                accessibilityLabel={t('workouts:custom.editTitle')}
                onPress={() =>
                  router.push({ pathname: '/workout/custom', params: { id: exercise.id } })
                }
              >
                <Icon set="ui" name="edit" size={20} />
              </IconButton>
            ) : undefined
          }
        />
      }
      footer={
        plan && known ? (
          running ? (
            // A workout is running: this adds to it, rather than offering to
            // throw it away for a new one.
            <Button
              fullWidth
              onPress={() => {
                dispatch({ type: 'addExercises', plans: [plan] })
                router.dismissTo('/workout/active')
              }}
            >
              {t('workouts:exercise.addToWorkout')}
            </Button>
          ) : (
            <Button
              fullWidth
              onPress={() => starter.start({ name: plan.name, source: 'empty', plans: [plan] })}
            >
              {t('workouts:exercise.start')}
            </Button>
          )
        ) : undefined
      }
    >
      {known ? <About exercise={known} /> : null}

      {history.isPending ? (
        <Card>
          <Skeleton className="h-[200px] w-full" />
        </Card>
      ) : history.data?.length && exercise ? (
        <>
          <Progress exercise={exercise} sessions={history.data} unit={unit} />
          {bests.data?.[0] ? (
            <Records bests={bests.data[0]} exercise={exercise} unit={unit} />
          ) : null}
          <History exercise={exercise} sessions={history.data} unit={unit} />
        </>
      ) : (
        <Card>
          <EmptyState
            title={t('workouts:exercise.noHistoryTitle')}
            description={t('workouts:exercise.noHistoryBody')}
            icon={{ set: 'system', name: 'trophy' }}
            className="py-md"
          />
        </Card>
      )}
      {starter.sheet}
    </Screen>
  )
}

function About({ exercise }: { exercise: LibraryExercise }) {
  const { t } = useTranslation(['workouts'])
  const muscles = rankedMuscles(exercise.muscles)
  const top = muscles[0]?.share ?? 1

  return (
    <Card contentClassName="gap-4">
      <View className="flex-row items-center gap-4">
        <ExerciseArt exerciseId={exercise.id} category={exercise.category} size={132} radius={36} />
        <View className="flex-1 gap-2">
          <Badge tone="pandan" size="sm" className="self-start">
            {t(CATEGORY_KEY[exercise.category])}
          </Badge>
          <Text variant="meta">{t(EQUIPMENT_KEY[exercise.equipment])}</Text>
          {!exercise.custom ? <Text variant="meta">{t(LEVEL_KEY[exercise.level])}</Text> : null}
          <Text variant="caption">{t(TRACKING_KEY[exercise.tracking])}</Text>
        </View>
      </View>

      {muscles.length ? (
        <View className="gap-2.5">
          <Text variant="overline">{t('workouts:exercise.split')}</Text>
          {muscles.map((entry, index) => (
            <View key={entry.muscle} className="flex-row items-center gap-3">
              <Text variant="label" className="w-[96px]" numberOfLines={1}>
                {t(MUSCLE_KEY[entry.muscle])}
              </Text>
              <View className="h-[10px] flex-1 overflow-hidden rounded-full bg-track">
                <View
                  className={
                    index === 0 ? 'h-full rounded-full bg-hibiscus' : 'h-full rounded-full bg-kaya'
                  }
                  style={{ width: `${(entry.share / top) * 100}%` }}
                />
              </View>
              <Text variant="meta" className="w-[42px] text-right">
                {Math.round(entry.share * 100)}%
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  )
}

function metricValue(session: ExerciseSession, metric: Metric): number | null {
  switch (metric) {
    case 'e1rm':
      return session.bestE1rmKg
    case 'heaviest':
      return session.bestWeightKg
    case 'volume':
      return session.volumeKg || null
    case 'reps':
      return (
        Math.max(
          0,
          ...session.sets.filter((set) => set.kind !== 'warmup').map((set) => set.reps ?? 0),
        ) || null
      )
    case 'duration':
      return session.durationS || null
    case 'distance':
      return session.distanceM
  }
}

function formatMetric(
  value: number,
  metric: Metric,
  unit: WeightUnit,
  distanceUnit: DistanceUnit,
  unitLabel: string,
): string {
  switch (metric) {
    case 'e1rm':
    case 'heaviest':
      return `${weightField(value, unit)} ${unitLabel}`
    case 'volume':
      return `${volume(value, unit)} ${unitLabel}`
    case 'reps':
      return String(Math.round(value))
    case 'duration':
      return shortClock(value)
    case 'distance':
      return `${distanceField(value, distanceUnit)} ${distanceUnit}`
  }
}

function Progress({
  exercise,
  sessions,
  unit,
}: {
  exercise: LibraryExercise
  sessions: readonly ExerciseSession[]
  unit: WeightUnit
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const metrics = metricsFor(exercise)
  const [metric, setMetric] = useState<Metric>(metrics[0])
  const distanceUnit = distanceUnitFor(unit)

  // Oldest first, the last twenty sessions: a line is read left to right.
  const points = useMemo(
    () =>
      [...sessions]
        .slice(0, 20)
        .reverse()
        .map((session) => {
          const value = metricValue(session, metric)
          return {
            key: session.workoutId,
            label: format(parseISO(session.startedAt), datePattern('dayMonth')),
            value:
              value === null
                ? null
                : metric === 'e1rm' || metric === 'heaviest' || metric === 'volume'
                  ? Number(weightField(value, unit))
                  : value,
          }
        }),
    [sessions, metric, unit],
  )
  const latest = metricValue(sessions[0], metric)

  return (
    <Card contentClassName="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {metrics.map((value) => (
          <Chip key={value} selected={metric === value} onPress={() => setMetric(value)}>
            {t(METRIC_KEY[value])}
          </Chip>
        ))}
      </View>
      {latest !== null ? (
        <Text variant="displayMd">
          {formatMetric(latest, metric, unit, distanceUnit, t(UNIT_KEY[unit]))}
        </Text>
      ) : null}
      {points.filter((point) => point.value !== null).length > 1 ? (
        <TrendLine points={points} height={140} accessibilityLabel={t(METRIC_KEY[metric])} />
      ) : null}
    </Card>
  )
}

function Records({
  bests,
  exercise,
  unit,
}: {
  bests: ExerciseBests
  exercise: LibraryExercise
  unit: WeightUnit
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const unitLabel = t(UNIT_KEY[unit])
  const distanceUnit = distanceUnitFor(unit)
  const rows: { label: string; value: string }[] = []
  const tracking = exercise.tracking

  if (bests.bestWeightKg !== null && tracking !== 'assisted_reps') {
    rows.push({
      label: t('workouts:exercise.bestWeight'),
      value:
        bests.bestWeightReps !== null && tracking !== 'weight_distance'
          ? t('workouts:exercise.weightReps', {
              weight: `${weightField(bests.bestWeightKg, unit)} ${unitLabel}`,
              reps: bests.bestWeightReps,
            })
          : `${weightField(bests.bestWeightKg, unit)} ${unitLabel}`,
    })
  }
  if (bests.bestE1rmKg !== null) {
    rows.push({
      label: t('workouts:exercise.bestE1rm'),
      value: `${weightField(bests.bestE1rmKg, unit)} ${unitLabel}`,
    })
  }
  if (bests.bestSetVolumeKg !== null) {
    rows.push({
      label: t('workouts:exercise.bestSetVolume'),
      value: `${volume(bests.bestSetVolumeKg, unit)} ${unitLabel}`,
    })
  }
  if (bests.bestSessionVolumeKg) {
    rows.push({
      label: t('workouts:exercise.bestSessionVolume'),
      value: `${volume(bests.bestSessionVolumeKg, unit)} ${unitLabel}`,
    })
  }
  if (bests.bestReps !== null)
    rows.push({ label: t('workouts:exercise.bestReps'), value: String(bests.bestReps) })
  if (bests.bestDurationS)
    rows.push({
      label: t('workouts:exercise.bestDuration'),
      value: shortClock(bests.bestDurationS),
    })
  if (bests.bestDistanceM) {
    rows.push({
      label: t('workouts:exercise.bestDistance'),
      value: `${distanceField(bests.bestDistanceM, distanceUnit)} ${distanceUnit}`,
    })
  }
  if (bests.totalVolumeKg > 0) {
    rows.push({
      label: t('workouts:exercise.totalVolume'),
      value: `${volume(bests.totalVolumeKg, unit)} ${unitLabel}`,
    })
  }

  return (
    <Card
      title={t('workouts:exercise.records')}
      action={
        <Text variant="caption">{t('workouts:exercise.sessions', { count: bests.workouts })}</Text>
      }
    >
      {rows.map((row, index) => (
        <View key={row.label}>
          {index > 0 ? <Divider /> : null}
          <View className="flex-row items-center gap-3 py-2.5">
            <Icon set="system" name="trophy" size={20} />
            <Text variant="body" className="flex-1">
              {row.label}
            </Text>
            <Text variant="label">{row.value}</Text>
          </View>
        </View>
      ))}
    </Card>
  )
}

function History({
  exercise,
  sessions,
  unit,
}: {
  exercise: LibraryExercise
  sessions: readonly ExerciseSession[]
  unit: WeightUnit
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const distanceUnit = distanceUnitFor(unit)
  const [shown, setShown] = useState(10)

  return (
    <Card title={t('workouts:exercise.history')} contentClassName="gap-0">
      {sessions.slice(0, shown).map((session, index) => {
        let working = 0
        return (
          <View key={session.workoutId}>
            {index > 0 ? <Divider /> : null}
            <Tappable
              className="gap-1.5 py-3"
              onPress={() =>
                router.push({ pathname: '/workout/[id]', params: { id: session.workoutId } })
              }
              accessibilityRole="button"
              accessibilityLabel={session.workoutName}
            >
              <View className="flex-row items-center justify-between">
                <Text variant="label" numberOfLines={1} className="flex-1">
                  {session.workoutName}
                </Text>
                <Text variant="caption">
                  {format(parseISO(session.startedAt), datePattern('weekdayDayMonth'))}
                </Text>
              </View>
              {session.sets.map((set, setIndex) => {
                if (set.kind !== 'warmup') working += 1
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a set is its position
                  <View key={setIndex} className="flex-row items-center gap-2">
                    <Text variant="meta" className="w-[22px] text-center">
                      {set.kind === 'normal' ? working : t(SET_BADGE_KEY[set.kind])}
                    </Text>
                    <Text variant="meta" className="flex-1 text-ink">
                      {describeSet(set, exercise.tracking, unit, distanceUnit, t(UNIT_KEY[unit]))}
                    </Text>
                    {set.isPr ? <Icon set="system" name="trophy" size={14} /> : null}
                  </View>
                )
              })}
            </Tappable>
          </View>
        )
      })}
      {sessions.length > shown ? (
        <Button variant="ghost" fullWidth onPress={() => setShown((count) => count + 10)}>
          {t('workouts:history.more')}
        </Button>
      ) : null}
    </Card>
  )
}
