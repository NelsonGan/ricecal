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
```

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

**The calories have to match the macros.** The loader recomputes
`4·carbs + 4·protein + 9·fat` and refuses any row more than 25% away from its
own stated `kcal` — the same margin the scan cascade holds its own guesses to.
Most rejections are this, and most of those are a portion size that changed
between writing the calories and writing the macros.

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
three words — see the header of `schemas/95_import_foods.sql`. They are for a
person to look at.
