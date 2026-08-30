import { Linking } from 'react-native'

/**
 * The two documents App Review requires a purchase screen to link to, and the one
 * place their addresses are written down.
 *
 * Guideline 3.1.2: a screen selling an auto-renewable subscription states the
 * title, length and price and carries functional links to the terms of use and
 * the privacy policy. The first three were already on `ProPitch`, and the missing
 * pair is one of the commonest reasons a paywall is rejected.
 *
 * Our own documents rather than Apple's standard EULA. `ricecal-web` serves both,
 * and the deletion page beside them is what guideline 5.1.1(v) points at.
 *
 * `ricecal.app` rather than the `ricecal.my` in `recipeLink`, which is the short
 * domain a shared recipe opens from: these have to be the addresses filed in App
 * Store Connect.
 */
const SITE = 'https://ricecal.app'

export const TERMS_URL = `${SITE}/terms`
export const PRIVACY_URL = `${SITE}/privacy`

/**
 * Opens one of them, swallowing the failure.
 *
 * There is nothing useful to say when a browser cannot be opened, and an
 * unhandled rejection from `openURL` is a red screen on the paywall — which is
 * a worse outcome than a link that did nothing.
 */
export function openLegal(url: string): void {
  Linking.openURL(url).catch(() => {})
}
