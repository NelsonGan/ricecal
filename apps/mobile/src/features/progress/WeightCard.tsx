import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { bodyFrom, type TrendBucket, type TrendRange, type TrendSummary, useProfile } from '@/data'
import { goalDate } from '@/lib/nutrition'
import { fromKg, showWeight, UNIT_KEY, type WeightUnit } from '@/lib/units'
import { radius } from '@/theme/tokens'
import { Icon, Squish, Text } from '@/ui'
import { bucketLabels, SPAN_KEY } from './axis'
import { TrendCard, TrendChip } from './TrendCard'
import { TrendLine } from './TrendLine'

export type WeightCardProps = {
  range: TrendRange
  buckets: readonly TrendBucket[] | undefined
  summary: TrendSummary | null | undefined
  loading: boolean
  problem?: 'offline' | 'unreachable' | null
  onRetry?: () => void
  unit: WeightUnit
  /** Opens the weigh-in sheet on today. The sheet itself is the screen's. */
  onAdd: () => void
}

/**
 * Weight: the newest reading, how far it moved over the range, the line, and
 * the distance to the target.
 *
 * The line holds its gaps rather than spanning them (see `TrendLine`), and the
 * target is the dashed rule, so "am I heading for it" is one glance. A range
 * with no reading still has a weight: the newest one before it. Weighing every
 * few weeks is normal, and an empty card over last month's reading read as lost.
 */
export function WeightCard({
  range,
  buckets,
  summary,
  loading,
  problem,
  onRetry,
  unit,
  onAdd,
}: WeightCardProps) {
  const { t } = useTranslation(['progress', 'common'])
  const { data: profile } = useProfile()
  const unitLabel = t(UNIT_KEY[unit])

  const current = summary?.weightLast ?? summary?.weightBefore ?? null
  /** Signed, oldest to newest. Null with a single reading: one point is not a trend. */
  const change =
    summary && summary.weightFirst !== null && current !== null && summary.weighIns > 1
      ? current - summary.weightFirst
      : null

  const target = Number(profile?.target_weight_kg ?? 0) || null
  const body = bodyFrom(profile, current ?? undefined)
  const reachedOn = body && target ? goalDate(body, target, new Date()) : null
  const remaining = target !== null && current !== null ? Math.abs(current - target) : null
  // The target joins the scale only when it is near the readings. A goal ten
  // kilograms off flattens a month's real movement into a level line.
  const readings = (buckets ?? [])
    .map((bucket) => bucket.weight)
    .filter((value): value is number => value !== null)
  const reach = readings.length ? Math.max(Math.max(...readings) - Math.min(...readings), 1) : 0
  const goalLine =
    target !== null &&
    readings.length > 0 &&
    target >= Math.min(...readings) - reach &&
    target <= Math.max(...readings) + reach
      ? target
      : null
  const labels = buckets
    ? bucketLabels(buckets, range, (index) => t('progress:range.week', { index }))
    : []

  return (
    <TrendCard
      icon={{ set: 'body', name: 'weighing-scale' }}
      title={t('progress:metric.weight')}
      onOpen={() => router.push({ pathname: '/history', params: { metric: 'weight' } })}
      action={<WeighInPill onPress={onAdd} />}
      loading={loading || !buckets}
      problem={problem}
      onRetry={onRetry}
      figure={current === null ? undefined : { value: showWeight(current, unit), unit: unitLabel }}
      chip={
        // Under what one decimal can show, there is no change to name.
        change === null || Math.abs(change) < 0.05 ? null : (
          <TrendChip
            tone={change < 0 ? 'pandan' : 'kaya'}
            direction={change < 0 ? 'down' : 'up'}
            label={t('progress:weight.change', {
              value: showWeight(Math.abs(change), unit),
              unit: unitLabel,
            })}
          />
        )
      }
    >
      {current === null || !buckets || !summary ? (
        <Text variant="meta">{t('progress:weight.empty')}</Text>
      ) : (
        <>
          {/* With no reading in the range the line would be one held value
              with nothing on it; the figure above already says the weight. */}
          {summary.weighIns === 0 ? null : (
            <TrendLine
              tone="teh"
              goal={goalLine}
              points={buckets.map((bucket, index) => ({
                key: bucket.start,
                label: labels[index],
                title: range === '1y' ? format(parseISO(bucket.start), 'LLLL') : undefined,
                value: bucket.weight,
              }))}
              carryFrom={summary.weightBefore}
              formatValue={(value) => `${showWeight(value, unit)} ${unitLabel}`}
              unitFactor={fromKg(1, unit)}
              accessibilityLabel={t('progress:weight.chart', { span: t(SPAN_KEY[range]) })}
            />
          )}

          {remaining === null || target === null ? null : (
            <View className="flex-row items-center gap-2 border-track border-t-2 pt-3">
              <Icon set="body" name="target" size={20} />
              <Text variant="label" className="min-w-0 flex-1" numberOfLines={2}>
                {remaining < 0.1
                  ? t('progress:weight.atGoal')
                  : t('progress:weight.toGoal', {
                      value: showWeight(remaining, unit),
                      target: showWeight(target, unit),
                      unit: unitLabel,
                    })}
              </Text>
              {reachedOn && remaining >= 0.1 ? (
                <Text variant="caption">
                  {t('progress:weight.weeksAway', {
                    count: Math.max(
                      1,
                      Math.ceil(differenceInCalendarDays(reachedOn, new Date()) / 7),
                    ),
                  })}
                </Text>
              ) : null}
            </View>
          )}
        </>
      )}
    </TrendCard>
  )
}

/**
 * The way to add a reading, on the card's heading where somebody notices one
 * is missing. A pill rather than a full-width button under the card.
 */
export function WeighInPill({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('progress')

  return (
    <Squish
      depth={0}
      radius={radius.full}
      slabClassName="bg-transparent"
      className="min-h-sm flex-row items-center gap-1.5 bg-track px-3"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('weight.sheetTitle')}
    >
      <Icon set="ui" name="plus" size={15} />
      {/* `label` rather than the display face at 15px. Baloo carries ascender
          space this string does not use, so centring the two boxes left the
          word sitting visibly below the icon beside it. */}
      <Text variant="label" className="text-pandan-ink">
        {t('weight.add')}
      </Text>
    </Squish>
  )
}
