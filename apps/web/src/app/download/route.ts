import { NextResponse } from "next/server";

import { STORE_URLS, storeTargetFor } from "@/lib/platform";
import { STORE_LIVE } from "@/lib/site";

/**
 * One link that lands everybody in the right place: `/download`.
 *
 * Every "get the app" call to action points here rather than at a store, so no
 * button has to know what the reader is holding and a link pasted into a
 * message works for whoever opens it. An iPhone gets the App Store, an Android
 * gets Google Play, and everybody else — a desktop, an iPad, an unrecognised
 * user agent, a platform that has not shipped — gets the download section,
 * where both badges are and the reader decides. See {@link storeTargetFor} for
 * why a user agent is the right thing to read.
 *
 * No analytics from here. There is no document behind a redirect to send an
 * event from, and a server-side provider call would double-count the click
 * `download-link.tsx` already reported without the browser privacy checks in
 * `lib/analytics.ts`.
 */

/** Where a click goes when there is no store to send it to. Both badges live here. */
const FALLBACK = "/#get";

export const dynamic = "force-dynamic";

/*
 * `force-dynamic` settles what Next does and nothing else: a shared cache in
 * front of the Worker applies its own defaults, and every answer here depends
 * entirely on who asked. One desktop reader's bounce to `/#get` replayed to an
 * iPhone is a download button broken for everybody behind that cache.
 */
const HEADERS = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const store = storeTargetFor(request.headers.get("user-agent") ?? "");

  /*
   * No store to reach, so the reader is sent to where the stores are. Both
   * stores are live, so today that is only a device we cannot place — a laptop,
   * an unrecognised user agent, an iPad (which reports itself as a Mac,
   * deliberately; see {@link storeTargetFor}). The `STORE_LIVE` arm stays for
   * the day a listing is pulled or a third store is added.
   *
   * The best answer is the same either way: the download section, where both
   * badges are real links a reader can open or send to a phone.
   *
   * The button beside the reader still sends the event, with `live: false`, so
   * "pressed it and reached no store" remains a number.
   */
  if (!store || !STORE_LIVE[store]) {
    return NextResponse.redirect(new URL(FALLBACK, request.url), {
      headers: HEADERS,
      // 307, not 308: a browser is entitled to remember a 308 after we flip
      // a `STORE_LIVE` key, and this is only a stand-in for a store.
      status: 307,
    });
  }

  return NextResponse.redirect(STORE_URLS[store], {
    headers: HEADERS,
    // 307 again, and here it matters most: the right store depends on who is
    // asking, so a remembered 308 would send Android readers to the App Store.
    status: 307,
  });
}
