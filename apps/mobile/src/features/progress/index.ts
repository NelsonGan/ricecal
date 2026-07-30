/**
 * Trends: three tabs over one range.
 *
 * The screen in `app/(tabs)/trends.tsx` owns the two queries and the three bits
 * of state — range, metric, and which day the weigh-in sheet is on — and hands
 * the answers down. The panels take data and render it; none of them fetches,
 * so switching tabs cannot cost a request and the three tiles at the top cannot
 * disagree with the panel under them.
 *
 * The charts are deliberately NOT exported. They are not design system
 * components: each one encodes a decision about its own metric — a water
 * column's height is always the goal, a calorie column is stacked by energy
 * rather than by grams, a weight line spans its gaps — and generalising them
 * would lose exactly the part worth keeping.
 */
export { CaloriesPanel, type CaloriesPanelProps } from './CaloriesPanel'
export { MetricTabs, type MetricTabsProps, TREND_METRICS, type TrendMetric } from './MetricTabs'
export { unitFor, type WeightUnit } from './units'
export { WaterPanel, type WaterPanelProps } from './WaterPanel'
export { WeighInSheet, type WeighInSheetProps } from './WeighInSheet'
export { WeightPanel, type WeightPanelProps } from './WeightPanel'
