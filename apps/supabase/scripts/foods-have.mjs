/**
 * What the catalogue already holds, for a researcher about to add to it.
 *
 *   node apps/supabase/scripts/foods-have.mjs kuih
 *   node apps/supabase/scripts/foods-have.mjs "nasi goreng" laksa mee
 *   node apps/supabase/scripts/foods-have.mjs --place kopitiam --all
 *   node apps/supabase/scripts/foods-have.mjs --packaged milkis bento
 *
 * `import_foods` will refuse a duplicate whatever anyone does, so this is not
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

import { runSql } from './lib/sql.mjs'

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

// ILIKE over `name_norm` rather than `search_foods`, deliberately. Search is
// ranked and capped and forgiving — it answers "what would the user see". This
// answers "what is in there", which wants every row containing the word and no
// opinion about which is best.
const matches =
  terms.length > 0
    ? `(${terms.map((t) => `f.search_text ilike ${lit(`%${t.toLowerCase()}%`)}`).join(' or ')})`
    : null

const where = [
  packaged ? null : "f.place <> 'packaged'",
  'not f.is_estimate',
  'not f.is_archetype',
  place ? `f.place = ${lit(place)}::public.food_place` : null,
  matches,
]
  .filter(Boolean)
  .join(' and ')

const rows = await runSql(`
  select f.name, f.place::text as place, f.kcal, f.source,
         (select s.label from public.food_servings s
           where s.food_id = f.id and s.is_default) as serving
  from public.foods f
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
        await runSql(`
          select count(*)::int as n from public.foods f
          where f.place = 'packaged' and not f.is_estimate and not f.is_archetype
          ${matches ? `and ${matches}` : ''}
        `)
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
