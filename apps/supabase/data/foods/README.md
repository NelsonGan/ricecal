# Researched dishes

One JSON file per research topic. Each is a payload for
`scripts/import-foods.mjs`, and each stays here after it has been imported —
this directory is the provenance record for every catalogue row that did not
come from USDA or MyFCD. When a figure is later disputed, the file that
introduced it says who wrote it down and where they got it.

```bash
pnpm foods:have kuih laksa                 # what the catalogue already holds
pnpm foods:import --dry-run data/foods/kuih.json
pnpm foods:import data/foods/kuih.json
pnpm foods:dupes                           # pairs one round wrote twice
pnpm foods:alias <slug> "another name"     # widen a row rather than add one
```

A dry run goes all the way into the loader and rolls back, so it reports what
the catalogue already has as well as what is malformed. That is the check to
iterate on: fix every `rejected`, and drop or rename anything that comes back
`skipped_name` or `skipped_slug`.

Nothing here is applied automatically and re-importing is free: the loader
dedupes on the slug and on the normalized name, so a file that has already
landed reports skips and writes nothing.

## The shape

```jsonc
{
  "source": "research:kuih",          // inherited by every dish below
  "foods": [
    {
      "name": "Kuih Seri Muka",       // required, the local spelling
      "place": "hawker",              // mamak | kopitiam | hawker | home | packaged
      "serving": "1 piece",           // required — what ONE of it is
      "kcal": 178,                    // required, for that one serving
      "carbs_g": 24.6,
      "protein_g": 2.4,
      "fat_g": 8.1,
      "fibre_g": 0.9,                 // omit rather than guess
      "sugar_g": 12.3,
      "sodium_mg": 96,
      "aliases": ["seri muka", "kuih salat", "娘惹糕"],
      "icon": "food/kuih-seri-muka",  // optional; must name a real drawing
      "source": "myfcd_current",      // overrides the file's
      "verified": false,
      "extra_servings": [{ "label": "2 pieces", "factor": 2 }]
    }
  ]
}
```

## What the rules actually are

**Macros are per ONE serving, not per 100 g.** `serving` says what that one is,
in the words a person would use — "1 plate", "1 bowl", "3 pieces", "1 glass
(250 ml)". This is the decision the whole catalogue is built around
(`schemas/20_foods.sql`): nobody weighs a roti canai.

**A serving label is 40 characters.** `food_servings.label` is checked, so a
descriptive one is refused rather than truncated — one round lost 21 rows of 65
to this before noticing. "1 whole fish (600 g), to share" fits; the explanation
of who shares it does not. Put the qualification in `aliases` or in an
`extra_servings` entry instead.

**The calories have to match the macros.** The loader recomputes
`4·carbs + 4·protein + 9·fat` and refuses any row more than 25% away from its
own stated `kcal` — the same margin the scan cascade holds its own guesses to.
Most rejections are this, and most of those are a portion size that changed
between writing the calories and writing the macros.

**`source` records two things and keeps both.** The file's `source` names the
research round; a dish's own `source` names where its numbers came from. The
loader joins them — `model_estimate · research:kuih` — because either alone is
useless later: the citation with no round cannot be traced back to the payload
that produced it, and the round with no citation does not say whether anybody
checked.

**`verified` is false unless the figure was published.** It is the flag a
review queue will sort on, so a researched estimate claiming it hides itself
from the only process that would ever check it. A number off a nutrition panel
or from MyFCD is verified; a number from a model is not.

**`fibre_g`, `sugar_g` and `sodium_mg` are nullable and null means unknown.**
Leave them out. A confident zero is a claim.

**An icon is optional and must exist.** `apps/mobile/assets/icons/dishes/` and
`.../food/` are the drawings there are; naming anything else gets the dish
imported without one, which renders as no icon rather than as a stand-in plate.

## What the loader reports

`inserted`, `updated`, `rejected`, and two kinds of skip — `skipped_slug` for
the same handle, `skipped_name` for the same dish under a different one. Then a
list of near-matches: rows that went in next to something that already looks
like them (`char-kway-teow ≈ Char Kuey Teow`). Those are not refused, because
no similarity threshold separates a second romanization from two dishes sharing
three words — see the header of `schemas/95_import_foods.sql`.

`pnpm foods:dupes` is where that list gets decided. It prints the pairs side by
side with their calories, and marks `!!` when the two figures agree to within
8% — which is what one dish written twice by two researchers looks like, since
they reasoned from the same ingredients. `--merge <keep> <drop>` folds the
dropped row's names into the kept row's `search_text` and deletes it, so the
name that goes away still finds the dish. It refuses if anything has been
logged against the row being dropped.

Similarity alone will not tell you. Measured on this catalogue,
`Siew Yoke Rice` / `Siew Yoke Fan` — the same dish — scores 0.53, while
`Kuey Teow Goreng Ayam` / `Kuey Teow Goreng Basah` — different dishes — scores
0.61. Read the pair.

When the right answer is "the dish is already there but nobody types that
name", use `pnpm foods:alias` rather than writing a second row. It only widens
`search_text`, never `name` or `name_norm`, so it cannot change what a future
payload is considered a duplicate of.
