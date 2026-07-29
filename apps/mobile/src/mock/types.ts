import type { IconProps } from '@/ui'

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

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

export type Macros = {
  /** Per serving. */
  kcal: number
  carbs: number
  protein: number
  fat: number
}

/** Where a dish is usually eaten. Drives the search filter chips. */
export type Place = 'mamak' | 'kopitiam' | 'hawker' | 'packaged' | 'home'

export type Serving = {
  id: string
  /** "1 piece", "Half", "100g". Data, not copy: portions are named the same in every language. */
  label: string
  /** Multiplier against the food's base macros. */
  factor: number
}

export type Food = {
  id: string
  /** Local spelling, unchanged in every language. */
  name: string
  icon: IconRef
  place: Place
  /** The default serving's name, e.g. "1 plate". */
  servingLabel: string
  servings: readonly Serving[]
  macros: Macros
  /** How often this user has logged it. Orders the "usual at this time" list. */
  timesLogged?: number
  /** Which meals it usually belongs to, for the same list. */
  usualMeals?: readonly Meal[]
}

export type Entry = {
  id: string
  foodId: string
  meal: Meal
  /** Number of the chosen serving. */
  quantity: number
  servingId: string
  /** ISO timestamp. Sorts the diary and prints the time on each row. */
  loggedAt: string
  /** Free-text correction the user typed, e.g. "no sambal". */
  note?: string
}

export type DayLog = {
  /** yyyy-MM-dd, the key everything else joins on. */
  date: string
  entries: Entry[]
  waterGlasses: number
}

export type Goal = 'lose' | 'maintain' | 'gain' | 'track'
export type ActivityLevel = 'sedentary' | 'light' | 'onFeet' | 'veryActive'
export type Sex = 'female' | 'male'
export type Units = 'metric' | 'imperial'
export type Energy = 'kcal' | 'kj'

export type Profile = {
  name: string
  memberSinceMonth: string
  sex: Sex
  goal: Goal
  heightCm: number
  weightKg: number
  targetWeightKg: number
  age: number
  activity: ActivityLevel
  /** Keys into onboarding.foodStyle.tags. */
  foodStyles: string[]
  mealTimes: { meal: Meal; time: string }[]
  source?: string
  units: Units
  energy: Energy
  language: string
  // Appearance is deliberately absent: ThemeProvider owns the colour scheme, and
  // a second copy here could disagree with what is on screen.
}

export type Targets = {
  kcal: number
  carbs: number
  protein: number
  fat: number
  waterGlasses: number
  steps: number
}

export type WeighIn = { date: string; kg: number }

export type SessionKind = 'run' | 'badminton' | 'gym' | 'walk' | 'cycle' | 'swim'

export type ActivitySession = {
  id: string
  kind: SessionKind
  title: string
  icon: IconRef
  startedAt: string
  minutes: number
  kcal: number
  distanceKm?: number
  avgHr?: number
  elevationM?: number
  /** Per-km pace in seconds, for the splits chart. */
  splitSeconds?: number[]
}

export type DayRings = {
  steps: number
  moveKcal: number
  moveGoal: number
  exerciseMin: number
  exerciseGoal: number
  standHours: number
  standGoal: number
  /** Minutes since the watch last synced. */
  syncedMinutesAgo: number
}

/**
 * Names the copy bundle knows about. A union rather than a string so adding a
 * badge without adding its label is a type error, not a key rendered on screen.
 */
export type AchievementKey =
  | 'sevenDays'
  | 'protein'
  | 'eightGlasses'
  | 'photoPro'
  | 'earlyBird'
  | 'weekend'
  | 'thirtyDays'
  | 'marathon'
  | 'perfectWeek'

export type Achievement = {
  id: string
  labelKey: AchievementKey
  icon: IconRef
  tone: 'pandan' | 'hibiscus' | 'water' | 'kaya'
  earned: boolean
}

export type SubscriptionStatus = 'none' | 'trial' | 'active' | 'expired'
export type Plan = 'yearly' | 'monthly'

export type Subscription = {
  status: SubscriptionStatus
  plan: Plan
  /** Whole days left in the trial. Only meaningful while `status` is 'trial'. */
  trialDaysLeft: number
  cardLast4: string
  /** Date the paid plan starts, already formatted. Mock data, so no timezone maths. */
  startsOn: string
}

export type Reminders = {
  breakfast: boolean
  lunch: boolean
  dinner: boolean
  water: boolean
  weighIn: boolean
  weeklyReport: boolean
  quietFrom: string
  quietTo: string
}

export type Connections = {
  watch: boolean
  phoneHealth: boolean
  runningApp: boolean
  smartScale: boolean
  autoSync: boolean
  wifiOnly: boolean
}

export type Privacy = {
  shareWithFamily: boolean
  anonymousFoodData: boolean
}
