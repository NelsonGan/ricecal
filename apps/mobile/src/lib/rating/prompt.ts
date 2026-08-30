import Constants from 'expo-constants'
import type * as StoreReviewModule from 'expo-store-review'
import { createMMKV } from 'react-native-mmkv'

import { track } from '@/lib/analytics'
import {
  checkRating,
  crossedCheckpoint,
  initialState,
  markAsked,
  parseState,
  type RatingState,
  type RatingTrigger,
  reconcileVersion,
  recordActivity,
  reviewWorthAsking,
} from './state'

/**
 * Asking a user to rate the app, in two stages.
 *
 * `StoreReview.requestReview()` is single-use: the OS allows a handful per year
 * per device, silently drops the rest and tells the app nothing. Fired at
 * everybody, most go to people about to leave a two-star review. So the app asks
 * its own question first, and only somebody who answers "I like it" reaches the
 * store's dialog; the rest are offered the Discord.
 *
 * Stage one is the silent gate in `state.ts`. Stage two is `RatePromptSheet`,
 * and this module decides when to hand it a question.
 *
 * MMKV rather than a column, for the reason `features/paywall/nudge.ts` gives,
 * and keyed by user, so a phone two people sign into does not ask the second
 * person a question the first one answered.
 */
const storage = createMMKV({ id: 'ricecal-rating' })

/**
 * `expo-store-review`, if this binary has it. Required rather than imported, for
 * the reason `turnstile.tsx` gives: `requireNativeModule` throws at module scope
 * on a build made before the dependency landed, and this is imported by
 * `src/data`, so a static import would put that throw in the graph of every
 * screen that logs a meal.
 *
 * Absent, the sheet still works and the answer is still recorded; only the
 * store's own dialog is missing, which `isAvailableAsync` already reports on
 * TestFlight and old Androids.
 *
 * On a stale dev client the throw still reaches LogBox, so tapping "I like it"
 * shows a redbox that dismisses to an app carrying on normally.
 */
function loadStoreReview(): typeof StoreReviewModule | null {
  try {
    return require('expo-store-review') as typeof StoreReviewModule
  } catch (error) {
    console.warn('[rating] no store review in this build, asking nothing of the store', error)
    return null
  }
}

const key = (userId: string) => `state:${userId}`

/**
 * `1.0.0` is a fallback rather than a real answer. `expoConfig` is null in a bare
 * runtime and in tests, and treating that as "some version" keeps the version
 * gates working rather than throwing inside a counter a meal write is waiting on.
 */
function appVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0'
}

function read(userId: string, now: number): RatingState {
  const parsed = parseState(storage.getString(key(userId)))
  const state = parsed ?? initialState(now, appVersion())
  return reconcileVersion(state, now, appVersion())
}

function write(userId: string, state: RatingState): void {
  storage.set(key(userId), JSON.stringify(state))
}

// ---------------------------------------------------------------------------
// The bridge to the sheet
// ---------------------------------------------------------------------------

/**
 * The account is carried with the trigger rather than read again by the sheet, so
 * the sheet is pure UI and the answer is filed against whoever the question was
 * put to. Reading the session on the tap would write the cooldown under the wrong
 * account for a sheet still open across a sign-out.
 */
export type RatingRequest = { trigger: RatingTrigger; userId: string }

type Listener = (request: RatingRequest) => void

const listeners = new Set<Listener>()

/**
 * Hand the question to whatever is on screen, and say how many took it. Nothing
 * is stamped or tracked unless a sheet received it: a trigger firing before the
 * root had mounted would spend the account's one ask on a dialog nobody saw, and
 * the sixty-day silence afterwards would be real.
 */
function deliver(request: RatingRequest): number {
  for (const listener of listeners) listener(request)
  return listeners.size
}

export function subscribeToRatingPrompt(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ---------------------------------------------------------------------------
// The counters
// ---------------------------------------------------------------------------

/**
 * Nothing here awaits, and nothing here throws. These sit inside a mutation's
 * `onSuccess` and a screen's effect, on the paths that put a meal on the day, and
 * a counter that could reject would let a rating prompt break logging. MMKV is
 * synchronous; the async store call happens later, behind the sheet.
 *
 * `userId` is a `string` rather than nullable: every caller reads it from
 * `useUserId`, which throws without a session, so a null guard would be a branch
 * that cannot run standing in for a routing bug that should be loud.
 */

/**
 * A meal went on a day. One per logging ACTION, so a photographed plate the
 * cascade took apart is one meal rather than four; `count` exists for a caller
 * that ever writes several at once.
 */
export function recordMealLogged(userId: string, count = 1, now = Date.now()): void {
  const before = read(userId, now)
  const after = recordActivity({ ...before, meals: before.meals + count }, now)
  write(userId, after)
  if (crossedCheckpoint(before.meals, after.meals)) ask(userId, 'meal_milestone', now)
}

/** A weekly or monthly review was actually read, rather than redirected away from. */
export function recordReviewOpened(userId: string, now = Date.now()): void {
  const before = read(userId, now)
  const after = recordActivity({ ...before, reviews: before.reviews + 1 }, now)
  write(userId, after)
  if (reviewWorthAsking(after.reviews)) ask(userId, 'review_opened', now)
}

/**
 * Deliberately not a trigger: a settled purchase. The strongest signal of
 * goodwill the app has, and still the wrong moment, because `paywall/welcome` is
 * already a celebration and a favour asked in the same breath as taking somebody's
 * money reads as one. The next meal carries the ask just as well.
 */

/**
 * The row in Me, the only way in that skips the gate: somebody who went looking
 * for "Rate RiceCal" has asked the question themselves. The cooldown is still
 * stamped, because what follows is the same one-per-year store dialog.
 *
 * No delay either: this is the answer to a tap, and a control that does nothing
 * for a second is one somebody taps again.
 */
export function askForRating(userId: string): void {
  if (deliver({ trigger: 'manual', userId }) > 0) {
    track('Rating Prompt Shown', { trigger: 'manual' })
  }
}

/**
 * How long the trigger waits before the sheet arrives, on the same reasoning as
 * `useProNudge`. A trigger fires when a write lands, and two of the three routes
 * into `useLogFood` navigate away in the same breath, so the `onSuccess` that
 * counts the meal can land while a dismissal is unwinding. A native modal
 * presented into the middle of that is a shape this app's sheets have gone wrong
 * in before.
 *
 * A beat later the user is looking at the meal they just logged.
 */
export const ASK_DELAY_MS = 1200

/**
 * One pending ask at a time. Two triggers can be in flight together, and two
 * sheets racing for one answer would stamp the cooldown twice.
 */
let pending: ReturnType<typeof setTimeout> | null = null

function ask(userId: string, trigger: RatingTrigger, now: number): void {
  if (pending) return
  const verdict = checkRating(read(userId, now), now, appVersion())
  if (!verdict.ask) {
    track('Rating Prompt Skipped', { trigger, reason: verdict.reason })
    return
  }
  pending = setTimeout(() => {
    pending = null
    if (deliver({ trigger, userId }) > 0) track('Rating Prompt Shown', { trigger })
  }, ASK_DELAY_MS)
}

// ---------------------------------------------------------------------------
// What the sheet reports back
// ---------------------------------------------------------------------------

/**
 * Every answer stamps the cooldown, including the one that is not an answer.
 * "Maybe later" and a tap on the scrim mean the same as "not really" for the next
 * sixty days: the question has been put, and putting it again next week is how an
 * app earns the review it was trying to avoid.
 */
function stamp(userId: string, now = Date.now()): void {
  write(userId, markAsked(read(userId, now), now, appVersion()))
}

/**
 * They like it. Stamp, then hand over to the OS. `isAvailableAsync` is false on
 * TestFlight and Android below 5.0, and `requestReview` does nothing visible once
 * the device has had its three dialogs this year. Neither is reportable, which is
 * why there is no "Rating Submitted" event.
 */
export async function ratingLiked({ userId, trigger }: RatingRequest): Promise<void> {
  track('Rating Prompt Answered', { trigger, answer: 'liked' })
  stamp(userId)
  try {
    const store = loadStoreReview()
    if (store && (await store.isAvailableAsync())) await store.requestReview()
  } catch {
    // The dialog is a courtesy either way. A store that would not open is not
    // something to put a toast in front of somebody who just said a kind thing.
  }
}

/**
 * They do not. Stamp, and let the sheet offer the conversation. The browser is
 * not opened here: somebody who has just said they are not enjoying the app
 * should not be thrown into Discord as well, so the sheet asks first and
 * `ratingFeedbackOpened` reports a yes.
 */
export function ratingDisliked({ userId, trigger }: RatingRequest): void {
  track('Rating Prompt Answered', { trigger, answer: 'disliked' })
  stamp(userId)
}

export function ratingDismissed({ userId, trigger }: RatingRequest): void {
  track('Rating Prompt Answered', { trigger, answer: 'dismissed' })
  stamp(userId)
}

/**
 * They took the offer of a conversation. There is no matching "declined" event: a
 * `disliked` answer not followed by this one is the decline.
 */
export function ratingFeedbackOpened({ trigger }: RatingRequest): void {
  track('Rating Feedback Opened', { trigger })
}

/** Test-only: forget everything this handset knows about a user, timer and all. */
export function resetRatingStateForTest(userId: string): void {
  if (pending) clearTimeout(pending)
  pending = null
  storage.remove(key(userId))
}
