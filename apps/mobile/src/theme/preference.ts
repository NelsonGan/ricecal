import { createMMKV } from 'react-native-mmkv'

import type { ColorSchemePreference } from './ThemeProvider'

/**
 * Which appearance the user picked, remembered across launches.
 *
 * `ThemeProvider` takes an `initialPreference` and leaves the storing to the
 * app, so the provider stays a pure piece of the design system. Nothing held
 * that end of the contract for a while, so a chosen Dark lasted only as long as
 * the process.
 *
 * MMKV rather than `user_settings`, because it is read on the first frame,
 * before the query client or a session exist. A column would mean painting the
 * wrong palette and correcting it, which is a flash of colour on every cold
 * start.
 *
 * Not keyed by user: two accounts on one phone want the same answer.
 */
const storage = createMMKV({ id: 'ricecal-theme' })

const KEY = 'preference'

const VALUES: ColorSchemePreference[] = ['light', 'dark', 'system']

/**
 * Validated rather than cast: the stored string outlives the build that wrote
 * it, so a renamed preference comes back as something with no palette here.
 * Anything unrecognised falls to `system`, the fresh-install default.
 */
export function storedThemePreference(): ColorSchemePreference {
  const stored = storage.getString(KEY)
  return VALUES.find((value) => value === stored) ?? 'system'
}

export function storeThemePreference(preference: ColorSchemePreference): void {
  storage.set(KEY, preference)
}
