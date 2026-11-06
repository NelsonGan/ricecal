/**
 * Trends: four cards over one range.
 *
 * The screen in `app/(tabs)/trends.tsx` owns the diary's two queries and hands
 * them to the calorie, weight and water cards, so those three can never
 * disagree about a range. The workouts card reads its own, which are bucketed
 * the same way in Postgres.
 *
 * Two charts are exported for the other callers reading the same metrics: a
 * review draws calories stacked by energy and weight as a line that holds its
 * gaps, and an exercise's page draws its best sets as a line. A second copy of
 * either would disagree with Trends the first time one was corrected.
 */
export {
  DayBand,
  HISTORY_METRICS,
  MealRow,
  RowGap,
  useDayName,
  useOpenDay,
  useOpenEntry,
  WaterRow,
  WeightRow,
} from './History'
export { IntakeCard, type IntakeCardProps } from './IntakeCard'
export { type StackedBar, StackedBars, type StackedBarsProps } from './StackedBars'
export { problemOf } from './TrendCard'
export { TrendLine, type TrendLineProps, type TrendPoint, type TrendTone } from './TrendLine'
export { WaterCard, type WaterCardProps } from './WaterCard'
export { WeighInSheet, type WeighInSheetProps } from './WeighInSheet'
export { WeighInPill, WeightCard, type WeightCardProps } from './WeightCard'
export { WorkoutsCard } from './WorkoutsCard'
