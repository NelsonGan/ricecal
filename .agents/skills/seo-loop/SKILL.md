---
name: seo-loop
description: Run the SEO engineering loop for ricecal.app (the website in apps/web of this repo) — decide whether a keyword deserves a new page (CREATE/IMPROVE/REJECT) using Search Console data, audit the implementation, pass the pre-deploy gate, verify the production HTML, then measure in GSC and decide KEEP/ITERATE/REVERT. Use whenever asked to add, change, or investigate an SEO page, target a keyword, write titles/meta/canonicals/hreflang/sitemap entries, diagnose a traffic or ranking drop, or check whether a page is indexed correctly.
---

# The SEO loop

Not an AI writer. An SEO engineer with rules, tools, and real feedback data.

```
GSC → intent & ownership check → audit → pre-deploy gate → deploy
    → production verification → GSC measurement → keep/iterate/revert
```

GSC is the source of truth. Everything else in this loop exists to keep code
honest between two GSC readings.

The site is `apps/web`. Source paths below (`src/lib/seo.ts` and so on) are
relative to it; run the commands from the repo root.

## The two rules that override enthusiasm

1. **No page is created before the ownership check.** The cheapest way to lose
   traffic is to publish a second page for an intent an existing URL already
   ranks for. Every new page starts at step 1, never at the editor.
2. **No page ships on what the source says it does.** The gate is what the
   server actually returned. Source can be right and the response wrong.

## Step 1 — Decide, with data, before writing code

Read `references/intent-check.md`. Output must be one of `CREATE`,
`IMPROVE EXISTING`, or `REJECT`, with the query, the URL that already ranks (if
any), and the numbers behind it. State the verdict to the user before writing
anything.

The `gsc` MCP server (`mcp-server-gsc`, read-only) supplies the data:
`list_sites`, `search_analytics`, `enhanced_search_analytics`,
`detect_quick_wins`, `index_inspect`, `list_sitemaps`, `get_sitemap`. Never
silently skip the check, and never invent GSC numbers.

## Step 2 — Build it the way this site builds pages

This repo already encodes most of the gate in code. Use it rather than
hand-rolling metadata:

| Concern | Where it lives |
| --- | --- |
| title, description, canonical, robots, OG/Twitter, hreflang cluster | `pageMetadata()` in `src/lib/seo.ts` |
| hreflang sets (`HREFLANG_HOME`, `HREFLANG_FOOD`) | `src/lib/seo.ts` |
| structured data for a market | `marketApp()` + `jsonLd()` in `src/lib/seo.ts` |
| which URLs are announced, and `lastmod` policy | `src/app/sitemap.ts` |
| what crawlers may fetch | `src/app/robots.ts` |
| per-market copy, keywords, FAQ, blurb | `src/lib/countries.ts` |
| site-wide constants and store-link switches | `src/lib/site.ts` |

Read the long comments in those files before changing them — each one records a
mistake already made once (a build-timestamp `lastmod`, a bleeding hreflang
cluster, a placeholder store URL published as JSON-LD). Do not reintroduce them.

Two standing editorial constraints:

- **A per-market page is not a template with the country swapped in.** Google
  treats that as doorway pages. Dishes, eating contexts, local-language terms,
  and FAQs differ per country — see the header comment in `countries.ts`.
- **Two pages about one market must answer different questions.** `/{code}` is
  "what is this app"; `/{code}/food` is "what does this dish cost me". If a
  proposed page cannot state its distinct question in one sentence, it is a
  `REJECT`.

## Step 3 — Audit before the gate

Read `references/audit.md`. It is the review pass: intent, cannibalisation,
title/H1/description alignment, canonical, indexability, internal linking, thin
or near-duplicate content, sitemap membership, unsupported claims, performance.

Claims matter here as much as tags: the site says what the app does, and
`STORE_LIVE` in `src/lib/site.ts` says where you can get it; both stores are
live today. Never hand-write store URLs or `operatingSystem`: `storeUrls()`
and `operatingSystems()` follow the flags, so hand-writing either in a page
undoes them.

## Step 4 — The pre-deploy gate

Read `references/pre-deploy-gate.md` and run it. Mechanically:

```bash
pnpm web:dev                                                       # in one shell
node .claude/skills/seo-loop/scripts/seo-check.mjs http://localhost:3000 /new-route
node apps/web/scripts/links.mjs http://localhost:3000                       # every href resolves
```

`seo-check.mjs` reads raw HTML over the wire — no JS execution, because what a
crawler is handed on the first response is the thing being audited. Exit code 1
means the gate is closed. **A failed gate is not deployed.** Report the failure
to the user; do not deploy "with a note".

## Step 5 — Deploy, then verify production

Deploy by merging the pull request: the **Web** workflow deploys `main`. Wait
for that run to finish (`gh run list --workflow web.yml --limit 3`), then check
the live page:

```bash
node .claude/skills/seo-loop/scripts/seo-check.mjs https://ricecal.app /new-route
```

Read `references/post-deploy-verify.md`. Verify the deployed HTML, the sitemap
actually served, and `robots.txt` — not the local build that produced them.
Cloudflare caching, a stale worker, or a route that fell back to dynamic
rendering all show up here and nowhere else.

## Step 6 — Measure, then decide

Wait for meaningful GSC data (a fortnight at this traffic; longer for a page
with few impressions). Then read `references/gsc-triage.md` and return
`KEEP`, `ITERATE`, or `REVERT` with the evidence.

On a drop, investigate in this order — **site → page → query → indexing/canonical
→ recent code changes** — before writing a single new word. Most drops are a
canonical, an index state, or a deploy, and none of those are fixed by more
content.
