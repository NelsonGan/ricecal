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
export type EntrySource = 'search' | 'quickAdd' | 'camera' | 'voice' | 'import' | 'text'

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
  /**
   * What one base serving weighs, when the catalogue knows. Grams, with
   * millilitres counted as grams — the same convention the whole app uses.
   */
  servingGrams?: number
  /** GTIN-14. Present only for a packaged product with a barcode on it. */
  barcode?: string
  /**
   * Who to credit for these numbers, when a licence requires it. Open Food Facts
   * is ODbL and serving its facts through an app is a "Produced Work", so the
   * detail screen prints this — it travels with the row rather than living in a
   * component, because a licence nobody can find is a licence nobody honours.
   */
  sourceAttribution?: string
}

/**
 * Where an entry is in the recognition round trip — a row that is not yet an
 * entry.
 *
 * Only ever set on a row that exists in the client's cache and not in the
 * database; nothing in Postgres carries it. `nofood` is the scan reporting
 * that the photo had nothing edible in it, so no entry was written at all and
 * the row waits to be dismissed rather than counted.
 */
export type EntryStatus = 'analysing' | 'waiting' | 'failed' | 'nofood'

export type Entry = {
  id: string
  quantity: number
  /** ISO instant. Orders the rows inside a meal. */
  loggedAt: string
  logDate: string
  note?: string
  source: EntrySource
  /** An object key in R2, under `meals/<user>/`. Never a URL. */
  photoPath?: string
  /**
   * A local `file://` uri, set only while a snap is in flight — before the
   * upload finishes there is no key to show, and the row still wants a picture.
   */
  localPhotoUri?: string
  /**
   * Figures the user typed for this entry, per field. Present only where they
   * typed one — the macros above already carry the result of applying them.
   */
  overrides?: { kcal?: number; carbs?: number; protein?: number; fat?: number }
  status?: EntryStatus
  /** Restored from storage: still working, but past the point of a progress bar. */
  restored?: boolean

  /**
   * Where this entry came from, when it came from anywhere. Both are soft: an
   * estimate the scan invented references no catalogue row, and a plate
   * corrected until it is nothing in particular references none either.
   */
  foodId?: string
  recipeId?: string
  foodName: string
  brand?: string
  /** Absent for most of the catalogue: there are far more foods than drawings. */
  icon?: IconRef
  place: Place
  servingId?: string
  servingLabel: string
  servingFactor: number

  /** Already costed by the view: the entry's macros x factor x quantity. */
  macros: Macros
  /**
   * The snapshot as stored, per one base serving, before the portion and the
   * quantity. Read by exactly one caller — "repeat yesterday", which copies an
   * entry rather than reading it. See `snapshotFromEntry`.
   */
  base: Macros
  baseExtras?: ExtraNutrients
  baseServingGrams?: number

  /** Set when this entry came from a photo scan. */
  scanId?: string
  /**
   * Up to three model-suggested corrections for this plate ("No sambal",
   * "Half portion"), offered as chips over the fix-by-typing box.
   */
  suggestedEdits?: string[]
  /**
   * The numbers on this row are a guess, not a catalogue figure: a tier-4
   * model estimate or a tier-5 archetype fallback. What the UI badges — an
   * estimate has to be obvious and easy to correct.
   */
  isEstimate: boolean
  isArchetype: boolean
}

/** 'g' | 'ml' | 'piece'. What an ingredient's amount is counted in. */
export type RecipeUnit = Enums<'recipe_unit'>
/** Where a recipe somebody asked to publish has got to. */
export type RecipeReviewStatus = Enums<'recipe_review'>

/**
 * One thing that went into the pot.
 *
 * Two sets of macros, and both are wanted on screen. `perUnit` is what the row
 * stores and what stays true when the amount moves — it is what the stepper
 * rescales against. `macros` is `perUnit` times `amount`, already worked out by
 * `recipe_ingredient_details`, and is the number printed beside the row.
 */
export type RecipeIngredient = {
  id: string
  name: string
  /** The catalogue row it was picked from, when it was picked rather than typed. */
  foodId?: string
  amount: number
  unit: RecipeUnit
  perUnit: Macros
  macros: Macros
  position: number
}

export type Recipe = {
  id: string
  name: string
  /** Absent unless the cook picked one, or a photograph is carrying the row. */
  icon?: IconRef
  /** An object key in R2, never a URL — same as `Entry.photoPath`. */
  photoPath?: string
  /** How many the whole pot feeds. What turns a total into a portion. */
  servings: number
  steps?: string

  /** From the RiceCal kitchen: a recipe with no owner. */
  isOfficial: boolean
  isMine: boolean
  /** The owner asked for it to be listed. Not the same as it being listed. */
  isPublic: boolean
  review: RecipeReviewStatus
  /** Why the review turned it down, shown to the owner. */
  reviewNote?: string
  /** Who to credit on a community card. Empty on your own and on official ones. */
  authorName: string
  shareSlug: string
  savedCount: number

  ingredientCount: number
  /** The whole pot. */
  total: Macros
  /** One serving of it — what a log of this recipe costs, and the snapshot's base. */
  perServing: Macros
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

/**
 * The three windows the range switch on Trends offers.
 *
 * Named rather than expressed as a pair of dates, because what "the last thirty
 * days" means depends on the user's timezone and only `local_today()` knows it.
 * These strings go to the server verbatim.
 */
export type TrendRange = '7d' | '30d' | '1y'

export const TREND_RANGES = ['7d', '30d', '1y'] as const satisfies readonly TrendRange[]

/**
 * One column of a Trends chart: a day, a seven-day block, or a calendar month.
 *
 * Carries all three tabs' numbers, because the tabs are three readings of one
 * range and switching between them must not go back to the server.
 *
 * Null and zero are not interchangeable here. A null `kcal` is a bucket with
 * nothing logged in it, which a chart draws as a gap; a zero `water` is a real
 * measurement of a day nobody drank on. The mappers in `trends.ts` are where
 * that distinction is made, and it is the only thing they exist for.
 */
export type TrendBucket = {
  /** First day covered. The bucket's identity, and what it sorts by. */
  start: string
  /** Last day covered, which is where the axis label comes from. */
  end: string
  /** Calendar days in it. Under seven for the oldest block of a 30-day range. */
  days: number

  /** Averaged over the days WITH food, not over the bucket. Null when none had. */
  kcal: number | null
  carbs: number | null
  protein: number | null
  fat: number | null
  daysLogged: number
  /** The budget in force on the bucket's last day. */
  kcalGoal: number | null
  daysUnderGoal: number

  /** Cups a day, averaged across the whole bucket. */
  water: number
  waterTotal: number
  waterBest: number
  waterGoalDays: number
  /**
   * Days that cleared three quarters of the goal — the habit card's line.
   *
   * Counted in the database rather than here, because on a thirty-day range a
   * bucket is a WEEK: the client can only ask whether the week averaged above
   * the line, which answers "0 of 30" for a month containing several full days.
   */
  waterHabitDays: number
  waterLoggedDays: number
  waterGoal: number

  /** The newest reading in the bucket — where the line lands. Null if none. */
  weight: number | null
  weightAvg: number | null
  weightMin: number | null
  weighIns: number
}

/** A whole range as one row: the three metric tiles, and each chart's footnote. */
export type TrendSummary = {
  from: string
  to: string
  days: number

  kcal: number | null
  carbs: number | null
  protein: number | null
  fat: number | null
  daysLogged: number
  kcalGoal: number | null
  daysUnderGoal: number

  water: number
  waterTotal: number
  waterBest: number
  waterGoalDays: number
  /** Days that cleared three quarters of the goal. See `TrendBucket`. */
  waterHabitDays: number
  waterLoggedDays: number
  waterGoal: number

  /**
   * The newest reading from before the range, which the chart's line starts
   * from. Null only when there is genuinely no earlier weigh-in.
   */
  weightBefore: number | null
  /** The oldest and newest readings in the range, which is what the change is. */
  weightFirst: number | null
  weightLast: number | null
  weightAvg: number | null
  /** The heaviest reading and the day of it, which the chart's subtitle names. */
  weightPeak: number | null
  weightPeakOn: string | null
  weighIns: number
}

/** A day as the screens read it: its entries and its water. */
export type DayLog = {
  date: string
  entries: Entry[]
  waterGlasses: number
}

/**
 * One day of the week strip: enough to colour a dot, and nothing else.
 *
 * `goalKcal` is nullable and the others are not, which is the distinction the
 * strip turns on — a day before the account had a budget has no line to be over
 * or under, while a day with no entries genuinely ate nothing.
 */
export type DayMark = {
  date: string
  entryCount: number
  kcal: number
  goalKcal: number | null
  activeKcal: number
}

/**
 * `day_marks` as PostgREST sends it.
 *
 * Hand-written rather than taken from the generated types, which declare every
 * column of a returning function non-null: three of these five are left joins
 * and arrive as null on any day with no food, no budget or no watch.
 */
export type DayMarkRow = {
  at: string
  entry_count: number | null
  kcal: number | null
  goal_kcal: number | null
  active_kcal: number | null
}

export type Profile = Tables<'profiles'>
export type Settings = Tables<'user_settings'>
export type MealTime = Tables<'meal_times'>
export type Subscription = Tables<'subscriptions'>

export type RecipeRow = Database['public']['Views']['recipe_details']['Row']
export type RecipeIngredientRow = Database['public']['Views']['recipe_ingredient_details']['Row']

/**
 * One catalogue food, as the `catalogue` edge function hands it back.
 *
 * Written out rather than generated, because there is no longer a Postgres view
 * to generate it from: `food_details` was a view over `foods` and
 * `food_servings`, and both are in Cloudflare D1 now. The Worker shapes its
 * answer to match what that view returned — see `foodDetails` in
 * `apps/catalogue-worker/src/index.ts` — so `toFood` did not have to change.
 *
 * Every field is nullable for the same reason the generated view types were:
 * this comes off a network hop with no schema to prove it, and `toFood`
 * coalesces once at the edge so nothing inland writes `?? 0`.
 */
export type FoodDetailsRow = {
  id: string | null
  slug?: string | null
  name: string | null
  brand: string | null
  icon_set: string | null
  icon_name: string | null
  place: Place | null
  kcal: number | null
  carbs_g: number | string | null
  protein_g: number | string | null
  fat_g: number | string | null
  fibre_g: number | string | null
  sugar_g: number | string | null
  sodium_mg: number | string | null
  verified: boolean | null
  barcode: string | null
  source_attribution: string | null
  /** The default portion, lifted onto the food. */
  default_serving_id: string | null
  serving_label: string | null
  serving_g: number | string | null
  /** `[{ id, label, factor }, …]`, which is what `toServings` reads. */
  servings: unknown
}
export type FoodLogRow = Database['public']['Views']['food_log_details']['Row']
export type DailyNutritionRow = Database['public']['Views']['daily_nutrition']['Row']
export type CurrentGoalsRow = Database['public']['Views']['current_daily_goals']['Row']
