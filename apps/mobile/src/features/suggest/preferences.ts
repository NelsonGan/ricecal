import { createMMKV } from 'react-native-mmkv'

import type { Cuisine, Focus } from '@/data'
import { cleanCuisine, DEFAULT_CUISINES, FOCUSES } from './ask'

/**
 * What the ask sheet remembers between openings.
 *
 * Somebody who eats Malay food and wants protein wants that again tomorrow, so
 * asking from scratch charges three taps for nothing.
 *
 * MMKV rather than `user_settings`: this is a preference about a control, and
 * the sheet opens on a tap with no room for a spinner. Keyed by user, so a
 * phone two people sign into does not hand the second one the first one's
 * taste.
 *
 * The sitting and the calorie ceiling are deliberately absent. The sitting
 * comes off the clock against `meal_times` (see `mealAt`), and a saved one
 * would offer last night's dinner at breakfast. The ceiling follows the sitting
 * and the day's remaining budget, both of which move. What is remembered is the
 * kind of food, which is the part that is the same tomorrow.
 */

const storage = createMMKV({ id: 'ricecal-suggest' })

/**
 * How many kitchens the list holds. A ceiling rather than a rule anybody meets:
 * it exists so a corrupted array cannot become a list a screen has to render.
 */
export const MAX_CUISINES = 12

/** What is remembered. Anything time- or day-dependent is deliberately absent. */
export type SuggestPreferences = {
  focus: Focus
  cuisine: Cuisine
  /**
   * The kitchens the dropdown offers, which the user edits themselves. Here
   * only: no column, no sync. Forgetting it costs three defaults back and a
   * moment's typing, where a column costs a migration, a grant and a query the
   * sheet has to wait on.
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
 * Validated rather than trusted: storage outlives the build that wrote it, and
 * this shape has changed once already (the cuisine was one of four keys and is
 * now a word off a list the user keeps). A select with a value nothing matches
 * draws as the placeholder while still being what gets sent.
 *
 * Each field falls back on its own, so one stale answer does not throw away the
 * others, and the selected cuisine falls back to the head of the surviving list.
 */
export function readPreferences(userId: string): SuggestPreferences {
  let stored: Partial<SuggestPreferences> = {}
  try {
    stored = JSON.parse(storage.getString(key(userId)) ?? '{}') as Partial<SuggestPreferences>
  } catch {
    // Written by an older build, or half-written by a process that died.
    // Either way the defaults are a fine answer.
  }

  const cuisines = cleanCuisines(stored.cuisines)
  const cuisine = cleanCuisine(typeof stored.cuisine === 'string' ? stored.cuisine : '')

  return {
    focus: FOCUSES.includes(stored.focus as Focus)
      ? (stored.focus as Focus)
      : DEFAULT_PREFERENCES.focus,
    cuisines,
    // On the list, or the head of it. A build upgrading from the four keys
    // arrives with `malay` against a list reading "Malay", so the comparison is
    // case-insensitive and returns the list's spelling.
    cuisine: cuisines.find((known) => known.toLowerCase() === cuisine.toLowerCase()) ?? cuisines[0],
    healthy: typeof stored.healthy === 'boolean' ? stored.healthy : DEFAULT_PREFERENCES.healthy,
  }
}

/**
 * A stored list of kitchens, made safe to draw and to send: deduped
 * case-insensitively, bounded, and never empty, since a dropdown with nothing
 * in it is a control with no way out of itself.
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
 * Saved when the question is asked rather than as each chip is tapped. A chip
 * tapped and tapped back is not a preference, and neither is a sheet somebody
 * opened and dismissed.
 */
export function savePreferences(userId: string, answers: SuggestPreferences): void {
  storage.set(key(userId), JSON.stringify(answers))
}

/**
 * The list alone, saved as it is edited. The exception to the rule above, for
 * the reason that rule gives: a cuisine somebody typed out is work rather than
 * a tap, and dismissing the sheet should not lose it.
 */
export function saveCuisines(userId: string, cuisines: Cuisine[]): void {
  const current = readPreferences(userId)
  savePreferences(userId, { ...current, cuisines: cleanCuisines(cuisines) })
}
