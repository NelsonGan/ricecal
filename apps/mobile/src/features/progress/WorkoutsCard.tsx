import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  TREND_GRAIN,
  type TrendRange,
  useLatestWorkouts,
  useTrendWorkoutSummary,
  useTrendWorkouts,
  type WorkoutSummary,
} from '@/data'
// The two helpers, not the feature's index: that one starts the workout
// notifications as it loads, which every screen importing Trends would pay for.
import { durationText } from '@/features/workouts/format'
import { compactVolume } from '@/features/workouts/progress'
import { UNIT_KEY, type WeightUnit } from '@/lib/units'
import { Card, Icon, ListRow, Text } from '@/ui'
import { pointNames, SPAN_KEY } from './axis'
import { useDayName } from './History'
import { problemOf, TrendCard, TrendChip } from './TrendCard'
import { TrendLine } from './TrendLine'

/** Rows under the line. Enough to see the routine, few enough to stay a glance. */
const LATEST = 3

/**
 * The period a range is compared with. A map, so renaming a key is a compile
 * error rather than a label.
 */
const VERSUS_KEY = {
  '7d': 'progress:workouts.vs7d',
  '30d': 'progress:workouts.vs30d',
  '1y': 'progress:workouts.vs1y',
} as const satisfies Record<TrendRange, string>

/**
 * Training on the Trends screen: how many workouts, against the period before,
 * the minutes trained a day across the range, and the newest sessions.
 *
 * Time rather than a count for the line: it carries both how often and how
 * long, and on the week view a count is a row of noughts and ones. The count
 * is the headline instead, beside the period before, because "more than last
 * month" is the question a training habit asks.
 *
 * Its own queries, not the screen's: the columns are `trend_workouts`', the
 * same as the diary's, and a meal logged should not refetch them.
 */
export function WorkoutsCard({ range, unit }: { range: TrendRange; unit: WeightUnit }) {
  const { t } = useTranslation(['progress', 'common'])
  // `durationText` takes the workouts bundle's own translator.
  const { t: tw } = useTranslation(['workouts', 'common'])
  const series = useTrendWorkouts(range)
  const summary = useTrendWorkoutSummary(range)
  const history = useLatestWorkouts(LATEST)
  const latest = history.data ?? []

  const loading = series.isPending || summary.isPending
  const totals = summary.data
  const neverTrained =
    !loading &&
    history.isSuccess &&
    latest.length === 0 &&
    (totals?.workouts ?? 0) === 0 &&
    (totals?.prevWorkouts ?? 0) === 0

  // Somebody who only tracks food sees one line here, not an empty chart.
  if (neverTrained) return <StartCard />

  const delta = totals ? totals.workouts - totals.prevWorkouts : 0
  const buckets = series.data
  /**
   * Minutes trained a day in each column, not the column's total. The weeks of
   * a year are not the same length: the oldest is however many days the
   * twelfth month back has left, and a total drew it as a slump.
   */
  const perDay = (bucket: { durationS: number; days: number }) =>
    Math.round(bucket.durationS / 60 / Math.max(1, bucket.days))
  const peakMinutes = Math.max(0, ...(buckets ?? []).map(perDay))
  const names = buckets
    ? pointNames(buckets, range, (from, to) => t('progress:range.between', { from, to }))
    : []

  return (
    <TrendCard
      heading={{ icon: { set: 'body', name: 'dumbbell' }, title: t('progress:workouts.title') }}
      onOpen={() => router.push('/workout/stats')}
      openLabel={tw('workouts:stats.title')}
      loading={loading}
      problem={problemOf([series, summary])}
      onRetry={() => {
        void series.refetch()
        void summary.refetch()
      }}
      figure={
        totals
          ? {
              value: totals.workouts.toLocaleString(),
              unit: t('progress:workouts.unit', { count: totals.workouts }),
            }
          : undefined
      }
      chip={
        !totals || delta === 0 ? null : (
          <TrendChip
            tone={delta > 0 ? 'pandan' : 'neutral'}
            direction={delta > 0 ? 'up' : 'down'}
            label={t(VERSUS_KEY[range], {
              // A true minus, as `showChange` prints beside it on the weight card.
              delta: delta > 0 ? `+${delta}` : `\u2212${Math.abs(delta)}`,
            })}
          />
        )
      }
    >
      {buckets ? (
        <TrendLine
          tone="hibiscus"
          fromZero
          minPad={15}
          points={buckets.map((bucket, index) => ({
            key: bucket.start,
            ...names[index],
            value: perDay(bucket),
          }))}
          // A day is its own figure; a week is an average of its days.
          formatValue={(minutes) =>
            TREND_GRAIN[range] === 'day'
              ? durationText(tw, minutes * 60)
              : t('progress:workouts.perDay', { value: durationText(tw, minutes * 60) })
          }
          // Past two hours the rules land on round hours, "4 h" rather than
          // "4 h 10 min", which is what fits beside the line.
          unitFactor={peakMinutes >= 120 ? 1 / 60 : 1}
          formatTick={(minutes) =>
            peakMinutes >= 120
              ? tw('workouts:duration.hours', { hours: Math.round((minutes / 60) * 10) / 10 })
              : tw('workouts:duration.minutes', { minutes: Math.round(minutes) })
          }
          accessibilityLabel={t('progress:workouts.chart', { span: t(SPAN_KEY[range]) })}
        />
      ) : null}

      {latest.length ? (
        <View className="gap-0 pt-2">
          <Text variant="overlineSm" className="pb-1">
            {t('progress:workouts.latest')}
          </Text>
          {latest.map((workout, index) => (
            <LatestRow
              key={workout.id}
              workout={workout}
              unit={unit}
              divider={index < latest.length - 1}
            />
          ))}
        </View>
      ) : null}
    </TrendCard>
  )
}

function LatestRow({
  workout,
  unit,
  divider,
}: {
  workout: WorkoutSummary
  unit: WeightUnit
  divider: boolean
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const dayName = useDayName()

  return (
    <ListRow
      title={workout.name}
      subtitle={`${dayName(workout.date)} · ${durationText(t, workout.durationS)}`}
      divider={divider}
      className="py-2"
      // The figures are read-only, and the chevron is what says the row opens.
      chevron
      onPress={() => router.push({ pathname: '/workout/[id]', params: { id: workout.id } })}
      trailing={
        <View className="flex-row items-center gap-2">
          {workout.prCount > 0 ? (
            <View className="flex-row items-center gap-0.5">
              <Icon set="system" name="trophy" size={15} />
              <Text variant="caption" className="text-kaya-ink">
                {workout.prCount}
              </Text>
            </View>
          ) : null}
          {workout.volumeKg > 0 ? (
            <Text variant="label" className="text-muted">
              {`${compactVolume(workout.volumeKg, unit)} ${t(UNIT_KEY[unit])}`}
            </Text>
          ) : null}
        </View>
      }
    />
  )
}

/**
 * The whole card for somebody who has never logged a workout: one row to
 * start, built as the Reviews row at the foot of Trends is.
 */
function StartCard() {
  const { t } = useTranslation(['progress'])

  return (
    <Card contentClassName="gap-0 px-5 py-1">
      <ListRow
        title={t('progress:workouts.startTitle')}
        subtitle={t('progress:workouts.startBody')}
        leading={<Icon set="body" name="dumbbell" size={28} />}
        divider={false}
        className="py-1.5"
        onPress={() => router.push('/workouts')}
      />
    </Card>
  )
}
