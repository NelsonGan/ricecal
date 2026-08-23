/**
 * Activity: what the phone's health store says the body did.
 *
 * The tab in `app/(tabs)/activity.tsx` owns the queries and hands the answers
 * down, the same arrangement as Trends — nothing in here fetches, so a
 * navigation between the five Activity screens cannot cost a request and two
 * screens cannot disagree about today.
 *
 * The charts are NOT design-system components and are deliberately not in
 * `@/ui`. Each encodes a decision about its own measurement: an hour column
 * with no steps is drawn rather than skipped because the gaps are the shape of
 * a day; a balance pair shares one scale because two scales would make a
 * matched day look mismatched. Generalising them would lose exactly the part
 * worth keeping.
 *
 * The PROVIDERS are not here either. They are in `lib/health`, because they
 * talk to a platform rather than to a screen, and keeping them out of a feature
 * folder is what lets `data/health-sync.ts` use them without a data layer
 * reaching into a feature.
 */
export { type BalanceBar, BalanceBars, type BalanceBarsProps, BalanceLegend } from './BalanceBars'
export { BudgetStrip, type BudgetStripProps } from './BudgetStrip'
export { ConnectPanel, type ConnectPanelProps } from './ConnectPanel'
export {
  clock,
  count,
  distance,
  duration,
  hourLabel,
  pace,
  speed,
  syncedAgo,
} from './format'
export {
  HourBars,
  type HourBarsProps,
  hasHourlyShape,
  hourlySummary,
} from './HourBars'
export { type RingStat, RingTrio, type RingTrioProps } from './RingTrio'
export { SessionRow, type SessionRowProps } from './SessionRow'
export { SplitBar, type SplitBarProps, type SplitPart } from './SplitBar'
export {
  asWorkoutKind,
  showsDistance,
  showsPace,
  showsSpeed,
  WORKOUT_KIND_KEY,
  WORKOUT_KINDS,
  type WorkoutKind,
  workoutIcon,
  workoutKindKey,
} from './workoutKind'
