import type { LocaleModule, PhoneStrings, PanelCopy, SceneCopy, FeatureCopy, LandingCopy, LocaleMeta } from './types';

import en from './en';
import ms from './ms';
import zh from './zh';
import zhHant from './zh-Hant';
import ta from './ta';
import bn from './bn';

// ── The rest of Asia, then the wider LTR set ─────────────────────────────────
import id from './id';
import th from './th';
import vi from './vi';
import ja from './ja';
import ko from './ko';
import hi from './hi';
import fil from './fil';
import es from './es';
import fr from './fr';
import de from './de';
import pt from './pt';
import it from './it';
import nl from './nl';
import ru from './ru';
import tr from './tr';
import pl from './pl';
import uk from './uk';
import sv from './sv';
import nb from './nb';
import da from './da';

export type { LocaleModule, PhoneStrings, PanelCopy, SceneCopy, FeatureCopy, LandingCopy, LocaleMeta };

/**
 * Sidebar order: English, then Malay and Chinese because Malaysia is the app's
 * first market, then the rest of Asia, then everything else.
 */
export const LOCALE_MODULES: LocaleModule[] = [
  en, ms, zh, zhHant,
  id, th, vi, ja, ko, hi, ta, bn, fil,
  es, fr, de, pt, it, nl, ru, tr, pl, uk, sv, nb, da,
];

export const LOCALE_REGISTRY: Record<string, LocaleModule> =
  Object.fromEntries(LOCALE_MODULES.map((m) => [m.meta.code, m]));

export const ALL_LOCALE_CODES: string[] = LOCALE_MODULES.map((m) => m.meta.code);

export const LOCALE_META: Record<string, LocaleMeta> =
  Object.fromEntries(LOCALE_MODULES.map((m) => [m.meta.code, m.meta]));

export const PHONE_STRINGS: Record<string, PhoneStrings> =
  Object.fromEntries(LOCALE_MODULES.map((m) => [m.meta.code, m.phone]));

export const FEATURE_COPY: Record<string, FeatureCopy> =
  Object.fromEntries(LOCALE_MODULES.map((m) => [m.meta.code, m.feature]));

export const LANDING_COPY: Record<string, LandingCopy> =
  Object.fromEntries(LOCALE_MODULES.map((m) => [m.meta.code, m.landing]));

/** Only languages supported by the app have native captures. */
export const NATIVE_SCREENSHOT_LOCALES = new Set<string>([
  'en', 'ms', 'zh', 'zh-Hant', 'id', 'th', 'vi', 'fil', 'ja', 'ko', 'hi', 'ta', 'bn',
]);

/** Store Chinese uses `zh`; the app names the script explicitly. */
export function screenshotLocale(locale: string): string {
  if (locale === 'zh') return 'zh-Hans';
  return NATIVE_SCREENSHOT_LOCALES.has(locale) ? locale : 'en';
}
