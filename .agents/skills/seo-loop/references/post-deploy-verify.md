# Step 5 — Verify production, not the source

The source implementation can be correct and the production HTML wrong. That
gap is the reason this step exists — it has caught real bugs on this site.

Ways it happens: a stale Cloudflare cache; a worker that deployed but did not
roll; a **Web** workflow deploy that failed, leaving the previous version's
prerendered pages live; a route that fell back to dynamic rendering and now
emits a different head; a build that
succeeded locally against data the deploy did not have.

## Run it against the real origin

```bash
node .claude/skills/seo-loop/scripts/seo-check.mjs https://ricecal.app /route
node .claude/skills/seo-loop/scripts/seo-check.mjs https://ricecal.app --sitemap=40
```

Then confirm by hand the three things a checker reads but a human should see:

```bash
curl -sI https://ricecal.app/route | head -5                       # status, cache
curl -s https://ricecal.app/route | grep -iE "<title|canonical|og:|hreflang|<h1"
curl -s https://ricecal.app/robots.txt
curl -s https://ricecal.app/sitemap.xml | grep -c "<loc>"          # count sanity
curl -s https://ricecal.app/sitemap.xml | grep "/route"            # this URL, live
```

## What must be true in the response

- `200`, no redirect chain, and not a soft 404 (a 200 that renders the not-found
  page is worse than a 404 — Google indexes it).
- Rendered title, description, canonical, robots, H1 identical to intent.
- The tags are in the **first response**, not added after hydration.
- `sitemap.xml` served by production contains the URL (or correctly omits it),
  and its `<loc>` count has not collapsed.
- `robots.txt` served by production still disallows only what it should.

## Crawlability, from Google's side

Run `index_inspect` (the `gsc` MCP server) on the deployed URL and record:
indexing state, Google-selected canonical vs declared canonical, last crawl,
mobile usability, and any rich-result verdict. A Google-selected canonical that
differs from the declared one is the single highest-value finding here — it
means Google disagrees with the page about what it is, and no amount of new
content fixes it.

Only then request indexing. Requesting indexing on a page that fails the above
just gets the failure indexed faster.
