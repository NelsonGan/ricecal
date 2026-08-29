import type { Locale } from 'date-fns'
import { bn, enGB, hi, id, ja, ko, ms, ta, th, vi, zhCN, zhTW } from 'date-fns/locale'
import { getLocales } from 'expo-localization'

import type { TextScript } from '@/ui'

/**
 * Every language the interface is written in.
 *
 * Left to right only. Nothing in `src/ui` mirrors, so an Arabic or Urdu bundle
 * would render as a correctly translated app laid out backwards. Adding one is a
 * layout project rather than a translation.
 *
 * Food is not in here: "nasi lemak" is a name, and a name is data. See the note
 * at the top of `en/index.ts`.
 *
 * The order is the order the picker draws, deliberately rather than
 * alphabetically: an alphabetical list across five scripts sorts by a spelling
 * nobody reading it can see. English first, then the region the catalogue is
 * centred on, then outwards.
 */

/**
 * Each language names ITSELF, and only itself.
 *
 * A picker is read by somebody who cannot necessarily read the language the app
 * is currently in — that is the whole reason they are looking at it — so
 * "Chinese (Simplified)" under 简体中文 is a line that helps only the users who
 * least need the screen. The endonym is the one label that works for the person
 * it is for.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', script: 'latin', dateFns: enGB },
  { code: 'zh-Hans', label: '简体中文', script: 'cjk', dateFns: zhCN },
  { code: 'zh-Hant', label: '繁體中文', script: 'cjk', dateFns: zhTW },
  { code: 'ms', label: 'Bahasa Melayu', script: 'latin', dateFns: ms },
  { code: 'id', label: 'Bahasa Indonesia', script: 'latin', dateFns: id },
  { code: 'th', label: 'ไทย', script: 'tall', dateFns: th },
  { code: 'vi', label: 'Tiếng Việt', script: 'latin', dateFns: vi },
  // date-fns ships no Filipino locale, so dates in a Filipino interface are
  // formatted in English. Every word around them is translated; a month name is
  // the one thing this bundle cannot reach, and an English "October" beside
  // Filipino copy is a smaller fault than no Filipino at all.
  { code: 'fil', label: 'Filipino', script: 'latin', dateFns: enGB },
  { code: 'ja', label: '日本語', script: 'cjk', dateFns: ja },
  { code: 'ko', label: '한국어', script: 'cjk', dateFns: ko },
  { code: 'hi', label: 'हिन्दी', script: 'tall', dateFns: hi },
  { code: 'ta', label: 'தமிழ்', script: 'tall', dateFns: ta },
  { code: 'bn', label: 'বাংলা', script: 'tall', dateFns: bn },
] as const satisfies readonly {
  code: string
  label: string
  /** How much vertical room a line of it needs. See `src/ui/TextScript.tsx`. */
  script: TextScript
  dateFns: Locale
}[]

export type Language = (typeof LANGUAGES)[number]['code']

export const SUPPORTED_LANGUAGES = LANGUAGES.map((language) => language.code) as Language[]

export const DEFAULT_LANGUAGE: Language = 'en'

export function isLanguage(value: string | null | undefined): value is Language {
  return (SUPPORTED_LANGUAGES as string[]).includes(value ?? '')
}

/** Which writing system a language is set in, for the type ramp's leading. */
export function scriptFor(language: Language): TextScript {
  return LANGUAGES.find((entry) => entry.code === language)?.script ?? 'latin'
}

/** The date-fns locale that goes with a language. See `applyDateLocale`. */
export function dateLocaleFor(language: Language): Locale {
  return LANGUAGES.find((entry) => entry.code === language)?.dateFns ?? enGB
}

/**
 * What the phone is set to, resolved to a bundle we actually have.
 * `getLocales()` is synchronous and safe at module scope, which lets i18next be
 * initialised before the first render.
 *
 * Chinese is why this is not a lookup: `languageCode` is `zh` for both scripts
 * and the two are not mutually readable. The script code is the reliable signal
 * where the OS sets one, and the region is the fallback, since Taiwan, Hong Kong
 * and Macau write traditional and everywhere else simplified.
 *
 * Filipino answers `fil` on iOS and, on some Android builds, the older `tl`.
 */
export function deviceLanguage(): Language {
  const locale = getLocales()[0]
  const code = locale?.languageCode ?? null

  if (code === 'zh') {
    if (locale?.languageScriptCode === 'Hant') return 'zh-Hant'
    if (locale?.languageScriptCode === 'Hans') return 'zh-Hans'
    const region = locale?.languageRegionCode ?? locale?.regionCode
    return region === 'TW' || region === 'HK' || region === 'MO' ? 'zh-Hant' : 'zh-Hans'
  }

  if (code === 'tl') return 'fil'

  return isLanguage(code) ? code : DEFAULT_LANGUAGE
}
