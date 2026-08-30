import { createMMKV } from 'react-native-mmkv'

import { isLanguage, type Language } from './languages'

/**
 * Which language the user picked, remembered across launches.
 *
 * MMKV rather than `user_settings.language`, for the reason the theme
 * preference is: i18next is initialised synchronously at import time, before
 * the query client or a session exist, and a first render without it paints raw
 * keys. It is also the only store that works during onboarding, where the
 * language is chosen before the account exists.
 *
 * `LanguageSync` still writes the column, but one way: this file is the owner
 * and the row is a copy the server can read.
 *
 * Not keyed by user. Two accounts on one handset want the same answer.
 */
const storage = createMMKV({ id: 'ricecal-language' })

const KEY = 'language'

/**
 * Null when nobody has chosen yet, which is what the first launch turns on: the
 * device's language is then the preselection rather than the answer.
 *
 * Validated rather than cast, because the stored string outlives the build that
 * wrote it and a dropped language has no bundle here.
 */
export function storedLanguage(): Language | null {
  const stored = storage.getString(KEY)
  return isLanguage(stored) ? stored : null
}

export function storeLanguage(language: Language): void {
  storage.set(KEY, language)
}
