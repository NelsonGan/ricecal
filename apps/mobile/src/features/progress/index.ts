/**
 * Trends: three tabs over one range.
 *
 * The screen in `app/(tabs)/trends.tsx` owns the two queries and the three bits
 * of state — range, metric, and which day the weigh-in sheet is on — and hands
 * the answers down. The panels take data and render it; none of them fetches,
 * so switching tabs cannot cost a request and the three tiles at the top cannot
 * disagree with the panel under them.
 *
 * Most of the charts are deliberately NOT exported. They are not design system
 * components: each one encodes a decision about its own metric — a water
 * column's height is always the goal, a calorie column is stacked by energy
 * rather than by grams, a weight line holds its gaps rather than spanning them
 * — and generalising them would lose exactly the part worth keeping.
 *
 * Two are out, for the one caller that reads the SAME metrics rather than a
 * general one. A review draws calories a day stacked by energy and weight as a
 * line that holds its gaps, which are those two decisions exactly; a second
 * copy of either would be a chart that disagrees with Trends about the same
 * week the first time one of them is corrected.
 */
export { CaloriesPanel, type CaloriesPanelProps } from './CaloriesPanel'
export { MetricTabs, type MetricTabsProps, TREND_METRICS, type TrendMetric } from './MetricTabs'
export { type StackedBar, StackedBars, type StackedBarsProps } from './StackedBars'
export { TrendLine, type TrendLineProps, type TrendPoint } from './TrendLine'
export { showChange, showWeight, unitFor, type WeightUnit } from './units'
export { WaterPanel, type WaterPanelProps } from './WaterPanel'
export { WeighInSheet, type WeighInSheetProps } from './WeighInSheet'
export { WeightPanel, type WeightPanelProps } from './WeightPanel'
