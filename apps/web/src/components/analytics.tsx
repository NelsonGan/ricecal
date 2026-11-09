"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  EVENTS,
  googleAnalyticsScript,
  isPrivateAnalyticsPath,
  pageTypeOf,
  pauseRecordingForPrivatePage,
  registerRegion,
  startAnalytics,
  track,
} from "@/lib/analytics";
import { useRegion } from "@/lib/use-region";

/**
 * Starts the configured providers and sends one page view per navigation.
 *
 * The Google script only renders after {@link startAnalytics} accepts the
 * browser, so Do Not Track prevents the request itself rather than opting out
 * after Google has loaded. Page views are manual because GA4 Enhanced
 * Measurement is disabled alongside every other autocaptured event.
 */
export function Analytics() {
  const pathname = usePathname();
  const { region } = useRegion();
  // The slug is the credential for one private recipe. A direct visit must not
  // load either provider, and client-side navigation must not send a page view
  // or attach that path to a later region event.
  const isPrivateShare = isPrivateAnalyticsPath(pathname);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (isPrivateShare) {
      pauseRecordingForPrivatePage();
      return;
    }
    const timer = window.setTimeout(() => setStarted(startAnalytics()), 0);
    return () => window.clearTimeout(timer);
  }, [isPrivateShare]);

  useEffect(() => {
    if (started && !isPrivateShare) registerRegion(region);
  }, [isPrivateShare, region, started]);

  useEffect(() => {
    if (!started || isPrivateShare) return;

    // Region resolution happens in a passive effect just after hydration. A
    // macrotask lands after it, avoiding a default-region page view followed
    // by a second corrected one.
    const timer = window.setTimeout(() => {
      track(EVENTS.viewPage, { pageType: pageTypeOf(pathname), path: pathname });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isPrivateShare, pathname, started]);

  const script = started ? googleAnalyticsScript() : null;
  return script ? (
    <Script id="ricecal-google-analytics" src={script} strategy="afterInteractive" />
  ) : null;
}
