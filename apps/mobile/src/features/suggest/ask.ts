import type { Cuisine, Focus, Meal, MealTime } from '@/data'
import type { TrackedCuisine } from '@/lib/analytics'

/**
 * What the sheet asks, and what it answers on the user's behalf before they
 * touch anything.
 *
 * Apart from the components so it can be tested without a device. Picking the
 * sitting off the clock is the part of this feature that goes wrong without
 * anybody reporting it: the sheet opens on "Lunch" at nine at night and the
 * user simply changes it, every time.
 */

/** The four sittings, in the order the chips are drawn. */
export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** What the meal should be heavy in. Three, because a fourth is not a choice. */
export const FOCUSES: readonly Focus[] = ['protein', 'balanced', 'carbs']

/**
 * The kitchens a new account starts with, kept as the words that go on screen
 * rather than as keys. `preferences.ts` holds the edited list, and
 * `cuisinePhrase` on the server holds the curated wording.
 *
 * The `satisfies` ties this to `TrackedCuisine`, the closed set of names
 * allowed to reach Mixpanel. A fourth default added here and not there would
 * report itself as `custom` for ever, on the one dashboard that exists to say
 * whether three are enough.
 */
export const DEFAULT_CUISINES = [
  'Malay',
  'Chinese',
  'Indian',
] as const satisfies readonly Capitalize<Exclude<TrackedCuisine, 'custom'>>[]

/** The longest a cuisine can be. The server holds the same bound. */
export const MAX_CUISINE_LENGTH = 40

/**
 * The cuisine, in a form that may be sent to Mixpanel. The list is the user's
 * own, so a cuisine is free text somebody typed, which the analytics rule keeps
 * out. A shipped default goes as itself because this repo wrote those words;
 * everything else goes as `custom`, which still answers whether three were
 * enough. `TrackedCuisine` makes this the only route between the two.
 */
export function trackedCuisine(cuisine: Cuisine): TrackedCuisine {
  const typed = cuisine.trim().toLowerCase()
  const known = DEFAULT_CUISINES.find((name) => name.toLowerCase() === typed)
  // The cast is what the `satisfies` above pays for: every member of that list
  // is the capitalised form of a `TrackedCuisine`, so its lower case is one.
  return known ? (known.toLowerCase() as TrackedCuisine) : 'custom'
}

/**
 * A cuisine as it is stored: trimmed, bounded, and with the whitespace inside
 * it collapsed so "Nasi   Padang" and "Nasi Padang" are not two entries.
 */
export const cleanCuisine = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().slice(0, MAX_CUISINE_LENGTH)

/*
 * No `FOCUS_ICONS`. The focus chips carried a drawing each and are a dropdown
 * now. A dropdown row could carry one, but the sitting and the cuisine beside
 * it cannot, and one of three fields wearing icons reads as three different
 * kinds of question.
 */

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
 * Which sitting it is, from the user's own meal times. `meal_times` already
 * answers "when does this person eat", and it is a `time` rather than a
 * timestamp so it stays true when they fly somewhere. Somebody whose dinner is
 * at nine gets Dinner at nine, where hardcoded windows would say Snacks.
 *
 * A time far from every meal is a snack, which is also the answer before the
 * meal times have loaded: it is the only choice that makes no claim about what
 * sitting this is.
 *
 * Nothing is remembered between openings. The time of day is the better guess.
 */
export function mealAt(now: Date, times: MealTime[] | undefined): Meal {
  if (!times?.length) return 'snack'

  const minutes = now.getHours() * 60 + now.getMinutes()
  let best: { meal: Meal; distance: number } | null = null

  for (const row of times) {
    if (!MEALS.includes(row.meal as Meal)) continue
    // Round the clock rather than along it: 00:30 is twenty minutes from a
    // 00:10 supper, not twenty-three hours from it.
    const raw = Math.abs(minutes - minutesOf(row.at))
    const distance = Math.min(raw, 24 * 60 - raw)
    if (!best || distance < best.distance) best = { meal: row.meal as Meal, distance }
  }

  return best && best.distance <= WINDOW_MINUTES ? best.meal : 'snack'
}

/**
 * How many dishes a request comes back with. A copy of the server's
 * `PICK_COUNT`, since the two are either side of the Deno / React Native line.
 * The list draws whatever arrives, but the wait draws a skeleton row per pick,
 * and a mismatch is a panel that changes height as the answer lands.
 */
export const PICK_COUNT = 7

/** The ceiling's bounds. The server holds the same two. */
export const MIN_KCAL = 100
export const MAX_KCAL = 2000
/** What the stepper moves by. Fifty is a plate of rice either way. */
export const KCAL_STEP = 50

/**
 * What to put in the ceiling before the user touches it: the rest of the day's
 * budget, rounded to a step and capped at what one sitting plausibly is, since
 * a fresh morning has the whole 2,000 kcal left. Floored at the minimum so a
 * day already over budget still opens on something askable.
 */
export function defaultKcal(left: number, meal: Meal): number {
  const ceiling = meal === 'snack' ? 300 : 800
  const rounded = Math.round(Math.min(Math.max(left, MIN_KCAL), ceiling) / KCAL_STEP) * KCAL_STEP
  return Math.min(MAX_KCAL, Math.max(MIN_KCAL, rounded))
}
