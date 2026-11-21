import { useSyncExternalStore } from 'react'
import { createMMKV } from 'react-native-mmkv'

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
const storage = createMMKV({ id: 'ricecal-places' })

/**
 * Every write goes through this module, so it tells its own readers rather than
 * leaning on MMKV's listener: a switch flipped in Settings, or the offer made
 * due by the data layer, shows on the screen behind at once.
 */
const listeners = new Set<() => void>()
let version = 0

function write(key: string, value: boolean | string): void {
  storage.set(key, value)
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Re-renders on any write here; the values themselves are read synchronously. */
function useVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}

const enabledKey = (userId: string) => `enabled:${userId}`
const autoTagKey = (userId: string) => `autoTag:${userId}`
const offerKey = (userId: string) => `offer:${userId}`

/** Off until the user turns it on, here or from the offer. */
export function locationsEnabled(userId: string): boolean {
  return storage.getBoolean(enabledKey(userId)) ?? false
}

/** On by default once Locations is: tagging is what turning it on is for. */
export function autoTagEnabled(userId: string): boolean {
  return storage.getBoolean(autoTagKey(userId)) ?? true
}

export function setLocationsEnabled(userId: string, enabled: boolean): void {
  write(enabledKey(userId), enabled)
  // Turning it on anywhere answers the offer: asking again would be asking a
  // question the user has already answered.
  if (enabled) answerLocationsOffer(userId)
}

export function setAutoTag(userId: string, enabled: boolean): void {
  write(autoTagKey(userId), enabled)
}

/** Both switches, live: a change in Settings shows on the screen behind it. */
export function useLocationsPreference(userId: string) {
  useVersion()
  return { enabled: locationsEnabled(userId), autoTag: autoTagEnabled(userId) }
}

// ---------------------------------------------------------------------------
// The offer
// ---------------------------------------------------------------------------

/**
 * `due` once a meal has been logged on this phone while Locations was off;
 * `answered` once the sheet has been put up, or Locations turned on. Answered
 * is stored BEFORE the sheet is on screen, so a crash or a kill while it is up
 * never brings it back: the cost of that is one lost offer, where the other
 * order costs an offer that keeps returning.
 */
type OfferState = 'due' | 'answered'

function offerState(userId: string): OfferState | null {
  const value = storage.getString(offerKey(userId))
  return value === 'due' || value === 'answered' ? value : null
}

/**
 * A meal was logged on this phone. Called beside `recordMealLogged`, on the
 * same two paths: the insert and a scan that landed. Synchronous and cannot
 * throw, so the write that called it is never at risk.
 */
export function recordMealForLocationsOffer(userId: string): void {
  if (offerState(userId) !== null || locationsEnabled(userId)) return
  write(offerKey(userId), 'due')
}

export function answerLocationsOffer(userId: string): void {
  write(offerKey(userId), 'answered')
}

/** Whether the offer should go up now (the screen also checks what else is). */
export function useLocationsOfferDue(userId: string): boolean {
  // Live, so a `due` written by the data layer while Today is mounted shows.
  useVersion()
  return offerState(userId) === 'due' && !locationsEnabled(userId)
}

/** Test hook. */
export function resetPlacesStorageForTest(): void {
  storage.clearAll()
  version += 1
}
