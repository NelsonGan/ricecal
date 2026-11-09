import type { MetadataRoute } from "next";

import { COUNTRIES, countryCode } from "@/lib/countries";
import { HREFLANG_FOOD, HREFLANG_HOME } from "@/lib/seo";
import { LEGAL_LAST_UPDATED, SITE_URL } from "@/lib/site";

const LEGAL = ["/contact", "/privacy", "/terms", "/data-deletion"];

/**
 * No `lastmod` on a page we cannot date, which is nearly all of them. A build
 * timestamp would claim every dish page changed on the deploy that fixed a
 * typo in the footer, and Google ignores `lastmod` entirely once a site's is
 * inaccurate.
 *
 * The legal pages are the exception: the date printed at the top of each of
 * them is maintained by hand, so it is real. Omitting the field elsewhere is
 * allowed and is the honest answer.
 */
const LEGAL_MODIFIED = new Date(LEGAL_LAST_UPDATED);

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      alternates: { languages: HREFLANG_HOME },
      changeFrequency: "weekly",
      priority: 1,
      url: SITE_URL,
    },
    // The localised home pages, then the dish tables. Each carries its own
    // cluster's alternates — see `lib/seo.ts` for why there are two.
    ...COUNTRIES.map((country) => ({
      alternates: { languages: HREFLANG_HOME },
      changeFrequency: "weekly" as const,
      priority: 0.9,
      url: `${SITE_URL}/${countryCode(country)}`,
    })),
    ...COUNTRIES.map((country) => ({
      alternates: { languages: HREFLANG_FOOD },
      changeFrequency: "monthly" as const,
      priority: 0.8,
      url: `${SITE_URL}/${countryCode(country)}/food`,
    })),
    /*
     * No dish pages. They carry `noindex` — see `app/food/[slug]/page.tsx` —
     * and a sitemap that lists a page it asks Google not to index is two
     * contradictory instructions. The dish tables above are how a crawler
     * reaches them, and the links on them still count.
     */
    ...LEGAL.map((path) => ({
      changeFrequency: "yearly" as const,
      lastModified: LEGAL_MODIFIED,
      priority: 0.4,
      url: `${SITE_URL}${path}`,
    })),
  ];
}
