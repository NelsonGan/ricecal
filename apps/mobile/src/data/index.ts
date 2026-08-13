/**
 * The data layer.
 *
 * Everything the screens read and write goes through here. Most of it goes to
 * Supabase; the catalogue goes to the Cloudflare Worker in front of D1. Three
 * rules hold throughout, and `README.md` beside this file has the detail:
 *
 * 1. **Screens never compute domain numbers.** A calorie total, a macro split
 *    and a day's budget come from views — `food_log_details`, `daily_nutrition`,
 *    `current_daily_goals` — so the arithmetic is in one place and it is the
 *    same place a reminder or report job will read.
 * 2. **Every mutation is a hook.** `useLogFood`, `useSetWater`, `useLogWeight`,
 *    `useUpdateProfile` — each one owns what it invalidates, so a screen never
 *    has to know what its write affects.
 * 3. **Reads go through hooks, not through a client.** No screen imports
 *    `supabase` directly.
 */
export {
  type ActivityBucket,
  type ActivityDay,
  type ActivityHour,
  type ActivitySession,
  type ActivitySummary,
  daysAgo,
  type HealthConnection,
  providerFor,
  useActivityDay,
  useActivityHours,
  useActivitySeries,
  useActivitySession,
  useActivitySessions,
  useActivitySummary,
  useClearDemoActivity,
  useDisconnectHealth,
  useHealthConnection,
  usePrefetchActivityDays,
} from './activity'
export { dateKey, today } from './client'
export {
  type DayView,
  useDay,
  useDayLog,
  useDayMarks,
  useNutritionRange,
  usePrefetchDays,
  useSetWater,
  useStreak,
} from './day'
export {
  type EntryPatch,
  type LogInput,
  useLogFood,
  useRemoveEntry,
  useUpdateEntry,
} from './entries'
export { useFood, useFoodSearch } from './foods'
export { type GoalsInput, useSetTargets, useTargets } from './goals'
export {
  type ConnectResult,
  type SyncProgress,
  useConnectHealth,
  useHealthAutoSync,
  useSyncHealth,
} from './health-sync'
export { keys } from './keys'
export { toEntry, toFood, toIcon, toRecipe, toRecipeIngredient } from './mappers'
export {
  type PendingSnap,
  PendingSnapProvider,
  pendingAsEntry,
  usePendingSnaps,
} from './pending-snaps'
export {
  removeAvatar,
  removeMealPhoto,
  type StoredImageSource,
  storedImageSource,
  uploadAvatar,
  uploadMealPhoto,
  useAvatarUrl,
  useMealPhotoUrl,
} from './photos'
export {
  bodyFrom,
  type OnboardingAnswers,
  type ProfilePatch,
  useFinishOnboarding,
  useProfile,
  useUpdateProfile,
} from './profile'
export {
  type PublishResult,
  type RecipeIngredientInput,
  type RecipeInput,
  type RecipeShelf,
  type RecipeSource,
  type SaveResult,
  type ScannedRecipe,
  useDeleteRecipe,
  usePublishRecipe,
  useReadRecipe,
  useRecipe,
  useRecipeIngredients,
  useRecipes,
  useSaveRecipe,
  useSaveRecipeCopy,
} from './recipes'
export { RefiningProvider, useRefiningEntries } from './refining'
export {
  useReviewMeals,
  useReviewPeriods,
  useReviewSeries,
  useReviewSummary,
} from './reviews'
export {
  type EntryIngredient,
  useEntryIngredients,
  useRefineEntry,
  useRemoveIngredient,
  useUpdateIngredient,
} from './scan'
export { SelectedDateProvider, useSelectedDate } from './selected-date'
export { SessionProvider, useSession, useUserId } from './session'
export { useMealTimes, useSettings, useUpdateMealTime, useUpdateSettings } from './settings'
export { type DescribeInput, useDescribeFood, useSnapFood } from './snap'
export {
  ENTRY_FOOD_ID,
  ENTRY_SERVING_ID,
  foodFromEntry,
  type LogSnapshot,
  packetCode,
  packetFoodId,
  snapshotColumns,
  snapshotFromEntry,
  snapshotFromFood,
  snapshotFromRecipe,
  withCataloguePortions,
} from './snapshot'
export {
  type AiUsage,
  type Entitlement,
  useAiUsage,
  useAwaitEntitlement,
  useEntitlement,
  usePlanPrices,
  useSubscription,
} from './subscription'
export { useTrendSeries, useTrendSummary } from './trends'
export * from './types'
export { useCurrentWeight, useDeleteWeighIn, useLogWeight, useWeighIns } from './weight'
