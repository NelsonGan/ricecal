import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      /*
       * `/download` sits in the header of every page, so it is the most
       * crawled URL on the site — and there is nothing at the end of it to
       * index. It is also the one route that cannot be cached, so each of
       * those crawls is a cold Worker invocation.
       *
       * Disallow rather than `nofollow` on the links: `nofollow` does not stop
       * Google fetching the URL, and fetching it is the part that costs.
       * `/xhs` is the same kind of redirect, for XiaoHongShu posts.
       */
      disallow: ["/download", "/xhs"],
      userAgent: "*",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
