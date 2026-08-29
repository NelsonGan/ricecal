import { createMMKV } from 'react-native-mmkv'

/**
 * When this account last had a paywall in front of it.
 *
 * MMKV rather than a column: Today has the strictest first-paint budget in the
 * app and an offline launch has to be able to answer this.
 *
 * Keyed by user, because a phone two people sign into in turn would otherwise
 * show one of them somebody else's quiet fortnight.
 *
 * Written by the paywall itself rather than by the nudge, so every route into
 * that screen marks it. The rule is "at most one paywall every two days", not
 * "one nudge every two days plus every refusal".
 */
const storage = createMMKV({ id: 'ricecal-paywall' })

const key = (userId: string) => `seen:${userId}`

/**
 * How long the app leaves somebody alone after showing them the price. Two days
 * means a user who opens the app three times a day meets the offer on one
 * launch in six.
 */
export const NUDGE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000

export function markPaywallSeen(userId: string, now: number = Date.now()): void {
  storage.set(key(userId), now)
}

/**
 * Is this account due the standing offer? Never having seen one counts as due:
 * a user signed in since before this existed has never been told what Pro
 * costs.
 *
 * `now` is a parameter so the boundary is testable without moving the clock.
 */
export function paywallDue(userId: string, now: number = Date.now()): boolean {
  const seen = storage.getNumber(key(userId))
  if (seen === undefined) return true
  // A clock that has gone backwards reads as "seen in the future" and would
  // otherwise silence the offer until the phone caught up.
  if (seen > now) return true
  return now - seen >= NUDGE_INTERVAL_MS
}
