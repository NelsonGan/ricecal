/**
 * Trends: three tabs over one range.
 *
 * The screen in `app/(tabs)/trends.tsx` owns the two queries and the three bits
 * of state (range, metric, and which day the weigh-in sheet is on) and hands the
 * answers down. None of the panels fetches, so switching tabs cannot cost a
 * request and the tiles cannot disagree with the panel under them.
 *
 * Most of the charts are deliberately not exported. Each encodes a decision about
 * its own metric: a water column's height is always the goal, a calorie column is
 * stacked by energy rather than grams, a weight line holds its gaps rather than
 * spanning them.
 *
 * Two are exported, for the one caller reading the same metrics: a review draws
 * calories stacked by energy and weight as a line that holds its gaps. A second
 * copy of either would disagree with Trends the first time one was corrected.
 */
export { CaloriesPanel, type CaloriesPanelProps } from './CaloriesPanel'
export { MetricTabs, type MetricTabsProps, TREND_METRICS, type TrendMetric } from './MetricTabs'
export { type StackedBar, StackedBars, type StackedBarsProps } from './StackedBars'
export { TrendLine, type TrendLineProps, type TrendPoint } from './TrendLine'
export { WaterPanel, type WaterPanelProps } from './WaterPanel'
export { WeighInSheet, type WeighInSheetProps } from './WeighInSheet'
export { WeightPanel, type WeightPanelProps } from './WeightPanel'
