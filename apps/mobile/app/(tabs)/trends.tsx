import { router } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  TREND_RANGES,
  type TrendRange,
  today,
  useSettings,
  useTrendSeries,
  useTrendSummary,
  useUpdateSettings,
} from '@/data'
import { useRequirePro } from '@/features/paywall'
import {
  IntakeCard,
  problemOf,
  WaterCard,
  WeighInSheet,
  WeightCard,
  WorkoutsCard,
} from '@/features/progress'
import { ScreenTitle } from '@/features/shared'
import { unitFor } from '@/lib/units'
import { Aside, Card, Icon, ListRow, Screen, SegmentedControl } from '@/ui'

/**
 * The Trends tab: calories, workouts, weight and water over seven days, thirty
 * days or a year, one card each, all on one scroll.
 *
 * One scroll rather than a tab per metric, because the useful questions here
 * cross metrics: did the weeks I trained more eat closer to budget, did the
 * weight move the month the calories did. Every card draws a line on the same
 * columns, so the four can be read down the page against each other.
 *
 * Each card is a figure, a pill that says whether it was good, and a line;
 * its heading opens the entries behind it. The RANGE is the one control and
 * governs the whole screen.
 *
 * The diary's two queries live here rather than in the cards, so the calorie,
 * weight and water cards never disagree about a range. Workouts read their own
 * (see `WorkoutsCard`).
 */
export default function TrendsScreen() {
  const { t } = useTranslation(['progress', 'common', 'reviews'])

  const [range, setRange] = useState<TrendRange>('7d')
  const requirePro = useRequirePro()
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
   * lands first, so a card rendered with a null summary, which reads as
   * "nothing logged in this range". The range switch flashed an empty state
   * before the meals appeared.
   */
  const loading = series.isPending || summary.isPending
  const problem = problemOf([series, summary])
  const cards = {
    range,
    buckets: series.data,
    summary: summary.data,
    loading,
    problem,
    onRetry: () => {
      void series.refetch()
      void summary.refetch()
    },
  }

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
             * A free account sees the week and nothing else. The control keeps
             * all three segments and refuses the two it cannot serve rather than
             * hiding them: a hidden option is a feature nobody knows they are
             * missing, and a greyed-out one gives them nowhere to go.
             */
            onChange={(next) => {
              if (next !== '7d' && !requirePro('trend_range')) return
              setRange(next)
            }}
            accessibilityLabel={t('progress:range.label')}
            // Sized rather than left to grow: the control and title share a
            // row, and a segmented control that takes what it needs would push
            // "Trends" to an ellipsis on a narrow phone.
            className="w-[152px]"
          />
        }
      />

      <IntakeCard {...cards} />
      <WorkoutsCard range={range} unit={unit} />

      {/* With two panes, eating and training are the first, and the body and
          the ways to look further back are the second. See `Aside`. */}
      <Aside>
        <WeightCard {...cards} unit={unit} onAdd={() => setWeighingIn(today())} />
        <WaterCard {...cards} />

        <Card contentClassName="gap-0 px-5 py-1">
          <ListRow
            title={t('reviews:entry.title')}
            subtitle={t('reviews:entry.subtitle')}
            leading={<Icon set="ui" name="calendar-view" size={28} />}
            divider={false}
            className="py-1.5"
            onPress={() => router.push('/reviews')}
          />
        </Card>
      </Aside>

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
