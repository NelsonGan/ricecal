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
import { Card, Screen, SegmentedControl, Skeleton } from '@/ui'

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
 *
 * This replaces a screen that was weight and only weight — a `WeightPanel` under
 * a title, with the chart, the BMI band and the history list all on one scroll.
 * Everything that screen did is still here, on the weight tab, and the two
 * things it did that the design drops went with it: the BMI band (context that
 * nobody asked this screen for) and the full-width "Log weigh in" button (which
 * is the Add pill on the readings card now, next to the list where you notice a
 * reading is missing).
 */
export default function TrendsScreen() {
  const { t } = useTranslation(['progress', 'common'])

  const [range, setRange] = useState<TrendRange>('7d')
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
            onChange={setRange}
            accessibilityLabel={t('progress:range.label')}
            // Sized rather than left to grow: the control and the title share a
            // row, and a segmented control that takes what it needs would push
            // "Trends" to an ellipsis on a narrow phone.
            className="w-[152px]"
          />
        }
      />

      <MetricTabs value={metric} onChange={setMetric} summary={summary.data} unit={unit} />

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
