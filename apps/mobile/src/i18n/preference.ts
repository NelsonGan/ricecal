import { createMMKV } from 'react-native-mmkv'

import { isLanguage, type Language } from './languages'

/**
 * Which language the user picked, remembered across launches.
 *
 * MMKV rather than `user_settings.language`, for the reason the theme
 * preference is: it is read on the very first frame, BEFORE the query client,
 * the session or a network request exist. i18next has to be initialised
 * synchronously at import time or the first render paints raw keys, and it
 * cannot wait for a row. It is also the only store that works during
 * onboarding, where the language is chosen on the first screen and the account
 * does not exist until the last.
 *
 * The column is still written — see `LanguageSync` — but in one direction only.
 * This file is the owner; the row is a copy the server can read.
 *
 * NOT keyed by user. Two accounts on one handset want the same answer, and the
 * choice was made before either of them existed.
 */
const storage = createMMKV({ id: 'ricecal-language' })

const KEY = 'language'

/**
 * Null when nobody has chosen yet, which is what the first launch turns on: no
 * stored language means the onboarding picker has not been answered, and the
 * device's own language is the preselection rather than the answer.
 *
 * Validated on the way out rather than cast, like the theme preference. The
 * stored string outlives the build that wrote it, so a language dropped in a
 * later version comes back as a code this app has no bundle for.
 */
export function storedLanguage(): Language | null {
  const stored = storage.getString(KEY)
  return isLanguage(stored) ? stored : null
}

export function storeLanguage(language: Language): void {
  storage.set(KEY, language)
}
