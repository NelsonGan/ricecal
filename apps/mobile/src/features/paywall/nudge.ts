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
 * How long the app leaves somebody alone after showing them the price, from
 * any route. A milestone reached inside it waits for it to pass, and is still
 * owed then if it still holds.
 */
export const NUDGE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000

export function markPaywallSeen(userId: string, now: number = Date.now()): void {
  storage.set(key(userId), now)
}

/**
 * Has this account gone long enough without a paywall to be offered one? Never
 * having seen one counts as due.
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

/** The milestones that earn an offer, each once per account. */
export type Milestone = 'nudge_streak' | 'nudge_goal'

const milestoneKey = (userId: string, milestone: Milestone) => `milestone:${milestone}:${userId}`

export function markMilestone(userId: string, milestone: Milestone): void {
  storage.set(milestoneKey(userId, milestone), true)
}

/**
 * Has a weigh-in reached the goal weight, from the side it started on?
 *
 * The oldest reading the app holds says which way the goal lies: above the
 * target means losing, below it gaining. Reaching it is the newest reading
 * arriving at or past the target from that side. A reading that started on
 * the target, or one reading alone, says nothing yet.
 */
export function reachedGoal(weighIns: readonly { kg: number }[], targetKg: number): boolean {
  if (!(targetKg > 0) || weighIns.length < 2) return false
  const first = weighIns[0].kg
  const latest = weighIns[weighIns.length - 1].kg
  if (first > targetKg) return latest <= targetKg
  if (first < targetKg) return latest >= targetKg
  return false
}

/**
 * Which milestone, if any, is owed an offer now. The streak comes first: it is
 * the habit, and the goal is often the end of one.
 */
export function milestoneDue(
  userId: string,
  facts: {
    streakDays: number
    streakGoal: number
    weighIns?: readonly { kg: number }[]
    targetKg: number
  },
): Milestone | null {
  if (
    facts.streakDays >= facts.streakGoal &&
    !storage.getBoolean(milestoneKey(userId, 'nudge_streak'))
  )
    return 'nudge_streak'
  if (
    facts.weighIns &&
    reachedGoal(facts.weighIns, facts.targetKg) &&
    !storage.getBoolean(milestoneKey(userId, 'nudge_goal'))
  )
    return 'nudge_goal'
  return null
}
