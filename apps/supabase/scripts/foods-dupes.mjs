/**
 * The duplicates exact matching cannot see, and a way to fold them together.
 *
 *   pnpm foods:dupes                              # everything against everything
 *   pnpm foods:dupes --since research:thailand-2  # one round against the rest
 *   pnpm foods:dupes --min 0.55                   # a different threshold
 *   pnpm foods:dupes --merge char-kuey-teow char-kway-teow
 *
 * The importer refuses a dish whose slug or normalized name is already in the
 * catalogue, and that is most of the job. What it cannot refuse is the same
 * dish under a different name — `Siew Yoke Rice` against `Siew Yoke Fan`,
 * `char kway teow` against `char kuey teow` — because no similarity threshold
 * separates those from genuinely different dishes that share three words. So
 * this reports and a person decides. It is worth deciding: two rows for one
 * dish split its logs, split its search ranking, and give the user two answers
 * to the same question.
 *
 * WHY THE SIMILARITY IS COMPUTED HERE
 *
 * It used to be `pg_trgm`'s `%` operator riding a GIN index, with one side of
 * the pair pinned so the planner had ~1,500 rows to scan rather than 15,000
 * squared. SQLite has no trigram similarity — its FTS5 trigram tokenizer
 * matches substrings and does not score — so the comparison came back to the
 * client, which turns out to be the easier place for it: ~20,000 searchable
 * non-packaged names is a couple of megabytes, and Jaccard over trigram sets is
 * a few seconds of plain JavaScript. The pinning survives as `--since`, for the
 * same reason it existed: a duplicate this tool exists to find always has a
 * freshly-written row on at least one side.
 *
 * WHY MERGING IS SAFE HERE
 *
 * Deleting a catalogue row is no longer dangerous the way it was. An entry
 * carries its own numbers now, so a dish that goes away takes nothing with it —
 * `food_logs.food_id` is a soft reference and a dangling one is ordinary. What
 * merging buys over deleting is that the kept row inherits the dropped one's
 * ALIASES, so `siew yoke fan` remains a thing a person can type.
 */

import { normalize } from '../../catalogue-worker/src/text.ts'
import { d1, d1batch, q } from './lib/d1.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? null : args[at + 1]
}

const MIN = Number(flag('min') ?? 0.45)
const since = flag('since')

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

const mergeAt = args.indexOf('--merge')
if (mergeAt !== -1) {
  const [keepSlug, dropSlug] = args.slice(mergeAt + 1, mergeAt + 3)
  if (!keepSlug || !dropSlug) {
    console.error('usage: --merge <keep-slug> <drop-slug>')
    process.exit(2)
  }

  const rows = await d1(
    `select id, slug, name from food where slug in (${q(keepSlug)}, ${q(dropSlug)})`,
  )
  const keep = rows.find((r) => r.slug === keepSlug)
  const drop = rows.find((r) => r.slug === dropSlug)
  if (!keep || !drop) {
    console.error(`could not find ${!keep ? keepSlug : dropSlug}`)
    process.exit(1)
  }

  const aliases = await d1(
    `select alias from food_alias where food_id = ${q(drop.id)}
      union select ${q(drop.name)} as alias`,
  )

  await d1batch([
    ...aliases.map(
      (a) =>
        `insert or replace into food_alias (food_id, alias, alias_norm)
         values (${q(keep.id)}, ${q(a.alias)}, ${q(normalize(a.alias))})`,
    ),
    `delete from food_alias where food_id = ${q(drop.id)}`,
    `delete from food_serving where food_id = ${q(drop.id)}`,
    `delete from food where id = ${q(drop.id)}`,
  ])

  console.log(
    `merged "${drop.name}" into "${keep.name}" — ${aliases.length} name(s) carried over\n\n` +
      'Run `pnpm foods:reindex --all`: the full-text index still holds the dropped row.',
  )
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

/** A name as its set of overlapping trigrams — the unit `pg_trgm` compared. */
function trigrams(text) {
  const padded = ` ${normalize(text)} `
  const set = new Set()
  for (let i = 0; i <= padded.length - 3; i++) set.add(padded.slice(i, i + 3))
  return set
}

const jaccard = (a, b) => {
  let shared = 0
  for (const g of a) if (b.has(g)) shared++
  return shared / (a.size + b.size - shared)
}

// Packaged rows are excluded on both sides. They are most of the catalogue, no
// two of them are the same dish under two romanizations, and including them
// turns a few seconds into a few minutes of comparing barcode products.
console.log('reading the searchable catalogue')
const all = await d1(
  "select id, slug, name, source_attribution as source from food where place <> 'packaged'",
)
console.log(`  ${all.length} rows`)

const left = since ? all.filter((r) => (r.source ?? '').includes(since)) : all
if (since && !left.length) {
  console.error(`no rows whose source mentions "${since}"`)
  process.exit(1)
}

const grams = new Map(all.map((r) => [r.id, trigrams(r.name)]))
const pairs = []
const seen = new Set()

for (const a of left) {
  const ga = grams.get(a.id)
  for (const b of all) {
    if (a.id === b.id) continue
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
    if (seen.has(key)) continue
    const score = jaccard(ga, grams.get(b.id))
    if (score < MIN) continue
    seen.add(key)
    pairs.push({ score, a, b })
  }
}

pairs.sort((x, y) => y.score - x.score)

for (const { score, a, b } of pairs) {
  console.log(`${score.toFixed(2)}  ${a.name}  ≈  ${b.name}`)
  console.log(`      ${a.slug}   |   ${b.slug}`)
}
console.log(`\n${pairs.length} pair${pairs.length === 1 ? '' : 's'} at or above ${MIN}`)
if (pairs.length) {
  console.log('Fold one into another with: pnpm foods:dupes --merge <keep-slug> <drop-slug>')
}
