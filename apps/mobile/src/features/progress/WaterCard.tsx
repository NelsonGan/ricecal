import { format, parseISO } from 'date-fns'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'

import type { TrendBucket, TrendRange, TrendSummary } from '@/data'
import { DEFAULT_WATER_ML, volume } from '@/lib/water'
import { Text } from '@/ui'
import { bucketLabels } from './axis'
import { TrendCard, TrendChip } from './TrendCard'
import { TrendLine } from './TrendLine'

export type WaterCardProps = {
  range: TrendRange
  buckets: readonly TrendBucket[] | undefined
  summary: TrendSummary | null | undefined
  loading: boolean
  problem?: 'offline' | 'unreachable' | null
  onRetry?: () => void
}

/**
 * Water: the range's daily average, the line of it from zero, and the goal as
 * the dashed rule. From zero because the question is how close to the goal,
 * and a scale zoomed to the spread makes 1.8 L and 2 L look a page apart.
 *
 * An unlogged day IS zero here, unlike calories, so every column has a dot.
 */
export function WaterCard({ range, buckets, summary, loading, problem, onRetry }: WaterCardProps) {
  const { t } = useTranslation(['progress', 'common'])

  /** "1.8 L" above a litre, "750 ml" below. */
  const amount = (ml: number) => {
    const { value, unit } = volume(ml)
    return t(`common:volume.${unit}`, { value })
  }

  // `||`, not `??`: `water_goal` comes back through `orZero`, and a goal of
  // zero would put the rule on the axis.
  const goal = summary?.waterGoal || DEFAULT_WATER_ML
  const empty = !summary || summary.waterTotal === 0
  const average = empty ? null : volume(summary.water)
  const labels = buckets
    ? bucketLabels(buckets, range, (index) => t('progress:range.week', { index }))
    : []

  return (
    <TrendCard
      heading={{ icon: { set: 'body', name: 'water-drop' }, title: t('progress:metric.water') }}
      onOpen={() => router.push('/history/water')}
      openLabel={t('progress:history.waterTitle')}
      loading={loading || !buckets}
      problem={problem}
      onRetry={onRetry}
      figure={
        average
          ? {
              value: average.value,
              unit: t('progress:water.unit', {
                unit: t(`common:volume.${average.unit}Unit`),
              }),
            }
          : undefined
      }
      chip={
        empty || !summary ? null : (
          <TrendChip
            tone={summary.waterGoalDays > 0 ? 'water' : 'neutral'}
            label={t('progress:water.goalDays', {
              done: summary.waterGoalDays,
              total: summary.days,
            })}
          />
        )
      }
    >
      {empty || !buckets ? (
        <Text variant="meta">{t('progress:water.empty')}</Text>
      ) : (
        <TrendLine
          tone="water"
          gaps="join"
          fromZero
          goal={goal}
          minPad={100}
          points={buckets.map((bucket, index) => ({
            key: bucket.start,
            label: labels[index],
            title: range === '1y' ? format(parseISO(bucket.start), 'LLLL') : undefined,
            value: bucket.water,
          }))}
          formatValue={amount}
          accessibilityLabel={t('progress:water.chart', { amount: amount(goal) })}
        />
      )}
    </TrendCard>
  )
}
