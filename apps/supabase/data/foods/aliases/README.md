# Alias top-ups

Names added to dishes the catalogue already has.

```bash
pnpm foods:alias --file apps/supabase/data/foods/aliases/festive.json
```

Each file is `{ "<slug>": ["alias", ...] }` and is idempotent — re-running
reports "every word was already there" rather than doubling the bag.

These live in the repo for the same reason the payloads next door do: applying
one is a write to a hosted database and nothing else records it, so a catalogue
rebuilt from `../*.json` alone would come back missing every alias anybody had
ever added. The rows would still be there; they would just have quietly stopped
being findable by the name that prompted the fix.

## When this is the right tool

When the dish is already in the catalogue under a name nobody types. Research
rounds hit this constantly — `Nasi Ayam Bebola` is the Melaka chicken rice ball,
`(Kuih Bakul)` is nian gao — and the loader cannot help, because it refuses a
payload whose normalized name already exists. That refusal is correct. The fix
is another word on the row that exists, not a second row.

It only widens `search_text`. `name` and `name_norm` are left alone
deliberately: `name_norm` is what dedup compares and what the trigram index
rides, so rewriting it here would change which future payloads count as
duplicates of the row.

## What it will not fix

Ranking. `search_foods` fuses three retrieval arms, and a near-miss on the NAME
can still outrank an alias match — searching "biskut suji" returns eight rows
literally named "Biskut ..." before it reaches `Sugee Cookies`, whose alias bag
holds both words. That is the fusion working as designed (see the header of
`schemas/91_food_search.sql`, which gives the exact arm triple weight for
exactly this reason), not a missing alias. Adding more words does not move it.
