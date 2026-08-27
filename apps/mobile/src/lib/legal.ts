import { Linking } from 'react-native'

/**
 * The two documents App Review requires a purchase screen to link to, and the
 * one place their addresses are written down.
 *
 * Guideline 3.1.2: a screen that sells an auto-renewable subscription has to
 * state the title, the length, the price, and carry FUNCTIONAL links to the
 * terms of use and the privacy policy. The first three were already on
 * `ProPitch`; these two are the pair that was missing, and their absence is one
 * of the most common reasons a paywall is rejected.
 *
 * They are our own documents rather than Apple's standard EULA, which is the
 * fallback for an app that has not written one. `apps/../ricecal-web` serves
 * both, and the deletion page beside them is what guideline 5.1.1(v) points at
 * for anyone who cannot reach the in-app delete.
 *
 * `ricecal.app`, not the `ricecal.my` in `recipeLink` — that one is the short
 * domain a shared recipe is opened from, and these have to be the addresses
 * filed in App Store Connect.
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
