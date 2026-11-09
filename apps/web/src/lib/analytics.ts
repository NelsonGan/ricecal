"use client";

import { countryByCode } from "@/lib/countries";
import type { DownloadTarget } from "@/lib/platform";
import type { RegionSlug } from "@/lib/regions";

/**
 * The site's one product-analytics plan, fanned out to PostHog and GA4.
 *
 * Both start only on the production hosts, and Do Not Track stops both before
 * either one loads. They receive the same decisions, with one deliberate
 * exception: GA4 never receives free-text food searches because a search box
 * cannot promise that somebody only typed a dish.
 *
 * Deliberately absent: interaction autocapture, identity, scroll depth,
 * keystrokes, form fields, and generic outbound clicks. The site has one job,
 * so only the decisions in {@link EVENTS} earn a product event. PostHog also
 * captures uncaught errors and records a sample of sessions (inputs masked),
 * both governed by the project settings.
 */

/**
 * PostHog's project token is a public, write-only ingestion key, the same one
 * the RiceCal app ships. The website and the app share the "RiceCal" project
 * (id 659954, US Cloud), so web acquisition sits beside app behaviour.
 */
const POSTHOG_TOKEN = "phc_oTQVxPmCyJK7aa2vqiYpXfis7uyvXfyq6haETFw7cQj7";
const POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * A measurement ID is public routing metadata, like the Firebase app IDs that
 * ship in the mobile binaries. Keeping it here makes the production stream
 * part of this repository's configuration instead of a hidden build setting.
 */
const GA_MEASUREMENT_ID = "G-5Q45RV0KMX";
const GA_HOSTS = new Set(["ricecal.app", "www.ricecal.app"]);

/** The whole event vocabulary, so no event has two spellings. */
export const EVENTS = {
  /** The support form was handed off to a mail client. Carries the topic only. */
  contactSubmitted: "Contact Submitted",
  /** Every request for the app, with the button and store it resolved to. */
  download: "App Download Clicked",
  /** A search that came back. One per answer, never one per keystroke. */
  foodSearched: "Food Searched",
  /** The footer picker was used, correcting the site's region guess. */
  regionChanged: "Region Changed",
  /** A result was followed. The rank is how we find out if search is useful. */
  searchResultClicked: "Search Result Clicked",
  viewPage: "Page Viewed",
} as const;

export type AnalyticsEvent = (typeof EVENTS)[keyof typeof EVENTS];

export type DownloadPlan = "free" | "pro";
type SearchSource = "chip" | "typed";

/** A typo in a placement would silently split the conversion funnel. */
export type Placement =
  | "country-dishes"
  | "dish"
  | "final-cta"
  | "header"
  | "hero"
  | "pricing";

/** The page shape reports group by instead of grouping 48,000 dish URLs. */
export type PageType =
  | "contact"
  | "country-dishes"
  | "country-home"
  | "dish"
  | "home"
  | "legal"
  | "other";

/** Single, unprefixed copies, so they never carry a country. */
const LEGAL_PAGES = new Set(["data-deletion", "privacy", "terms"]);

export function pageTypeOf(pathname: string): PageType {
  const [first, second] = pathname.split("/").filter(Boolean);

  if (!first) return "home";
  if (first === "food") return second ? "dish" : "other";
  if (first === "contact") return "contact";
  if (LEGAL_PAGES.has(first)) return "legal";

  if (countryByCode(first)) {
    return second === "food" ? "country-dishes" : "country-home";
  }

  return "other";
}

type AnalyticsPlan = {
  [EVENTS.contactSubmitted]: { topic: string };
  [EVENTS.download]: {
    live: boolean;
    placement: Placement;
    target: DownloadTarget;
    plan?: DownloadPlan;
  };
  [EVENTS.foodSearched]: {
    failed: boolean;
    query: string;
    results: number;
    source: SearchSource;
  };
  [EVENTS.regionChanged]: {
    from: RegionSlug;
    fromLocalisedPage: boolean;
    to: RegionSlug;
  };
  [EVENTS.searchResultClicked]: {
    query: string;
    rank: number;
    results: number;
    seeded: boolean;
    slug: string;
    source: SearchSource | "seeded";
  };
  [EVENTS.viewPage]: { pageType: PageType; path: string };
};

type AnalyticsCall = {
  [Event in AnalyticsEvent]: {
    event: Event;
    properties: AnalyticsPlan[Event];
  };
}[AnalyticsEvent];

type PostHog = (typeof import("posthog-js"))["default"];
type PostHogCapture = { event: string; properties?: Record<string, unknown> };
type GtagParameters = Record<string, boolean | number | string>;

const CAMPAIGN_PARAMETERS = {
  utm_campaign: "campaign_name",
  utm_content: "campaign_content",
  utm_id: "campaign_id",
  utm_medium: "campaign_medium",
  utm_source: "campaign_source",
  utm_term: "campaign_term",
} as const;
const CAMPAIGN_VALUE_LIMIT = 100;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let trackingEnabled = false;
let posthog: PostHog | null = null;
let posthogStarting = false;
let googleConfigured = false;
let previousGooglePage: string | null = null;

const posthogPending: Array<(client: PostHog) => void> = [];
const PENDING_LIMIT = 20;

/** URL properties PostHog records itself, reduced to origin + path. */
const POSTHOG_URL_PROPERTIES = [
  "$current_url",
  "$initial_current_url",
  "$session_entry_url",
] as const;
/** Referrer properties, reduced to an origin for external sites as in GA4. */
const POSTHOG_REFERRER_PROPERTIES = [
  "$referrer",
  "$initial_referrer",
  "$session_entry_referrer",
] as const;
/**
 * Ad click identifiers PostHog would otherwise record from the landing URL as
 * campaign properties. GA4 receives only the six `utm_*` values; so does PostHog.
 */
const CLICK_ID_PARAMETERS = [
  "dclid",
  "fbclid",
  "gad_source",
  "gbraid",
  "gclid",
  "gclsrc",
  "igshid",
  "ko_click_id",
  "li_fat_id",
  "mc_cid",
  "msclkid",
  "rdt_cid",
  "sccid",
  "ttclid",
  "twclid",
  "wbraid",
] as const;

/** Private recipe paths carry a bearer credential and never enter analytics. */
export function isPrivateAnalyticsPath(pathname: string): boolean {
  return /^\/r\/[^/]+\/?$/.test(pathname);
}

function analyticsRouteAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    !isPrivateAnalyticsPath(window.location.pathname)
  );
}

export function googleAnalyticsScript(): string | null {
  if (!googleAnalyticsAvailable()) return null;
  return `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
}

function googleAnalyticsAvailable(): boolean {
  return (
    analyticsRouteAvailable() && GA_HOSTS.has(window.location.hostname)
  );
}

function browserDoNotTrack(): boolean {
  if (typeof window === "undefined") return false;

  const flags = [
    window.navigator.doNotTrack,
    (window as { doNotTrack?: string }).doNotTrack,
    (window.navigator as { msDoNotTrack?: string }).msDoNotTrack,
  ];

  return flags.some((flag) => flag === "1" || flag === "yes");
}

/** `https://host/path` for an http(s) URL, or undefined when unreadable. */
function originAndPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

/** A RiceCal path keeps its path; an external site keeps only its origin. */
function safeReferrer(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (value === "$direct") return value;
  try {
    const referrer = new URL(value);
    if (!["http:", "https:"].includes(referrer.protocol)) return undefined;
    return GA_HOSTS.has(referrer.hostname)
      ? `${referrer.origin}${referrer.pathname}`
      : referrer.origin;
  } catch {
    return undefined;
  }
}

function privateUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return isPrivateAnalyticsPath(new URL(value).pathname);
  } catch {
    return false;
  }
}

/**
 * PostHog `before_send`: drop anything recorded on a private recipe link, and
 * strip query strings and fragments from every URL so PostHog keeps exactly
 * the URL context GA4 does.
 */
export function sanitizePostHogEvent<T extends PostHogCapture>(
  event: T | null,
): T | null {
  if (!event?.properties) return event;
  if (privateUrl(event.properties.$current_url)) return null;
  const properties = sanitizeProperties(event.properties);
  // The same fields also travel as initial person properties.
  for (const setKey of ["$set", "$set_once"] as const) {
    const set = properties[setKey];
    if (set && typeof set === "object") {
      properties[setKey] = sanitizeProperties(set as Record<string, unknown>);
    }
  }
  return { ...event, properties };
}

function sanitizeProperties(input: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = { ...input };
  for (const key of POSTHOG_URL_PROPERTIES) {
    if (key in properties) properties[key] = originAndPath(properties[key]);
  }
  for (const key of POSTHOG_REFERRER_PROPERTIES) {
    if (key in properties) properties[key] = safeReferrer(properties[key]);
  }
  for (const parameter of CLICK_ID_PARAMETERS) {
    delete properties[parameter];
    delete properties[`$initial_${parameter}`];
  }
  return properties;
}

function startPostHog(): void {
  if (posthog || posthogStarting) return;

  posthogStarting = true;

  void import("posthog-js")
    .then(({ default: loaded }) => {
      // A client navigation may have reached a private share while the chunk
      // was in flight. Re-check the route before initialising the provider.
      if (!trackingEnabled || !analyticsRouteAvailable()) return;

      loaded.init(POSTHOG_TOKEN, {
        api_host: POSTHOG_HOST,
        ui_host: "https://us.posthog.com",
        // Visitors are never identified, so every website event is anonymous,
        // PostHog's cheapest kind, and no person profiles are created.
        person_profiles: "identified_only",
        // Only the typed plan is captured; page views are sent manually so
        // their URLs can be sanitized.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        rageclick: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_performance: false,
        capture_exceptions: true,
        // Recordings follow the project's sample rate. Inputs are masked (the
        // contact form); network headers and bodies are never recorded.
        session_recording: {
          maskAllInputs: true,
          recordHeaders: false,
          recordBody: false,
        },
        // Flags are an app feature; skipping them here keeps page loads from
        // ever counting as billable flag requests.
        advanced_disable_feature_flags: true,
        disable_surveys: true,
        respect_dnt: true,
        persistence: "localStorage+cookie",
        before_send: sanitizePostHogEvent,
      });

      posthog = loaded;
      for (const call of posthogPending.splice(0)) call(loaded);
    })
    .catch(() => {
      posthogPending.length = 0;
    })
    .finally(() => {
      posthogStarting = false;
    });
}

/**
 * A client navigation into a private recipe link: stop the recording, whose
 * URL would carry the link's credential. Its events are already dropped by
 * {@link sanitizePostHogEvent}. Recording resumes on the next page load.
 */
export function pauseRecordingForPrivatePage(): void {
  posthog?.stopSessionRecording();
}

function gtag(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  window.dataLayer ??= [];
  window.gtag ??= function googleTagCommand() {
    // gtag.js intentionally consumes the function's array-like Arguments
    // object. A rest-parameter array is close, but is not the documented wire
    // shape Google places on dataLayer.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag(...args);
}

function startGoogleAnalytics(): void {
  if (!googleAnalyticsAvailable()) return;
  if (googleConfigured) return;

  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, {
    allow_ad_personalization_signals: false,
    allow_google_signals: false,
    cookie_flags: "SameSite=Lax;Secure",
    ...googleConfigContext(),
    send_page_view: false,
  });
  googleConfigured = true;
}

/** Safe to call again. Providers that are already ready stay ready. */
export function startAnalytics(): boolean {
  if (!googleAnalyticsAvailable() || browserDoNotTrack()) return false;

  trackingEnabled = true;
  startGoogleAnalytics();
  startPostHog();
  return true;
}

function withPostHog(call: (client: PostHog) => void): void {
  if (!trackingEnabled || !analyticsRouteAvailable()) return;

  if (posthog) {
    call(posthog);
    return;
  }

  if (!posthogStarting || posthogPending.length >= PENDING_LIMIT) return;
  posthogPending.push(call);
}

/**
 * The PostHog half of a call. A page view becomes PostHog's own `$pageview`,
 * with the query-free URL, so its web analytics and paths work; every other
 * decision keeps its name.
 */
function postHogEvent(call: AnalyticsCall): {
  name: string;
  properties: Record<string, unknown>;
} {
  if (call.event === EVENTS.viewPage) {
    return {
      name: "$pageview",
      properties: {
        $current_url: `${window.location.origin}${call.properties.path}`,
        page_type: call.properties.pageType,
        path: call.properties.path,
      },
    };
  }
  return { name: call.event, properties: call.properties };
}

function safeDocumentReferrer(): string | undefined {
  if (typeof document === "undefined" || !document.referrer) return undefined;

  try {
    const referrer = new URL(document.referrer);
    if (!["http:", "https:"].includes(referrer.protocol)) return undefined;

    // An external path is not needed for attribution and could be uncontrolled.
    return GA_HOSTS.has(referrer.hostname)
      ? `${referrer.origin}${referrer.pathname}`
      : referrer.origin;
  } catch {
    return undefined;
  }
}

function googleConfigContext(): GtagParameters {
  const context: GtagParameters = {
    // Do not let an arbitrary query string become an Analytics page dimension.
    page_location: `${window.location.origin}${window.location.pathname}`,
  };
  const referrer = safeDocumentReferrer();
  if (referrer) context.page_referrer = referrer;

  // Keep acquisition reporting without forwarding the whole query string.
  const query = new URLSearchParams(window.location.search);
  for (const [parameter, field] of Object.entries(CAMPAIGN_PARAMETERS)) {
    const value = query.get(parameter);
    if (value) {
      context[field] = Array.from(value).slice(0, CAMPAIGN_VALUE_LIMIT).join("");
    }
  }

  return context;
}

function googleEvent(call: AnalyticsCall): {
  name: string;
  parameters: GtagParameters;
} {
  switch (call.event) {
    case EVENTS.viewPage: {
      const page = `${window.location.origin}${call.properties.path}`;
      const referrer = previousGooglePage ?? safeDocumentReferrer();
      previousGooglePage = page;

      return {
        name: "page_view",
        parameters: {
          content_group: call.properties.pageType,
          page_location: page,
          page_title: document.title,
          ...(referrer ? { page_referrer: referrer } : {}),
        },
      };
    }
    case EVENTS.foodSearched:
      return {
        name: "ricecal_food_searched",
        parameters: {
          query_length: Array.from(call.properties.query).length,
          results: call.properties.results,
          search_failed: call.properties.failed ? "yes" : "no",
          source: call.properties.source,
        },
      };
    case EVENTS.searchResultClicked:
      return {
        // The mobile app calls the same decision `Food Picked`. Sharing its
        // event name and core fields keeps one cross-platform search funnel.
        name: "ricecal_food_picked",
        parameters: {
          content_id: call.properties.slug,
          content_type: "food",
          position: call.properties.rank,
          results: call.properties.results,
          source: call.properties.source,
        },
      };
    case EVENTS.download:
      return {
        name: "ricecal_app_download_clicked",
        parameters: {
          link_live: call.properties.live ? "yes" : "no",
          placement: call.properties.placement,
          ...(call.properties.plan ? { plan: call.properties.plan } : {}),
          target: call.properties.target,
        },
      };
    case EVENTS.regionChanged:
      return {
        name: "ricecal_region_changed",
        parameters: {
          from_localised_page: call.properties.fromLocalisedPage ? "yes" : "no",
          region_from: call.properties.from,
          region_to: call.properties.to,
        },
      };
    case EVENTS.contactSubmitted:
      return {
        name: "ricecal_contact_submitted",
        parameters: { topic: call.properties.topic },
      };
  }
}

function sendGoogle(call: AnalyticsCall): void {
  if (!trackingEnabled || !googleAnalyticsAvailable()) return;
  const event = googleEvent(call);
  gtag("event", event.name, {
    // `page_location` was deliberately fixed to a query-free value during
    // config so GA's automatic lifecycle events cannot see arbitrary URL
    // parameters. Config scope survives client-side navigation, however, so
    // refresh it at event scope or a download from `/pricing` could still be
    // attributed to the page on which this tab first loaded.
    page_location:
      previousGooglePage ??
      `${window.location.origin}${window.location.pathname}`,
    ...event.parameters,
  });
}

/** The region rides on every later event in both providers. */
export function registerRegion(region: RegionSlug): void {
  withPostHog((client) => client.register({ region }));
  if (trackingEnabled && googleAnalyticsAvailable()) {
    gtag("set", { site_region: region });
  }
}

export function track<Event extends AnalyticsEvent>(
  event: Event,
  properties: AnalyticsPlan[Event],
): void {
  if (!trackingEnabled || !analyticsRouteAvailable()) return;
  const call = { event, properties } as AnalyticsCall;
  const posthogEvent = postHogEvent(call);
  withPostHog((client) => client.capture(posthogEvent.name, posthogEvent.properties));
  sendGoogle(call);
}

/** Send the PostHog half immediately when a click leaves this page. */
export function trackLeaving<Event extends AnalyticsEvent>(
  event: Event,
  properties: AnalyticsPlan[Event],
): void {
  if (!trackingEnabled || !analyticsRouteAvailable()) return;
  const call = { event, properties } as AnalyticsCall;
  const posthogEvent = postHogEvent(call);
  withPostHog((client) =>
    client.capture(posthogEvent.name, posthogEvent.properties, {
      send_instantly: true,
      transport: "sendBeacon",
    }),
  );
  sendGoogle(call);
}
