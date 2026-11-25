---
name: catalogue-data
description: Change what is in the RiceCal food catalogue in Cloudflare D1: importing, aliasing, reindexing and deduplicating dishes with the pnpm foods:* scripts, the sibling ricecal-food-database repo that authors the data, Open Food Facts' moved nutrition panel, and the national food composition tables reachable without an account (Singapore, Vietnam, Thailand, Taiwan, Indonesia, India). Use before any catalogue data or search change.
---

# The catalogue in D1

Moved out of `AGENTS.md` so it loads for catalogue work. The README's *The food catalogue* is the design; this is the tooling and the sources.

## The catalogue in D1

The catalogue is Cloudflare D1, reached only through `wrangler`. The Worker is
`apps/cloudflare/workers/catalogue` and the shape is
`apps/cloudflare/d1/food-catalogue/schema.sql`, which CI applies on every merge
to main (schema before Worker) and whose every statement is safe to re-run.
`apps/supabase/scripts/lib/d1.mjs` is the transport, because
`wrangler d1 execute --json` prints a banner before its JSON.

    pnpm foods:have <term>          what is already in there, before researching more
    pnpm foods:import --dry-run     shape, arithmetic and dedup, writing nothing
    pnpm foods:gate --save before   … then --against before
    pnpm foods:dupes --since …      near-duplicates
    pnpm foods:reindex [--all]      normalized columns and the two FTS5 indexes
    pnpm foods:servings             a default portion that is a unit of measure

- **The dish payloads under `apps/supabase/data/foods/` are gitignored**, aliases
  and all. A catalogue data change is made by running `foods:import` /
  `foods:alias` against production and does not appear in a PR. Say so in the PR
  body or the change is invisible to review.
- The normalizer lives in the Worker's `src/text.ts` and the Node scripts import
  that `.ts` directly. Do not copy it: a query folded one way and a column folded
  another is a row nobody can find.
- `foods:import` skips a dish whose name is already taken, so a good row cannot
  be added under a name a bad one holds. That is what `foods:alias` is for.
- SQLite reserves `indexed`; it cannot be a column alias. Contentless FTS5 cannot
  delete a row without the values it was indexed with, so `foods:import` only
  appends and `--all` rebuilds. D1 takes at most 100 bound parameters per
  statement.

**Where the data is authored.** Not in this repo: the sibling
`ricecal-food-database` (Python, DuckDB, `uv`) normalizes each source into
`data/staging/*.parquet`, unions them, and exports the app's shape with
`scripts/export_for_ricecal.py`. Its raw artefacts are gitignored and large —
the Open Food Facts dump alone is 7.2 GB and ~20 minutes to re-download — so
deleting `data/` to save disk costs that before the next catalogue change. The
exporter reads the app's icon directories out of `../ricecal/apps/mobile/assets/icons`,
so the two repos must sit side by side.

**Open Food Facts moved the nutrition panel.** It is no longer
`nutriments.<key>_100g` but `nutrition.aggregated_set.nutrients.<key>.value`
with the basis in `.per`, keys `energy-kcal`, `carbohydrates`, `proteins`,
`fat`. A reader written against the old key does not error: it found four usable
products in 85,000 and looked like a quiet day. The new shape found 54,818 in
the same files. Read the new one first and fall back.

**The national tables that are reachable without an account**, each through the
endpoint its own web tool calls, none of them documented:

- **Singapore, HPB** — `https://pphtpc.hpb.gov.sg/bff/v1/food-portal`;
  `/foods?searchText=<letter>&pageNumber=N` enumerates, `/foods/compare?crIds=…`
  returns detail ten at a time. The best shaped of the six: a household portion
  with its weight, nutrients already priced for it, and the provenance of each.
- **Vietnam, NIN** — `https://viendinhduong.vn` (not `www.`, which 301s and
  breaks the JSON). Two tables and the difference matters:
  `/api/fe/tool/getPageFoodData` is 1,250 dishes priced per portion,
  `/api/fe/foodNatunal/getPageFoodData` is 853 ingredients per 100 g.
- **Thailand, INMU Mahidol** — `https://inmu.mahidol.ac.th/thaifcd`;
  `/appassistant/get_json_food_name?term=<letter>` enumerates, the detail page is
  HTML that reads out as `label|unit|value` once tags are stripped.
- **Taiwan, TFDA** — one 62 MB CSV at `data.fda.gov.tw`, long format, no auth.
- **Indonesia, TKPI** — `https://www.panganku.org/id-ID/view`, POST, and the form
  field is literally named `haha`.
- **India, IFCT 2017** — the `nodef/ifct2017` CSV on GitHub. Energy is in kJ, and
  its `lang` column holds each food's name in a dozen Indian languages, which is
  the real prize.

Korea and the Philippines are blocked on account creation rather than on
technique — ask before signing up in the owner's name. Pakistan's table is a
scanned pdf with no text layer, Sri Lanka's is a Blazor server app that fills
over a SignalR circuit, and Hong Kong's is sourced entirely from tables the
catalogue already holds. None needs checking again.
