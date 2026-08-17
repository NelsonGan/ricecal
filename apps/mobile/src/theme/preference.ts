import { createMMKV } from 'react-native-mmkv'

import type { ColorSchemePreference } from './ThemeProvider'

/**
 * Which appearance the user picked, remembered across launches.
 *
 * `ThemeProvider` deliberately does not do this itself — its `initialPreference`
 * prop says "persist the user's choice and pass it back in here", so the store
 * is the app's business and the provider stays a pure piece of the design
 * system. Nothing was holding the other end of that contract, so Light and Dark
 * both survived exactly as long as the process did: choose Dark, kill the app,
 * and it opened following the OS again with the segmented control back on Auto.
 *
 * MMKV rather than `user_settings`, for the reason the tour flag is: it is read
 * on the very first frame, BEFORE the query client, the session or a network
 * request exist. A column would mean painting the wrong palette and then
 * correcting it, which is a flash of the wrong colour on every cold start —
 * exactly what the splash screen is held for the typefaces to avoid.
 *
 * NOT keyed by user, unlike the tour. This is a property of reading a screen in
 * this room on this handset, and two accounts on one phone want the same answer.
 */
const storage = createMMKV({ id: 'ricecal-theme' })

const KEY = 'preference'

const VALUES: ColorSchemePreference[] = ['light', 'dark', 'system']

/**
 * Validated on the way out rather than cast.
 *
 * The stored string outlives the build that wrote it, so a preference that is
 * renamed or dropped in a later version comes back as something this app has no
 * palette for. Anything unrecognised falls to `system`, which is the default a
 * fresh install gets.
 */
export function storedThemePreference(): ColorSchemePreference {
  const stored = storage.getString(KEY)
  return VALUES.find((value) => value === stored) ?? 'system'
}

export function storeThemePreference(preference: ColorSchemePreference): void {
  storage.set(KEY, preference)
}
