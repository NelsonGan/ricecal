/**
 * One of our locale codes to many of the stores'.
 *
 * Plain ESM rather than TypeScript so the Next routes and the CLI scripts can
 * both import it — a locale map that disagrees between the web UI and the
 * command line is a listing that half-updates and nobody notices.
 *
 * `en` goes out to every English variant the store keeps separately.
 * Chinese scripts have separate art, so each maps only to its own listings.
 */

/** @type {Record<string, string[]>} */
export const IOS_LOCALE_MAP = {
  en: ['en-US', 'en-GB', 'en-AU', 'en-CA'],
  ms: ['ms'],
  zh: ['zh-Hans'],
  'zh-Hant': ['zh-Hant'], // zh-HK is not an App Store Connect locale
  id: ['id'],
  th: ['th'],
  vi: ['vi'],
  ja: ['ja'],
  ko: ['ko'],
  hi: ['hi'],
  ta: ['ta-IN'],
  bn: ['bn-BD'],
  es: ['es-ES', 'es-MX'],
  fr: ['fr-FR', 'fr-CA'],
  de: ['de-DE'],
  pt: ['pt-BR', 'pt-PT'],
  it: ['it'],
  nl: ['nl-NL'],
  ru: ['ru'],
  tr: ['tr'],
  pl: ['pl'],
  uk: ['uk'],
  sv: ['sv'],
  nb: ['no'],
  da: ['da'],
  // fil: Filipino has no App Store Connect localization.
};

/** @type {Record<string, string[]>} */
export const ANDROID_LOCALE_MAP = {
  en: ['en-US', 'en-GB'],
  ms: ['ms'],
  zh: ['zh-CN'],
  'zh-Hant': ['zh-TW', 'zh-HK'],
  id: ['id'],
  th: ['th'],
  vi: ['vi'],
  ja: ['ja-JP'],
  ko: ['ko-KR'],
  hi: ['hi-IN'],
  ta: ['ta-IN'],
  bn: ['bn-BD'],
  fil: ['fil'],
  es: ['es-ES', 'es-419'],
  fr: ['fr-FR', 'fr-CA'],
  de: ['de-DE'],
  pt: ['pt-BR', 'pt-PT'],
  it: ['it-IT'],
  nl: ['nl-NL'],
  ru: ['ru-RU'],
  tr: ['tr-TR'],
  pl: ['pl-PL'],
  uk: ['uk'],
  sv: ['sv-SE'],
  nb: ['no-NO'],
  da: ['da-DK'],
};

// Listing text still has one Chinese source. Keep its existing coverage while
// screenshots use separate Simplified and Traditional Chinese captures.
const metadataLocales = (mapping, chinese) => Object.fromEntries(
  Object.entries({ ...mapping, zh: chinese }).filter(([locale]) => locale !== 'zh-Hant'),
);
export const IOS_METADATA_LOCALE_MAP = metadataLocales(IOS_LOCALE_MAP, ['zh-Hans', 'zh-Hant']);
export const ANDROID_METADATA_LOCALE_MAP = metadataLocales(ANDROID_LOCALE_MAP, ['zh-CN', 'zh-TW', 'zh-HK']);

/**
 * `asc` device types. It reports 1290 × 2796 as valid for both IPHONE_67 and
 * IPHONE_69 (`asc screenshots sizes --all`); 69 is the 6.9" slot Apple asks
 * for now, and is what this tool exports at.
 */
export const IOS_DEVICE_TYPE = {
  phone: 'IPHONE_69',
  // Open on its side, 2853 × 2007, which `asc` resolves to APP_IPHONE_DUO.
  duo: 'IPHONE_DUO',
  ipad: 'IPAD_PRO_3GEN_129',
  // 416 × 496, which `asc` resolves to APP_WATCH_SERIES_10. App Store Connect
  // scales one watch set to the other sizes, as it does the iPhone's.
  watch: 'WATCH_SERIES_10',
};

/**
 * `gplay` image types, as a list per device.
 *
 * Tablet is two galleries, not one. Play keeps 7-inch and 10-inch screenshots
 * separately and asks for both before it will treat an app as tablet-ready, so
 * one set of tablet art goes to each. The same 2732 × 2048 export satisfies
 * both: Play's rule is 320px to 3840px a side with the long side no more than
 * twice the short one, and 4:3 is well inside it.
 */
export const ANDROID_IMAGE_TYPES = {
  phone: ['phoneScreenshots'],
  tablet: ['sevenInchScreenshots', 'tenInchScreenshots'],
  feature: ['featureGraphic'],
  icon: ['icon'],
};

/**
 * Play accepts at most 8 screenshots per device type
 * (https://support.google.com/googleplay/android-developer/answer/9866151).
 * The phone set is 6 scenes so nothing is dropped today, but the cap is
 * enforced here rather than discovered mid-upload if a scene is ever added.
 * App Store Connect allows 10.
 */
export const ANDROID_MAX_SCREENSHOTS = 8;
export const IOS_MAX_SCREENSHOTS = 10;

/**
 * How many images each Play gallery holds, by our device name. The screenshot
 * galleries take a set; the feature graphic and the icon are single slots, and
 * sending a second image to one silently becomes the one Play keeps.
 */
export const ANDROID_MAX_IMAGES = {
  phone: ANDROID_MAX_SCREENSHOTS,
  tablet: ANDROID_MAX_SCREENSHOTS,
  feature: 1,
  icon: 1,
};

/**
 * Play's app icon, which is a listing asset rather than anything read out of
 * the bundle: 512 x 512 PNG, and the launcher icon inside the AAB never
 * replaces it. Shipped in the repo so the button has something to send.
 */
export const ANDROID_ICON_FILE = 'public/assets/icons/play_store_512.png';
