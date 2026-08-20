import { createMMKV } from 'react-native-mmkv'

import type { Cuisine, Focus } from '@/data'
import { cleanCuisine, DEFAULT_CUISINES, FOCUSES } from './ask'

/**
 * What the ask sheet remembers between openings.
 *
 * Somebody who eats Malay food and wants protein wants that again tomorrow.
 * Answered from scratch every time, the sheet asks four questions to which
 * three of the answers were the same as last time, which is three taps charged
 * for nothing.
 *
 * MMKV rather than `user_settings`, for the reason the tour flag is: this is a
 * preference about a control, not a fact about the account. A column would mean
 * a query to answer before the sheet could be drawn — and the sheet opens on a
 * tap, over a screen, with no room for a spinner. Keyed by user all the same,
 * because a phone two people sign into in turn would otherwise hand the second
 * one the first one's taste.
 *
 * THE SITTING IS NOT HERE, and neither is the calorie ceiling.
 *
 * The sitting is answered by the clock against the user's own `meal_times` —
 * see `mealAt` — and a saved one would be last night's dinner offered at
 * breakfast. It is the one answer on this sheet that is about WHEN rather than
 * about taste.
 *
 * The ceiling follows the sitting (`defaultKcal`) and the day's remaining
 * budget, both of which move: a 300 saved from a snack would open tomorrow's
 * dinner at 300, and a figure saved on a day with 2,900 kcal left is the wrong
 * question on a day with 400. What is remembered is the kind of food, which is
 * the part that is genuinely the same tomorrow.
 */

const storage = createMMKV({ id: 'ricecal-suggest' })

/**
 * How many kitchens the list holds.
 *
 * A ceiling rather than a rule anybody will meet: twelve is already more than a
 * dropdown wants to be, and the number exists so that a corrupted array cannot
 * turn into a list a screen has to render.
 */
export const MAX_CUISINES = 12

/** What is remembered. Anything time- or day-dependent is deliberately absent. */
export type SuggestPreferences = {
  focus: Focus
  cuisine: Cuisine
  /**
   * The kitchens the dropdown offers, which the user edits themselves.
   *
   * HERE AND NOWHERE ELSE — no column, no table, no sync. It is a list of words
   * that go into one line of one prompt, so the cost of a phone forgetting it is
   * three defaults back and a moment's typing, and the cost of putting it in
   * Postgres is a migration, a grant, a query the sheet has to wait on, and a
   * fourth thing that can be offline. See the note at the top of this file about
   * why the rest of these preferences are here.
   */
  cuisines: Cuisine[]
  /** Whether to lean towards the lighter of two dishes that both fit. */
  healthy: boolean
}

export const DEFAULT_PREFERENCES: SuggestPreferences = {
  focus: 'balanced',
  cuisine: DEFAULT_CUISINES[0],
  cuisines: [...DEFAULT_CUISINES],
  // On by default. It is a tie-break between real dishes rather than a diet
  // setting, so the version of the app somebody meets first should be the one
  // that leans the right way; turning it off is a deliberate act.
  healthy: true,
}

const key = (userId: string) => `answers:${userId}`

/**
 * What they chose last time, or the defaults.
 *
 * VALIDATED on the way out rather than trusted. Storage outlives the build that
 * wrote it, and this file has already changed shape once — the cuisine was one
 * of four keys and is now a word off a list the user keeps. A build reading
 * `malay` out of storage must not hand the dropdown a value that is on no list,
 * because a select with a value nothing matches draws as the placeholder while
 * still being what gets sent.
 *
 * Each field falls back on its own, so one stale answer does not throw away the
 * others, and the SELECTED cuisine falls back to the head of whatever list
 * survived rather than to a constant.
 */
export function readPreferences(userId: string): SuggestPreferences {
  let stored: Partial<SuggestPreferences> = {}
  try {
    stored = JSON.parse(storage.getString(key(userId)) ?? '{}') as Partial<SuggestPreferences>
  } catch {
    // Written by a build that shaped this differently, or half-written by a
    // process that died. Either way the defaults are a fine answer and there is
    // nothing here worth reporting.
  }

  const cuisines = cleanCuisines(stored.cuisines)
  const cuisine = cleanCuisine(typeof stored.cuisine === 'string' ? stored.cuisine : '')

  return {
    focus: FOCUSES.includes(stored.focus as Focus)
      ? (stored.focus as Focus)
      : DEFAULT_PREFERENCES.focus,
    cuisines,
    // On the list, or the head of it. A build upgrading from the four keys
    // arrives here with `malay` and a list reading "Malay", so the comparison
    // is case-insensitive and returns the LIST's spelling — the one the
    // dropdown will be comparing against.
    cuisine: cuisines.find((known) => known.toLowerCase() === cuisine.toLowerCase()) ?? cuisines[0],
    healthy: typeof stored.healthy === 'boolean' ? stored.healthy : DEFAULT_PREFERENCES.healthy,
  }
}

/**
 * A stored list of kitchens, made safe to draw and to send.
 *
 * Deduped case-insensitively, since "malay" and "Malay" are one kitchen and two
 * rows in a dropdown; bounded, because a list is a thing somebody can go on
 * adding to and every entry is a key in a rendered list; and never empty, since
 * a dropdown with nothing in it is a control with no way out of itself.
 */
function cleanCuisines(raw: unknown): Cuisine[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CUISINES]

  const seen = new Set<string>()
  const list: Cuisine[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const clean = cleanCuisine(entry)
    if (!clean || seen.has(clean.toLowerCase())) continue
    seen.add(clean.toLowerCase())
    list.push(clean)
    if (list.length >= MAX_CUISINES) break
  }

  return list.length > 0 ? list : [...DEFAULT_CUISINES]
}

/**
 * Saved when the question is ASKED, not as each chip is tapped.
 *
 * A chip tapped and then tapped back is not a preference, and neither is a
 * sheet somebody opened, looked at and dismissed. What is worth remembering is
 * the set of answers they actually sent.
 */
export function savePreferences(userId: string, answers: SuggestPreferences): void {
  storage.set(key(userId), JSON.stringify(answers))
}

/**
 * The list alone, saved as it is EDITED rather than when the question is asked.
 *
 * The exception to the rule above it, and for the reason that rule gives: a
 * chip tapped and tapped back is not a preference, but a cuisine somebody typed
 * out and added is one, and losing it because they then dismissed the sheet
 * would be losing work rather than losing a tap. The three answers around it
 * are still saved on Ask.
 */
export function saveCuisines(userId: string, cuisines: Cuisine[]): void {
  const current = readPreferences(userId)
  savePreferences(userId, { ...current, cuisines: cleanCuisines(cuisines) })
}
