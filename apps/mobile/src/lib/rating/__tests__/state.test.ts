import {
  checkRating,
  crossedCheckpoint,
  dayKey,
  initialState,
  MEALS_PER_CHECKPOINT,
  MIN_ACTIVE_DAYS,
  MIN_DAYS_BETWEEN_ASKS,
  MIN_DAYS_SINCE_INSTALL,
  MIN_DAYS_SINCE_VERSION_CHANGE,
  markAsked,
  parseState,
  type RatingState,
  reconcileVersion,
  recordActivity,
  reviewWorthAsking,
} from '../state'

/**
 * The gate in front of the rating sheet.
 *
 * Worth testing at this length because none of it is visible from the app: a
 * threshold that is too tight shows nothing at all, and one that is too loose
 * spends the account's one store dialog on somebody who was not ready to be
 * asked. Neither failure looks like a bug from the outside, so this file is
 * where the boundaries are actually checked.
 */

const VERSION = '1.2.0'
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 7, 21, 9, 0, 0)

/** An account that has earned the question on every count. */
function ready(): RatingState {
  return {
    ...initialState(NOW - 30 * DAY, VERSION),
    meals: MEALS_PER_CHECKPOINT,
    activeDays: MIN_ACTIVE_DAYS,
  }
}

describe('checkRating', () => {
  it('asks when every gate is satisfied', () => {
    expect(checkRating(ready(), NOW, VERSION)).toEqual({ ask: true })
  })

  it('waits out the first days after install', () => {
    const state = { ...ready(), installedAt: NOW - (MIN_DAYS_SINCE_INSTALL - 1) * DAY }
    expect(checkRating(state, NOW, VERSION)).toEqual({
      ask: false,
      reason: 'too_soon_after_install',
    })
    // And the boundary itself is old enough.
    expect(
      checkRating({ ...state, installedAt: NOW - MIN_DAYS_SINCE_INSTALL * DAY }, NOW, VERSION),
    ).toEqual({ ask: true })
  })

  it('waits out the first days after an update', () => {
    // The release that broke something is the release whose first two days are
    // its worst, and the user has not yet used the version they would rate.
    const state = { ...ready(), versionChangedAt: NOW - (MIN_DAYS_SINCE_VERSION_CHANGE - 1) * DAY }
    expect(checkRating(state, NOW, VERSION)).toEqual({
      ask: false,
      reason: 'too_soon_after_update',
    })
  })

  it('wants a fortnight of meals and two separate days', () => {
    expect(checkRating({ ...ready(), meals: MEALS_PER_CHECKPOINT - 1 }, NOW, VERSION)).toEqual({
      ask: false,
      reason: 'too_few_meals',
    })
    // The person who logged a fortnight in one sitting to see what it did.
    expect(checkRating({ ...ready(), activeDays: MIN_ACTIVE_DAYS - 1 }, NOW, VERSION)).toEqual({
      ask: false,
      reason: 'too_few_active_days',
    })
  })

  it('goes quiet for the cooldown and comes back at the end of it', () => {
    const asked = markAsked(ready(), NOW - MIN_DAYS_BETWEEN_ASKS * DAY + 1, 'older')
    expect(checkRating(asked, NOW, VERSION)).toEqual({ ask: false, reason: 'asked_recently' })
    expect(
      checkRating(markAsked(ready(), NOW - MIN_DAYS_BETWEEN_ASKS * DAY, 'older'), NOW, VERSION),
    ).toEqual({ ask: true })
  })

  it('never asks twice on one version, however long ago it was', () => {
    // A year later, still the same build: somebody who said "not really" should
    // meet the question again only once the app has actually changed.
    const asked = markAsked(ready(), NOW - 365 * DAY, VERSION)
    expect(checkRating(asked, NOW, VERSION)).toEqual({
      ask: false,
      reason: 'asked_on_this_version',
    })
  })

  it('treats a clock that has gone backwards as too recent', () => {
    // A restored backup or a manual timezone change puts the stamp in the
    // future. Read as "ages ago" it would be a way to be asked twice in a week.
    const asked = markAsked(ready(), NOW + 10 * DAY, 'older')
    expect(checkRating(asked, NOW, VERSION)).toEqual({ ask: false, reason: 'asked_recently' })
  })

  it('reports the first thing wrong, not an arbitrary one', () => {
    // A brand new account fails four gates. The reason that reaches Mixpanel
    // should be the one that is actually true of it.
    const fresh = initialState(NOW, VERSION)
    expect(checkRating(fresh, NOW, VERSION)).toEqual({
      ask: false,
      reason: 'too_soon_after_install',
    })
  })
})

describe('recordActivity', () => {
  it('counts a day once, however many meals it holds', () => {
    const morning = recordActivity(initialState(NOW, VERSION), NOW)
    const evening = recordActivity(morning, NOW + 6 * 60 * 60 * 1000)
    expect(evening.activeDays).toBe(1)
    // The same object back, so nothing is written for a no-op.
    expect(evening).toBe(morning)
  })

  it('counts the next day separately', () => {
    const first = recordActivity(initialState(NOW, VERSION), NOW)
    const second = recordActivity(first, NOW + DAY)
    expect(second.activeDays).toBe(2)
    expect(second.lastActiveDay).toBe(dayKey(NOW + DAY))
  })
})

describe('reconcileVersion', () => {
  it('moves the clock when the app has changed under the account', () => {
    const before = initialState(NOW - 10 * DAY, '1.1.0')
    const after = reconcileVersion(before, NOW, VERSION)
    expect(after.appVersion).toBe(VERSION)
    expect(after.versionChangedAt).toBe(NOW)
    // And leaves everything else alone: an update is not activity.
    expect(after.activeDays).toBe(before.activeDays)
    expect(after.installedAt).toBe(before.installedAt)
  })

  it('is a no-op on the same version', () => {
    const state = initialState(NOW - 10 * DAY, VERSION)
    expect(reconcileVersion(state, NOW, VERSION)).toBe(state)
  })
})

describe('parseState', () => {
  it('reads back what it wrote', () => {
    const state = markAsked(ready(), NOW, VERSION)
    expect(parseState(JSON.stringify(state))).toEqual(state)
  })

  it('refuses anything it does not recognise', () => {
    expect(parseState(undefined)).toBeNull()
    expect(parseState('not json')).toBeNull()
    expect(parseState(JSON.stringify({ version: 99, installedAt: NOW }))).toBeNull()
    // No install date is no state: the five-day gate has nothing to measure.
    expect(parseState(JSON.stringify({ version: 1, appVersion: VERSION }))).toBeNull()
  })

  it('repairs a partial state rather than trusting it', () => {
    const parsed = parseState(
      JSON.stringify({
        version: 1,
        installedAt: NOW,
        appVersion: VERSION,
        meals: 'seventeen',
        activeDays: -4,
        askedAt: 'yesterday',
      }),
    )
    // A count that is not a count reads as zero, which DELAYS the next ask. The
    // other direction would be a corrupt state that asks immediately.
    expect(parsed?.meals).toBe(0)
    expect(parsed?.activeDays).toBe(0)
    expect(parsed?.askedAt).toBeNull()
    expect(parsed?.versionChangedAt).toBe(NOW)
  })
})

describe('crossedCheckpoint', () => {
  it('fires on the fifteenth meal and not on the fourteenth or sixteenth', () => {
    expect(crossedCheckpoint(13, 14)).toBe(false)
    expect(crossedCheckpoint(14, 15)).toBe(true)
    expect(crossedCheckpoint(15, 16)).toBe(false)
    expect(crossedCheckpoint(29, 30)).toBe(true)
  })

  it('still fires when the counter steps over the checkpoint', () => {
    // The whole reason this is a crossing rather than `meals % 15 === 0`.
    expect(crossedCheckpoint(14, 17)).toBe(true)
  })
})

describe('reviewWorthAsking', () => {
  it('is the second review, then every fifth', () => {
    // The first is a curiosity. The second is somebody who came back for it.
    expect([1, 2, 3, 4, 5, 6, 10, 15].map(reviewWorthAsking)).toEqual([
      false,
      true,
      false,
      false,
      true,
      false,
      true,
      true,
    ])
  })
})
