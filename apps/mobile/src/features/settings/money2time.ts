/**
 * Money2Time, the other app, advertised to free accounts under Me.
 *
 * Money2Time does the same for RiceCal in its own settings, so the two halves
 * are one arrangement: change a store id there and here together.
 */
export const MONEY2TIME_APP_STORE_URL = 'https://apps.apple.com/app/id6760418898'
export const MONEY2TIME_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.nelsongan.money2time'
/** The website's redirect, which picks a store itself. */
export const MONEY2TIME_DOWNLOAD_URL = 'https://money2time.com/download'

/** The listing this device can install from, and the website anywhere else. */
export function money2TimeStoreUrl(platformOS: string): string {
  if (platformOS === 'ios') return MONEY2TIME_APP_STORE_URL
  if (platformOS === 'android') return MONEY2TIME_PLAY_STORE_URL
  return MONEY2TIME_DOWNLOAD_URL
}

/** In `assets/brand` for the reason `DISCORD_LOGO` is: the icon sync would delete it. */
export const MONEY2TIME_LOGO = require('../../../assets/brand/money2time.png')
