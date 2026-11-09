# Step 3 — The audit pass

Review the implementation; do not re-ask the model whether it did a good job.
Each item below is checked against the code and the rendered page, and each is
answered with what was found, not "yes".

## Intent and uniqueness

- **One primary intent per page**, stated in a sentence. Two intents means two
  pages or a narrower page.
- **No duplicate keyword targets.** Compare the target head term against every
  existing page's title and H1. On this site, run:
  `grep -rn "searchTitle\|title:" src/lib src/app | grep -i "<term>"`.
- **Distinct job from its neighbours.** `/{code}` vs `/{code}/food` is the live
  example of the rule; a third page about one market needs a third question.

## The tags

- **Title** — unique across the site, leads with the searched phrase, under
  ~60 characters *including* the layout's `· RiceCal` suffix. Pages that carry
  their own suffix pass `absoluteTitle: true`; adding it twice is a bug this
  repo has already had.
- **Description** — written to ~150 characters, opens on the thing searched for,
  not on the brand. `country.blurb` exists precisely because `intro` was being
  truncated mid-list. Unique per page.
- **H1** — one per page, matching the page's answer. It is allowed to differ
  from the title: the title is the search result, the H1 is the page.
- **Canonical** — absolute, self-referential, built via `pageMetadata()`.
- **Robots** — `CRAWLABLE` unless the page must not be indexed, in which case it
  overrides the spread wholesale (see `not-found.tsx`).
- **hreflang** — a page belongs to exactly one cluster (`home` or `food`), lists
  every member including itself, and never bridges the two clusters. Legal pages
  pass no cluster at all.
- **Open Graph locale** — `language_TERRITORY`, via `ogLocale()`. A bare `en` is
  silently rejected by Facebook's parser.

## Indexability and discovery

- Route is reachable from at least one other page — no orphans. The header,
  footer, and in-copy links all count; a sitemap entry does not.
- Route appears in `src/app/sitemap.ts` *if it should*: a page nobody should
  spend crawl budget on stays out (see the comment on why only baked dish pages
  are listed).
- `robots.ts` does not disallow it, and nothing in the sitemap is disallowed.
- No `lastmod` unless there is a real date behind it.

## Content

- **Not thin, not near-duplicate.** If the page reads as another page with terms
  swapped, it is a doorway page and it is a `REJECT`, however good the tags.
- **Claims match the product.** `STORE_LIVE` says which listings exist; both
  are `true` today. No copy, badge, or JSON-LD may promise a listing whose flag
  is off. `storeUrls()` returns only the live ones, and `undefined` rather
  than `[]` when none are — an empty array is a claim
  that there is nowhere to download it. `operatingSystems()` is the same answer
  for `operatingSystem`: never hand-write `"iOS, Android"` beside a
  `downloadUrl` that has one store in it.
- **Numbers come from the catalogue**, not from prose. `scripts/catalogue.mjs`
  is why a wrong calorie count fails the build instead of shipping quietly.

## Performance

- No new render-blocking work, no new client component where a server one did.
- Open the candidate in a real browser with the network panel open. A healthy
  page settles; anything still pending or failing after a few seconds is a
  regression. Compare production against the candidate; the number that
  matters is the difference.
