import { createMMKV } from 'react-native-mmkv'

import type { Cuisine, Focus } from '@/data'
import { CUISINES, FOCUSES } from './ask'

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

/** What is remembered. Anything time- or day-dependent is deliberately absent. */
export type SuggestPreferences = {
  focus: Focus
  cuisine: Cuisine
  /** Whether to lean towards the lighter of two dishes that both fit. */
  healthy: boolean
}

export const DEFAULT_PREFERENCES: SuggestPreferences = {
  focus: 'balanced',
  cuisine: 'malay',
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
 * wrote it, so a cuisine dropped from `CUISINES` in a later version would come
 * back as a value the chips cannot select and the server would refuse — a sheet
 * with no cuisine highlighted and a button that 400s. Each field falls back on
 * its own, so one stale answer does not throw away the other two.
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

  return {
    focus: FOCUSES.includes(stored.focus as Focus)
      ? (stored.focus as Focus)
      : DEFAULT_PREFERENCES.focus,
    cuisine: CUISINES.includes(stored.cuisine as Cuisine)
      ? (stored.cuisine as Cuisine)
      : DEFAULT_PREFERENCES.cuisine,
    healthy: typeof stored.healthy === 'boolean' ? stored.healthy : DEFAULT_PREFERENCES.healthy,
  }
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
