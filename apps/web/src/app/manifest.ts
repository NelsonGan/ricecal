import type { MetadataRoute } from "next";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#F6F8F7",
    description:
      "A calorie tracker built for Asian food. Snap a plate, describe it, or scan a barcode.",
    display: "standalone",
    icons: [
      { sizes: "512x512", src: "/icon.png", type: "image/png" },
      { sizes: "any", src: "/favicon.png?v=20260823", type: "image/png" },
    ],
    name: `${SITE_NAME}: ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    start_url: "/",
    theme_color: "#2FBF71",
  };
}
