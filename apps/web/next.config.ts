import type { NextConfig } from "next";

/**
 * Country pages moved from their full name — `/malaysia` — to their ISO
 * 3166-1 alpha-2 code, `/my`.
 *
 * Written out rather than derived from `src/lib/countries.ts`, because this is
 * a record of URLs that once existed and not a view of the ones that do: a new
 * country needs no entry, and one dropped from `COUNTRIES` still needs its old
 * path to resolve.
 */
const RENAMED_COUNTRY_PATHS: Record<string, string> = {
  china: "cn",
  "hong-kong": "hk",
  india: "in",
  indonesia: "id",
  japan: "jp",
  malaysia: "my",
  myanmar: "mm",
  pakistan: "pk",
  philippines: "ph",
  singapore: "sg",
  "south-korea": "kr",
  "sri-lanka": "lk",
  taiwan: "tw",
  thailand: "th",
  vietnam: "vn",
};

const nextConfig: NextConfig = {
  /**
   * Every picture is a PNG in `public/`, exported at the size it is drawn at,
   * so an optimizer would buy nothing and cost a per-transformation bill on
   * Cloudflare.
   *
   * That makes the export size load-bearing. `icon.png` is 1024px for the
   * manifest and the JSON-LD, and an optimizer had been hiding the fact that
   * the header drew the same file at 25px — a quarter of a megabyte per
   * request. Hence the sized copies: `icon-128.png` and `mascot-192.png` for
   * where they are drawn, the originals for the machines that want the big
   * one. Adding a picture means exporting it at its display size.
   */
  images: { unoptimized: true },

  /**
   * Only the real site is allowed into an index.
   *
   * Nothing but `ricecal.app` serves these pages today, since `workers_dev` is
   * off — but that is one line of config away from changing, and turning it
   * back on would put the whole site at `ricecal-web.*.workers.dev` under a
   * name no canonical mentions. `missing` rather than a list of hosts to
   * exclude, so a host nobody has thought of yet is covered too.
   */
  async headers() {
    return [
      {
        // A share token is a bearer credential. Set this on the response,
        // before the browser discovers any assets in the document, so the
        // token cannot become a Referer header.
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
        source: "/r/:slug",
      },
      {
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
        missing: [{ type: "host" as const, value: "ricecal.app" }],
        source: "/:path*",
      },
    ];
  },

  async redirects() {
    return [
      /*
       * One host, and it is the bare one. Every canonical, the sitemap and all
       * fifteen sets of hreflang alternates name `ricecal.app`; both hosts are
       * attached to the Worker, so without this Google would have two copies
       * of every page. The `has` match keeps it from looping, since the apex
       * is not `www`.
       *
       * The root needs its own rule: `/:path*` matches `/` with an empty
       * `path`, and an empty segment is not substituted into an absolute
       * destination — so it redirected to the literal `.../:path+`.
       */
      {
        destination: "https://ricecal.app/",
        has: [{ type: "host" as const, value: "www.ricecal.app" }],
        permanent: true,
        source: "/",
      },
      {
        destination: "https://ricecal.app/:path+",
        has: [{ type: "host" as const, value: "www.ricecal.app" }],
        permanent: true,
        source: "/:path+",
      },
      /*
       * Unbaked dishes used to render at an internal `/food-render/{slug}`
       * route, which redirected here when requested directly. The route is
       * gone, but its URLs may still be out there.
       */
      {
        destination: "/food/:slug",
        permanent: true,
        source: "/food-render/:slug",
      },
      ...Object.entries(RENAMED_COUNTRY_PATHS).map(([from, code]) => ({
        destination: `/${code}`,
        permanent: true,
        source: `/${from}`,
      })),
    ];
  },
};

export default nextConfig;

