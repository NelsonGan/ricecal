import type { Locale } from 'date-fns'
import { bn, enGB, hi, id, ja, ko, ms, ta, th, vi, zhCN, zhTW } from 'date-fns/locale'
import { getLocales } from 'expo-localization'

/**
 * Every language the interface is written in.
 *
 * LEFT TO RIGHT ONLY. Nothing in `src/ui` mirrors — padding, chevrons, the
 * progress bar and the week strip all read one way — so an Arabic or Urdu
 * bundle would render as a correctly translated app laid out backwards, which
 * is worse than English. Adding one is a layout project, not a translation.
 *
 * FOOD IS NOT IN HERE. "nasi lemak" is a name, and a name is data: the
 * catalogue, the recipes people type and everything a model writes back stay in
 * the language they arrived in. See the note at the top of `en/index.ts`.
 *
 * The order is the order the picker draws, and it is deliberate rather than
 * alphabetical: an alphabetical list across five scripts sorts by a spelling
 * nobody reading it can see. English first because it is the source, then the
 * region the catalogue is centred on, then outwards.
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
  { code: 'en', label: 'English', dateFns: enGB },
  { code: 'zh-Hans', label: '简体中文', dateFns: zhCN },
  { code: 'zh-Hant', label: '繁體中文', dateFns: zhTW },
  { code: 'ms', label: 'Bahasa Melayu', dateFns: ms },
  { code: 'id', label: 'Bahasa Indonesia', dateFns: id },
  { code: 'th', label: 'ไทย', dateFns: th },
  { code: 'vi', label: 'Tiếng Việt', dateFns: vi },
  // date-fns ships no Filipino locale, so dates in a Filipino interface are
  // formatted in English. Every word around them is translated; a month name is
  // the one thing this bundle cannot reach, and an English "October" beside
  // Filipino copy is a smaller fault than no Filipino at all.
  { code: 'fil', label: 'Filipino', dateFns: enGB },
  { code: 'ja', label: '日本語', dateFns: ja },
  { code: 'ko', label: '한국어', dateFns: ko },
  { code: 'hi', label: 'हिन्दी', dateFns: hi },
  { code: 'ta', label: 'தமிழ்', dateFns: ta },
  { code: 'bn', label: 'বাংলা', dateFns: bn },
] as const satisfies readonly { code: string; label: string; dateFns: Locale }[]

export type Language = (typeof LANGUAGES)[number]['code']

export const SUPPORTED_LANGUAGES = LANGUAGES.map((language) => language.code) as Language[]

export const DEFAULT_LANGUAGE: Language = 'en'

export function isLanguage(value: string | null | undefined): value is Language {
  return (SUPPORTED_LANGUAGES as string[]).includes(value ?? '')
}

/** The date-fns locale that goes with a language. See `applyDateLocale`. */
export function dateLocaleFor(language: Language): Locale {
  return LANGUAGES.find((entry) => entry.code === language)?.dateFns ?? enGB
}

/**
 * What the phone is set to, resolved to a bundle we actually have.
 *
 * `getLocales()` is synchronous and safe at module scope, which is what lets
 * i18next be initialised before the first render — an async init would paint one
 * frame of raw keys.
 *
 * CHINESE IS THE REASON THIS IS NOT A LOOKUP. `languageCode` is `zh` for both
 * scripts, and the two are not mutually readable: a Taiwanese phone answering
 * `zh` and getting 简体中文 is the wrong app. The script code is the reliable
 * signal where the OS sets one (`zh-Hant-TW`), and the region is the fallback
 * for the phones that do not — Taiwan, Hong Kong and Macau write traditional,
 * everywhere else writes simplified.
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
