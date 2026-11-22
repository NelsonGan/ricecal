import { createJsonStore } from '@/lib/jsonStore'

/**
 * The Locations switches and the one-time offer, per phone and per account
 * (README: Meal locations).
 *
 * On the phone rather than in `user_settings`, because location permission is
 * the phone's: an account signed into a second phone that has never been asked
 * must not behave as if it had been told yes. Keyed by user, for the reason
 * `features/logging/preference.ts` gives: two people signing into one phone in
 * turn each keep their own answer.
 *
 * In `lib` rather than in `features/places` because the data layer counts the
 * meals the offer waits for, and `src/data` does not import a feature.
 */

/**
 * `due` once a meal has been logged on this phone while Locations was off;
 * `answered` once the sheet has been put up, or Locations turned on. Answered
 * is stored BEFORE the sheet is on screen, so a crash or a kill while it is up
 * never brings it back: the cost of that is one lost offer, where the other
 * order costs an offer that keeps returning.
 */
type OfferState = 'due' | 'answered' | null

type Preference = {
  /** Off until the user turns it on, in Settings, from the offer or from the 1.3.0 news card. */
  enabled: boolean
  /** On by default once Locations is: tagging is what turning it on is for. */
  autoTag: boolean
  offer: OfferState
}

const store = createJsonStore<Preference>('ricecal-places', (stored) => {
  const value = (stored ?? {}) as Partial<Preference>
  return {
    enabled: value.enabled === true,
    autoTag: value.autoTag !== false,
    offer: value.offer === 'due' || value.offer === 'answered' ? value.offer : null,
  }
})

function update(userId: string, change: Partial<Preference>): void {
  store.set(userId, { ...store.get(userId), ...change })
}

export function locationsEnabled(userId: string): boolean {
  return store.get(userId).enabled
}

export function autoTagEnabled(userId: string): boolean {
  return store.get(userId).autoTag
}

export function setLocationsEnabled(userId: string, enabled: boolean): void {
  // Turning it on anywhere answers the offer: asking again would be asking a
  // question the user has already answered.
  update(userId, enabled ? { enabled, offer: 'answered' } : { enabled })
}

export function setAutoTag(userId: string, autoTag: boolean): void {
  update(userId, { autoTag })
}

/** Both switches, live: a change in Settings shows on the screen behind it. */
export function useLocationsPreference(userId: string) {
  const enabled = store.useValue(userId, (value) => value.enabled)
  const autoTag = store.useValue(userId, (value) => value.autoTag)
  return { enabled, autoTag }
}

/**
 * A meal was logged on this phone. Called beside `recordMealLogged`, on the
 * same two paths: the insert and a scan that landed. Synchronous and cannot
 * throw, so the write that called it is never at risk.
 */
export function recordMealForLocationsOffer(userId: string): void {
  const value = store.get(userId)
  if (value.offer !== null || value.enabled) return
  update(userId, { offer: 'due' })
}

export function answerLocationsOffer(userId: string): void {
  update(userId, { offer: 'answered' })
}

function offerDue(value: Preference): boolean {
  return value.offer === 'due' && !value.enabled
}

/** Whether the offer should go up now (the screen also checks what else is). */
export function useLocationsOfferDue(userId: string): boolean {
  // Live, so a `due` written by the data layer while Today is mounted shows.
  return store.useValue(userId, offerDue)
}

/** `useLocationsOfferDue` without rendering, for tests. */
export function locationsOfferDue(userId: string): boolean {
  return offerDue(store.get(userId))
}
