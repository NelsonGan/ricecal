import type { StoreTarget } from "@/lib/platform";

export const SITE_NAME = "RiceCal";
/* "Asian", not "Asia" — it has to match the wordmark's own subtitle. */
export const SITE_TAGLINE = "Asian Calorie Tracker";
export const SITE_URL = "https://ricecal.app";
export const SITE_METADATA_BASE = new URL(SITE_URL);

export const CONTACT_EMAIL = "support@ricecal.app";

/* Both listings are live; {@link STORE_LIVE} decides whether anything links to them. */
export const APP_STORE_URL =
  "https://apps.apple.com/app/ricecal-asia-calorie-tracker/id6795558595";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.nelsongan.ricecal";

/**
 * The switch that turns each store button on, one store at a time.
 *
 * This was a single `STORES_LIVE` boolean, which was right for exactly as long
 * as both listings were unpublished. iOS shipped first, so the two answers
 * parted: a grey "Coming soon" App Store badge beside a live listing is worse
 * than the 404 the flag existed to prevent, and one flag could not say so.
 *
 * A store that is not live keeps the old treatment everywhere — the badge says
 * "Coming soon" and does nothing, `/download` sends that device to the badges
 * instead of a store, and the URL stays out of the JSON-LD. Flip a key here
 * and every one of those follows.
 *
 * Both are on now. The pair stays because a listing can be pulled and a third
 * store can arrive, and neither should mean rewriting five files again.
 */
export const STORE_LIVE: Record<StoreTarget, boolean> = {
  app_store: true,
  play_store: true,
};

/**
 * The same switch, for the structured data. {@link STORE_LIVE} takes an
 * unpublished store off the buttons; without this it would stay in every page's
 * JSON-LD, where `downloadUrl` and `sameAs` go on telling Google the app is at
 * a URL that 404s — in the one place on the page written to be believed
 * without being clicked.
 *
 * `undefined` rather than an empty array, because `JSON.stringify` drops an
 * undefined property but emits an empty one — and `downloadUrl: []` is a claim
 * that there is nowhere to download it.
 */
export function storeUrls(): string[] | undefined {
  const urls = [
    ...(STORE_LIVE.app_store ? [APP_STORE_URL] : []),
    ...(STORE_LIVE.play_store ? [PLAY_STORE_URL] : []),
  ];
  return urls.length > 0 ? urls : undefined;
}

/**
 * The platforms the app can actually be installed on, for the structured data.
 *
 * Written out as `"iOS, Android"` in two files, which was true about the app
 * and false about the reader: schema.org reads `operatingSystem` beside
 * `downloadUrl`, so a page offering one App Store link while naming both
 * platforms tells Google there is an Android build to go and get. There is not,
 * yet — and that is the one claim {@link storeUrls} exists to keep off the
 * page. Both follow {@link STORE_LIVE}, so they cannot say different things.
 *
 * The app is genuinely built for both, and the privacy and terms pages say so;
 * this is narrower on purpose, because it is an answer to "where can I get it".
 */
export function operatingSystems(): string {
  const systems = [
    ...(STORE_LIVE.app_store ? ["iOS"] : []),
    ...(STORE_LIVE.play_store ? ["Android"] : []),
  ];
  return systems.join(", ");
}

export const DISCORD_URL = "https://discord.gg/DCtQ47tEMh";

/* Prices are per market, from App Store Connect — see `lib/pricing.ts`. */

export const IOS_BUNDLE_ID = "com.nelsongan.ricecal";
export const ANDROID_PACKAGE = "com.nelsongan.ricecal";

/** The date the legal pages last changed. Bump when you edit one. */
export const LEGAL_LAST_UPDATED = "12 October 2026";

export const COMPANY_NAME = "RiceCal";
