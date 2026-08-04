/**
 * What the catalogue already holds, for a researcher about to add to it.
 *
 *   node apps/supabase/scripts/foods-have.mjs kuih
 *   node apps/supabase/scripts/foods-have.mjs "nasi goreng" laksa mee
 *   node apps/supabase/scripts/foods-have.mjs --place kopitiam --all
 *
 * `import_foods` will refuse a duplicate whatever anyone does, so this is not
 * a correctness tool — it is a cost one. A research agent handed "Malaysian
 * kuih" with no idea that 140 kuih are already in there spends its whole run
 * rediscovering them, and the import reports 140 skips and nothing gained.
 * Reading this first turns that run into one that only writes down what is
 * missing.
 *
 * Packaged goods are excluded. They are 97% of the catalogue, none of them is
 * a dish anybody researches, and including them buries the answer.
 */

import { runSql } from './lib/sql.mjs'

const args = process.argv.slice(2)
const all = args.includes('--all')
const placeAt = args.indexOf('--place')
const place = placeAt === -1 ? null : args[placeAt + 1]
const terms = args.filter((a, i) => !a.startsWith('--') && !(placeAt !== -1 && i === placeAt + 1))

if (terms.length === 0 && !place) {
  process.stderr.write('usage: foods-have.mjs [--place <place>] [--all] <term> ...\n')
  process.exit(2)
}

const lit = (s) => `'${String(s).replaceAll("'", "''")}'`

// ILIKE over `name_norm` rather than `search_foods`, deliberately. Search is
// ranked and capped and forgiving — it answers "what would the user see". This
// answers "what is in there", which wants every row containing the word and no
// opinion about which is best.
const where = [
  "f.place <> 'packaged'",
  'not f.is_estimate',
  'not f.is_archetype',
  place ? `f.place = ${lit(place)}::public.food_place` : null,
  terms.length > 0
    ? `(${terms.map((t) => `f.search_text ilike ${lit(`%${t.toLowerCase()}%`)}`).join(' or ')})`
    : null,
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

for (const r of rows) {
  process.stdout.write(
    `${r.name}  —  ${r.kcal} kcal / ${r.serving ?? '?'}  [${r.place}, ${r.source ?? 'no source'}]\n`,
  )
}
process.stdout.write(`\n${rows.length} row${rows.length === 1 ? '' : 's'}\n`)
if (!all && rows.length === 400) {
  process.stdout.write('(capped at 400 — pass --all for the rest)\n')
}
