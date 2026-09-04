import type { Database, Enums, Tables } from '@/lib/database.types'
import type { IconProps } from '@/ui'

/**
 * The domain, as the screens see it.
 *
 * Two jobs: naming the database's enums, so a screen imports `Meal` rather than
 * `Database['public']['Enums']['meal']`, and declaring non-null shapes for what
 * the generated types call nullable.
 *
 * Every column of every view comes back as `T | null`, because Postgres cannot
 * promise a view's nullability. A screen proving that on every read grows `?? 0`
 * in forty places, one of which will be wrong, so the mappers coalesce once.
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
 * The two enums whose spelling differs across the wire. Both spellings are
 * load-bearing: the i18n bundle keys off `onFeet` and the column is `on_feet`.
 * Two named converters beat a snake_case key in the copy files.
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
 * The `{ set, name }` half of `IconProps`, which is what a data record carries.
 * Size and tint belong to the screen that renders it.
 *
 * A distributive conditional rather than `Pick<IconProps, …>`, because `Pick`
 * over a union collapses it and would let a `dishes` set pair with a `ui` name.
 *
 * Narrowed to the sets the database has, since `icon_set` is a Postgres enum:
 * `scenes` is onboarding art and no food row will point at it. Derived from the
 * enum, so a new set in `assets/icons` cannot silently break every insert that
 * carries an icon.
 */
export type IconRef = IconProps extends infer T
  ? T extends { set: infer S; name: infer N }
    ? S extends Enums<'icon_set'>
      ? { set: S; name: N }
      : never
    : never
  : never

export type Macros = {
  kcal: number
  carbs: number
  protein: number
  fat: number
}

/**
 * The nutrients beyond the four that drive the budget. Absent means unknown,
 * never zero: most of the catalogue carries none of them, and "0 g of fibre" is
 * a claim about a dish rather than a gap in a spreadsheet.
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
   * is ODbL and serving its facts through an app is a Produced Work. It travels
   * with the row, because a licence nobody can find is one nobody honours.
   */
  sourceAttribution?: string
}

/**
 * Where an entry is in the recognition round trip: a row that is not yet an
 * entry, and only ever set on one in the client's cache. `nofood` is the scan
 * reporting nothing edible, so no entry was written and the row waits to be
 * dismissed rather than counted.
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
   * quantity. Read by one caller, "repeat yesterday", which copies an entry
   * rather than reading it. See `snapshotFromEntry`.
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
}

/** 'g' | 'ml' | 'piece'. What an ingredient's amount is counted in. */
export type RecipeUnit = Enums<'recipe_unit'>
/** Where a recipe somebody asked to publish has got to. */
export type RecipeReviewStatus = Enums<'recipe_review'>

/**
 * One thing that went into the pot. Both sets of macros are wanted on screen:
 * `perUnit` is what the row stores and what the stepper rescales against, and
 * `macros` is `perUnit` times `amount`, worked out by
 * `recipe_ingredient_details` and printed beside the row.
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

/**
 * Why somebody reported a community recipe. Mirrors `public.report_reason`.
 *
 * Four, and they are the four App Review guideline 1.2 is written about:
 * objectionable material, spam, physical harm, and somebody else's work.
 */
export type ReportReason = 'inappropriate' | 'spam' | 'dangerous' | 'stolen'

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

  isMine: boolean
  /** The owner asked for it to be listed. Not the same as it being listed. */
  isPublic: boolean
  review: RecipeReviewStatus
  /** Why the review turned it down, shown to the owner. */
  reviewNote?: string
  /** Who to credit on a community card. Empty on your own. */
  authorName: string
  /**
   * The account that owns it, empty on an official recipe. It exists for
   * `useBlockAuthor`, which needs an id rather than a display name: two cooks
   * can be called Farah, and a block is about one of them.
   */
  ownerId: string
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
  /** The day's water goal, in millilitres. */
  waterMl: number
  /** True once the user has typed their own budget, which stops the recompute. */
  isCustom: boolean
}

export type WeighIn = {
  date: string
  kg: number
}

/**
 * The three windows the range switch on Trends offers. Named rather than a pair
 * of dates, because what "the last thirty days" means depends on the user's
 * timezone and only `local_today()` knows it.
 */
export type TrendRange = '7d' | '30d' | '1y'

export const TREND_RANGES = ['7d', '30d', '1y'] as const satisfies readonly TrendRange[]

/**
 * One column of a Trends chart: a day, a seven-day block, or a calendar month.
 * Carries all three tabs' numbers, because the tabs are three readings of one
 * range and switching must not go back to the server.
 *
 * Null and zero are not interchangeable: a null `kcal` is a bucket with nothing
 * logged in it and draws as a gap, where a zero `water` is a real measurement.
 * `trends.ts` is where that distinction is made.
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

  /** Millilitres a day, averaged across the whole bucket. */
  water: number
  waterTotal: number
  waterBest: number
  waterGoalDays: number
  /**
   * Days that cleared three quarters of the goal, which is the habit card's
   * line. Counted in the database, because on a thirty-day range a bucket is a
   * week and the client could only ask whether the week averaged above it.
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

  /** Millilitres a day, averaged across the range. */
  water: number
  /** Millilitres over the whole range, and the fullest single day of it. */
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

/**
 * A review is of a finished week or a finished month. The kind travels with
 * every request and answer, because a period is identified by its first day and
 * `2026-08-03` is a Monday and the third of a month at once. It is also what the
 * server works the period's end out of.
 */
export type ReviewKind = 'week' | 'month'

export const REVIEW_KINDS = ['week', 'month'] as const satisfies readonly ReviewKind[]

/**
 * One row of the reviews list, and one bar of the comparison chart inside a
 * story. Every period in the window is one of these, however little was logged:
 * a thin week is the week you most want to see the shape of.
 */
export type ReviewPeriod = {
  kind: ReviewKind
  /** First day, which is the period's identity and what a route carries. */
  start: string
  end: string
  days: number
  daysLogged: number

  /** Averaged over the days WITH food. Null when none had any. */
  kcal: number | null
  /** Against the reading the period opened at. Null with no weigh-in in it. */
  weightChange: number | null

  /**
   * The sparkline: a week's seven days, or a month's four or five weeks. A null
   * entry draws as a gap, which is the point of drawing it: the figure beside it
   * is an average, and an average cannot show that Tuesday is missing.
   */
  marks: (number | null)[]
}

/** One review period folded to the figures its four steps put in headlines. */
export type ReviewSummary = {
  kind: ReviewKind
  start: string
  end: string
  days: number
  daysLogged: number
  daysUnderGoal: number
  /** Consecutive logged days ending on the period's LAST day, not on today. */
  streakDays: number

  kcal: number | null
  kcalGoal: number | null
  carbs: number | null
  protein: number | null
  fat: number | null
  lightestOn: string | null
  lightestKcal: number | null
  heaviestOn: string | null
  heaviestKcal: number | null

  /** Millilitres a day, averaged over every day in the period. */
  water: number
  waterGoalDays: number

  weightLast: number | null
  weightChange: number | null
  weighIns: number

  /** Every figure below is null or zero for a period before the watch arrived. */
  activeDays: number
  activeKcal: number | null
  steps: number | null
  stepGoalDays: number
  stepGoal: number | null
  distanceM: number
  exerciseMinutes: number
  sessions: number
}

/**
 * One column of the charts inside a story: a day of a week, a week of a month.
 * Every field is a mark on one of them, from the block on the share card to the
 * stack on the calorie chart.
 */
export type ReviewBucket = {
  start: string
  daysLogged: number

  kcal: number | null
  carbs: number | null
  protein: number | null
  fat: number | null
  /** The newest reading in the column. Null where nobody weighed in. */
  weight: number | null
  /** Averaged over the days the watch HAS. Null where it has none. */
  steps: number | null
}

/**
 * One dish of a review period, folded across every time it was eaten. The name
 * is the identity, since `review_meals` groups on the folded name, so a list of
 * them needs no other key. They arrive heaviest first.
 */
export type ReviewMeal = {
  name: string
  icon?: IconRef
  /**
   * The newest plate photographed under this name, as a stored key. Preferred
   * over the icon, as the diary prefers it. A dish logged by camera once and by
   * hand twice can have both, so neither field displaces the other here.
   */
  photoPath?: string
  /** What one of them cost, averaged over any repeats. Not the period's total. */
  kcal: number
  carbs: number
  protein: number
  fat: number
}

/** A day as the screens read it: its entries and its water. */
export type DayLog = {
  date: string
  entries: Entry[]
  /** Millilitres drunk, summed over every drink recorded on this day. */
  waterMl: number
}

/**
 * One day of the week strip: enough to colour a dot. `goalKcal` is nullable and
 * the others are not, which is the distinction the strip turns on: a day before
 * the account had a budget has no line to be over or under.
 */
export type DayMark = {
  date: string
  entryCount: number
  kcal: number
  goalKcal: number | null
  activeKcal: number
}

/**
 * `day_marks` as PostgREST sends it. Hand-written, because the generated types
 * declare every column of a returning function non-null and three of these five
 * are left joins.
 */
export type DayMarkRow = {
  at: string
  entry_count: number | null
  kcal: number | null
  goal_kcal: number | null
  active_kcal: number | null
}

/**
 * The one dish drawn in a day's cell on the month calendar. Both a photograph
 * and a drawing, because the client prefers the photograph as the diary does and
 * a swept month has only the drawing left.
 */
export type DayPlate = {
  date: string
  name: string
  icon?: IconRef
  /** An object key in R2, never a URL. */
  photoPath?: string
}

/**
 * `day_plates` as PostgREST sends it. Hand-written for the reason `DayMarkRow`
 * is: the generated types call every column of a returning function non-null,
 * and three of these four are optional in the row itself.
 */
export type DayPlateRow = {
  at: string
  food_name: string | null
  icon_set: string | null
  icon_name: string | null
  photo_path: string | null
}

export type Profile = Tables<'profiles'>
export type Settings = Tables<'user_settings'>
export type MealTime = Tables<'meal_times'>
export type Subscription = Tables<'subscriptions'>

export type RecipeRow = Database['public']['Views']['recipe_details']['Row']
export type RecipeIngredientRow = Database['public']['Views']['recipe_ingredient_details']['Row']

/**
 * One catalogue food, as the catalogue Worker hands it back.
 *
 * Written out because there is no Postgres view to generate it from any more:
 * `food_details` was a view over `foods` and `food_servings`, both now in D1.
 * The Worker shapes its answer to match, so `toFood` did not have to change.
 *
 * Every field is nullable for the reason the generated view types were: this
 * comes off a network hop with no schema to prove it.
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
