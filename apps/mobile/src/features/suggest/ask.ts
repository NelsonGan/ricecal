import type { Cuisine, Focus, Meal, MealTime } from '@/data'
import type { TrackedCuisine } from '@/lib/analytics'

/**
 * What the sheet asks, and what it answers on the user's behalf before they
 * touch anything.
 *
 * Apart from the components so it can be tested without a device: picking the
 * sitting off the clock is the one part of this feature that is wrong in a way
 * nobody reports — the sheet opens on "Lunch" at nine at night and the user
 * simply changes it, every time, and never says so.
 */

/** The four sittings, in the order the chips are drawn. */
export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** What the meal should be heavy in. Three, because a fourth is not a choice. */
export const FOCUSES: readonly Focus[] = ['protein', 'balanced', 'carbs']

/**
 * The kitchens a new account starts with, and nothing more than a starting
 * point.
 *
 * So these three are a DEFAULT the user edits, kept as the words that go on
 * screen rather than as keys — see `preferences.ts` for where the edited list
 * lives, and `cuisinePhrase` on the server for the four that still carry
 * curated wording when they are typed.
 *
 * The `satisfies` is what ties this list to `TrackedCuisine`, which is the
 * closed set of cuisine names allowed to reach Mixpanel. A fourth default added
 * here without a fourth member added there would compile fine and then report
 * itself as `custom` for ever — a silent wrong answer on the one dashboard that
 * exists to say whether these three are the right three. This way it does not
 * compile.
 */
export const DEFAULT_CUISINES = [
  'Malay',
  'Chinese',
  'Indian',
] as const satisfies readonly Capitalize<Exclude<TrackedCuisine, 'custom'>>[]

/** The longest a cuisine can be. The server holds the same bound. */
export const MAX_CUISINE_LENGTH = 40

/**
 * The cuisine, in a form that may be sent to Mixpanel.
 *
 * The list is the user's own now, so a cuisine is free text somebody typed on
 * their phone — and free text somebody typed is the one category the analytics
 * rule keeps out. One of the shipped defaults goes as itself, because those are
 * words this repo wrote; everything else goes as `custom`, which still answers
 * the only question worth asking about the list: whether three were enough.
 *
 * See `TrackedCuisine` in `lib/analytics/events.ts`, which is the type that
 * makes this the only route from one to the other.
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
 * No `FOCUS_ICONS`. There was a drawing beside each focus chip — a drumstick, a
 * target, a rice bowl — and the chips are a dropdown now. A dropdown row could
 * carry one, but the sitting and the cuisine beside it cannot: their lists are
 * four meals and whatever the user has typed. One of three fields wearing icons
 * reads as three different kinds of question, which is the thing the dropdowns
 * were adopted to stop.
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

/**
 * How many dishes a request comes back with.
 *
 * The client's copy of the server's `PICK_COUNT`, and it is a copy for the
 * ordinary reason: the two live either side of the Deno / React Native line and
 * cannot import each other. Nothing here DEPENDS on it being right — the list
 * draws whatever arrives — but the wait draws a skeleton row per pick, and a
 * skeleton that does not match what lands is a panel that changes height at the
 * one moment it must not.
 */
export const PICK_COUNT = 7

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
