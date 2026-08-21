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
 * WHY TWO. `StoreReview.requestReview()` is a single-use thing: the OS allows a
 * handful per year per device, silently drops the rest, and tells the app
 * nothing either way. Fired at everybody, most of those go to people who are
 * about to leave a two-star review or who close the dialog without reading it.
 * So the app asks its own question first, and only somebody who answers "I like
 * it" ever reaches the store's dialog. Somebody who does not is offered the
 * Discord instead, which is the same conversation held somewhere it can be
 * answered.
 *
 * Stage one is the gate in `state.ts`, which is silent and arithmetic. Stage two
 * is `RatePromptSheet`, which is the only thing that puts the question on a
 * screen, and this module is what decides when to hand it one.
 *
 * The state is MMKV rather than a column, for the reason `features/paywall/nudge.ts`
 * gives: it is a question about this handset and this launch, answered before
 * anything can be shown, and an offline launch could not answer a query at all.
 * KEYED BY USER for the same reason as well, since a phone two people sign into
 * in turn would otherwise ask the second person a question the first one
 * answered.
 */
const storage = createMMKV({ id: 'ricecal-rating' })

/**
 * `expo-store-review`, if this binary actually has it.
 *
 * REQUIRED RATHER THAN IMPORTED, for the reason `features/auth/turnstile.tsx`
 * gives about the WebView: `requireNativeModule` throws at module scope on a
 * build made before the dependency landed, and this module is imported by
 * `src/data`, so a static import would put that throw in the graph of every
 * screen that logs a meal. On a dev client from before this shipped the symptom
 * would be the whole app failing to start.
 *
 * Absent, the sheet still works and the answer is still recorded; only the
 * store's own dialog is missing, which is what `isAvailableAsync` already
 * reports on TestFlight and on old Androids.
 *
 * One thing the catch cannot suppress: on a stale DEV client the throw still
 * reaches LogBox, so tapping "I like it" there shows a redbox that dismisses to
 * an app carrying on normally. Dev only, and one rebuild away.
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
 * `1.0.0` is a fallback and not a real answer. `expoConfig` is null in a few
 * corners (a bare runtime, a test), and treating that as "some version" keeps
 * the version gates working on a number that never changes rather than throwing
 * inside a counter that a meal write is waiting on.
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
 * The account is carried WITH the trigger rather than read again by the sheet.
 *
 * Two reasons. The sheet is then pure UI with no session dependency, and more
 * importantly the answer is filed against whoever the question was put to: a
 * sheet that read the session on the tap would write the cooldown under the
 * wrong account if it were still open across a sign-out.
 */
export type RatingRequest = { trigger: RatingTrigger; userId: string }

type Listener = (request: RatingRequest) => void

const listeners = new Set<Listener>()

/**
 * Hand the question to whatever is on screen, and say how many took it.
 *
 * The count is the point. Nothing is stamped and nothing is tracked unless a
 * sheet actually received the request: without that, a trigger that fired before
 * the root had mounted would spend the account's one ask on a dialog nobody ever
 * saw, and the sixty-day silence afterwards would be real.
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
 * Nothing here awaits, and nothing here throws.
 *
 * These sit inside a mutation's `onSuccess` and a screen's effect, on the paths
 * that put a meal on the day. A counter that could reject would make a rating
 * prompt able to break logging, which is a trade nobody would take. MMKV is
 * synchronous, so there is nothing to await in the first place; the store call
 * that IS async happens later, behind the sheet.
 *
 * `userId` is a `string` rather than a nullable one, and it is not a shortcut.
 * Every caller reads it from `useUserId`, which THROWS without a session for the
 * reason written out there, so a null guard here would be a branch that cannot
 * run standing in for a routing bug that should be loud.
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
 * Deliberately NOT a trigger: a settled purchase.
 *
 * It is the strongest signal of goodwill the app has, and it is still the wrong
 * moment. `paywall/welcome` is already a celebration, a sheet over it is two,
 * and a favour asked in the same breath as taking somebody's money reads as
 * exactly that. The next meal they log is a few hours away and carries the ask
 * just as well.
 */

/**
 * The row in Me, which is the only way in that skips the gate.
 *
 * Somebody who went looking for "Rate RiceCal" has asked the question
 * themselves, so every threshold above is beside the point. The COOLDOWN is
 * still stamped, because what follows is the same one-per-year store dialog and
 * an automatic ask a week later would be spending an allowance this one already
 * used.
 *
 * No delay either, for the same reason: this one is the answer to a tap, and a
 * control that does nothing for a second is a control somebody taps again.
 */
export function askForRating(userId: string): void {
  if (deliver({ trigger: 'manual', userId }) > 0) {
    track('Rating Prompt Shown', { trigger: 'manual' })
  }
}

/**
 * How long the trigger waits before the sheet arrives.
 *
 * The same reasoning and nearly the same number as `useProNudge`, which holds
 * the standing paywall offer back for 1.4 seconds. A trigger fires at the moment
 * a write lands, and two of the three routes into `useLogFood` navigate away in
 * the same breath: the dish screen calls `finish()` immediately after
 * `mutate`, so the `onSuccess` that counts the meal can land while a dismissal
 * is still unwinding. A native modal window presented into the middle of that is
 * the one shape this app's sheets have gone wrong in before.
 *
 * A beat later the user is on the diary looking at the meal they just logged,
 * which is a better moment to be asked anything at all.
 */
export const ASK_DELAY_MS = 1200

/**
 * One pending ask at a time.
 *
 * Two triggers can be in flight together (a review read, then a meal logged
 * before the timer fires) and two sheets racing for one answer would stamp the
 * cooldown twice and report two of everything.
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
 *
 * "Maybe later" and a tap on the scrim mean the same thing as "not really" as
 * far as the next sixty days are concerned: the question has been put, and
 * putting it again next week is how an app earns the one-star review it was
 * trying to avoid.
 */
function stamp(userId: string, now = Date.now()): void {
  write(userId, markAsked(read(userId, now), now, appVersion()))
}

/**
 * They like it. Stamp, then hand over to the OS.
 *
 * `isAvailableAsync` is false on TestFlight and on Android below 5.0, and
 * `requestReview` does nothing visible when the device has already had its three
 * dialogs this year. Neither is reportable, which is why there is no "Rating
 * Submitted" event anywhere in this file: what happens past this line belongs to
 * the store, and an app-side count of it would be a guess.
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
 * They do not. Stamp, and let the sheet offer the conversation.
 *
 * The browser is NOT opened here. Somebody who has just said they are not
 * enjoying the app should not have it throw them into Discord as well; the sheet
 * asks first, and `ratingFeedbackOpened` is what a yes reports.
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
 * They took the offer of a conversation.
 *
 * There is no matching "declined" event, for the reason the analytics plan gives
 * about `Paywall Shown`: an answer of `disliked` that is not followed by this
 * one IS the decline, and a second event would be a worse way to count the same
 * subtraction.
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
