/**
 * Whether this account has earned the question "do you like RiceCal?", as a
 * pure function of what it has done.
 *
 * SPLIT OUT FROM THE REST OF THE FEATURE ON PURPOSE. Every branch here is a way
 * to annoy somebody or to waste the one ask the store allows, and none of them
 * is observable from the app: a gate that is too tight shows nothing, and a gate
 * that is too loose shows itself once and is never seen again. So the whole of
 * the decision is arithmetic over a plain object with a clock passed in, and the
 * test file next door is where it is actually checked.
 *
 * Nothing in this file touches MMKV, the store, or React. `prompt.ts` is what
 * holds it against a real user and a real clock.
 */

/**
 * The shape kept on disk, and the number in front of it.
 *
 * Anything this parser does not recognise is thrown away and replaced with a
 * fresh state, which resets `installedAt` to now and so DELAYS the next ask by
 * five days. That is the safe direction to be wrong in: the cost of a state we
 * cannot read is a question asked later than it could have been, never one
 * asked twice.
 */
export const RATING_STATE_VERSION = 1

export type RatingState = {
  version: number
  /** When this account was first seen on this handset, in epoch ms. */
  installedAt: number
  /** The app version it was last seen under, and when that last changed. */
  appVersion: string
  versionChangedAt: number
  /** Distinct local days on which this account did something worth counting. */
  activeDays: number
  lastActiveDay: string | null
  /** Meals logged, and reviews opened, since the counter existed. */
  meals: number
  reviews: number
  /** The last time the question was actually put, and under which version. */
  askedAt: number | null
  askedVersion: string | null
}

/**
 * Days between the account first being seen on this handset and the first
 * possible ask. "First seen" is the first counted action, since that is what
 * creates the stored state.
 */
export const MIN_DAYS_SINCE_INSTALL = 5

/**
 * And after an update.
 *
 * An app that has just changed under somebody is the worst moment to ask what
 * they think of it: they have not used the version they would be rating, and a
 * release that broke something is a release whose first two days are its worst.
 */
export const MIN_DAYS_SINCE_VERSION_CHANGE = 2

/**
 * Meals per checkpoint. The ask rides on crossing a multiple of this, so it is
 * the 15th meal, the 30th, the 45th.
 *
 * Fifteen is roughly a week of somebody logging what they actually eat. Below
 * that the app has not yet done the thing it is for, and a five-star rating from
 * somebody who logged three plates is worth less than the ask it spent.
 */
export const MEALS_PER_CHECKPOINT = 15

/**
 * Distinct days, not consecutive ones.
 *
 * The point is to exclude the person who installed the app, logged a fortnight
 * of meals in one sitting to see what it did, and will not open it again. A
 * streak would be a stricter test and a worse one: somebody who logs on Monday
 * and Thursday is a user, and a rule that says otherwise is a rule about
 * weekends.
 *
 * THREE RATHER THAN TWO, and the reason is not that two felt lax. The state is
 * created by the first counted action, so `installedAt` is that day and the
 * gate above already requires five days between it and the ask; a fifteenth
 * meal that clears the install gate has therefore been logged on a second day
 * by definition. At two this gate could never turn anything down, which is a
 * worse thing for a threshold to be than lax.
 */
export const MIN_ACTIVE_DAYS = 3

/**
 * How long the app leaves somebody alone after asking.
 *
 * Apple's own limit is three prompts a year per device, counted by the OS and
 * silently enforced: over it, `requestReview` does nothing at all and the app
 * cannot tell. Sixty days keeps us under it with room to spare, and the
 * same-version gate below means the realistic cadence is one ask per release.
 */
export const MIN_DAYS_BETWEEN_ASKS = 60

const DAY_MS = 24 * 60 * 60 * 1000

/** What each trigger says about the moment it fired in. */
export type RatingTrigger = 'meal_milestone' | 'review_opened' | 'manual'

export type RatingSkipReason =
  | 'too_soon_after_install'
  | 'too_soon_after_update'
  | 'too_few_meals'
  | 'too_few_active_days'
  | 'asked_recently'
  | 'asked_on_this_version'

export type RatingVerdict = { ask: true } | { ask: false; reason: RatingSkipReason }

export function initialState(now: number, appVersion: string): RatingState {
  return {
    version: RATING_STATE_VERSION,
    installedAt: now,
    appVersion,
    versionChangedAt: now,
    activeDays: 0,
    lastActiveDay: null,
    meals: 0,
    reviews: 0,
    askedAt: null,
    askedVersion: null,
  }
}

const tally = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

const moment = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const word = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

/** `null` for anything unreadable. The caller starts again from `initialState`. */
export function parseState(raw: string | undefined): RatingState | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!value || value.version !== RATING_STATE_VERSION) return null
    const installedAt = moment(value.installedAt)
    const appVersion = word(value.appVersion)
    if (installedAt === null || appVersion === null) return null
    return {
      version: RATING_STATE_VERSION,
      installedAt,
      appVersion,
      versionChangedAt: moment(value.versionChangedAt) ?? installedAt,
      activeDays: tally(value.activeDays),
      lastActiveDay: word(value.lastActiveDay),
      meals: tally(value.meals),
      reviews: tally(value.reviews),
      askedAt: moment(value.askedAt),
      askedVersion: word(value.askedVersion),
    }
  } catch {
    return null
  }
}

/**
 * `yyyy-MM-dd` in local time.
 *
 * The same three lines as `data/client.ts`'s `dateKey` rather than an import of
 * it, because `src/lib` does not reach into the data layer. Local rather than
 * `toISOString`, which reports UTC and so disagrees with the user's own day for
 * part of every one of them: two meals either side of that boundary would count
 * as two active days on one evening, or as one across two.
 */
export function dayKey(now: number): string {
  const date = new Date(now)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Noticed at every counted moment rather than at launch.
 *
 * A launch is not evidence of anything: a notification opened and dismissed is
 * one. This only moves when a meal goes on the day or a review is read, which is
 * the app being used.
 */
export function recordActivity(state: RatingState, now: number): RatingState {
  const today = dayKey(now)
  if (state.lastActiveDay === today) return state
  return { ...state, lastActiveDay: today, activeDays: state.activeDays + 1 }
}

/** A version change is not itself activity, so it moves the clock and nothing else. */
export function reconcileVersion(state: RatingState, now: number, appVersion: string): RatingState {
  if (state.appVersion === appVersion) return state
  return { ...state, appVersion, versionChangedAt: now }
}

export function markAsked(state: RatingState, now: number, appVersion: string): RatingState {
  return { ...state, askedAt: now, askedVersion: appVersion }
}

/**
 * A clock that has gone backwards reads as "it happened in the future", and the
 * difference is negative. Every gate below wants that treated as "not long
 * enough ago" rather than as "ages ago": a restored backup or a manual timezone
 * fix must not be a way to ask somebody twice in a week.
 */
const daysSince = (then: number, now: number): number => (now - then) / DAY_MS

/**
 * Should the question be put?
 *
 * The order is deliberate: the cheapest and most common refusals first, so the
 * reason that reaches Mixpanel is the FIRST thing wrong rather than an arbitrary
 * one of several. A brand new account is `too_soon_after_install`, which is what
 * it is, rather than `too_few_meals`.
 */
export function checkRating(state: RatingState, now: number, appVersion: string): RatingVerdict {
  if (daysSince(state.installedAt, now) < MIN_DAYS_SINCE_INSTALL) {
    return { ask: false, reason: 'too_soon_after_install' }
  }
  if (daysSince(state.versionChangedAt, now) < MIN_DAYS_SINCE_VERSION_CHANGE) {
    return { ask: false, reason: 'too_soon_after_update' }
  }
  if (state.meals < MEALS_PER_CHECKPOINT) {
    return { ask: false, reason: 'too_few_meals' }
  }
  if (state.activeDays < MIN_ACTIVE_DAYS) {
    return { ask: false, reason: 'too_few_active_days' }
  }
  if (state.askedAt !== null && daysSince(state.askedAt, now) < MIN_DAYS_BETWEEN_ASKS) {
    return { ask: false, reason: 'asked_recently' }
  }
  // The gate that makes the realistic cadence one ask per release rather than
  // one every sixty days. Somebody who said "not really" in March should meet
  // the question again only once the app has actually changed.
  if (state.askedVersion === appVersion) {
    return { ask: false, reason: 'asked_on_this_version' }
  }
  return { ask: true }
}

/**
 * Did this meal cross a checkpoint?
 *
 * A CROSSING RATHER THAN AN EXACT MULTIPLE, which is the same one line and one
 * failure mode fewer: `meals % 15 === 0` is only correct while the counter moves
 * by exactly one, and a caller that ever records two would step over the 15th
 * meal and wait silently for the 30th. `before` is the count as it stood.
 */
export function crossedCheckpoint(before: number, after: number): boolean {
  if (after < MEALS_PER_CHECKPOINT) return false
  return Math.floor(after / MEALS_PER_CHECKPOINT) > Math.floor(before / MEALS_PER_CHECKPOINT)
}

/**
 * And for reviews, which are rarer and worth less individually.
 *
 * The second one, then every fifth. The first review anybody opens is a
 * curiosity; the second is somebody who came back for it, which is the moment
 * this trigger exists for. A weekly review appears once a week, so "every fifth"
 * is a month or more apart and could never carry the ask on its own.
 */
export function reviewWorthAsking(reviews: number): boolean {
  return reviews === 2 || (reviews > 2 && reviews % 5 === 0)
}
