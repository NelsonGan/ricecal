import { setDefaultOptions } from 'date-fns'
import i18n from 'i18next'
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
 * Every language still ships in the app. Require the selected one synchronously
 * so switching works offline without evaluating twelve unused bundles at launch.
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
  resources: { en, [initialLanguage]: bundles[initialLanguage]() },
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  // Only ever given an exact code. `deviceLanguage()` resolves the phone's
  // locale down to one of ours — including the zh-Hans / zh-Hant split, which a
  // bare `zh` cannot decide — so i18next never has to guess from a region tag.
  supportedLngs: SUPPORTED_LANGUAGES,
  defaultNS: 'common',
  // Every namespace of the active language is ready before the first render.
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
  if (!i18n.hasResourceBundle(language, 'common')) {
    for (const [namespace, resources] of Object.entries(bundles[language]())) {
      i18n.addResourceBundle(language, namespace, resources)
    }
  }
  storeLanguage(language)
  applyDateLocale(language)
  void i18n.changeLanguage(language)
}

/** The active language, as one of ours rather than as whatever i18next holds. */
export function currentLanguage(): Language {
  return isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE
}

export default i18n
