import { markPaywallSeen, NUDGE_INTERVAL_MS, paywallDue } from '../nudge'

/**
 * The clock behind the standing offer.
 *
 * Worth testing for its size because every branch of it is a way to annoy
 * somebody: too eager and a free account meets a paywall on every launch, too
 * lax and it is never told the app has a paid tier at all. The boundary is
 * exact — a launch at the two-day mark is due — so both sides of it are here.
 */

const USER = 'user-1'
const OTHER = 'user-2'
const NOW = Date.UTC(2026, 7, 18, 9, 0, 0)

describe('paywallDue', () => {
  it('is due when this account has never seen one', () => {
    // The state of everybody signed in before the offer existed, and of anybody
    // who left onboarding by a route with no paywall on it. Showing the price to
    // somebody who has never been told it is the one obvious case.
    expect(paywallDue('never-seen', NOW)).toBe(true)
  })

  it('goes quiet for the interval and comes back at the end of it', () => {
    markPaywallSeen(USER, NOW)

    expect(paywallDue(USER, NOW)).toBe(false)
    expect(paywallDue(USER, NOW + NUDGE_INTERVAL_MS - 1)).toBe(false)
    expect(paywallDue(USER, NOW + NUDGE_INTERVAL_MS)).toBe(true)
  })

  it('is answered per account, not per phone', () => {
    // Every test device, and plenty of real ones. Keyed by handset, the second
    // person to sign in would inherit the first person's quiet fortnight.
    markPaywallSeen(USER, NOW)
    expect(paywallDue(OTHER, NOW)).toBe(true)
  })

  it('treats a clock that has gone backwards as due', () => {
    // A timezone fix, a manual change, a restored backup: the stored moment is
    // in the future and the difference is negative. Read as "not yet" it would
    // silence the offer until the phone caught up, which could be years.
    markPaywallSeen(USER, NOW)
    expect(paywallDue(USER, NOW - NUDGE_INTERVAL_MS)).toBe(true)
  })
})

describe('reachedGoal', () => {
  const { reachedGoal } = jest.requireActual<typeof import('../nudge')>('../nudge')
  it('reaches a lower goal from above, and a higher one from below', () => {
    expect(reachedGoal([{ kg: 80 }, { kg: 72 }, { kg: 69.9 }], 70)).toBe(true)
    expect(reachedGoal([{ kg: 80 }, { kg: 71 }], 70)).toBe(false)
    expect(reachedGoal([{ kg: 50 }, { kg: 55 }], 55)).toBe(true)
  })
  it('says nothing from one reading, no target, or a start on the target', () => {
    expect(reachedGoal([{ kg: 69 }], 70)).toBe(false)
    expect(reachedGoal([{ kg: 80 }, { kg: 60 }], 0)).toBe(false)
    expect(reachedGoal([{ kg: 70 }, { kg: 70 }], 70)).toBe(false)
  })
  it('does not count staying under a goal already passed', () => {
    // The oldest reading is already past a losing goal, so it reads as a
    // gaining goal and a lower newest reading has not reached it.
    expect(reachedGoal([{ kg: 68 }, { kg: 67 }], 70)).toBe(false)
  })
})

describe('milestoneDue', () => {
  const { milestoneDue, markMilestone } = jest.requireActual<typeof import('../nudge')>('../nudge')
  const facts = { streakDays: 7, streakGoal: 7, weighIns: [{ kg: 80 }, { kg: 69 }], targetKg: 70 }
  it('offers the streak first, then the goal, each once', () => {
    expect(milestoneDue('m1', facts)).toBe('nudge_streak')
    markMilestone('m1', 'nudge_streak')
    expect(milestoneDue('m1', facts)).toBe('nudge_goal')
    markMilestone('m1', 'nudge_goal')
    expect(milestoneDue('m1', facts)).toBe(null)
  })
  it('waits for a streak of the full length', () => {
    expect(milestoneDue('m2', { ...facts, streakDays: 6, weighIns: undefined })).toBe(null)
  })
})
