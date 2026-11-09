---
name: work-on-website
description: Work on ricecal.app, the RiceCal website in apps/web of this repo (Next.js App Router code built by vinext and served by one Cloudflare Worker). Use for any change to the landing page, country pages, dish pages, legal pages (privacy, terms, data deletion), /download, /r/ share links, site copy, styling, analytics, sitemap or SEO, the catalogue tables baked into the site, or the website's build and deploy.
---

# The website (`apps/web`)

ricecal.app lives in this repo at `apps/web`, package `@ricecal/web`. It was its
own repository (`NelsonGan/ricecal-web`) until November 2026; that repo and any
`~/Projects/ricecal-web` checkout are retired. Do not edit them. Everything below
runs from the repo root of your worktree.

The reference is the root README's **The website** section, and AGENTS.md's
**The website** section lists the invariants. Read the README subsection for the
area you are touching before you change it.

## This is Next.js code that does not run on Next.js

vinext (Cloudflare's reimplementation of the App Router on Vite) builds and
serves it. The `next` package is not installed and must not be: every `next/*`
import is a vinext shim. Before relying on a Next.js feature, check
`apps/web/node_modules/vinext/README.md` (*API coverage*, *Known gaps*) and
`.claude/skills/migrate-to-vinext/references/compatibility.md`. The migration is
done; `migrate-to-vinext` is reference material here, not a task. Webpack and
Turbopack settings do nothing. The Worker's whole config is
`apps/web/cloudflare.config.ts`; there is no `wrangler.jsonc`.

## Commands

```sh
pnpm install                                # once, at the root; pnpm only, never npm
pnpm web:dev                                # http://localhost:3000, served by workerd
pnpm --filter @ricecal/web lint             # ESLint (Biome skips apps/web)
pnpm --filter @ricecal/web typecheck        # route types, binding types, tsc
pnpm web:build                              # full prerender, ~3,100 dish pages, ~500 MB in dist/
node apps/web/scripts/links.mjs             # every internal link and #anchor, against web:dev
pnpm check                                  # the whole repo, website included
```

`pnpm web:build` writes about 500 MB to `apps/web/dist` and
`apps/web/.cloudflare/output`. Delete both afterwards on a full disk. A
markdown-only or comment-only change needs no build.

## Seeing a change

There is no browser automation in the repo. Look at every visible change, in
both colour schemes and at a phone width. With the T3 preview tools, open
`http://localhost:3000`. Without them, headless Chrome takes the same pictures
(`preferredColorScheme=0` is dark, `1` is light):

```sh
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$C" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$TMPDIR/chrome-web" \
  --window-size=390,844 --blink-settings=preferredColorScheme=1 \
  --virtual-time-budget=10000 --screenshot="$TMPDIR/web-phone-light.png" http://localhost:3000/my
```

Use `--window-size=1280,900` for desktop. Stop `pnpm web:dev` when you are done
(`kill $(lsof -tnP -iTCP:3000 -sTCP:LISTEN)`); another worktree may want port
3000. Save PR screenshots in `.github/pr-assets/<topic>/` (ignored by git) and
attach them with `gh pr create/edit --attach`; never commit them (see `create-pr`).

## Where the site touches the rest of the repo

- **The catalogue Worker** (`apps/cloudflare/workers/catalogue`) answers the
  hero search and the on-demand dish pages, and it deploys separately
  (`cloudflare.yml`). A change to its response shape must keep answering what
  the deployed site asks for: deploy the Worker change first, then the site.
- **The baked dish tables** (`src/lib/catalogue.ts`, `src/lib/catalogue-static.ts`)
  are generated. Never hand-edit them. After a catalogue change, run
  `node scripts/catalogue.mjs` from `apps/web` (it reads D1 through wrangler, so
  it needs a Cloudflare login). It stops on any icon the catalogue names that
  `public/icons` lacks. Copy those from the app:
  `cp ../mobile/assets/icons/{dishes,food}/<name>.png public/icons/<set>/`.
- **The app links to the site.** `apps/mobile/src/lib/legal.ts` opens
  `/privacy` and `/terms`, and `apps/mobile/src/features/recipes/share.ts`
  builds `/r/{slug}` share links. Those, and `/data-deletion` (the address Google
  Play holds), are filed with the stores and opened by every store copy of the
  app forever, so never move or rename them.
- **The legal pages describe the app's real data flow.** When the app starts
  collecting, sending or storing something new, the privacy policy changes in
  the same PR. Bump `LEGAL_LAST_UPDATED` whenever a legal page changes.
- **Analytics** share the app's PostHog project and GA4 property. A tracking
  change follows `maintain-analytics-tracking`: update the README's *Website
  product analytics* tables in the same change. The inventory test checks the
  event names and source files.
- **SEO work** follows `seo-loop`. Dish pages stay `noindex, follow` and out of
  the sitemap.
- **Prices** in `src/lib/pricing.ts` are a snapshot of App Store Connect's
  territory prices. Re-read them there; the app itself never hard-codes one.

## Deploying

The **Web** workflow (`.github/workflows/web.yml`) ships the site. It runs when
`apps/web/**`, the lockfile or the workflow changes:

- **On a PR** (`Web · Check, build and upload`): lint, typecheck, build, then
  `pnpm run upload`, which uploads the build as a version of `ricecal-web` that
  gets no traffic. A red run here is a site that would not deploy.
- **On `main`** (`Web · Check, build and deploy`): the same, then
  `pnpm run deploy:prebuilt`. Merging is the deploy. Follow it with
  `gh run list --workflow web.yml --limit 3`.

It authenticates with the `CLOUDFLARE_WEB_API_TOKEN` secret (the account token
`ricecal-web-github-actions`, which can only deploy this Worker and its two
domains) and `CLOUDFLARE_ACCOUNT_ID`. `deploy.yml` ignores `apps/web/**`, so a
website-only PR neither runs the app's tests nor ships an app build; a PR that
changes the app and the site together ships both.

- `cf` and `@cloudflare/vite-plugin` are betas pinned exactly. Upgrade them on
  purpose, then rebuild and run the link check.
- A Worker version holds at most 100,000 asset files and every prerendered page
  takes two. Do not raise `STATIC_LIMIT` without that sum.
- From a laptop, when Actions is down: `pnpm --filter @ricecal/web run deploy`.
  It deploys to production, so do it only when asked.

## Copy

The app's voice: warm, plain, never scolding. No em or en dashes in anything a
reader sees. Food names stay in their own language (nasi lemak, char kuey teow).
Every claim on the site must be true of the app as it ships today.
