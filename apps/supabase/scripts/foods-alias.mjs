/**
 * Adds names to a dish that is already in the catalogue.
 *
 *   pnpm foods:alias nasi-ayam-bebola "chicken rice ball" "Melaka chicken rice"
 *   pnpm foods:alias --file apps/supabase/data/foods/aliases/penang.json
 *
 * Three research rounds in a row ended with the same request: a dish is already
 * there under a name nobody types. `Nasi Ayam Bebola` is the Melaka chicken
 * rice ball; `(Papadam)` is a papadom; half the MyFCD catalogue buries the Malay
 * term inside parentheses after an English one — `Rice, "Dagang" (Nasi Dagang)`.
 * Search will not find any of those from what a person actually writes, and
 * re-importing the dish under its other name is refused as a duplicate — which
 * is correct, and leaves the name unfindable.
 *
 * An alias is a ROW rather than a word in a bag, and that is what makes it worth
 * adding: the search fuses five arms and one of them matches aliases exactly,
 * the way it matches a name. A second romanization added here ranks like a name,
 * not like one word among fifty.
 *
 * The file form takes `{ "<slug>": ["alias", …], … }`.
 */

import { readFileSync } from 'node:fs'

import { normalize } from '../../catalogue-worker/src/text.ts'
import { d1, d1batch, q } from './lib/d1.mjs'

const args = process.argv.slice(2)
const fileAt = args.indexOf('--file')

/** `{ slug: [alias, …] }`, however it was asked for. */
const wanted =
  fileAt !== -1
    ? JSON.parse(readFileSync(args[fileAt + 1], 'utf8'))
    : args.length >= 2
      ? { [args[0]]: args.slice(1) }
      : null

if (!wanted) {
  process.stderr.write('usage: foods-alias.mjs <slug> <alias> ... | --file <aliases.json>\n')
  process.exit(2)
}

const slugs = Object.keys(wanted)
const rows = await d1(
  `select id, slug, name, name_norm from food where slug in (${slugs.map(q).join(',')})`,
)
const bySlug = new Map(rows.map((r) => [r.slug, r]))

const missing = slugs.filter((s) => !bySlug.has(s))
for (const slug of missing) console.log(`✗ ${slug} — no such dish`)

const statements = []
let added = 0
let skipped = 0

for (const [slug, aliases] of Object.entries(wanted)) {
  const food = bySlug.get(slug)
  if (!food) continue

  const already = new Set(
    (await d1(`select alias_norm from food_alias where food_id = ${q(food.id)}`)).map(
      (a) => a.alias_norm,
    ),
  )

  for (const raw of aliases) {
    const alias = String(raw).trim()
    const norm = normalize(alias)
    // An alias that folds to the dish's own name adds a row and no reach, and
    // one that folds to nothing at all — punctuation, a stray bracket — would
    // be matched by the empty query.
    if (!norm || norm === food.name_norm || already.has(norm)) {
      skipped++
      continue
    }
    already.add(norm)
    statements.push(
      `insert or replace into food_alias (food_id, alias, alias_norm)
       values (${q(food.id)}, ${q(alias)}, ${q(norm)})`,
    )
    added++
    console.log(`+ ${food.name}  ←  ${alias}`)
  }
}

if (statements.length) await d1batch(statements)

console.log(`\n${added} added, ${skipped} already there or not usable`)
if (added) {
  console.log('Run `pnpm foods:reindex --all` so the full-text index picks them up.')
}
