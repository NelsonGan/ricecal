/**
 * Whether this account has earned the question "do you like RiceCal?", as a pure
 * function of what it has done.
 *
 * Split out from the rest of the feature, because every branch is a way to annoy
 * somebody or waste the one ask the store allows, and none of them is observable
 * from the app: too tight shows nothing, too loose shows itself once. So the
 * decision is arithmetic over a plain object with a clock passed in, and the test
 * file next door is where it is checked.
 *
 * Nothing here touches MMKV, the store or React. `prompt.ts` holds it against a
 * real user and a real clock.
 */

/**
 * The shape kept on disk, and the number in front of it. Anything this parser
 * does not recognise is replaced with a fresh state, which resets `installedAt`
 * and delays the next ask by five days: the safe direction, since the cost is a
 * question asked later rather than one asked twice.
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
 * And after an update. An app that has just changed under somebody is the worst
 * moment to ask what they think of it: they have not used the version they would
 * be rating, and a release that broke something is worst in its first two days.
 */
export const MIN_DAYS_SINCE_VERSION_CHANGE = 2

/**
 * Meals per checkpoint. The ask rides on crossing a multiple of this, so the
 * 15th meal, the 30th, the 45th. Fifteen is roughly a week of somebody logging
 * what they actually eat; below that the app has not done the thing it is for.
 */
export const MEALS_PER_CHECKPOINT = 15

/**
 * Distinct days rather than consecutive ones, to exclude the person who logged a
 * fortnight of meals in one sitting to see what the app did. A streak would be
 * stricter and worse: somebody who logs on Monday and Thursday is a user.
 *
 * Three rather than two, because the state is created by the first counted
 * action and the install gate already requires five days, so a fifteenth meal
 * clearing that gate has been logged on a second day by definition. At two this
 * gate could never turn anything down.
 */
export const MIN_ACTIVE_DAYS = 3

/**
 * How long the app leaves somebody alone after asking. Apple's own limit is three
 * prompts a year per device, silently enforced: over it, `requestReview` does
 * nothing and the app cannot tell. Sixty days keeps us under it, and the
 * same-version gate below makes the realistic cadence one ask per release.
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
 * `yyyy-MM-dd` in local time. The same three lines as `data/client.ts`'s
 * `dateKey` rather than an import, because `src/lib` does not reach into the data
 * layer. Local rather than `toISOString`, which reports UTC: two meals either
 * side of that boundary would count as two active days on one evening.
 */
export function dayKey(now: number): string {
  const date = new Date(now)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Noticed at every counted moment rather than at launch, which is not evidence of
 * anything. This only moves when a meal goes on the day or a review is read.
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
 * Should the question be put? The order is deliberate: the cheapest and most
 * common refusals first, so the reason that reaches Mixpanel is the first thing
 * wrong rather than an arbitrary one of several.
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
 * Did this meal cross a checkpoint? A crossing rather than an exact multiple:
 * `meals % 15 === 0` is only correct while the counter moves by one, and a caller
 * recording two would step over the 15th meal and wait for the 30th.
 */
export function crossedCheckpoint(before: number, after: number): boolean {
  if (after < MEALS_PER_CHECKPOINT) return false
  return Math.floor(after / MEALS_PER_CHECKPOINT) > Math.floor(before / MEALS_PER_CHECKPOINT)
}

/**
 * And for reviews, which are rarer and worth less individually: the second one,
 * then every fifth. The first is a curiosity and the second is somebody who came
 * back for it. A weekly review appears once a week, so every fifth is a month
 * apart and could never carry the ask on its own.
 */
export function reviewWorthAsking(reviews: number): boolean {
  return reviews === 2 || (reviews > 2 && reviews % 5 === 0)
}
