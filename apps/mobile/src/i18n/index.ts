import { getLocales } from 'expo-localization'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { en } from './en'

/** Locales with a bundle. Add the code here and the bundle in `resources`. */
export const SUPPORTED_LANGUAGES = ['en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'en'

/**
 * The device's first preferred language, if we have a bundle for it.
 *
 * `getLocales()` is synchronous and safe at module scope, which is what lets
 * i18next be initialised before the first render — an async init would paint
 * one frame of raw keys.
 */
function deviceLanguage(): Language {
  const tag = getLocales()[0]?.languageCode
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(tag ?? '')
    ? (tag as Language)
    : DEFAULT_LANGUAGE
}

i18n.use(initReactI18next).init({
  resources: { en },
  lng: deviceLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
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

export default i18n
