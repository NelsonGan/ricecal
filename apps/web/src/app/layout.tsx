import type { Metadata } from "next";

import { Analytics } from "@/components/analytics";
import { SITE_METADATA_BASE, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: SITE_NAME,
  appleWebApp: { capable: true, title: SITE_NAME },
  formatDetection: { telephone: false },
  icons: {
    apple: "/apple-icon.png",
    icon: [
      { url: "/favicon.ico?v=20260823", sizes: "48x48" },
      { url: "/favicon.png?v=20260823", sizes: "96x96", type: "image/png" },
    ],
  },
  keywords: [
    "calorie tracker",
    "asian food calorie counter",
    "asian food calories",
    "street food calories",
    "food photo calorie tracker",
    "barcode calorie scanner",
    "macro tracker",
    "hawker food nutrition",
    "halal food calorie app",
    "calorie counter asia",
  ],
  metadataBase: SITE_METADATA_BASE,
  title: {
    default: `${SITE_NAME}: ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <head>
        <link
          rel="preload"
          href="/fonts/baloo-2-latin-d7d9c82e455b419c.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/nunito-latin-07454f8ad8aaac57.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        {/* Renders nothing; mounted here so a route change is one page view. */}
        <Analytics />
      </body>
    </html>
  );
}
