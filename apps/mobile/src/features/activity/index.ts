/**
 * Activity: what the phone's health store says the body did.
 *
 * There is no Activity tab any more. What is left is read elsewhere: a workout
 * as a row of Today's day list and on its own page, the connect flow in
 * Settings, Health. Nothing in here fetches; the screens own the queries.
 *
 * The providers live in `lib/health`, because they talk to a platform rather than
 * a screen, which is what lets `data/health-sync.ts` use them without a data
 * layer reaching into a feature.
 */
export { ConnectPanel, type ConnectPanelProps } from './ConnectPanel'
export {
  clock,
  count,
  distance,
  duration,
  pace,
  speed,
  syncedAgo,
} from './format'
export { SessionItem, type SessionItemProps } from './SessionItem'
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
