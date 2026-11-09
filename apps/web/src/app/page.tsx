import type { Metadata } from "next";

import { HomeMain } from "@/components/home/home-main";
import { Footer, Header } from "@/components/site-chrome";
import { pricingFor } from "@/lib/pricing";
import { jsonLd, pageMetadata } from "@/lib/seo";
import {
  DISCORD_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  operatingSystems,
  storeUrls,
} from "@/lib/site";

/**
 * The home page for somebody we have no country for.
 *
 * The `x-default` of the hreflang set, and the one page in it that ships the
 * pan-Asian food in its HTML. The fifteen localised selves at `/my`, `/sg` and
 * so on are the same {@link HomeMain} with the country settled by the path;
 * here it is settled in the browser a paint after hydration, from the time
 * zone or the reader's own choice.
 */

/** The meta description, kept to the ~150 characters a result prints. */
const DESCRIPTION =
  "A calorie tracker that already knows Asian food. Phở, ramen, nasi lemak, bibimbap and 48,000 more dishes, counted by the plate.";

export const metadata: Metadata = pageMetadata({
  absoluteTitle: true,
  cluster: "home",
  description: DESCRIPTION,
  keywords: [
    "asian calorie tracker",
    "asian food calorie counter",
    "calorie tracker app asia",
    "calorie tracker asia",
    "hawker food calories",
    "street food calories",
    "photo calorie counter",
    "barcode calorie scanner",
    "macro tracker asia",
  ],
  path: "",
  /*
   * The same split the country pages make: the H1 is for somebody already
   * reading, the tab for somebody who has not clicked. The tab leads on the
   * search phrase and names two dishes at opposite ends of the region, which
   * is what separates this from every other tracker.
   */
  title: `Asian Calorie Tracker: Nasi Lemak to Ramen · ${SITE_NAME}`,
});

export default function Home() {
  const graph = [
    /*
     * The pan-Asian twin of `marketApp` in `lib/seo.ts`, written out because
     * that function is built around a `Country` this page does not have: the
     * area served is the region rather than a member of it.
     */
    {
      "@context": "https://schema.org",
      "@type": "MobileApplication",
      alternateName: ["Asian Calorie Tracker", "Asian Food Calorie Counter"],
      applicationCategory: "HealthApplication",
      description: DESCRIPTION,
      downloadUrl: storeUrls(),
      image: `${SITE_URL}/icon.png`,
      inLanguage: "en",
      name: `${SITE_NAME}: ${SITE_TAGLINE}`,
      offers: {
        "@type": "Offer",
        areaServed: { "@type": "Place", name: "Asia" },
        name: "Free plan",
        price: "0",
        priceCurrency: pricingFor("asia").monthly.currency,
      },
      operatingSystem: operatingSystems(),
      url: SITE_URL,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      logo: `${SITE_URL}/icon.png`,
      name: SITE_NAME,
      // Only places that exist today. A store listing joins this the day its
      // `STORE_LIVE` key flips; both stores are here now.
      sameAs: [...(storeUrls() ?? []), DISCORD_URL],
      url: SITE_URL,
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(graph) }}
      />
      <Header />
      <HomeMain />
      <Footer />
    </>
  );
}
