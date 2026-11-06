/**
 * Trends: four cards over one range.
 *
 * The screen in `app/(tabs)/trends.tsx` owns the diary's two queries and hands
 * them to the calorie, weight and water cards, so those three can never
 * disagree about a range. The workouts card reads its own, which are bucketed
 * the same way in Postgres.
 *
 * The line chart is exported for the other callers reading the same metrics:
 * a review draws calories and weight with it, and an exercise's page its best
 * sets. A second copy of
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
export { HistoryScreen } from './HistoryScreen'
export { IntakeCard, type IntakeCardProps } from './IntakeCard'
export { problemOf, TrendChip } from './TrendCard'
export { TrendLine, type TrendLineProps, type TrendPoint, type TrendTone } from './TrendLine'
export { WaterCard, type WaterCardProps } from './WaterCard'
export { WeighInSheet, type WeighInSheetProps } from './WeighInSheet'
export { WeighInPill, WeightCard, type WeightCardProps } from './WeightCard'
export { WorkoutsCard } from './WorkoutsCard'
