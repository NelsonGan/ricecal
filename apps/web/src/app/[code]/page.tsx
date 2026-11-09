import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HomeMain } from "@/components/home/home-main";
import { Footer, Header } from "@/components/site-chrome";
import {
  COUNTRIES,
  countryByCode,
  countryCode,
  countryKeywords,
  dishesFor,
  label,
} from "@/lib/countries";
import { jsonLd, marketApp, ogLocale, pageMetadata } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { isRegion } from "@/lib/regions";
import { RegionLock } from "@/lib/use-region";

/**
 * The home page, localised: `/my`, `/sg`, `/jp`.
 *
 * Same layout as `/`, with the country settled by the path instead of guessed
 * in the browser. `RegionLock` is what makes that worth a URL: the marquee and
 * the feature cards render this country's food into the HTML, so a crawler is
 * served the page a reader in Kuala Lumpur is served.
 *
 * The dish table and the FAQ live at `/{code}/food` instead. Two pages about
 * one market only earn their keep by answering different questions, and this
 * one answers "what is this app".
 */
export function generateStaticParams() {
  return COUNTRIES.map((country) => ({ code: countryCode(country) }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/[code]">): Promise<Metadata> {
  const { code } = await params;
  const country = countryByCode(code);
  if (!country) return {};

  return pageMetadata({
    cluster: "home",
    /*
     * `blurb`, not `intro`. The intro is page copy at 230 characters, so a
     * result cut it mid-list of dishes without ever reaching the word
     * "tracker". The blurb is written to the length a result has.
     */
    description: country.blurb,
    keywords: countryKeywords(country),
    locale: ogLocale(country.hreflang),
    path: `/${countryCode(country)}`,
    // The searchable title, not the H1 — see `searchTitle` in `countries.ts`.
    // The root layout's template appends "· RiceCal", so this must not.
    title: country.searchTitle,
  });
}

export default async function LocalisedHome({ params }: PageProps<"/[code]">) {
  const { code } = await params;
  const country = countryByCode(code);
  if (!country) notFound();

  // Every country in COUNTRIES has a dish set, but the type cannot know that.
  if (!isRegion(country.slug)) notFound();

  const url = `${SITE_URL}/${countryCode(country)}`;
  const dishes = dishesFor(country.slug);

  const graph = [
    marketApp({
      country,
      description: country.intro,
      name: `${SITE_NAME}: ${label(country)} Calorie Tracker`,
      url,
    }),
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", item: SITE_URL, name: SITE_NAME, position: 1 },
        {
          "@type": "ListItem",
          item: url,
          name: `${label(country)} calorie tracker`,
          position: 2,
        },
      ],
    },
    /*
     * A sample rather than the whole table, which carries the full `ItemList`
     * on `/{code}/food`. Repeating every row in both pages' structured data
     * would have them competing for the same result.
     */
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: dishes.slice(0, 4).map((dish, index) => ({
        "@type": "ListItem",
        item: { "@type": "MenuItem", name: dish.name },
        position: index + 1,
      })),
      name: `${country.adjective} dishes RiceCal already knows`,
      numberOfItems: Math.min(dishes.length, 4),
    },
  ];

  return (
    <RegionLock region={country.slug}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(graph) }}
      />
      <Header />
      <HomeMain country={country} />
      <Footer />
    </RegionLock>
  );
}
