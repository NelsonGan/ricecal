"use client";

import {
  type DownloadPlan,
  EVENTS,
  type Placement,
  trackLeaving,
} from "@/lib/analytics";
import { type DownloadTarget, storeTargetFor } from "@/lib/platform";
import { STORE_LIVE } from "@/lib/site";

/**
 * Every "get the app" link that is not a store badge — the header's button and
 * the pricing buttons — so they cannot drift apart or go uncounted again.
 *
 * Goes to `/download`, which works out which store the reader can install
 * from, so this button need not know where either store lives.
 *
 * A plain `<a>`, not `next/link`: `/download` is a route handler with no RSC
 * payload behind it, so the client router would fetch one, get a cross-origin
 * redirect it cannot read, and fall back to the document load it should have
 * done first.
 */
export function DownloadLink({
  children,
  className,
  placement,
  plan,
}: {
  children: React.ReactNode;
  className: string;
  placement: Placement;
  plan?: DownloadPlan;
}) {
  /*
   * The same question the route asks, asked a moment earlier, so the event can
   * say which store the click reached. `navigator.userAgent` here and the
   * `user-agent` header there are the same string read through
   * {@link storeTargetFor}, so this is the same decision rather than a guess
   * at it — and the route still makes it for a link pasted into a chat.
   */
  const handleClick = () => {
    const store = storeTargetFor(window.navigator.userAgent);

    /*
     * Which store the click resolved to, and whether that store exists yet,
     * are two different columns. `target` is the store the device would
     * install from either way, so a header press on an Android and a press on
     * the Play badge beside it are one row rather than two. `live` says
     * whether that press reached the store, and is false for a device we could
     * not place at all.
     */
    const target: DownloadTarget = store ?? "none";
    const live = store ? STORE_LIVE[store] : false;

    // Every click navigates: `/download` answers every device with a redirect,
    // so there is nothing for this handler to cancel.
    trackLeaving(EVENTS.download, {
      live,
      placement,
      target,
      ...(plan ? { plan } : {}),
    });
  };

  return (
    /*
     * The rule sees `/download` in the `app` directory and cannot tell that the
     * file is `route.ts` rather than `page.tsx`, so its advice is the thing the
     * note above explains is wrong here. Disabled at this line rather than in
     * `eslint.config.mjs`, where it still catches real mistakes.
     */
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href="/download" className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
