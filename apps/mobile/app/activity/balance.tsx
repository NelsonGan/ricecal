import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { TREND_RANGES, type TrendRange, useActivitySeries, useActivitySummary } from '@/data'
import {
  type BalanceBar,
  BalanceBars,
  BalanceLegend,
  count,
  SplitBar,
  type SplitPart,
} from '@/features/activity'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, EmptyState, Screen, SegmentedControl, Skeleton, Text } from '@/ui'

/**
 * A5: energy balance.
 *
 * In against out, then where the out came from.
 *
 * THE HONESTY OF THIS SCREEN IS THE `balanceDays` LINE
 *
 * A daily balance needs both halves: food logged AND a resting figure from the
 * store. Plenty of days have one and not the other, and averaging those in
 * would make the headline a story about missing data — a day with a watch and
 * no breakfast logged is not a 2,000 calorie deficit. `activity_summary` counts
 * the days that had both, this screen prints that count, and when it is a
 * minority of the range the footnote says so out loud.
 *
 * Health Connect frequently reports no resting energy at all, in which case
 * there is no balance to draw and the card says which half is missing rather
 * than showing an empty chart.
 */
export default function BalanceScreen() {
  const { t } = useTranslation(['activity', 'progress', 'common'])
  const goBack = useBack('/activity')

  const [range, setRange] = useState<TrendRange>('7d')
  const series = useActivitySeries(range)
  const summary = useActivitySummary(range)

  const balance = summary.data?.balance ?? null

  const bars: BalanceBar[] = (series.data ?? []).map((bucket, index) => ({
    key: bucket.start,
    label:
      range === '7d'
        ? format(parseISO(bucket.end), 'EEEEE')
        : range === '1y'
          ? format(parseISO(bucket.start), 'LLLLL')
          : t('progress:range.week', { index: index + 1 }),
    eaten: bucket.eaten,
    // Total burn — resting plus active. This is the one chart where resting
    // belongs in the number, because it is being compared with everything that
    // was eaten rather than being added to a budget that already contains it.
    burned: bucket.burn,
  }))

  /**
   * The three-way split, as RANGE TOTALS.
   *
   * This was three daily figures first, and they were not comparable with each
   * other — which is the one thing a split has to be. Resting used
   * `resting_kcal_avg`, an average over the days that HAVE a resting figure,
   * while workouts and walking were range totals divided by every day in the
   * range. With one day of watch data in seven that reads "Resting 1,580,
   * Walking 104" for a day whose real walking was 437, and the bar inherits the
   * skew because its shares come from the same numbers.
   *
   * Totals fix it because all three come from the same function over the same
   * window: `resting_kcal_total`, `session_kcal` and `walking_kcal` are sums,
   * and `walking` is defined as active energy minus sessions, so the three add
   * up to the range's whole burn by construction. The bar is then exactly
   * proportional and the rows are exactly what it is proportional to.
   *
   * The card's heading names the range, so a total is what it reads as.
   */
  const restingTotal = summary.data?.restingKcalTotal ?? 0
  const workoutsTotal = summary.data?.sessionKcal ?? 0
  const walkingTotal = summary.data?.walkingKcal ?? 0
  const burnTotal = restingTotal + workoutsTotal + walkingTotal || 1

  const parts: SplitPart[] = summary.data
    ? [
        {
          key: 'resting',
          label: t('activity:balance.resting'),
          caption: t('activity:balance.restingBody'),
          value: t('activity:balance.kcal', { value: count(restingTotal) }),
          share: restingTotal / burnTotal,
          fill: 'bg-water',
          icon: { set: 'body', name: 'lungs' },
        },
        {
          key: 'workouts',
          label: t('activity:balance.workouts'),
          caption: t('activity:balance.workoutsBody'),
          value: t('activity:balance.kcal', { value: count(workoutsTotal) }),
          share: workoutsTotal / burnTotal,
          fill: 'bg-hibiscus',
          icon: { set: 'body', name: 'running-shoe' },
        },
        {
          key: 'walking',
          label: t('activity:balance.walking'),
          caption: t('activity:balance.walkingBody'),
          value: t('activity:balance.kcal', { value: count(walkingTotal) }),
          share: walkingTotal / burnTotal,
          fill: 'bg-pandan',
          icon: { set: 'body', name: 'footprints' },
        },
      ]
    : []

  const loading = series.isPending || summary.isPending

  return (
    <Screen>
      <AppBar
        // "Balance", not "Energy balance". The bar carries a three-option range
        // control, and the two together do not fit a 393pt phone — one of them
        // ellipsises whatever the split. The row on the Activity tab that opens
        // this screen is called "Balance", so the short form is also the one
        // that matches how the user got here. "Energy balance" survives as the
        // card heading below, where there is room for it.
        title={t('activity:today.balanceRow')}
        onBack={goBack}
        backLabel={t('common:action.back')}
        action={
          <SegmentedControl
            options={TREND_RANGES.map((value) => ({ value, label: t(RANGE_KEY[value]) }))}
            value={range}
            onChange={setRange}
            accessibilityLabel={t('progress:range.label')}
            className="w-[132px]"
          />
        }
      />

      <Card
        title={t('activity:balance.chartTitle')}
        action={
          balance == null ? null : (
            <Text variant="label" className={balance < 0 ? 'text-pandan-ink' : 'text-kaya-ink'}>
              {balance < 0
                ? t('activity:balance.deficit', { value: count(-balance) })
                : balance > 0
                  ? t('activity:balance.surplus', { value: count(balance) })
                  : t('activity:balance.even')}
            </Text>
          )
        }
      >
        {loading ? (
          <Skeleton className="h-[170px] w-full" />
        ) : (
          <View className="gap-3">
            <Text variant="meta">{t('activity:balance.chartBody')}</Text>
            <BalanceBars bars={bars} accessibilityLabel={t('activity:balance.chartTitle')} />
            <BalanceLegend
              eatenLabel={t('activity:balance.eatenLegend')}
              burnedLabel={t('activity:balance.burnedLegend')}
            />
            {summary.data && summary.data.balanceDays < summary.data.days ? (
              <Text variant="meta">
                {t('activity:balance.partial', {
                  days: summary.data.balanceDays,
                  total: summary.data.days,
                })}
              </Text>
            ) : null}
          </View>
        )}
      </Card>

      {loading ? null : summary.data?.restingKcal == null ? (
        // No resting figure means no honest split and no balance. Said in one
        // card rather than left as three zeros and an empty chart.
        <Card tone="kaya">
          <View className="gap-1">
            <Text variant="subtitle" className="text-kaya-ink">
              {t('activity:balance.noRestingTitle')}
            </Text>
            <Text variant="body" className="text-kaya-ink">
              {t('activity:balance.noRestingBody')}
            </Text>
          </View>
        </Card>
      ) : (
        <Card title={t('activity:balance.splitTitle')}>
          <SplitBar parts={parts} accessibilityLabel={t('activity:balance.splitTitle')} />
        </Card>
      )}

      {!loading && summary.data && summary.data.activeDays === 0 ? (
        <EmptyState
          title={t('activity:balance.empty')}
          icon={{ set: 'body', name: 'pulse-wave' }}
        />
      ) : null}
    </Screen>
  )
}

const RANGE_KEY = {
  '7d': 'progress:range.7d',
  '30d': 'progress:range.30d',
  '1y': 'progress:range.1y',
} as const satisfies Record<TrendRange, string>
