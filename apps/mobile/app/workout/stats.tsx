import { format, parseISO, subDays } from 'date-fns'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  dateKey,
  today,
  useEntitlement,
  useExerciseBests,
  useExerciseTotals,
  useSettings,
  useWorkoutMonths,
  useWorkoutOverview,
  useWorkoutWeeks,
  type WorkoutWeek,
} from '@/data'
import { useRequirePro } from '@/features/paywall'
import { BarChart } from '@/features/shared'
import {
  type Bucket,
  compactVolume,
  durationText,
  ExerciseArt,
  FREE_WEEKS,
  groupSplit,
  KG_PER_LB,
  MuscleSplitBars,
  NOT_LOADED,
  OverviewCard,
  PROGRESS_RANGE_KEY,
  PROGRESS_RANGES,
  type ProgressRange,
  periodsFor,
  useExerciseLibrary,
  volumeText,
  WorkoutCalendar,
  weightText,
} from '@/features/workouts'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { unitFor, type WeightUnit } from '@/lib/units'
import {
  AppBar,
  Badge,
  Button,
  Card,
  cn,
  Divided,
  Icon,
  Screen,
  SegmentedControl,
  Sheet,
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
 * Progress: the week so far, training as bars over three months to all time,
 * the month as a calendar, where the last thirty days of sets went by muscle,
 * and every personal best.
 */
export default function WorkoutStatsScreen() {
  const { t } = useTranslation(['workouts', 'common'])
  const goBack = useBack('/workouts')
  const { data: settings } = useSettings()
  const unit = unitFor(settings?.units)
  const overview = useWorkoutOverview()

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
      <OverviewCard
        overview={overview.data}
        unit={unit}
        loading={overview.isPending && !overview.isPaused}
      />
      <Totals unit={unit} />
      <WorkoutCalendar />
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
  return <Text variant="meta">{t(NOT_LOADED[offline ? 'offline' : 'unreachable'].title)}</Text>
}

function Totals({ unit }: { unit: WeightUnit }) {
  const { t } = useTranslation(['workouts', 'common'])
  const [metric, setMetric] = useState<WeekMetric>('workouts')
  const [range, setRange] = useState<ProgressRange>('3m')
  // A Pro range on an account that lapsed while the page was open falls back
  // to the free one rather than keeping a year it no longer pays for.
  const { entitled } = useEntitlement()
  const shownRange = entitled ? range : '3m'
  const weeks = useWorkoutWeeks(FREE_WEEKS)
  const months = useWorkoutMonths(shownRange !== '3m')
  const query = shownRange === '3m' ? weeks : months
  const periods = useMemo(
    () => (query.data ? periodsFor(shownRange, query.data) : null),
    [shownRange, query.data],
  )

  return (
    <Card
      title={t('workouts:stats.weeks')}
      action={<RangePicker value={shownRange} onChange={setRange} />}
      contentClassName="gap-4"
    >
      {/* One row whatever the language: four chips wrapped "Sets" onto a
          line of its own. */}
      <SegmentedControl
        options={WEEK_METRICS.map((value) => ({ value, label: t(WEEK_KEY[value]) }))}
        value={metric}
        onChange={setMetric}
        accessibilityLabel={t('workouts:stats.weeks')}
      />
      {periods ? (
        <PeriodBars
          // A new range is a new set of bars, and a bar tapped in the old one
          // would name a different period in the new.
          key={`${shownRange}-${periods.bucket}`}
          periods={periods.rows}
          bucket={periods.bucket}
          metric={metric}
          unit={unit}
        />
      ) : query.isPending && !query.isPaused ? (
        <Skeleton className="h-[160px] w-full" />
      ) : (
        <Unavailable offline={query.isPaused} />
      )}
    </Card>
  )
}

/**
 * The range as a pill opposite the card's title, which opens the three in a
 * sheet. Year and All time stay listed for a free account, marked Pro, and
 * refuse with the paywall, as Trends does with its ranges: a hidden option is
 * a feature nobody knows they are missing.
 */
function RangePicker({
  value,
  onChange,
}: {
  value: ProgressRange
  onChange: (range: ProgressRange) => void
}) {
  const { t } = useTranslation(['workouts', 'common', 'paywall'])
  const [open, setOpen] = useState(false)
  const { entitled } = useEntitlement()
  // The sheet is a native modal, so the paywall would open behind it.
  const requirePro = useRequirePro({ beforePaywall: () => setOpen(false) })

  return (
    <>
      <Tappable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-1 rounded-full bg-surface-alt py-1.5 pl-3 pr-2"
        accessibilityRole="button"
        accessibilityLabel={t('workouts:stats.range.label')}
        accessibilityValue={{ text: t(PROGRESS_RANGE_KEY[value]) }}
      >
        <Text variant="label">{t(PROGRESS_RANGE_KEY[value])}</Text>
        <Icon set="ui" name="chevron-down" size={16} />
      </Tappable>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('workouts:stats.range.label')}
        closeLabel={t('common:action.close')}
      >
        <View>
          {PROGRESS_RANGES.map((range, index) => {
            const selected = range === value
            const locked = range !== '3m' && !entitled
            return (
              <Tappable
                key={range}
                onPress={() => {
                  if (range !== '3m' && !requirePro('workout_range')) return
                  onChange(range)
                  setOpen(false)
                }}
                className={cn(
                  'min-h-sm flex-row items-center gap-3 py-4',
                  index > 0 && 'border-t-2 border-track',
                )}
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
              >
                <Text
                  variant="bodyStrong"
                  className={cn('flex-1', selected ? 'text-pandan-ink' : 'font-body-bold')}
                >
                  {t(PROGRESS_RANGE_KEY[range])}
                </Text>
                {locked ? (
                  <Badge tone="kaya" size="sm">
                    {t('paywall:table.pro')}
                  </Badge>
                ) : null}
                {selected ? <Icon set="ui" name="check" size={22} /> : null}
              </Tappable>
            )
          })}
        </View>
      </Sheet>
    </>
  )
}

function periodValue(period: WorkoutWeek, metric: WeekMetric): number {
  switch (metric) {
    case 'workouts':
      return period.workouts
    case 'duration':
      return period.durationS
    case 'volume':
      return period.volumeKg
    case 'sets':
      return period.sets
  }
}

function PeriodBars({
  periods,
  bucket,
  metric,
  unit,
}: {
  periods: readonly WorkoutWeek[]
  bucket: Bucket
  metric: WeekMetric
  unit: WeightUnit
}) {
  const { t } = useTranslation(['workouts', 'common', 'progress'])
  const last = periods[periods.length - 1]
  // A tapped bar takes over the headline, named by its period; nothing tapped
  // is the current one.
  const [selected, setSelected] = useState<number | null>(null)
  const shown = selected === null ? last : periods[selected]
  const show = (value: number) =>
    metric === 'duration'
      ? durationText(t, value)
      : metric === 'volume'
        ? volumeText(t, value, unit)
        : String(value)
  const name = (period: WorkoutWeek) =>
    format(
      parseISO(period.week),
      bucket === 'week'
        ? datePattern('dayMonth')
        : bucket === 'month'
          ? datePattern('monthYear')
          : 'yyyy',
    )
  const current =
    bucket === 'week'
      ? t('progress:weight.thisWeek')
      : bucket === 'month'
        ? t('workouts:stats.thisMonth')
        : t('workouts:stats.thisYear')

  // The scale's steps in a unit a person counts in: hours once the tallest
  // bar is an hour and a half, minutes below that, and whole pounds or
  // kilograms.
  const peak = Math.max(0, ...periods.map((period) => periodValue(period, metric)))
  const axis =
    metric === 'duration'
      ? peak >= 5400
        ? { unit: 3600, format: (s: number) => t('workouts:duration.hours', { hours: s / 3600 }) }
        : { unit: 60, format: (s: number) => t('workouts:duration.minutes', { minutes: s / 60 }) }
      : metric === 'volume'
        ? {
            unit: unit === 'lb' ? KG_PER_LB : 1,
            format: (kg: number) => compactVolume(kg, unit),
          }
        : { format: (value: number) => String(value) }

  return (
    <View className="gap-2">
      {/* The figure is the period drawn in full colour: this one, or the one tapped. */}
      <View className="gap-0.5">
        <Text variant="overlineSm">{selected === null || !shown ? current : name(shown)}</Text>
        <Text variant="displayMd">{shown ? show(periodValue(shown, metric)) : '0'}</Text>
      </View>
      <BarChart
        height={140}
        others="soft"
        selected={selected}
        onSelect={setSelected}
        axis={axis}
        bars={periods.map((period, index) => ({
          key: period.week,
          value: periodValue(period, metric),
          highlight: index === periods.length - 1,
          a11yLabel: `${name(period)}, ${show(periodValue(period, metric))}`,
        }))}
      />
      <View className="flex-row justify-between">
        <Text variant="micro">{periods[0] ? name(periods[0]) : ''}</Text>
        <Text variant="micro">{last ? name(last) : ''}</Text>
      </View>
    </View>
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
        <MuscleSplitBars rows={split} />
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
  const rows = bests.data ?? []
  // Ten at a time, as an exercise's history is: a few years of training is a
  // hundred exercises, each a picture, drawn at once.
  const [shown, setShown] = useState(10)

  return (
    <Card title={t('workouts:stats.records')} contentClassName="gap-0">
      {bests.isPending && !bests.isPaused ? (
        <Skeleton className="h-[160px] w-full" />
      ) : !bests.data && (bests.isPaused || bests.isError) ? (
        <Unavailable offline={bests.isPaused} />
      ) : rows.length ? (
        <Divided>
          {rows.slice(0, shown).map((entry) => {
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
              <Tappable
                key={entry.exerciseId}
                className="flex-row items-center gap-3 py-2.5"
                onPress={() =>
                  router.push({
                    pathname: '/workout/exercise/[id]',
                    params: { id: entry.exerciseId },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={best ? `${entry.name}, ${best}` : entry.name}
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
            )
          })}
        </Divided>
      ) : (
        <Text variant="meta">{t('workouts:history.emptyTitle')}</Text>
      )}
      {rows.length > shown ? (
        <Button variant="ghost" fullWidth onPress={() => setShown((count) => count + 10)}>
          {t('workouts:history.more')}
        </Button>
      ) : null}
    </Card>
  )
}
