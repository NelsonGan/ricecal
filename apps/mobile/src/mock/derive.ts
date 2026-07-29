import { getFood, getServing } from './foods'
import type { ActivityLevel, DayLog, Entry, Goal, Macros, Meal, Profile, Targets } from './types'

/**
 * Pure functions over the mock data. No React, no store — so a screen can call
 * them, a test can call them, and neither needs a provider.
 */

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

/** Mifflin St Jeor, the same formula the real app will use server side. */
export function basalRate(profile: Profile): number {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age
  return profile.sex === 'male' ? base + 5 : base - 161
}

/**
 * The daily budget, rounded to the nearest 10 so the number on screen reads as
 * a target rather than a computation.
 */
export function computeTargets(profile: Profile): Targets {
  const maintenance = basalRate(profile) * ACTIVITY_FACTOR[profile.activity]
  const kcal = Math.round((maintenance + GOAL_DELTA[profile.goal]) / 10) * 10

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

export const ZERO_MACROS: Macros = { kcal: 0, carbs: 0, protein: 0, fat: 0 }

/** The macros one entry contributes, after its serving and quantity. */
export function entryMacros(entry: Entry): Macros {
  const food = getFood(entry.foodId)
  const factor = getServing(food, entry.servingId).factor * entry.quantity
  return {
    kcal: Math.round(food.macros.kcal * factor),
    carbs: Math.round(food.macros.carbs * factor),
    protein: Math.round(food.macros.protein * factor),
    fat: Math.round(food.macros.fat * factor),
  }
}

export function sumMacros(entries: readonly Entry[]): Macros {
  return entries.reduce<Macros>((total, entry) => {
    const m = entryMacros(entry)
    return {
      kcal: total.kcal + m.kcal,
      carbs: total.carbs + m.carbs,
      protein: total.protein + m.protein,
      fat: total.fat + m.fat,
    }
  }, ZERO_MACROS)
}

export function entriesForMeal(day: DayLog, meal: Meal): Entry[] {
  return day.entries
    .filter((entry) => entry.meal === meal)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
}

export function mealKcal(day: DayLog, meal: Meal): number {
  return sumMacros(entriesForMeal(day, meal)).kcal
}

/**
 * What is left of the budget. Negative when the day went over — the caller
 * decides how to say that, and the copy never scolds.
 */
export function remainingKcal(day: DayLog, targets: Targets, burnedKcal = 0): number {
  return targets.kcal + burnedKcal - sumMacros(day.entries).kcal
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

/** 0 to 1, clamped, for the ring and the bars. */
export function progressOf(done: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(1, Math.max(0, done / goal))
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

/** kg per week the plan moves, signed toward the target. */
export function weeklyPace(profile: Profile): number {
  if (profile.goal === 'lose') return 0.5
  if (profile.goal === 'gain') return 0.35
  return 0
}

/**
 * When the target weight is reached at the current pace, or null when there is
 * nothing to reach — a maintain plan has no finish line, and saying "never"
 * would be both true and unkind.
 */
export function goalDate(profile: Profile, from: Date): Date | null {
  const pace = weeklyPace(profile)
  const delta = Math.abs(profile.weightKg - profile.targetWeightKg)
  if (pace === 0 || delta < 0.1) return null
  const weeks = Math.ceil(delta / pace)
  return new Date(from.getTime() + weeks * 7 * 24 * 60 * 60 * 1000)
}

export function bmi(profile: Profile): number {
  const metres = profile.heightCm / 100
  return Math.round((profile.weightKg / (metres * metres)) * 10) / 10
}
