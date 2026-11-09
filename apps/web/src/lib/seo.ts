import type { Metadata } from "next";

import { type Country, COUNTRIES, countryCode, label } from "@/lib/countries";
import { pricingFor } from "@/lib/pricing";
import { isRegion } from "@/lib/regions";
import {
  SITE_METADATA_BASE,
  SITE_NAME,
  SITE_URL,
  operatingSystems,
  storeUrls,
} from "@/lib/site";

type SeoPath = "" | `/${string}`;

export function pageUrl(path: SeoPath) {
  return `${SITE_URL}${path === "/" ? "" : path}`;
}

/**
 * Two hreflang clusters, because there are two sets of pages. Every page in a
 * set lists every other page in it and itself — a missing self-reference makes
 * Google drop the whole cluster.
 *
 * The two sets must not bleed into each other: `/my` and `/my/food` are
 * different pages about the same market, not alternates, and calling them
 * alternates would have Google pick one and drop the other.
 */

/** `/`, `/my`, `/sg` … the home page and its fifteen localised selves. */
export const HREFLANG_HOME: Record<string, string> = {
  // The one to serve somebody the set has no country for.
  "x-default": SITE_URL,
  en: SITE_URL,
  ...Object.fromEntries(
    COUNTRIES.map((country) => [
      country.hreflang,
      `${SITE_URL}/${countryCode(country)}`,
    ]),
  ),
};

/**
 * `/my/food`, `/sg/food` … the dish tables.
 *
 * No `x-default`: there is no country-less version of a dish table, and
 * pointing this set at `/` would nominate a page that is not one of its
 * alternates.
 */
export const HREFLANG_FOOD: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((country) => [
    country.hreflang,
    `${SITE_URL}/${countryCode(country)}/food`,
  ]),
);

/**
 * What every page tells a crawler it may do with it. `index, follow` is the
 * default already; the `googleBot` half is the point. Left unsaid, Google caps
 * previews at a thumbnail and snippets at its own guess of a sensible length,
 * and a thumbnail is the wrong size for a page whose answer is a dish.
 *
 * A page that must not be indexed says so itself — see `not-found.tsx` — or
 * passes `indexable: false` and gets {@link FOLLOW_ONLY}.
 */
const CRAWLABLE = {
  follow: true,
  googleBot: {
    follow: true,
    index: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
  index: true,
} as const;

/**
 * For a page that is there for readers but not for Google's index: the dish
 * pages. `follow` stays on so the links out of it still count, and the page
 * stays crawlable, because a robots.txt block would hide the `noindex` itself.
 */
const FOLLOW_ONLY = {
  follow: true,
  googleBot: { follow: true, index: false },
  index: false,
} as const;

/**
 * Open Graph wants `language_TERRITORY`, not a bare language: a plain `en` is
 * read as invalid and silently falls back to `en_US`. The localised pages have
 * a territory to hand (`en-MY`, `en-SG`) and pass their own.
 */
const DEFAULT_OG_LOCALE = "en_US";

export function ogLocale(hreflang: string) {
  return hreflang.replace("-", "_");
}

/**
 * Every market's `og:locale`, for `og:locale:alternate` — the same fact
 * hreflang carries, repeated because Open Graph does not read hreflang. A page
 * emits this minus its own locale; nothing may be its own alternate.
 */
const OG_LOCALES = COUNTRIES.map((country) => ogLocale(country.hreflang));

export function pageMetadata({
  absoluteTitle,
  cluster,
  description,
  indexable = true,
  keywords,
  locale = DEFAULT_OG_LOCALE,
  path,
  title,
}: {
  /** Skip the root layout's "· RiceCal" suffix, for a title that has it already. */
  absoluteTitle?: boolean;
  /**
   * Which hreflang set this page belongs to, if any.
   *
   * Omitted for the legal pages: they have no regional variant, and claiming
   * one would point Google at a set of URLs that are not alternates of them.
   */
  cluster?: "food" | "home";
  description: string;
  /** `false` for a page readers use but search should not list. */
  indexable?: boolean;
  keywords?: string[];
  /** `og:locale`, in Open Graph's `language_TERRITORY` form. */
  locale?: string;
  path: SeoPath;
  title: string;
}): Metadata {
  const url = pageUrl(path);

  return {
    alternates: {
      canonical: url,
      ...(cluster
        ? { languages: cluster === "food" ? HREFLANG_FOOD : HREFLANG_HOME }
        : {}),
    },
    keywords,
    description,
    metadataBase: SITE_METADATA_BASE,
    openGraph: {
      // Only for a page that has alternates. The legal pages pass no cluster
      // and get no list, for the same reason they get no hreflang.
      alternateLocale: cluster
        ? OG_LOCALES.filter((other) => other !== locale)
        : undefined,
      description,
      images: [
        {
          alt: `${SITE_NAME} app preview`,
          height: 630,
          type: "image/png",
          url: `${SITE_URL}/opengraph-image`,
          width: 1200,
        },
      ],
      locale,
      siteName: SITE_NAME,
      title,
      type: "website",
      url,
    },
    robots: indexable ? CRAWLABLE : FOLLOW_ONLY,
    title: absoluteTitle ? { absolute: title } : title,
    twitter: {
      card: "summary_large_image",
      description,
      images: [
        { alt: `${SITE_NAME} app preview`, url: `${SITE_URL}/opengraph-image` },
      ],
      title,
    },
  };
}

/**
 * The `MobileApplication` node a country page publishes about itself. Shared
 * by `/{code}` and `/{code}/food`, which differ only in the `name` and `url`
 * they pass in.
 *
 * Three fields are localised because a crawler can act on them:
 * `alternateName` carries the query itself and the local-language phrase for
 * the category; `areaServed` names the country as an ISO 3166-1 alpha-2 code,
 * which Google matches against a searcher's location; and `priceCurrency` is
 * the market's own, matching the currency shown in the pricing section.
 */
export function marketApp({
  country,
  description,
  name,
  url,
}: {
  country: Country;
  description: string;
  name: string;
  url: string;
}) {
  const code = countryCode(country).toUpperCase();
  const place = label(country);
  // Every country in COUNTRIES is priced; the type cannot know that.
  const pricing = isRegion(country.slug) ? pricingFor(country.slug) : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "MobileApplication",
    alternateName: [
      `${place} Calorie Tracker`,
      ...(country.native ? [country.native.term] : []),
    ],
    applicationCategory: "HealthApplication",
    countriesSupported: country.name,
    description,
    downloadUrl: storeUrls(),
    image: `${SITE_URL}/icon.png`,
    inLanguage: "en",
    name,
    offers: {
      "@type": "Offer",
      areaServed: { "@type": "Country", identifier: code, name: place },
      name: "Free plan",
      price: "0",
      ...(pricing ? { priceCurrency: pricing.monthly.currency } : {}),
    },
    operatingSystem: operatingSystems(),
    url,
  };
}

/** Escapes `<` so a `</script>` inside the data cannot close the tag early. */
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
