import { setDefaultOptions } from 'date-fns'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { bn } from './bn'
import { en } from './en'
import { fil } from './fil'
import { hi } from './hi'
import { id } from './id'
import { ja } from './ja'
import { ko } from './ko'
import {
  DEFAULT_LANGUAGE,
  dateLocaleFor,
  deviceLanguage,
  isLanguage,
  LANGUAGES,
  type Language,
  SUPPORTED_LANGUAGES,
} from './languages'
import { ms } from './ms'
import { storedLanguage, storeLanguage } from './preference'
import { ta } from './ta'
import { th } from './th'
import { vi } from './vi'
import { zhHans } from './zh-Hans'
import { zhHant } from './zh-Hant'

export { storedLanguage } from './preference'
export {
  DEFAULT_LANGUAGE,
  deviceLanguage,
  isLanguage,
  LANGUAGES,
  type Language,
  SUPPORTED_LANGUAGES,
}

/**
 * Every bundle, keyed by the code the picker and the device resolve to.
 *
 * Bundled rather than fetched, all of them, which is what keeps `t`
 * synchronous everywhere: there is no load to await and no frame where a screen
 * can render its own keys. Thirteen bundles of copy is a few hundred kilobytes
 * of strings against an app that ships typefaces and several hundred
 * illustrations.
 */
const resources = {
  en,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ms,
  id,
  th,
  vi,
  fil,
  ja,
  ko,
  hi,
  ta,
  bn,
} satisfies Record<Language, unknown>

/**
 * What the app opens in: the choice if there is one, the phone's language if it
 * is one we have, English otherwise.
 *
 * The stored choice wins over the device deliberately. Somebody who set the app
 * to English on a Thai phone means it, and a system language that outranked
 * them would undo the setting every launch.
 */
const initialLanguage: Language = storedLanguage() ?? deviceLanguage()

/**
 * Month names, weekday names and the "3 hours ago" phrasings come from
 * date-fns rather than from a bundle, so it needs telling too — otherwise a
 * Japanese interface prints "Thursday 14 October" in the middle of it.
 *
 * `setDefaultOptions` sets `weekStartsOn` along with the locale, which would
 * ordinarily move what the app calls a week. It does not here: every
 * `startOfWeek` in the app passes `WEEK_STARTS_ON` explicitly, because the week
 * strip draws Monday first by design rather than by locale.
 */
function applyDateLocale(language: Language): void {
  setDefaultOptions({ locale: dateLocaleFor(language) })
}

applyDateLocale(initialLanguage)

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  // Only ever given an exact code. `deviceLanguage()` resolves the phone's
  // locale down to one of ours — including the zh-Hans / zh-Hant split, which a
  // bare `zh` cannot decide — so i18next never has to guess from a region tag.
  supportedLngs: SUPPORTED_LANGUAGES,
  defaultNS: 'common',
  // Every namespace is bundled, so nothing is fetched and nothing can arrive
  // late. Loading them all up front keeps `t` synchronous everywhere.
  ns: Object.keys(en),
  interpolation: {
    // React escapes for us. Leaving i18next's escaping on would turn an
    // apostrophe in a food name into `&#39;` on screen.
    escapeValue: false,
  },
  returnNull: false,
})

/**
 * Switch language, everywhere, in one call.
 *
 * Three things have to move together and this is the only place that knows it:
 * what i18next hands to `t`, what date-fns formats a date in, and what the next
 * launch opens in. The screens that offer a language — the onboarding picker
 * and the preferences card — call this and nothing else.
 *
 * `user_settings.language` is NOT written here. This module is imported at the
 * root of the app and must not reach the data layer: doing so would build the
 * Supabase client at import time, which no test environment can do. The row is
 * caught up by `LanguageSync`, which lives where the session does.
 */
export function setLanguage(language: Language): void {
  storeLanguage(language)
  applyDateLocale(language)
  void i18n.changeLanguage(language)
}

/** The active language, as one of ours rather than as whatever i18next holds. */
export function currentLanguage(): Language {
  return isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE
}

export default i18n
