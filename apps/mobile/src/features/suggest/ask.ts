import type { Cuisine, Focus, Meal, MealTime } from '@/data'

/**
 * What the sheet asks, and what it answers on the user's behalf before they
 * touch anything.
 *
 * Apart from the components so it can be tested without a device: picking the
 * sitting off the clock is the one part of this feature that is wrong in a way
 * nobody reports — the sheet opens on "Lunch" at nine at night and the user
 * simply changes it, every time, and never says so.
 */

/**
 * How many dishes come back.
 *
 * The server decides it and this is the copy's copy of the number — the two are
 * separate because edge functions are Deno and outside the pnpm workspace, so
 * there is no module both halves can import (the same reason `icons.generated.ts`
 * exists twice). Nothing here depends on it being right: the list renders
 * whatever arrived. It is here so the card can say what it is offering.
 */
export const PICK_COUNT = 5

/** The four sittings, in the order the chips are drawn. */
export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** What the meal should be heavy in. Three, because a fourth is not a choice. */
export const FOCUSES: readonly Focus[] = ['protein', 'balanced', 'carbs']

/**
 * The kitchens, hardcoded.
 *
 * These are the four a Malaysian eater picks between, and a list read from the
 * catalogue would be a list of whatever happened to be imported. `others` is
 * last and is not a fifth cuisine: it is the absence of the constraint, for
 * somebody who wants Japanese or simply does not care.
 */
export const CUISINES: readonly Cuisine[] = ['malay', 'mamak', 'chinese', 'others']

/** The drawing beside each focus chip. */
export const FOCUS_ICONS = {
  protein: { set: 'food', name: 'chicken-drumstick' },
  balanced: { set: 'body', name: 'target' },
  carbs: { set: 'food', name: 'rice-bowl' },
} as const

/** The drawing beside a reason on the detail screen. */
export const REASON_ICONS = {
  protein: { set: 'body', name: 'muscle' },
  carbs: { set: 'food', name: 'carb-block' },
  fat: { set: 'food', name: 'fat-block' },
  calories: { set: 'food', name: 'kcal-tag' },
  taste: { set: 'food', name: 'noodle-bowl' },
} as const

/**
 * How far either side of a meal time still counts as that meal.
 *
 * Two and a half hours, which makes the four windows meet without gaps at the
 * default times (08:00, 13:00, 19:00) and puts the boundary between two
 * sittings halfway between them.
 */
const WINDOW_MINUTES = 150

const minutesOf = (at: string): number => {
  const [hours, mins] = at.split(':')
  return Number(hours) * 60 + Number(mins ?? 0)
}

/**
 * Which sitting it is, from the user's OWN meal times.
 *
 * `meal_times` is already the answer to "when does this person eat", set in
 * onboarding and editable in Settings, and it is a `time` rather than a
 * timestamp precisely so that it stays true when they fly somewhere. Reading it
 * here means somebody who has told the app their dinner is at nine gets Dinner
 * at nine, where a table of hardcoded windows would have handed them Snacks.
 *
 * A time far from every meal is a SNACK, which is what eating between meals is.
 * That is also the answer before the meal times have loaded and on an account
 * that somehow has none — and it is the safe one, because snack is the only
 * choice here that makes no claim about what sitting this is.
 *
 * Nothing is remembered between openings. The sheet is opened at a time of day,
 * and the time of day is the better guess than the last one they made.
 */
export function mealAt(now: Date, times: MealTime[] | undefined): Meal {
  if (!times?.length) return 'snack'

  const minutes = now.getHours() * 60 + now.getMinutes()
  let best: { meal: Meal; distance: number } | null = null

  for (const row of times) {
    if (!MEALS.includes(row.meal as Meal)) continue
    // Round the clock rather than along it: 00:30 is twenty minutes from a
    // 00:10 supper, not twenty-three hours and forty minutes from it.
    const raw = Math.abs(minutes - minutesOf(row.at))
    const distance = Math.min(raw, 24 * 60 - raw)
    if (!best || distance < best.distance) best = { meal: row.meal as Meal, distance }
  }

  return best && best.distance <= WINDOW_MINUTES ? best.meal : 'snack'
}

/** The ceiling's bounds. The server holds the same two. */
export const MIN_KCAL = 100
export const MAX_KCAL = 2000
/** What the stepper moves by. Fifty is a plate of rice either way. */
export const KCAL_STEP = 50

/**
 * What to put in the ceiling before the user touches it.
 *
 * The rest of the day's budget, rounded to a step, and capped at what one
 * sitting plausibly is — because a fresh morning has the whole 2,000 kcal left
 * and "suggest me a 2,000 kcal breakfast" is not the question anybody is
 * asking. Floored at the minimum so a day already over budget still opens on
 * something askable rather than on a dead button.
 */
export function defaultKcal(left: number, meal: Meal): number {
  const ceiling = meal === 'snack' ? 300 : 800
  const rounded = Math.round(Math.min(Math.max(left, MIN_KCAL), ceiling) / KCAL_STEP) * KCAL_STEP
  return Math.min(MAX_KCAL, Math.max(MIN_KCAL, rounded))
}
