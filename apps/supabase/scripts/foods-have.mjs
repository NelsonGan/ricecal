/**
 * What the catalogue already holds, for a researcher about to add to it.
 *
 *   pnpm foods:have kuih
 *   pnpm foods:have "nasi goreng" laksa mee
 *   pnpm foods:have --place kopitiam --all
 *   pnpm foods:have --packaged milkis bento
 *
 * The importer will refuse a duplicate whatever anyone does, so this is not
 * a correctness tool — it is a cost one. A research agent handed "Malaysian
 * kuih" with no idea that 140 kuih are already in there spends its whole run
 * rediscovering them, and the import reports 140 skips and nothing gained.
 * Reading this first turns that run into one that only writes down what is
 * missing.
 *
 * Packaged goods are excluded by default. They are 97% of the catalogue, none
 * of them is a dish anybody researches, and including them buries the answer.
 *
 * But silence about them is its own trap, and it has now caught two rounds: a
 * Korean round wrote Milkis and lost it to a slug collision with a packaged
 * row, and a Japanese one concluded three of its own bento were missing from
 * the catalogue when they were sitting there as `place = 'packaged'`. So when
 * the filter is what hid the answer, this says so and gives the flag rather
 * than reporting a confident zero.
 */

import { d1 } from './lib/d1.mjs'

const args = process.argv.slice(2)
const all = args.includes('--all')
const packaged = args.includes('--packaged')
const placeAt = args.indexOf('--place')
const place = placeAt === -1 ? null : args[placeAt + 1]
const terms = args.filter((a, i) => !a.startsWith('--') && !(placeAt !== -1 && i === placeAt + 1))

if (terms.length === 0 && !place) {
  process.stderr.write('usage: foods-have.mjs [--place <place>] [--all] [--packaged] <term> ...\n')
  process.exit(2)
}

const lit = (s) => `'${String(s).replaceAll("'", "''")}'`

// LIKE over the normalized name and the alias rows rather than through the
// search endpoint, deliberately. Search is ranked and capped and forgiving — it
// answers "what would the user see". This answers "what is in there", which
// wants every row containing the word and no opinion about which is best.
//
// The alias half matters more here than anywhere: a dish already in the
// catalogue under an English name is exactly the one a researcher is about to
// write down again under its local one.
const matches =
  terms.length > 0
    ? `(${terms
        .map((t) => {
          const like = lit(`%${t.toLowerCase()}%`)
          return `(f.name_norm like ${like} or exists (select 1 from food_alias a
                    where a.food_id = f.id and a.alias_norm like ${like}))`
        })
        .join(' or ')})`
    : null

const where = [
  packaged ? null : "f.place <> 'packaged'",
  // The estimate and archetype flags went with the Postgres catalogue: nothing
  // shared is written by a scan any more, so every row here is a catalogue row
  // by construction. The archetypes are in Postgres, not in D1 at all.
  place ? `f.place = ${lit(place)}` : null,
  matches,
]
  .filter(Boolean)
  .join(' and ')

const rows = await d1(`
  select f.id, f.name, f.place, f.kcal, f.source_attribution as source,
         (select s.label from food_serving s
           where s.food_id = f.id and s.is_default = 1) as serving
  from food f
  where ${where}
  order by f.name
  ${all ? '' : 'limit 400'}
`)

// Count what the packaged filter is hiding, so a zero here is never mistaken
// for a zero in the catalogue. Only asked when the filter is actually on.
const hidden = packaged
  ? 0
  : Number(
      (
        await d1(`select count(*) as n from food f
          where f.place = 'packaged' ${matches ? `and ${matches}` : ''}`)
      )[0].n,
    )

for (const r of rows) {
  process.stdout.write(
    `${r.name}  —  ${r.kcal} kcal / ${r.serving ?? '?'}  [${r.place}, ${r.source ?? 'no source'}]\n`,
  )
}
process.stdout.write(`\n${rows.length} row${rows.length === 1 ? '' : 's'}\n`)
if (!all && rows.length === 400) {
  process.stdout.write('(capped at 400 — pass --all for the rest)\n')
}
if (hidden > 0) {
  process.stdout.write(
    `(and ${hidden} packaged row${hidden === 1 ? '' : 's'} not shown — pass --packaged to see them.\n` +
      ' A dish missing here may already exist as a packaged product, and the loader will still refuse it.)\n',
  )
}
