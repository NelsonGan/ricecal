/**
 * The data layer.
 *
 * Everything the screens read and write goes through here, and everything here
 * goes through Supabase. The rules the mock layer set are the rules that still
 * hold, now with a server behind them:
 *
 * 1. **Screens never compute domain numbers.** A calorie total, a macro split
 *    and a day's budget come from views — `food_log_details`, `daily_nutrition`,
 *    `current_daily_goals` — so the arithmetic is in one place and it is the
 *    same place the reminder and report jobs will read.
 * 2. **Every mutation is a hook.** `useLogFood`, `useSetWater`, `useLogWeight`,
 *    `useUpdateProfile` … each one owns what it invalidates, so a screen never
 *    has to know what its write affects.
 * 3. **Reads go through hooks, not through a client.** No screen imports
 *    `supabase` directly.
 */
export {
  bestStreak,
  currentStreak,
  evaluateAchievements,
  measure,
} from './achievement-rules'
export { useAchievementCatalogue, useAchievements, useStreak } from './achievements'
export { useBurnRange, useDayBurn, useDayRings, useWorkouts } from './activity'
export { dateKey, today } from './client'
export { entriesForMeal, useDay, useDayLog, useNutritionRange, useSetWater } from './day'
export {
  type EntryPatch,
  type LogInput,
  useLogFood,
  useRemoveEntry,
  useUpdateEntry,
} from './entries'
export {
  type FoodDraft,
  type SearchFilter,
  useCreateFood,
  useFood,
  useFoodSearch,
  useTopFoods,
  useUsualFoods,
} from './foods'
export { type GoalsInput, useSetTargets, useTargets } from './goals'
export { keys } from './keys'
export { toEntry, toFood, toIcon } from './mappers'
export {
  type PendingSnap,
  PendingSnapProvider,
  pendingAsEntry,
  usePendingSnaps,
} from './pending-snaps'
export { removeMealPhoto, uploadMealPhoto, useMealPhotoUrl } from './photos'
export { type ProfilePatch, useCompleteOnboarding, useProfile, useUpdateProfile } from './profile'
export { SelectedDateProvider, useSelectedDate } from './selected-date'
export { SessionProvider, useSession, useUserId } from './session'
export { useMealTimes, useSettings, useUpdateMealTime, useUpdateSettings } from './settings'
export { useSnapFood } from './snap'
export { useSubscription } from './subscription'
export * from './types'
export { useCurrentWeight, useLogWeight, useWeighIns } from './weight'
