import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  TREND_RANGES,
  type TrendRange,
  useSettings,
  useTrendSeries,
  useTrendSummary,
  useUpdateSettings,
} from '@/data'
import { useRequirePro } from '@/features/paywall'
import {
  CaloriesPanel,
  MetricTabs,
  type TrendMetric,
  unitFor,
  WaterPanel,
  WeighInSheet,
  WeightPanel,
} from '@/features/progress'
import { ScreenTitle } from '@/features/shared'
import { Card, Icon, ListRow, Screen, SegmentedControl, Skeleton } from '@/ui'

/**
 * The Trends tab: calories, water and weight, over seven days, thirty days or a
 * year.
 *
 * Two controls, and they are deliberately different objects. The RANGE is a
 * segmented control beside the title, because it governs the whole screen —
 * including the three figures in the tiles below it. The METRIC is those tiles,
 * because each one is a number as well as a choice, and a number is not
 * something a tab strip can carry.
 *
 * Both queries live here rather than in the panels. One range is one pair of
 * requests whichever tab is showing, so switching tabs is instant and the tile
 * a user just tapped cannot say something different from the panel it opened.
 */
export default function TrendsScreen() {
  const { t } = useTranslation(['progress', 'common', 'reviews'])

  const [range, setRange] = useState<TrendRange>('7d')
  const requirePro = useRequirePro()
  const [metric, setMetric] = useState<TrendMetric>('calories')
  /** Which day the weigh-in sheet is on, and null when it is shut. */
  const [weighingIn, setWeighingIn] = useState<string | null>(null)

  const series = useTrendSeries(range)
  const summary = useTrendSummary(range)
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  const unit = unitFor(settings?.units)

  /**
   * Both queries, or neither.
   *
   * Waiting on the series alone was a visible bug: it is the smaller answer and
   * lands first, so the panel rendered with a null summary — which every panel
   * reads as "nothing logged in this range" and draws as an empty state. The
   * range switch flashed "No meals in this range" before the meals appeared.
   */
  const loading = series.isPending || summary.isPending
  const buckets = series.data

  return (
    <Screen>
      <ScreenTitle
        title={t('progress:title')}
        trailing={
          <SegmentedControl
            options={TREND_RANGES.map((value) => ({
              value,
              label: t(RANGE_KEY[value]),
            }))}
            value={range}
            /**
             * A free account sees the week and nothing else.
             *
             * The control keeps all three segments and refuses the two it
             * cannot serve, rather than hiding them: a hidden option is a
             * feature nobody knows they are missing, and the whole job of a
             * free tier is to show what the paid one is for. Same argument as
             * the gated buttons everywhere else — a greyed-out control tells
             * somebody they cannot do something and gives them nowhere to go.
             *
             * The seven-day range is not an arbitrary slice either: it is the
             * one the app is built around. The strip on Today is a week, the
             * review is a week, and a free user is not being shown a crippled
             * chart — they are being shown the week, and offered the shape only
             * a month or a year can carry.
             */
            onChange={(next) => {
              if (next !== '7d' && !requirePro('trend_range')) return
              setRange(next)
            }}
            accessibilityLabel={t('progress:range.label')}
            // Sized rather than left to grow: the control and the title share a
            // row, and a segmented control that takes what it needs would push
            // "Trends" to an ellipsis on a narrow phone.
            className="w-[152px]"
          />
        }
      />

      {/* The same gate as the panel below. The tiles are the tab control so
          they stay put, but their figures belong to the range being switched
          away from until the new one lands — three numbers that were true a
          moment ago and are not any more. */}
      <MetricTabs
        value={metric}
        onChange={setMetric}
        summary={summary.data}
        loading={loading}
        unit={unit}
      />

      {loading || !buckets ? (
        // One block, not three. The panels differ in how many cards they have,
        // and a skeleton that guesses wrong is a layout that jumps twice.
        <Card>
          <Skeleton className="h-[260px] w-full" />
        </Card>
      ) : metric === 'calories' ? (
        <CaloriesPanel range={range} buckets={buckets} summary={summary.data ?? null} />
      ) : metric === 'water' ? (
        <WaterPanel range={range} buckets={buckets} summary={summary.data ?? null} />
      ) : (
        <WeightPanel
          range={range}
          buckets={buckets}
          summary={summary.data ?? null}
          unit={unit}
          onEdit={setWeighingIn}
        />
      )}

      {/* At the foot rather than beside the title: a review is a place you go
          when you have finished reading this screen, and a control up there
          would compete with the range switch that governs everything under it.

          Always here, and it used to appear only once some period had enough
          logged in it to be worth opening. That made the one route into the
          feature invisible to exactly the person who had not found it yet, and
          it made "where did that row go" a question the app could not answer.
          The list behind it draws every finished week either way. */}
      <Card contentClassName="gap-0 p-card">
        <ListRow
          title={t('reviews:entry.title')}
          subtitle={t('reviews:entry.subtitle')}
          leading={<Icon set="ui" name="calendar-view" size={34} />}
          divider={false}
          onPress={() => router.push('/reviews')}
        />
      </Card>

      <WeighInSheet
        date={weighingIn}
        onClose={() => setWeighingIn(null)}
        unit={unit}
        // The sheet's kg/lb switch is the app's unit preference, not a local
        // display toggle. Flipping it here changes it in Settings too, which is
        // the only behaviour that does not surprise somebody the second time.
        onUnitChange={(next) =>
          updateSettings.mutate({ units: next === 'lb' ? 'imperial' : 'metric' })
        }
      />
    </Screen>
  )
}

/** Copy keys as a map, so renaming one is a compile error rather than a label. */
const RANGE_KEY = {
  '7d': 'progress:range.7d',
  '30d': 'progress:range.30d',
  '1y': 'progress:range.1y',
} as const satisfies Record<TrendRange, string>
