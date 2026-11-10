import { setDefaultOptions } from 'date-fns/setDefaultOptions'
import i18n, { type ReadCallback } from 'i18next'
import { initReactI18next } from 'react-i18next'

import type { Bundle } from './bundle'
import { en } from './en'
import {
  DEFAULT_LANGUAGE,
  dateLocaleFor,
  deviceLanguage,
  isLanguage,
  LANGUAGES,
  type Language,
  SUPPORTED_LANGUAGES,
  scriptFor,
} from './languages'
import { storedLanguage, storeLanguage } from './preference'

export { storedLanguage } from './preference'
export {
  DEFAULT_LANGUAGE,
  deviceLanguage,
  isLanguage,
  LANGUAGES,
  type Language,
  SUPPORTED_LANGUAGES,
  scriptFor,
}

/**
 * Every bundle, keyed by the code the picker and the device resolve to.
 *
 * Bundled rather than fetched, all of them, which is what keeps `t`
 * synchronous everywhere: there is no load to await and no frame where a screen
 * can render its own keys. Thirteen bundles of copy is a few hundred kilobytes
 * of strings against an app that ships typefaces and several hundred
 * illustrations.
 *
 * Bundled, but not all run. Each is a `require` inside a function, so Metro
 * ships the module and nothing evaluates it until its language is asked for,
 * and `require` answers in the same tick. As thirteen imports at the top of
 * this file, every launch built twelve languages of strings it would not draw,
 * before the first frame. English is the exception: it is the fallback under
 * every other language, so it is always wanted.
 */
const bundles: Record<Language, () => Bundle> = {
  en: () => en,
  'zh-Hans': () => require('./zh-Hans').zhHans,
  'zh-Hant': () => require('./zh-Hant').zhHant,
  ms: () => require('./ms').ms,
  id: () => require('./id').id,
  th: () => require('./th').th,
  vi: () => require('./vi').vi,
  fil: () => require('./fil').fil,
  ja: () => require('./ja').ja,
  ko: () => require('./ko').ko,
  hi: () => require('./hi').hi,
  ta: () => require('./ta').ta,
  bn: () => require('./bn').bn,
}

/**
 * How i18next gets a language it has not been given: it asks here, and is
 * answered before the call returns. With `initAsync: false` that makes a
 * bundle's first use as synchronous as having passed it in `resources`.
 */
const bundled = {
  type: 'backend' as const,
  read(language: string, namespace: string, callback: ReadCallback): void {
    if (!isLanguage(language)) {
      callback(new Error(`no bundle for ${language}`), null)
      return
    }
    const bundle = bundles[language]() as Record<string, object | undefined>
    callback(null, bundle[namespace] ?? {})
  },
}

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

i18n
  .use(bundled)
  .use(initReactI18next)
  .init({
    // Loads the opening language and English inside this call, through
    // `bundled`, rather than on a later tick: the first render reads `t`.
    initAsync: false,
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
 * launch opens in. The onboarding picker and the preferences card call this and
 * nothing else.
 *
 * `user_settings.language` is not written here. This module is imported at the
 * root of the app and must not reach the data layer, which would build the
 * Supabase client at import time. `LanguageSync` catches the row up.
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
