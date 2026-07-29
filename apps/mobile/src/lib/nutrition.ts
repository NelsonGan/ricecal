import type { ActivityLevel, DayLog, Entry, Goal, Macros, Meal, Targets } from '@/data/types'

/**
 * Arithmetic the screens share.
 *
 * What is left here after the move to Postgres is deliberately small. Anything
 * that describes stored data — a day's calories, an entry's macros, the budget
 * in force — is a view now, computed once in the database where the reminder
 * and report jobs can read the same number. What remains is either presentation
 * (a bar's fill, which meal a tap means) or a projection of something that has
 * not been saved yet (the budget onboarding previews before an account exists).
 */

export const ZERO_MACROS: Macros = { kcal: 0, carbs: 0, protein: 0, fat: 0 }

/** Adds up entries that already carry their own costed macros. */
export function sumMacros(entries: readonly Entry[]): Macros {
  return entries.reduce<Macros>(
    (total, entry) => ({
      kcal: total.kcal + entry.macros.kcal,
      carbs: total.carbs + entry.macros.carbs,
      protein: total.protein + entry.macros.protein,
      fat: total.fat + entry.macros.fat,
    }),
    ZERO_MACROS,
  )
}

export function entriesForMeal(day: DayLog, meal: Meal): Entry[] {
  return day.entries
    .filter((entry) => entry.meal === meal)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
}

export function mealKcal(day: DayLog, meal: Meal): number {
  return sumMacros(entriesForMeal(day, meal)).kcal
}

/** 0 to 1, clamped, for the ring and the bars. */
export function progressOf(done: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(1, Math.max(0, done / goal))
}

/**
 * Macro targets rescaled to a day's actual budget.
 *
 * When exercise adds calories back, those calories have to be eaten as
 * something. Leaving the macro targets at their resting values would show all
 * three bars pegged on any day with a workout, which is the opposite of what
 * the extra budget means.
 */
export function scaleTargets(targets: Targets, budget: number): Targets {
  if (targets.kcal <= 0 || budget === targets.kcal) return targets
  const factor = budget / targets.kcal
  return {
    ...targets,
    kcal: budget,
    carbs: Math.round(targets.carbs * factor),
    protein: Math.round(targets.protein * factor),
    fat: Math.round(targets.fat * factor),
  }
}

/**
 * The meal a "log food" tap should default to, from the wall clock. Snack is
 * never guessed: it is what the user picks when none of the three fit.
 */
export function mealForHour(hour: number): Meal {
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  return 'dinner'
}

export function bmi(heightCm: number, weightKg: number): number {
  const metres = heightCm / 100
  if (metres <= 0) return 0
  return Math.round((weightKg / (metres * metres)) * 10) / 10
}

/** kg per week the plan moves, signed toward the target. */
export function weeklyPace(goal: Goal): number {
  if (goal === 'lose') return 0.5
  if (goal === 'gain') return 0.35
  return 0
}

/**
 * When the target weight is reached at the current pace, or null when there is
 * nothing to reach — a maintain plan has no finish line, and saying "never"
 * would be both true and unkind.
 */
export function goalDate(
  goal: Goal,
  weightKg: number,
  targetWeightKg: number,
  from: Date,
): Date | null {
  const pace = weeklyPace(goal)
  const delta = Math.abs(weightKg - targetWeightKg)
  if (pace === 0 || delta < 0.1) return null
  const weeks = Math.ceil(delta / pace)
  return new Date(from.getTime() + weeks * 7 * 24 * 60 * 60 * 1000)
}

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  onFeet: 1.55,
  veryActive: 1.725,
}

/** kcal/day added or removed to move about 0.5 kg a week. */
const GOAL_DELTA: Record<Goal, number> = {
  lose: -400,
  maintain: 0,
  gain: 300,
  track: 0,
}

export type BodyInput = {
  sex: 'female' | 'male'
  weightKg: number
  heightCm: number
  age: number
  activity: ActivityLevel
  goal: Goal
}

/** Mifflin St Jeor, the same formula `compute_targets()` runs server-side. */
export function basalRate(body: BodyInput): number {
  const base = 10 * body.weightKg + 6.25 * body.heightCm - 5 * body.age
  return body.sex === 'male' ? base + 5 : base - 161
}

/**
 * The daily budget, previewed.
 *
 * The database owns this number — a trigger recomputes `daily_goals` whenever
 * the profile or the newest weigh-in changes, and that is the copy every
 * screen reads. This exists for the one moment there is nothing to read from:
 * the onboarding preview, which shows a budget before the account that would
 * store it exists. Keep the two in step; they are the same arithmetic on
 * purpose.
 */
export function computeTargets(body: BodyInput): Omit<Targets, 'isCustom'> {
  const maintenance = basalRate(body) * ACTIVITY_FACTOR[body.activity]
  const kcal = Math.round((maintenance + GOAL_DELTA[body.goal]) / 10) * 10

  // A 47/22/31 split by energy: high enough carbs for a rice based diet,
  // protein at roughly 1.7 g per kg.
  return {
    kcal,
    carbs: Math.round((kcal * 0.47) / 4),
    protein: Math.round((kcal * 0.22) / 4),
    fat: Math.round((kcal * 0.31) / 9),
    waterGlasses: 8,
    steps: 8000,
  }
}

/** Years between a birth date and today. The profile stores the date. */
export function ageFrom(birthDate: string | null): number {
  if (!birthDate) return 0
  const born = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthDelta = now.getMonth() - born.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) age--
  return age
}

/** A birth date for someone who says they are this many years old today. */
export function birthDateFromAge(age: number): string {
  const now = new Date()
  const year = now.getFullYear() - age
  return `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
