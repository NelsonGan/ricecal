import { bindings, defineConfig, defineWorker, exports } from "cf/config";

/**
 * The one Worker that serves ricecal.app. vinext builds it with Vite, and
 * `cf` deploys it from this file, so this is where every binding, domain and
 * runtime flag lives. There is no `wrangler.jsonc`. README: *The Worker*.
 */
export default defineConfig({
  worker: defineWorker({
    name: "ricecal-web",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-27",

    /*
     * `nodejs_compat` gives the server the Node built-ins it expects, and
     * `process.env` (where `WEB_CATALOGUE_TOKEN` is read).
     *
     * `global_fetch_strictly_public` makes `fetch()` to `catalogue.ricecal.app`
     * leave for the public internet and reach that Worker as a real request,
     * rather than short-circuiting inside the zone. Without it the catalogue
     * Worker never sees the header that exempts us from its rate limit.
     */
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],

    /*
     * Every request reaches the Worker first except hashed build output, the
     * fonts and the dish pictures, which are served straight from Static
     * Assets with `public/_headers` applied. Worker-first covers
     * `/_vinext/static-cache/*`, where the prerendered pages are stored, so
     * nobody can fetch a raw cache file directly. It also means
     * `next.config.ts` headers and redirects apply to every page.
     */
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: [
        "/*",
        "!/_next/static/*",
        "!/*/_next/static/*",
        "!/fonts/*",
        "!/dishes/*",
      ],
    },

    /*
     * The apex is the site. `www` is attached only so the Worker can see the
     * request and redirect it: every canonical, the sitemap and all the
     * hreflang alternates name the apex. See the host redirect in
     * `next.config.ts`.
     */
    domains: ["ricecal.app", "www.ricecal.app"],

    /*
     * No `*.workers.dev` copy of the site and no preview URLs. Either would
     * publish a second, complete copy of the site under a name no canonical
     * mentions. The `headers()` rule in `next.config.ts` still sends
     * `X-Robots-Tag: noindex` to any host but the apex, in case either is
     * turned on later.
     */
    workersDev: false,
    previewUrls: false,

    observability: { enabled: true },

    env: {
      /* Build output, and the prerendered pages vinext reads back from it. */
      ASSETS: bindings.assets(),

      /*
       * The data cache: the catalogue response for each dish that was not
       * prerendered, kept for a day (`FOOD_REVALIDATE` in `src/lib/food.ts`).
       * KV's eventual consistency is fine here, because the catalogue
       * changes only when an import runs.
       */
      VINEXT_KV_CACHE: bindings.kv({ id: "45328c0270bd48ee9ee81287acb84d3f" }),

      /*
       * Not declared here: `WEB_CATALOGUE_TOKEN`, the Worker secret that exempts
       * dish renders from the catalogue's per-IP rate limit. A declared secret
       * is required, and `cf` refuses to upload a version until it has a value.
       * The site works without it (`src/lib/food.ts` reads it from
       * `process.env` and sends no header when it is unset), so it stays an
       * optional secret set on the Worker directly. See `.env.example`.
       */
    },

    exports: {
      /*
       * Records that this Worker once exported `DOQueueHandler`; its deletion
       * is applied. Keep the entry: Cloudflare keeps the Worker's migration
       * history, and removing it would not undo the deletion.
       */
      DOQueueHandler: exports.durableObject({ state: "deleted" }),
    },
  }),
});
