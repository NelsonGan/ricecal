/**
 * The mock data layer.
 *
 * Everything the screens read comes from here: a typed catalogue, seed
 * fixtures, pure derivations, and one in-memory store. There is no network call
 * anywhere in this folder, and no screen imports a fixture directly — they go
 * through the store, so a later swap to Supabase touches this folder only.
 */
export {
  basalRate,
  bmi,
  computeTargets,
  entriesForMeal,
  entryMacros,
  goalDate,
  mealForHour,
  mealKcal,
  progressOf,
  remainingKcal,
  scaleTargets,
  sumMacros,
  weeklyPace,
  ZERO_MACROS,
} from './derive'
export { dateKey } from './fixtures'
export { FOODS, findFood, getFood, getServing } from './foods'
export {
  type Action,
  type AppState,
  AppStoreProvider,
  useAppState,
  useDay,
  useDayBurn,
  useDispatch,
  useSelectedDay,
  useStore,
} from './store'
export * from './types'
