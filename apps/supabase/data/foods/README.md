# Researched dishes

One JSON file per research topic. Each is a payload for
`scripts/catalogue-import.mjs`, and each stays here after it has been imported —
this directory is the provenance record for every catalogue row that did not
come from USDA or MyFCD. When a figure is later disputed, the file that
introduced it says who wrote it down and where they got it.

The catalogue started Malaysian and is widening to Asia, so a topic is now
usually a country or a cuisine (`singapore.json`, `thailand.json`) rather than
a Malaysian food family. The overlap between neighbours is the thing to watch:
Malaysian and Indonesian cooking share most of a repertoire, as do Malaysian
and Singaporean, and a round that restates its neighbour's dishes has done
nothing. Skip what is genuinely the same; where the regional version is a
different dish — Singapore and Penang Hokkien mee, Padang and Malaysian
rendang — give it a name that distinguishes it.

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
(250 ml)". This is the decision the whole catalogue is built around: nobody
weighs a roti canai.

**A serving label is 40 characters.** `scripts/lib/food-shape.mjs` refuses a
longer one rather than truncating it — one round lost 21 rows of 65 to this
before noticing. "1 whole fish (600 g), to share" fits; the explanation of who
shares it does not. Put the qualification in `aliases` or in an `extra_servings`
entry instead. D1 has no constraints to speak of, so that shape check is the
only gate a row passes through.

**The calories have to match the macros.** The loader recomputes
`4·carbs + 4·protein + 9·fat` and refuses any row more than 25% away from its
own stated `kcal` — the same margin the scan cascade holds its own guesses to.
Most rejections are this, and most of those are a portion size that changed
between writing the calories and writing the macros.

**A `brand` is prefixed onto the name unless the name already carries it in
full.** The check is literal, so a name using a shortened form of its own brand
gets prefixed anyway — `MOS Teriyaki Chicken Burger` with
brand `MOS Burger` normalizes to `mos burger mos teriyaki chicken burger`.
Twenty rows read like that. Nothing breaks, because the app shows `name` and
the dedup is at least consistent with itself, but it is avoidable: write the
brand exactly as the name spells it, or leave `brand` off when the name already
says who made it.

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

**Aliases are ROWS, not words in a bag.** In a search bag full text reads an
alias as one token among fifty, which is why a dish's actual second name scored
as a partial hit and "kuih salat" lost to rows that merely contained "kuih". The
loader writes them to `food_alias`, and one of the search's four arms matches
them exactly, the way it matches a name. So an alias is worth writing down
carefully. The Chinese name, the Penang romanization and the abbreviation are
each a query somebody will type.

**A serving that states its weight gets a `grams` column for free.** The loader
reads "1 plate (350 g)", "100 g" and "3.0 oz" out of the label and stores the
number, which is what the scan cascade bounds a portion against. Writing the
weight into the label is therefore not decoration — it is the difference between
a portion the cascade can check and one it has to guess at. Cups and spoons are
deliberately not read: a cup of rice is 200 g and a cup of cornflakes is 30 g.

**An icon is optional and must exist.** `apps/mobile/assets/icons/dishes/` and
`.../food/` are the drawings there are; naming anything else gets the dish
imported without one, which renders as no icon rather than as a stand-in plate.
The two directories are not interchangeable and guessing which one holds a
drawing has now cost two rounds a batch of blank icons — `food/satay` exists,
`dishes/satay` does not. List the directory rather than assuming.

**Write the file as you go.** A round is long enough to be interrupted, and a
session limit killed six of them at once. Four had files on disk, all four
parsed, and 453 dishes survived because each agent had been saving valid JSON
after every block rather than holding the payload in its head until the end.
A partial file is worth importing and worth resuming; a lost one is worth
nothing.

## What the loader reports

`inserted`, `updated`, `rejected`, and two kinds of skip — `skipped_slug` for
the same handle, `skipped_name` for the same dish under a different one. Then a
list of near-matches: rows that went in next to something that already looks
like them (`char-kway-teow ≈ Char Kuey Teow`). Those are not refused, because no
similarity threshold separates a second romanization from two dishes sharing
three words.

`pnpm foods:dupes` is where that list gets decided. It prints the pairs side by
side with their calories, and marks `!!` when the two figures agree to within
8% — which is what one dish written twice by two researchers looks like, since
they reasoned from the same ingredients. `--merge <keep> <drop>` moves the
dropped row's names and aliases onto the kept row as `food_alias` rows and then
deletes it, so the name that goes away still finds the dish.

Similarity alone will not tell you. Measured on this catalogue,
`Siew Yoke Rice` / `Siew Yoke Fan` — the same dish — scores 0.53, while
`Kuey Teow Goreng Ayam` / `Kuey Teow Goreng Basah` — different dishes — scores
0.61. Read the pair.

When the right answer is "the dish is already there but nobody types that
name", use `pnpm foods:alias` rather than writing a second row. It only adds
`food_alias` rows, never touching `name` or `name_norm`, so it cannot change
what a future payload is considered a duplicate of.

## The national composition tables

Not every payload here is researched. Seven countries publish a food composition
table that can be read directly, and a table beats a round of estimates on every
axis that matters: the figures are measured, the round is one script rather than
two days, and the rows can claim `verified` honestly. Each has a `source_id` in
`SOURCES` in `catalogue-import.mjs`, which is what decides how the rows are
attributed and how they rank — a payload naming a source_id that is not
registered there silently attributes itself as `research`.

| file | source | rows | basis |
|---|---|---|---|
| `singapore-hpb.json` | Singapore Food Insights Database (HPB) | 1,430 | a household portion, with its weight |
| `vietnam-nin.json` | Vietnamese dish table (NIN) | 797 | one portion |
| `vietnam-nin-ingredients.json` | Vietnamese Food Composition Table (NIN) | 468 | 100 g |
| `indonesia-tkpi.json` | Tabel Komposisi Pangan Indonesia | 537 | 100 g |
| `taiwan-tfda.json` | Taiwan FDA food composition database | 412 | the stated unit, else 100 g |
| `india-ifct.json` | Indian Food Composition Tables 2017 | 383 | 100 g |
| `thailand-inmu.json` | Thai Food Composition Database (INMU) | 342 | 100 g |
| `japan-mext.json` | Standard Tables of Food Composition in Japan | 217 | 100 g |

The endpoints are recorded in the session memory rather than here, because they
are undocumented and change. Three things about them are worth knowing before
the next one is loaded:

**Read the whole table, then import a slice of it.** Taiwan's has 2,181 samples
and 331 of them are fish species; Japan's has eighteen groups and fifteen are
ingredients the USDA rows already answer for; India's has nineteen cultivars of
Chinese yam. Every row in `food` is a competitor for rank, and importing a
composition table whole is the USDA Branded mistake in a new accent. The slice
that earns its place is the prepared food, the confectionery, the drinks, and
whatever is genuinely local.

**Establish what a row is priced per before you label it.** Vietnam publishes
two tables through two endpoints — 1,250 dishes per PORTION and 853 ingredients
per 100 g — and they look identical until you notice 136 grams of macronutrient
in a hundred-gram serving. The mass check in `lib/food-shape.mjs` caught it, four
hundred rows in a row, which is what a wrong basis looks like from the outside.

**The names are the work.** A table in Chinese or Japanese has no slug, because
`slugify` is ASCII only, and a machine romanization ("Bai Man Tou") is worse than
the name a person would type. Both of those rounds were hand-named against the
source's own English column where it had one, which is a few hundred lines of
judgement and the reason the row is findable at all. India's table is the
opposite case and the most valuable of the seven for it: its `lang` column carries
each food's name in a dozen Indian languages, and those go in as aliases.
