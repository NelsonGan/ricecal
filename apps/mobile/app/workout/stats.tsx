import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  parseISO,
  startOfMonth,
  subDays,
} from 'date-fns'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  dateKey,
  today,
  useExerciseBests,
  useExerciseTotals,
  useSettings,
  useWorkoutDates,
  useWorkoutWeeks,
  type WorkoutWeek,
} from '@/data'
import {
  durationText,
  ExerciseArt,
  groupSplit,
  MuscleSplitBars,
  trim,
  useExerciseLibrary,
  volume,
  weightField,
} from '@/features/workouts'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { UNIT_KEY, unitFor, type WeightUnit } from '@/lib/units'
import {
  AppBar,
  Card,
  Chip,
  cn,
  Divider,
  Icon,
  IconButton,
  Screen,
  Skeleton,
  Tappable,
  Text,
} from '@/ui'

type WeekMetric = 'workouts' | 'duration' | 'volume' | 'sets'
const WEEK_METRICS: readonly WeekMetric[] = ['workouts', 'duration', 'volume', 'sets']
const WEEK_KEY = {
  workouts: 'workouts:stats.metric.workouts',
  duration: 'workouts:stats.metric.duration',
  volume: 'workouts:stats.metric.volume',
  sets: 'workouts:stats.metric.sets',
} as const satisfies Record<WeekMetric, string>

/**
 * Progress: twelve weeks of training as bars, the month as a calendar, where
 * the last thirty days of sets went by muscle, and every personal best.
 */
export default function WorkoutStatsScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const goBack = useBack('/workouts')
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const weeks = useWorkoutWeeks(12)
  const [metric, setMetric] = useState<WeekMetric>('workouts')

  return (
    <Screen
      header={
        <AppBar
          title={t('workouts:stats.title')}
          onBack={goBack}
          backLabel={t('common:action.back')}
        />
      }
    >
      <Card title={t('workouts:stats.weeks')} contentClassName="gap-4">
        <View className="flex-row flex-wrap gap-2">
          {WEEK_METRICS.map((value) => (
            <Chip key={value} selected={metric === value} onPress={() => setMetric(value)}>
              {t(WEEK_KEY[value])}
            </Chip>
          ))}
        </View>
        {weeks.isPending || !weeks.data ? (
          <Skeleton className="h-[160px] w-full" />
        ) : (
          <WeekBars weeks={weeks.data} metric={metric} unit={unit} />
        )}
      </Card>

      <Calendar />
      <Split />
      <Records unit={unit} />
    </Screen>
  )
}

function weekValue(week: WorkoutWeek, metric: WeekMetric): number {
  switch (metric) {
    case 'workouts':
      return week.workouts
    case 'duration':
      return week.durationS
    case 'volume':
      return week.volumeKg
    case 'sets':
      return week.sets
  }
}

function WeekBars({
  weeks,
  metric,
  unit,
}: {
  weeks: readonly WorkoutWeek[]
  metric: WeekMetric
  unit: WeightUnit
}) {
  const { t } = useTranslation(['workouts', 'common', 'progress'])
  const values = weeks.map((week) => weekValue(week, metric))
  const max = Math.max(...values, 1)
  const last = weeks[weeks.length - 1]
  const show = (value: number) =>
    metric === 'duration'
      ? durationText(t, value)
      : metric === 'volume'
        ? `${volume(value, unit)} ${t(UNIT_KEY[unit])}`
        : String(value)

  return (
    <View className="gap-2">
      {/* The figure is the current week's, the bar drawn in full colour. */}
      <View className="gap-0.5">
        <Text variant="overlineSm">{t('progress:weight.thisWeek')}</Text>
        <Text variant="displayMd">{last ? show(weekValue(last, metric)) : '0'}</Text>
      </View>
      <View className="h-[140px] flex-row items-end gap-1.5">
        {weeks.map((week, index) => {
          const value = values[index]
          const current = index === weeks.length - 1
          return (
            <View
              key={week.week}
              className="flex-1 items-center justify-end"
              style={{ height: '100%' }}
            >
              <View
                className={cn(
                  'w-full rounded-t-md',
                  current ? 'bg-pandan' : value > 0 ? 'bg-pandan-soft-line' : 'bg-track',
                )}
                style={{ height: `${Math.max(3, (value / max) * 100)}%` }}
              />
            </View>
          )
        })}
      </View>
      <View className="flex-row justify-between">
        <Text variant="micro">
          {weeks[0] ? format(parseISO(weeks[0].week), datePattern('dayMonth')) : ''}
        </Text>
        <Text variant="micro">
          {last ? format(parseISO(last.week), datePattern('dayMonth')) : ''}
        </Text>
      </View>
    </View>
  )
}

/** The month, with a dot on every day that had a workout. */
function Calendar() {
  const { t } = useTranslation(['workouts', 'logging'])
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const from = dateKey(month)
  const to = dateKey(endOfMonth(month))
  const dates = useWorkoutDates(from, to).data ?? {}
  const days = eachDayOfInterval({ start: month, end: endOfMonth(month) })
  // Monday first, as the weekly streak counts.
  const lead = (getDay(month) + 6) % 7
  const now = today()
  const isCurrent = dateKey(startOfMonth(new Date())) === from

  return (
    <Card
      title={t('workouts:stats.calendar')}
      action={
        <View className="flex-row items-center gap-1">
          <IconButton
            size="sm"
            variant="ghost"
            accessibilityLabel={t('logging:calendar.previousMonth')}
            onPress={() => setMonth(addMonths(month, -1))}
          >
            <Icon set="ui" name="chevron-left" size={18} />
          </IconButton>
          <Text variant="label">{format(month, datePattern('monthYear'))}</Text>
          <IconButton
            size="sm"
            variant="ghost"
            accessibilityLabel={t('logging:calendar.nextMonth')}
            disabled={isCurrent}
            onPress={() => setMonth(addMonths(month, 1))}
          >
            <Icon set="ui" name="chevron-right" size={18} />
          </IconButton>
        </View>
      }
    >
      <View className="flex-row flex-wrap">
        {Array.from({ length: lead }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: blank cells before the first
          <View key={`blank-${index}`} className="w-[14.28%] p-1" />
        ))}
        {days.map((day) => {
          const key = dateKey(day)
          const trained = (dates[key] ?? 0) > 0
          return (
            <View key={key} className="w-[14.28%] items-center p-1">
              <View
                // Not flattened, for the reason a set row is not (`SetRow`):
                // a day whose workouts arrive after it is drawn turned into a
                // green square on Android.
                collapsable={false}
                className={cn(
                  'h-[34px] w-[34px] items-center justify-center rounded-full',
                  trained ? 'bg-pandan' : key === now ? 'border-2 border-pandan' : undefined,
                )}
              >
                <Text
                  className={cn(
                    'font-body-black text-[14px]',
                    trained ? 'text-on-pandan' : 'text-ink',
                  )}
                >
                  {format(day, 'd')}
                </Text>
              </View>
            </View>
          )
        })}
      </View>
    </Card>
  )
}

function Split() {
  const { t } = useTranslation(['workouts'])
  const library = useExerciseLibrary()
  const to = today()
  const from = dateKey(subDays(new Date(), 29))
  const totals = useExerciseTotals(from, to)
  const split = useMemo(
    () => groupSplit(totals.data ?? [], library.byId),
    [totals.data, library.byId],
  )

  return (
    <Card
      title={t('workouts:stats.split')}
      action={<Text variant="caption">{t('workouts:stats.splitRange')}</Text>}
    >
      {totals.isPending ? (
        <Skeleton className="h-[160px] w-full" />
      ) : split.length ? (
        <MuscleSplitBars
          rows={split.map((row) => ({ group: row.group, value: row.sets }))}
          format={(value) => t('workouts:stats.splitSets', { value: trim(value, 1) })}
        />
      ) : (
        <Text variant="meta">{t('workouts:stats.splitEmpty')}</Text>
      )}
    </Card>
  )
}

function Records({ unit }: { unit: WeightUnit }) {
  const { t } = useTranslation(['workouts', 'common'])
  const router = useRouter()
  const library = useExerciseLibrary()
  const bests = useExerciseBests(null)
  const rows = (bests.data ?? []).filter((entry) => entry.workouts > 0)

  return (
    <Card title={t('workouts:stats.records')} contentClassName="gap-0">
      {bests.isPending ? (
        <Skeleton className="h-[160px] w-full" />
      ) : rows.length ? (
        rows.map((entry, index) => {
          const exercise = library.byId(entry.exerciseId)
          // The heaviest set as lifted, "72.5 kg × 8". The estimated 1RM was
          // here first and read as a weight somebody had put on the bar.
          const heaviest =
            entry.bestWeightKg !== null
              ? `${weightField(entry.bestWeightKg, unit)} ${t(UNIT_KEY[unit])}`
              : null
          const best =
            heaviest !== null
              ? entry.bestWeightReps
                ? t('workouts:exercise.weightReps', {
                    weight: heaviest,
                    reps: entry.bestWeightReps,
                  })
                : heaviest
              : entry.bestReps !== null
                ? `× ${entry.bestReps}`
                : entry.bestDurationS
                  ? durationText(t, entry.bestDurationS)
                  : ''
          return (
            <View key={entry.exerciseId}>
              {index > 0 ? <Divider /> : null}
              <Tappable
                className="flex-row items-center gap-3 py-2.5"
                onPress={() =>
                  router.push({
                    pathname: '/workout/exercise/[id]',
                    params: { id: entry.exerciseId },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={entry.name}
              >
                <ExerciseArt
                  exerciseId={entry.exerciseId}
                  category={exercise?.category ?? 'fullBody'}
                  size={44}
                />
                <View className="min-w-0 flex-1">
                  <Text variant="label" numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <Text variant="caption">
                    {t('workouts:exercise.sessions', { count: entry.workouts })}
                  </Text>
                </View>
                <Text variant="label">{best}</Text>
              </Tappable>
            </View>
          )
        })
      ) : (
        <Text variant="meta">{t('workouts:stats.recordsEmpty')}</Text>
      )}
    </Card>
  )
}
