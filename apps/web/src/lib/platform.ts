import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/site";

/**
 * Which of the two stores a device can install from. Named after the store
 * rather than the operating system, so "Get the app" on an iPhone and a press
 * on the App Store badge land in the same column of the funnel.
 */
export type StoreTarget = "app_store" | "play_store";

/**
 * The same, plus `"none"` for a reader we cannot place — a desktop, an
 * unrecognised user agent — pressing a call to action. A device whose store
 * has not launched would still report that store, with `live: false` beside
 * it, so demand for an unshipped platform stays countable.
 */
export type DownloadTarget = StoreTarget | "none";

/**
 * Reading the user agent is right here: the question is which app store the
 * device can install from, which is a property of the device and has no
 * feature to detect instead.
 *
 * One copy, read from both sides — `/download` from the request header and
 * `download-link.tsx` from `navigator.userAgent`. The button decides whether
 * to navigate and the route decides where to, so two copies drifting apart
 * would be a button that goes nowhere on exactly one browser.
 *
 * iPadOS reports itself as `Macintosh` and is deliberately not detected, since
 * guessing would send every desktop Safari reader to the App Store. An iPad
 * reader falls back to the store badges on the home page.
 */
export function storeTargetFor(userAgent: string): StoreTarget | null {
  if (/android/i.test(userAgent)) return "play_store";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "app_store";
  return null;
}

/**
 * The listing each target resolves to, live or not. The store URLs stay in
 * `site.ts`, and so does whether each one exists yet — see `STORE_LIVE`.
 */
export const STORE_URLS: Record<StoreTarget, string> = {
  app_store: APP_STORE_URL,
  play_store: PLAY_STORE_URL,
};
