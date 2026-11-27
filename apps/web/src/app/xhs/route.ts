import { NextResponse } from "next/server";

import { storeTargetFor } from "@/lib/platform";

/**
 * `ricecal.app/xhs`: the address a XiaoHongShu post can carry.
 *
 * XiaoHongShu is where most new users hear about RiceCal (the onboarding
 * answer says about half), but a post cannot hold a store link, so people
 * searched the store by name and arrived uncounted. This is short enough to
 * type, and it lands each phone on a listing that says where it came from:
 *
 * - iPhone: the "XHS Malaysia, food first" custom product page (`ppid`), with
 *   an App Store campaign token (`pt` + `ct`) so App Store Connect counts it
 *   under Acquisition > Campaigns. Apple shows a campaign only once it has
 *   five downloads, so there is one token for the channel, not one per post.
 * - Android: Google Play with a UTM referrer, which Play Console reports by
 *   source and campaign, and `listing=xhs` for a custom store listing of that
 *   name. Without that listing Play shows the default one.
 * - Anything else: `/download`'s fallback, the home page's badges.
 *
 * No analytics event, for the same reason as `/download`: a redirect has no
 * document to send one from. The stores count the arrival.
 */
const APP_STORE =
  "https://apps.apple.com/app/id6795558595?ppid=d998c373-f798-4df1-a7b0-2dddb1d168f3&pt=128646860&ct=xhs&mt=8";
const PLAY_STORE =
  "https://play.google.com/store/apps/details?id=com.nelsongan.ricecal&listing=xhs&referrer=utm_source%3Dxiaohongshu%26utm_medium%3Dsocial%26utm_campaign%3Dxhs";
const FALLBACK = "/#get";

export const dynamic = "force-dynamic";

/* Every answer depends on who asked, so nothing in front of the Worker may keep one. */
const HEADERS = { "cache-control": "no-store" };

export function GET(request: Request) {
  const store = storeTargetFor(request.headers.get("user-agent") ?? "");
  const to =
    store === "app_store"
      ? APP_STORE
      : store === "play_store"
        ? PLAY_STORE
        : new URL(FALLBACK, request.url);
  // 307 rather than 308, so no browser remembers which store it was sent to.
  return NextResponse.redirect(to, { headers: HEADERS, status: 307 });
}
