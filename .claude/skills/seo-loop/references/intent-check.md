# Step 1 — Intent and ownership: `CREATE / IMPROVE EXISTING / REJECT`

Runs **before any code is written**. The output is a verdict, not a page.

## Get the data

The `gsc` MCP server is connected (`mcp-server-gsc`, read-only). Its tools:

| Tool | What it answers |
| --- | --- |
| `list_sites` | which properties this credential can read |
| `search_analytics` | the Performance report: clicks, impressions, CTR, position by `query` / `page` / `country` / `device` / `date` |
| `enhanced_search_analytics` | the same with regex filters and up to 25,000 rows — use it for the full query set behind a page |
| `detect_quick_wins` | queries ranking just off the first page, where a title or an answer moves the needle |
| `index_inspect` | URL Inspection: index state, **Google-selected canonical**, last crawl |
| `list_sitemaps` / `get_sitemap` | what Google has of the sitemap, and what it did with it |
| `submit_sitemap` | write scope; the credential is `webmasters.readonly`, so expect this to fail |

`siteUrl` takes either `sc-domain:ricecal.app` (domain property) or
`https://ricecal.app/` (URL-prefix property, trailing slash required). Run
`list_sites` once and use whichever form comes back; guessing wastes a call.

Google's data lags ~2 days, so an `endDate` of today returns a short window.

**If the tools are missing** (a session started before the server was added),
say so and offer either a restart or a pasted Performance CSV export. Never
invent GSC numbers, and never let a missing tool downgrade the check into a
guess. Without data the honest verdict is "unknown — need GSC", not `CREATE`.

## The four questions

For the target query, pull the last 3 months and answer all four:

1. **Which URL already ranks for this query?** Query → Pages. Note clicks,
   impressions, CTR, average position.
2. **What queries does that URL already receive clicks from?** Page → Queries.
   This is what the page is actually understood to be about, which is often not
   what it was written to be about.
3. **Is the new keyword a genuinely different search intent?** Not a synonym, a
   different *job*. "Malaysia calorie tracker" (find an app) and "nasi lemak
   calories" (find a number) are different jobs. "Calorie tracker Malaysia" is
   the same job.
4. **Would the new page compete with something already ranking?** Check the
   proposed title and H1 against every existing title on the site. Overlapping
   head terms with an already-ranking page is cannibalisation.

## The verdict

**CREATE** — all of:

- No existing URL receives meaningful clicks for the query, *and*
- the intent is distinct from every existing page's job, *and*
- the page can state its own question in one sentence, *and*
- there is enough real, non-templated substance to answer it.

**IMPROVE EXISTING** — the default when a URL already ranks. Prefer it whenever
an existing page sits at position 5–20 for the query: moving a page that Google
already trusts beats starting a new one at zero. Improvement means the title,
description, H1, on-page answer, and internal links that point at it — in that
order of leverage.

**REJECT** — any of:

- An existing page owns the intent and is already performing.
- The "new" intent is a synonym, a plural, or a word-order variant.
- The page would only exist by templating an existing one with a term swapped.
- There is no honest answer to give — no data, no dish, no real claim.

## Report it like this

```
Query:      "halwa puri calories"
Owner:      /food/halwa-puri — 2 clicks, 330 impr, 0.6% CTR, avg pos 8.4
Overlap:    same job (find a number for one dish)
Verdict:    IMPROVE EXISTING
Action:     page 1 already, and almost nobody clicks — the title and
            description are what to change, not the page count.
```

Those are real figures from this property, and the shape of them is the lesson:
position 8 with a 0.6% CTR is a *result* problem, not a *content* problem. A new
page would have fixed nothing.

Three lines of evidence, one verdict, one action. Then proceed — or stop.
