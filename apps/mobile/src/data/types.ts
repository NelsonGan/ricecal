import type { Database, Enums, Tables } from '@/lib/database.types'
import type { IconProps } from '@/ui'

/**
 * The domain, as the screens see it.
 *
 * Two jobs. First, it names the database's enums so a screen imports `Meal`
 * rather than `Database['public']['Enums']['meal']`. Second — and this is the
 * one that earns the file — it declares non-null shapes for things the
 * generated types call nullable.
 *
 * Every column of every VIEW comes back as `T | null`, because Postgres cannot
 * promise a view's nullability and the generator will not guess. `kcal` on a
 * logged entry is never null in practice, but a screen that has to prove that
 * on every read grows `?? 0` in forty places, and one of them will be wrong.
 * The mappers below coalesce once, at the edge, and everything inland is
 * ordinary.
 */

// Enums that mean the same thing on both sides.
export type Meal = Enums<'meal'>
export type Sex = Enums<'sex'>
export type Goal = Enums<'weight_goal'>
export type Place = Enums<'food_place'>
export type Units = Enums<'unit_system'>
export type Energy = Enums<'energy_unit'>
export type IconSet = Enums<'icon_set'>
export type SubscriptionStatus = Enums<'subscription_status'>
export type Plan = Enums<'subscription_plan'>

export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

/**
 * The two enums whose spelling differs across the wire.
 *
 * Postgres enums are snake_case by convention and the client is camelCase, and
 * both spellings are load-bearing: the i18n bundle keys off `onFeet`, the
 * database column is `on_feet`. Converting in two named functions beats either
 * a snake_case key leaking into the copy files or a column named `onFeet`.
 */
export type ActivityLevel = 'sedentary' | 'light' | 'onFeet' | 'veryActive'
export type EntrySource = 'search' | 'quickAdd' | 'camera' | 'voice' | 'import'

const ACTIVITY_TO_DB: Record<ActivityLevel, Enums<'activity_level'>> = {
  sedentary: 'sedentary',
  light: 'light',
  onFeet: 'on_feet',
  veryActive: 'very_active',
}

const ACTIVITY_FROM_DB: Record<Enums<'activity_level'>, ActivityLevel> = {
  sedentary: 'sedentary',
  light: 'light',
  on_feet: 'onFeet',
  very_active: 'veryActive',
}

export const toDbActivity = (level: ActivityLevel) => ACTIVITY_TO_DB[level]
export const fromDbActivity = (level: Enums<'activity_level'>) => ACTIVITY_FROM_DB[level]

export const toDbSource = (source: EntrySource): Enums<'entry_source'> =>
  source === 'quickAdd' ? 'quick_add' : source

export const fromDbSource = (source: Enums<'entry_source'>): EntrySource =>
  source === 'quick_add' ? 'quickAdd' : source

/**
 * The `{ set, name }` half of `IconProps`, which is what a data record carries
 * — size and tint belong to the screen that renders it.
 *
 * Written as a distributive conditional rather than `Pick<IconProps, …>`
 * because `Pick` over a union collapses it, which would let a `dishes` set pair
 * with a `ui` name.
 */
export type IconRef = IconProps extends infer T
  ? T extends { set: infer S; name: infer N }
    ? { set: S; name: N }
    : never
  : never

export type Macros = {
  kcal: number
  carbs: number
  protein: number
  fat: number
}

/**
 * The nutrients beyond the four that drive the budget.
 *
 * Every one is optional and absent means UNKNOWN, never zero. Most of the
 * catalogue is imported and carries none of them, and "0 g of fibre" is a claim
 * about a dish rather than a gap in a spreadsheet.
 */
export type ExtraNutrients = {
  fibre?: number
  sugar?: number
  /** Milligrams, unlike everything else here. */
  sodium?: number
}

export type Serving = {
  id: string
  /** "1 plate", "Half", "100g". Data, not copy. */
  label: string
  /** Multiplier against the food's base macros. */
  factor: number
}

export type Food = {
  id: string
  name: string
  brand?: string
  /** Absent for most of the catalogue: there are far more foods than drawings. */
  icon?: IconRef
  place: Place
  /** The default serving's name, e.g. "1 plate". */
  servingLabel: string
  servings: Serving[]
  macros: Macros
  /** Per base serving, like `macros`. Scaled by the portion at the point of use. */
  extras: ExtraNutrients
  verified: boolean
  /** How often this user has logged it. From `user_food_stats`, when joined. */
  timesLogged?: number
  /** Which meals they usually log it at. Same source. */
  usualMeals?: Meal[]
}

/**
 * Where an entry is in the recognition round trip.
 *
 * Only ever set on a row that exists in the client's cache and not yet in the
 * database — an optimistic snap. Nothing in Postgres carries it.
 */
export type EntryStatus = 'analysing' | 'failed'

export type Entry = {
  id: string
  meal: Meal
  quantity: number
  /** ISO instant. Orders the rows inside a meal. */
  loggedAt: string
  logDate: string
  note?: string
  source: EntrySource
  /** Key inside the private `meal-photos` bucket. */
  photoPath?: string
  /**
   * A local `file://` uri, set only while a snap is in flight — before the
   * upload finishes there is no key to show, and the row still wants a picture.
   */
  localPhotoUri?: string
  status?: EntryStatus

  foodId: string
  foodName: string
  /** Absent for most of the catalogue: there are far more foods than drawings. */
  icon?: IconRef
  place: Place
  servingId: string
  servingLabel: string
  servingFactor: number

  /** Already costed by the view: the dish's macros x factor x quantity. */
  macros: Macros
}

export type Targets = {
  kcal: number
  carbs: number
  protein: number
  fat: number
  waterGlasses: number
  /** True once the user has typed their own budget, which stops the recompute. */
  isCustom: boolean
}

export type WeighIn = {
  date: string
  kg: number
}

/** A day as the screens read it: its entries and its water. */
export type DayLog = {
  date: string
  entries: Entry[]
  waterGlasses: number
}

export type Profile = Tables<'profiles'>
export type Settings = Tables<'user_settings'>
export type MealTime = Tables<'meal_times'>
export type Subscription = Tables<'subscriptions'>

export type FoodDetailsRow = Database['public']['Views']['food_details']['Row']
export type FoodLogRow = Database['public']['Views']['food_log_details']['Row']
export type DailyNutritionRow = Database['public']['Views']['daily_nutrition']['Row']
export type CurrentGoalsRow = Database['public']['Views']['current_daily_goals']['Row']
