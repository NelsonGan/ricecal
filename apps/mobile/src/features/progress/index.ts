/**
 * Trends: four cards over one range, and the history page behind each.
 *
 * The screen in `app/(tabs)/trends.tsx` owns the diary's two queries and hands
 * them to the calorie, weight and water cards, so those three can never
 * disagree about a range. The workouts card reads its own, which are bucketed
 * the same way in Postgres.
 *
 * `TrendLine` is the one chart in the app: Trends, the reviews, an exercise's
 * page and the workout progress page all draw it, so a correction to how a line
 * reads is made once. `TrendChip` is the pill beside a figure, shared with the
 * reviews for the same reason.
 */
export { HISTORY_METRICS } from './History'
export { HistoryScreen } from './HistoryScreen'
export { IntakeCard } from './IntakeCard'
export { problemOf, TrendChip } from './TrendCard'
export { TrendLine } from './TrendLine'
export { WaterCard } from './WaterCard'
export { WeightCard } from './WeightCard'
export { WorkoutsCard } from './WorkoutsCard'
