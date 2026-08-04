/**
 * Adds names to a dish that is already in the catalogue.
 *
 *   node apps/supabase/scripts/foods-alias.mjs nasi-ayam-bebola "chicken rice ball" "Melaka chicken rice"
 *   node apps/supabase/scripts/foods-alias.mjs --file apps/supabase/data/foods/aliases/penang.json
 *
 * Three research rounds in a row ended with the same request: a dish is
 * already there under a name nobody types. `Nasi Ayam Bebola` is the Melaka
 * chicken rice ball; `(Papadam)` is a papadom; half the MyFCD catalogue buries
 * the Malay term inside parentheses after an English one — `Rice, "Dagang"
 * (Nasi Dagang)`. Search will not find any of those from what a person actually
 * writes.
 *
 * The loader cannot fix this. It refuses a dish whose normalized name is
 * already present, which is exactly right for its job and exactly wrong for
 * this one: the correct change is not a second row, it is another word on the
 * row that exists. Without a tool for that, every round either created the
 * duplicate or gave up and reported the gap.
 *
 * WHAT IT TOUCHES AND WHAT IT WILL NOT
 *
 * `search_text` only. That column is the bag of words full text matches
 * against, and it is the one thing on a catalogue row that can be widened
 * without restating anything: adding "chicken rice ball" does not change what
 * the dish costs, what it is called, or what any entry logged against it means.
 * `name` and `name_norm` are left alone deliberately — `name_norm` is what
 * dedup compares and what the trigram index rides, so rewriting it here would
 * quietly change which future payloads are considered duplicates of this row.
 *
 * A JSON file may be passed instead, as { "<slug>": ["alias", ...], ... }, so a
 * research round can hand back a batch of these rather than a paragraph asking
 * somebody to do it.
 */

import { readFileSync } from 'node:fs'
import { runSql } from './lib/sql.mjs'

const lit = (s) => `'${String(s).replaceAll("'", "''")}'`

/**
 * The same folding `public.search_normalize` does — apostrophes split rather
 * than elide, CJK survives — because a token this writes that the query form
 * cannot produce is a word the row can never be found by. See the note in
 * import-foods.mjs.
 */
function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

async function addAliases(slug, aliases) {
  const words = [...new Set(aliases.flatMap((a) => normalize(a).split(' ')))].filter(Boolean)
  if (words.length === 0) return { slug, added: 0, skipped: 'no usable words' }

  // Whole aliases are appended, not just their words, so a multi-word phrase
  // still reads as one in a dump — but the dedup below is per word, since the
  // index is per word too and a phrase whose every word is already there adds
  // nothing but length. `search_text` is capped: a long bag dilutes ts_rank_cd
  // across terms that do not distinguish the dish.
  const [row] = await runSql(`
    with target as (
      select id, name, search_text from public.foods where slug = ${lit(slug)}
    ),
    fresh as (
      select t.id, t.name, t.search_text,
        (select string_agg(w, ' ')
         from unnest(array[${words.map(lit).join(',')}]) as w
         where not (' ' || t.search_text || ' ') like ('% ' || w || ' %')) as add
      from target t
    )
    update public.foods f
       set search_text = left(btrim(f.search_text || ' ' || coalesce(fresh.add, '')), 900)
      from fresh
     where f.id = fresh.id and fresh.add is not null
    returning f.slug, f.name, f.search_text
  `)

  if (!row) {
    const [exists] = await runSql(
      `select count(*)::integer as n from public.foods where slug = ${lit(slug)}`,
    )
    return exists.n === 0
      ? { slug, added: 0, skipped: 'no such slug' }
      : { slug, added: 0, skipped: 'every word was already there' }
  }
  return { slug, name: row.name, added: words.length, search_text: row.search_text }
}

const args = process.argv.slice(2)
const fileAt = args.indexOf('--file')

const work =
  fileAt !== -1
    ? Object.entries(JSON.parse(readFileSync(args[fileAt + 1], 'utf8')))
    : [[args[0], args.slice(1)]]

if (!work[0]?.[0] || work[0][1].length === 0) {
  process.stderr.write(
    'usage: foods-alias.mjs <slug> "<alias>" ...\n' +
      '       foods-alias.mjs --file <aliases.json>   # { "<slug>": ["alias", ...] }\n',
  )
  process.exit(2)
}

for (const [slug, aliases] of work) {
  const result = await addAliases(slug, aliases)
  process.stdout.write(
    result.skipped
      ? `  – ${slug}: ${result.skipped}\n`
      : `  + ${result.name}\n      ${result.search_text}\n`,
  )
}
