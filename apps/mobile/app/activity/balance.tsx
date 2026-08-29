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
 * Energy balance: in against out, then where the out came from.
 *
 * The honesty of this screen is the `balanceDays` line. A daily balance needs
 * food logged and a resting figure from the store, and plenty of days have one
 * and not the other: a day with a watch and no breakfast logged is not a 2,000
 * calorie deficit. `activity_summary` counts the days that had both, this screen
 * prints that count, and the footnote says so when it is a minority.
 *
 * Health Connect frequently reports no resting energy at all, in which case there
 * is no balance to draw and the card says which half is missing.
 */
export default function BalanceScreen() {
  const { t } = useTranslation(['activity', 'progress', 'common'])
  const goBack = useBack('/(tabs)/activity')

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
   * The three-way split, as range totals. As three daily figures they were not
   * comparable with each other, which is the one thing a split has to be: resting
   * used an average over the days that have a resting figure, while workouts and
   * walking were range totals divided by every day. With one day of watch data in
   * seven that reads "Resting 1,580, Walking 104" for a day whose real walking
   * was 437.
   *
   * Totals fix it, because all three are sums from the same function over the
   * same window and `walking` is active energy minus sessions, so they add up to
   * the range's whole burn by construction.
   *
   * Which makes the heading load-bearing: a total is only readable next to the
   * window it is a total of, and `SPLIT_KEY` puts the range in it.
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
        // that matches how the user got here. The longer form was kept as a
        // spare string for a card heading it never reached, and has been
        // deleted rather than left looking like it was in use somewhere.
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
        <Card title={t(SPLIT_KEY[range])}>
          <SplitBar parts={parts} accessibilityLabel={t(SPLIT_KEY[range])} />
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

/**
 * The split card's heading, per range.
 *
 * A map rather than an assembled `activity:balance.splitTitle${range}` — see
 * `PATTERN_KEY` on the steps screen for the same reasoning: an assembled key
 * type-checks and then renders itself after a rename.
 */
const SPLIT_KEY = {
  '7d': 'activity:balance.splitTitle7d',
  '30d': 'activity:balance.splitTitle30d',
  '1y': 'activity:balance.splitTitle1y',
} as const satisfies Record<TrendRange, string>
