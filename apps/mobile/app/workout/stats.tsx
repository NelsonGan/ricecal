import { addMonths, format, parseISO, subDays } from 'date-fns'
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
import { monthEnd, monthStart, monthWeeks, weekdayColumns } from '@/features/logging/month'
import { BarChart } from '@/features/shared'
import {
  durationText,
  ExerciseArt,
  groupSplit,
  MuscleSplitBars,
  useExerciseLibrary,
  volumeText,
  weightText,
} from '@/features/workouts'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { unitFor, type WeightUnit } from '@/lib/units'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Card,
  cn,
  Divider,
  Icon,
  IconButton,
  Screen,
  SegmentedControl,
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
        {/* One row whatever the language: four chips wrapped "Sets" onto a
            line of its own. */}
        <SegmentedControl
          options={WEEK_METRICS.map((value) => ({ value, label: t(WEEK_KEY[value]) }))}
          value={metric}
          onChange={setMetric}
          accessibilityLabel={t('workouts:stats.weeks')}
        />
        {weeks.data ? (
          <WeekBars weeks={weeks.data} metric={metric} unit={unit} />
        ) : weeks.isPending && !weeks.isPaused ? (
          <Skeleton className="h-[160px] w-full" />
        ) : (
          <Unavailable offline={weeks.isPaused} />
        )}
      </Card>

      <Calendar />
      <Split />
      <Records unit={unit} />
    </Screen>
  )
}

/**
 * A card whose numbers did not come: offline with nothing cached, where the
 * request is held and a skeleton would wait forever, or a request that failed.
 */
function Unavailable({ offline }: { offline: boolean }) {
  const { t } = useTranslation(['common'])
  return (
    <Text variant="meta">
      {offline ? t('common:offline.title') : t('common:offline.unreachableTitle')}
    </Text>
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
  const last = weeks[weeks.length - 1]
  // A tapped week takes over the headline, named by its Monday; nothing
  // tapped is this week.
  const [selected, setSelected] = useState<number | null>(null)
  const shown = selected === null ? last : weeks[selected]
  const show = (value: number) =>
    metric === 'duration'
      ? durationText(t, value)
      : metric === 'volume'
        ? volumeText(t, value, unit)
        : String(value)

  return (
    <View className="gap-2">
      {/* The figure is the week drawn in full colour: this one, or the one tapped. */}
      <View className="gap-0.5">
        <Text variant="overlineSm">
          {selected === null || !shown
            ? t('progress:weight.thisWeek')
            : format(parseISO(shown.week), datePattern('dayMonth'))}
        </Text>
        <Text variant="displayMd">{shown ? show(weekValue(shown, metric)) : '0'}</Text>
      </View>
      <BarChart
        height={140}
        others="soft"
        selected={selected}
        onSelect={setSelected}
        bars={weeks.map((week, index) => ({
          key: week.week,
          value: weekValue(week, metric),
          highlight: index === weeks.length - 1,
          a11yLabel: `${format(parseISO(week.week), datePattern('dayMonth'))}, ${show(weekValue(week, metric))}`,
        }))}
      />
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

/**
 * The month, with every day that had a workout filled in. Laid out like the
 * diary's month (`features/logging/MonthCalendar.tsx`): the same weekday row,
 * the same muted chevrons either side of the month, and a row per week. Only
 * the paging differs: workouts go back further than the diary's twelve months.
 */
function Calendar() {
  const { t } = useTranslation(['workouts', 'logging'])
  const colors = useThemeColors()
  const now = today()
  const [month, setMonth] = useState(() => monthStart(now))
  const to = monthEnd(month)
  const dates = useWorkoutDates(month, to).data ?? {}
  const weeks = useMemo(() => monthWeeks(month), [month])
  const columns = weekdayColumns((date) => format(date, 'EEEEE'))
  const isCurrent = month >= monthStart(now)
  const step = (by: -1 | 1) => setMonth(dateKey(addMonths(parseISO(month), by)))

  return (
    <Card title={t('workouts:stats.calendar')} contentClassName="gap-3">
      <View className="flex-row items-center justify-between">
        <IconButton
          size="sm"
          onPress={() => step(-1)}
          accessibilityLabel={t('logging:calendar.previousMonth')}
        >
          <Icon set="ui" name="chevron-left" size={18} tintColor={colors.muted} />
        </IconButton>
        <Text variant="subtitle" className="min-w-0 flex-1 text-center">
          {format(parseISO(month), datePattern('monthYear'))}
        </Text>
        <IconButton
          size="sm"
          onPress={isCurrent ? undefined : () => step(1)}
          disabled={isCurrent}
          accessibilityLabel={t('logging:calendar.nextMonth')}
        >
          <Icon set="ui" name="chevron-right" size={18} tintColor={colors.muted} />
        </IconButton>
      </View>

      <View className="flex-row">
        {columns.map((column) => (
          <Text
            key={column.key}
            variant="micro"
            className="flex-1 text-center"
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {column.label}
          </Text>
        ))}
      </View>

      <View className="gap-1">
        {weeks.map((week) => (
          <View key={week.find(Boolean) ?? week.join()} className="flex-row">
            {week.map((key, index) => {
              if (!key) {
                // biome-ignore lint/suspicious/noArrayIndexKey: blank cells hold a place, not a day
                return <View key={`blank-${index}`} className="flex-1" />
              }
              const trained = (dates[key] ?? 0) > 0
              const day = format(parseISO(key), datePattern('weekdayDayMonthLong'))
              return (
                <View
                  key={key}
                  className="flex-1 items-center"
                  // Said, not only coloured: a filled day is a trained one.
                  accessible
                  accessibilityLabel={trained ? t('workouts:stats.dayTrained', { day }) : day}
                >
                  <View
                    // Not flattened, for the reason a set row is not (`SetRow`):
                    // a day whose workouts arrive after it is drawn turned into
                    // a green square on Android.
                    collapsable={false}
                    className={cn(
                      'h-[34px] w-[34px] items-center justify-center rounded-full',
                      trained ? 'bg-pandan' : key === now ? 'border-2 border-pandan' : undefined,
                    )}
                  >
                    <Text
                      className={cn(
                        'font-body-black text-[14px]',
                        trained ? 'text-on-pandan' : key > now ? 'text-faint' : 'text-ink',
                      )}
                    >
                      {format(parseISO(key), 'd')}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        ))}
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
      {totals.isPending && !totals.isPaused ? (
        <Skeleton className="h-[160px] w-full" />
      ) : !totals.data && (totals.isPaused || totals.isError) ? (
        <Unavailable offline={totals.isPaused} />
      ) : split.length ? (
        <MuscleSplitBars rows={split.map((row) => ({ group: row.group, value: row.sets }))} />
      ) : (
        <Text variant="meta">{t('workouts:history.emptyTitle')}</Text>
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
      {bests.isPending && !bests.isPaused ? (
        <Skeleton className="h-[160px] w-full" />
      ) : !bests.data && (bests.isPaused || bests.isError) ? (
        <Unavailable offline={bests.isPaused} />
      ) : rows.length ? (
        rows.map((entry, index) => {
          const exercise = library.byId(entry.exerciseId)
          // The heaviest set as lifted, "72.5 kg × 8". The estimated 1RM was
          // here first and read as a weight somebody had put on the bar.
          const heaviest =
            entry.bestWeightKg !== null ? weightText(t, entry.bestWeightKg, unit) : null
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
                  category={exercise?.category}
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
        <Text variant="meta">{t('workouts:history.emptyTitle')}</Text>
      )}
    </Card>
  )
}
