import { createMMKV } from 'react-native-mmkv'

/**
 * Whether this account has been offered the tour on this phone.
 *
 * MMKV rather than `user_settings`, because the flag exists so a toast does not
 * appear twice, which is a question about this install. A column would mean a
 * query to answer before the toast can be shown, on the screen with the strictest
 * first-paint budget in the app, and an offline launch could not answer it.
 *
 * Keyed by user, though. The tour is offered to a person, so a phone two people
 * sign into in turn would otherwise offer it to the first and withhold it from
 * the second. Signing out does not clear it: the offer has been made.
 */
const storage = createMMKV({ id: 'ricecal-tutorial' })

const key = (userId: string) => `offered:${userId}`

export function tutorialOffered(userId: string): boolean {
  return storage.getBoolean(key(userId)) ?? false
}

/**
 * Marked when the toast is SHOWN, not when it is answered.
 *
 * "Dismiss it and it never comes back" is the rule, and a toast dismisses
 * itself after a few seconds — so a flag written on the tap would re-offer the
 * tour to everybody who looked away. Me carries a permanent row to the same
 * screen, which is what makes once-only safe rather than merely tidy.
 */
export function markTutorialOffered(userId: string): void {
  storage.set(key(userId), true)
}
