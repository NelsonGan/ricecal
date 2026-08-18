import { createMMKV } from 'react-native-mmkv'

/**
 * When this account last had a paywall in front of it.
 *
 * MMKV rather than a column, for the reason the tour flag is: it exists so a
 * screen does not appear too often, which is a question about this install and
 * this launch. A column would mean a query to answer before Today can decide,
 * on the screen with the strictest first-paint budget in the app, and an
 * offline launch could not answer it at all.
 *
 * KEYED BY USER, though. The offer is made to a person, and a phone two people
 * sign into in turn — which is every test device and plenty of real ones —
 * would otherwise show one of them somebody else's quiet fortnight.
 *
 * WRITTEN BY THE PAYWALL ITSELF, not by the nudge. Every route into that screen
 * marks it: the standing offer below, a refused button, a scan that ran out, the
 * end of onboarding. So the rule the user experiences is "at most one paywall
 * every two days" rather than "one nudge every two days plus every refusal" —
 * and somebody who has just been shown the price by pressing Describe is not
 * shown it again the next morning for no reason.
 */
const storage = createMMKV({ id: 'ricecal-paywall' })

const key = (userId: string) => `seen:${userId}`

/**
 * How long the app leaves somebody alone after showing them the price.
 *
 * Two days is the number the product asked for, and it is the interesting part
 * of the whole feature: a free tier that never mentions Pro converts nobody,
 * and one that mentions it on every launch is an app people delete. Two days
 * means a user who opens the app three times a day meets the offer on one
 * launch in six.
 */
export const NUDGE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000

export function markPaywallSeen(userId: string, now: number = Date.now()): void {
  storage.set(key(userId), now)
}

/**
 * Is this account due the standing offer?
 *
 * NEVER SEEN ONE IS DUE. A user who has been signed in since before this
 * existed, or who left onboarding by a route with no paywall on it, has never
 * been told what Pro costs — which is the one state where showing it is
 * obviously right.
 *
 * `now` is a parameter so the boundary is testable without moving the clock.
 */
export function paywallDue(userId: string, now: number = Date.now()): boolean {
  const seen = storage.getNumber(key(userId))
  if (seen === undefined) return true
  // A clock that has gone backwards — a timezone fix, a manual change, a
  // restored backup — reads as "seen in the future" and would otherwise silence
  // the offer until the phone caught up. Treated as due, which is the same
  // answer as never having seen one.
  if (seen > now) return true
  return now - seen >= NUDGE_INTERVAL_MS
}
