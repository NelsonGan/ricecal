import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { staticAssetsAdapter } from "@vinext/cloudflare/cache/static-assets-adapter";
import vinext from "vinext";
import { defineConfig } from "vite";

/**
 * vinext reimplements the Next.js API on Vite, so `src/app` and
 * `next.config.ts` are read as they are. The Cloudflare plugin runs the server
 * in workerd during `vite dev` as well as in production, so a local run and a
 * deployed one fail in the same places. README: *How a request is served*.
 */
export default defineConfig({
  /*
   * `npm start` answers to the production hostnames too, so the host rules in
   * `next.config.ts` (the www redirect, noindex everywhere but the apex) can be
   * checked locally: `curl -H "Host: www.ricecal.app" localhost:3000`.
   */
  preview: { allowedHosts: ["ricecal.app", "www.ricecal.app"] },
  plugins: [
    vinext({
      /*
       * Every page that can be rendered at build time is: the home page, the
       * fifteen country pages and dish tables, the legal pages and the 3,000
       * baked dishes from `generateStaticParams`. Metadata routes (the sitemap,
       * robots.txt, the manifest and the OG image) are not prerendered by
       * vinext and render per request.
       */
      prerender: { routes: "*" },
      cache: {
        /*
         * Those prerendered pages ship inside the deploy as Static Assets and
         * are served read-only. A new build replaces them all at once, so no
         * page can name the previous build's chunks, and there is no cache
         * left behind to prune. Pages that were not prerendered (the other
         * ~49,000 dishes) render per request and are never stored.
         */
        cdn: staticAssetsAdapter(),
        /*
         * The data cache, in KV (`VINEXT_KV_CACHE` in `cloudflare.config.ts`):
         * the catalogue response behind each on-demand dish, for the day
         * `src/lib/food.ts` asks.
         */
        data: kvDataAdapter(),
      },
    }),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    }),
  ],
});
