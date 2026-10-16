import { format, isThisYear, parseISO } from 'date-fns'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { TFunction } from 'i18next'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type ExerciseBests,
  type ExerciseSession,
  type IconRef,
  type RepBest,
  useCustomExercises,
  useExerciseBests,
  useExerciseHistory,
  useExerciseRepBests,
  useSession,
  useSettings,
} from '@/data'
import { TrendLine } from '@/features/progress'
import {
  CATEGORY_KEY,
  type DistanceUnit,
  describeSet,
  dispatchWorkout,
  distanceText,
  distanceUnitFor,
  EQUIPMENT_KEY,
  ExerciseArt,
  LEVEL_KEY,
  type LibraryExercise,
  M_PER_MI,
  MUSCLE_KEY,
  openLogger,
  planFor,
  rankedMuscles,
  setBadges,
  shortClock,
  TRACKING_KEY,
  type Tracking,
  useExerciseLibrary,
  useHasActiveWorkout,
  useWorkoutHasExercise,
  useWorkoutStarter,
  volumeText,
  weightText,
} from '@/features/workouts'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { fromKg, UNIT_KEY, unitFor, type WeightUnit } from '@/lib/units'
import {
  AppBar,
  Badge,
  Button,
  Card,
  cn,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  SegmentedControl,
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
  const { id } = useLocalSearchParams<{ id: string }>()
  // Keyed by id, so a link that reuses this screen for another one starts
  // clean rather than carrying the last one's menus and held state.
  return <ExercisePage key={id} id={id} />
}

function ExercisePage({ id }: { id: string }) {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const goBack = useBack('/workouts')
  const library = useExerciseLibrary()
  // The library's custom half, asked directly to know whether it has answered.
  const customs = useCustomExercises()
  const known = library.byId(id ?? '')
  const history = useExerciseHistory(id)
  const bests = useExerciseBests(id ?? null)
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const starter = useWorkoutStarter()
  // Whether one runs, not the workout: this page stays mounted under the
  // logger, and reading the document re-rendered it on every keystroke.
  const { userId } = useSession()
  const running = useHasActiveWorkout(userId)
  // Opened from the logger, the exercise is usually already in it, and adding
  // it again would put a second card of it in the workout.
  const inWorkout = useWorkoutHasExercise(userId, id ?? '')

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
  const repBests = useExerciseRepBests(
    exercise && LOADED.has(exercise.tracking) ? exercise.id : undefined,
  )

  // Nothing names this id yet: not the catalogue, the user's own exercises or
  // a saved set. Until all three have answered that is loading; after, it is
  // an exercise that is not there, which a blank title over "Not done yet"
  // passed off as one never done.
  if (!exercise) {
    const sources = [customs, bests, history]
    if (sources.some((query) => query.isPending && query.isPaused)) {
      return (
        <Empty
          title={t('common:offline.title')}
          description={t('common:offline.body')}
          icon={{ set: 'ui', name: 'offline' }}
        />
      )
    }
    if (sources.some((query) => query.isPending)) {
      return (
        <Screen header={<AppBar onBack={goBack} backLabel={t('common:action.back')} />}>
          <Card>
            <Skeleton className="h-[200px] w-full" />
          </Card>
        </Screen>
      )
    }
    return sources.some((query) => query.isError) ? (
      <Empty
        title={t('common:offline.unreachableTitle')}
        description={t('common:offline.unreachableBody')}
        icon={{ set: 'ui', name: 'warning' }}
      />
    ) : (
      <Empty title={t('workouts:exercise.missing')} icon={{ set: 'body', name: 'dumbbell' }} />
    )
  }

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
        plan && known && !inWorkout ? (
          running ? (
            // A workout is running: this adds to it, rather than offering to
            // throw it away for a new one.
            <Button
              fullWidth
              onPress={() => {
                if (userId) dispatchWorkout(userId, { type: 'addExercises', plans: [plan] })
                openLogger(router)
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

      {history.isPending && !history.isPaused ? (
        <Card>
          <Skeleton className="h-[200px] w-full" />
        </Card>
      ) : history.isPaused && !history.data ? (
        <Card>
          <EmptyState
            title={t('common:offline.title')}
            description={t('common:offline.body')}
            icon={{ set: 'ui', name: 'offline' }}
            className="py-md"
          />
        </Card>
      ) : history.data?.length ? (
        <>
          <Progress exercise={exercise} sessions={history.data} unit={unit} />
          {bests.data?.[0] ? (
            <Records bests={bests.data[0]} exercise={exercise} unit={unit} />
          ) : null}
          {repBests.data ? <RepRecords rows={repBests.data} unit={unit} /> : null}
          <History exercise={exercise} sessions={history.data} unit={unit} />
        </>
      ) : (
        <Card>
          <EmptyState
            title={t('workouts:exercise.noHistoryTitle')}
            icon={{ set: 'system', name: 'trophy' }}
            className="py-md"
          />
        </Card>
      )}
      {starter.dialog}
    </Screen>
  )
}

/** The page with nothing in it but a way back. */
function Empty({
  title,
  description,
  icon,
}: {
  title: string
  description?: string
  icon: IconRef
}) {
  const { t } = useTranslation(['common'])
  const goBack = useBack('/workouts')
  return (
    <Screen header={<AppBar onBack={goBack} backLabel={t('common:action.back')} />}>
      <EmptyState title={title} description={description} icon={icon} />
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
  t: TFunction<['workouts', 'common']>,
  value: number,
  metric: Metric,
  unit: WeightUnit,
  distanceUnit: DistanceUnit,
  tracking: Tracking,
): string {
  switch (metric) {
    case 'e1rm':
    case 'heaviest':
      return weightText(t, value, unit)
    case 'volume':
      return volumeText(t, value, unit)
    case 'reps':
      return String(Math.round(value))
    case 'duration':
      return shortClock(value)
    case 'distance':
      return distanceText(value, distanceUnit, tracking)
  }
}

/**
 * What a metric's stored value is multiplied by to read it, so the chart's
 * rules land on round figures in the unit shown: pounds rather than kilograms,
 * kilometres or miles rather than metres, minutes rather than seconds.
 */
function readFactor(
  metric: Metric,
  unit: WeightUnit,
  distanceUnit: DistanceUnit,
  tracking: Tracking,
): number {
  switch (metric) {
    case 'e1rm':
    case 'heaviest':
    case 'volume':
      return fromKg(1, unit)
    case 'duration':
      return 1 / 60
    case 'distance':
      if (tracking === 'weight_distance') return 1
      return distanceUnit === 'mi' ? 1 / M_PER_MI : 1 / 1000
    case 'reps':
      return 1
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
        // Kilograms and seconds as stored: the line's shape is the same in any
        // unit, and the readout converts.
        .map((session) => ({
          key: session.workoutId,
          label: format(parseISO(session.startedAt), datePattern('dayMonth')),
          value: metricValue(session, metric),
        })),
    [sessions, metric],
  )
  const latest = metricValue(sessions[0], metric)

  return (
    <Card contentClassName="gap-3">
      {metrics.length > 1 ? (
        <SegmentedControl
          options={metrics.map((value) => ({ value, label: t(METRIC_KEY[value]) }))}
          value={metric}
          onChange={setMetric}
          accessibilityLabel={t('workouts:exercise.history')}
        />
      ) : null}
      {latest !== null ? (
        <Text variant="displayMd">
          {formatMetric(t, latest, metric, unit, distanceUnit, exercise.tracking)}
        </Text>
      ) : null}
      {points.filter((point) => point.value !== null).length > 1 ? (
        <TrendLine
          points={points}
          height={160}
          formatValue={(value) =>
            formatMetric(t, value, metric, unit, distanceUnit, exercise.tracking)
          }
          unitFactor={readFactor(metric, unit, distanceUnit, exercise.tracking)}
          accessibilityLabel={t(METRIC_KEY[metric])}
        />
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
  const distanceUnit = distanceUnitFor(unit)
  const rows: { label: string; value: string }[] = []
  const tracking = exercise.tracking

  if (bests.bestWeightKg !== null && tracking !== 'assisted_reps') {
    rows.push({
      label: t('workouts:exercise.bestWeight'),
      value:
        bests.bestWeightReps !== null && tracking !== 'weight_distance'
          ? t('workouts:exercise.weightReps', {
              weight: weightText(t, bests.bestWeightKg, unit),
              reps: bests.bestWeightReps,
            })
          : weightText(t, bests.bestWeightKg, unit),
    })
  }
  if (bests.bestE1rmKg !== null) {
    rows.push({
      label: t('workouts:exercise.bestE1rm'),
      value: weightText(t, bests.bestE1rmKg, unit),
    })
  }
  if (bests.bestSetVolumeKg !== null) {
    rows.push({
      label: t('workouts:exercise.bestSetVolume'),
      value: volumeText(t, bests.bestSetVolumeKg, unit),
    })
  }
  if (bests.bestSessionVolumeKg) {
    rows.push({
      label: t('workouts:exercise.bestSessionVolume'),
      value: volumeText(t, bests.bestSessionVolumeKg, unit),
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
      value: distanceText(bests.bestDistanceM, distanceUnit, tracking),
    })
  }
  if (bests.totalVolumeKg > 0) {
    rows.push({
      label: t('workouts:exercise.totalVolume'),
      value: volumeText(t, bests.totalVolumeKg, unit),
    })
  }

  return (
    <Card
      title={t('workouts:exercise.records')}
      action={
        <Text variant="caption">{t('workouts:exercise.sessions', { count: bests.workouts })}</Text>
      }
      contentClassName="gap-0"
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

/** The trackings where a set's weight is load, so a heavier lift is a better one. */
const LOADED: ReadonlySet<Tracking> = new Set(['weight_reps', 'weighted_reps'])

function RepRecords({ rows, unit }: { rows: readonly RepBest[]; unit: WeightUnit }) {
  const { t } = useTranslation(['workouts'])
  // Kilograms are compared exactly and shown rounded, so 61.25 kg typed in kg
  // and 135 lb typed in pounds can both be records and read as the same
  // weight. The one at more reps is the record that means something.
  const shown = rows.filter(
    (row, index) =>
      index === rows.length - 1 ||
      weightText(t, rows[index + 1].weightKg, unit) !== weightText(t, row.weightKg, unit),
  )
  // One row is the heaviest weight again, already in Records.
  if (shown.length < 2) return null
  return (
    <Card title={t('workouts:exercise.repRecords')} contentClassName="gap-0">
      {shown.map((row, index) => (
        <View key={row.reps}>
          {index > 0 ? <Divider /> : null}
          <View className="flex-row items-center gap-3 py-2.5">
            <Text variant="body" className="flex-1">
              {t('workouts:exercise.repCount', { count: row.reps })}
            </Text>
            <Text variant="caption">{recordDate(row.at)}</Text>
            <Text variant="label" className="min-w-[72px] text-right">
              {weightText(t, row.weightKg, unit)}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  )
}

/** The year only when it is not this one: a record can be years old. */
function recordDate(at: string): string {
  const date = parseISO(at)
  return format(date, datePattern(isThisYear(date) ? 'dayMonth' : 'dayMonthYear'))
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
        const badges = setBadges(session.sets, t)
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
                const badge = badges[setIndex]
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a set is its position
                  <View key={setIndex} className="flex-row items-center gap-2">
                    <Text variant="meta" className={cn('w-[22px] text-center', badge.tone)}>
                      {badge.label}
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
