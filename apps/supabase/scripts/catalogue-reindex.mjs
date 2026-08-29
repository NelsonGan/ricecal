/**
 * Brings the catalogue's derived data back in line with its rows.
 *
 *   pnpm foods:reindex            everything that is out of date
 *   pnpm foods:reindex --all      rebuild the full-text indexes from scratch
 *   pnpm foods:reindex --check    say what is stale and change nothing
 *
 * `apps/cloudflare/d1/food-catalogue/schema.sql` creates the tables. This fills
 * in the three things computed rather than stored by the loader:
 *
 *   food.name_norm         what the exact-name search arm compares against
 *   food_alias.alias_norm  the same, for a dish's other names
 *   food_fts / food_trgm   the two full-text indexes, and the rowid map
 *
 * The loader writes those for rows it wrote. This exists for the rest: rows that
 * predate a column, rows written by the Worker's own `/product` cache path, and
 * the full-text indexes, which are contentless FTS5 tables and cannot be edited
 * row by row without the original values to hand. The catalogue is small enough
 * (~53,000 searchable rows) that rebuilding is a few minutes.
 *
 * `--all` is a live window, though: the indexes are truncated and refilled, so
 * for the few minutes it runs search answers off a partial index, and the fuzzy
 * arm is rebuilt last, so misspellings go first. Graded halfway through, the
 * search gate scored 26/30 against 29/30 on the finished index. Run it when
 * nobody is typing, and do not read a gate result taken while it is in flight.
 *
 * The normalizer is imported from the Worker's own source rather than
 * reimplemented, because the query and the column have to be folded identically
 * or the arm silently matches nothing.
 */

import { normalize } from '../../cloudflare/workers/catalogue/src/text.ts'
import { d1, d1batch, q } from './lib/d1.mjs'

const args = process.argv.slice(2)
const rebuildAll = args.includes('--all')
const checkOnly = args.includes('--check')

/** How many rows to put in one multi-row VALUES clause. */
const ROWS_PER_STATEMENT = 400

const progress = (done, total) => process.stdout.write(`\r  ${done}/${total} statements`)

/**
 * The columns and indexes `schema.sql` declares, added to a database that
 * predates them.
 *
 * SQLite has no `add column if not exists`, so the columns are checked against
 * `pragma table_info` first. Indexes do have the clause, so they are simply
 * asserted every run — which is what makes this safe to re-run and makes it the
 * one command that brings a live catalogue in line with the committed schema.
 */
async function ensureShape() {
  const columns = async (table) =>
    new Set((await d1(`pragma table_info(${table})`)).map((c) => c.name))

  const food = await columns('food')
  if (!food.has('name_norm')) {
    console.log('adding food.name_norm')
    await d1('alter table food add column name_norm text')
  }

  const alias = await columns('food_alias')
  if (!alias.has('alias_norm')) {
    console.log('adding food_alias.alias_norm')
    await d1('alter table food_alias add column alias_norm text')
  }

  for (const sql of [
    'create unique index if not exists food_slug_idx on food (slug)',
    'create index if not exists food_name_norm_idx on food (name_norm)',
    'create index if not exists food_alias_norm_idx on food_alias (alias_norm)',
    'create index if not exists fts_map_food_idx on fts_map (food_id)',
  ]) {
    await d1(sql)
  }
}

async function main() {
  await ensureShape()

  const [counts] = await d1(`select
      (select count(*) from food) foods,
      (select count(*) from food where name_norm is null) foods_unnormalized,
      (select count(*) from food_alias) aliases,
      (select count(*) from food_alias where alias_norm is null) aliases_unnormalized,
      (select count(*) from fts_map) in_index`)

  console.log(
    `${counts.foods} foods (${counts.foods_unnormalized} without name_norm), ` +
      `${counts.aliases} aliases (${counts.aliases_unnormalized} without alias_norm), ` +
      `${counts.in_index} in the full-text index`,
  )

  if (checkOnly) return

  // ---- name_norm -----------------------------------------------------------
  //
  // Through a temp table rather than one UPDATE per row. 48,000 statements is
  // 48,000 round trips through wrangler; 48,000 rows in multi-row VALUES is a
  // hundred and change, and the UPDATE that reads them is one more.
  const rows = rebuildAll
    ? await d1('select id, name from food')
    : await d1('select id, name from food where name_norm is null')

  if (rows.length) {
    console.log(`normalizing ${rows.length} names`)
    await d1('drop table if exists _norm')
    await d1('create table _norm (id text primary key, v text)')

    const statements = []
    for (let i = 0; i < rows.length; i += ROWS_PER_STATEMENT) {
      const values = rows
        .slice(i, i + ROWS_PER_STATEMENT)
        .map((r) => `(${q(r.id)},${q(normalize(r.name))})`)
        .join(',')
      statements.push(`insert into _norm (id, v) values ${values}`)
    }
    await d1batch(statements, { onProgress: progress })
    process.stdout.write('\n')

    await d1(
      'update food set name_norm = (select v from _norm where _norm.id = food.id) ' +
        'where exists (select 1 from _norm where _norm.id = food.id)',
    )
    await d1('drop table _norm')
  }

  // ---- alias_norm ----------------------------------------------------------
  const aliases = rebuildAll
    ? await d1('select food_id, alias from food_alias')
    : await d1('select food_id, alias from food_alias where alias_norm is null')

  if (aliases.length) {
    console.log(`normalizing ${aliases.length} aliases`)
    await d1('drop table if exists _anorm')
    await d1('create table _anorm (food_id text, alias text, v text, primary key (food_id, alias))')

    const statements = []
    for (let i = 0; i < aliases.length; i += ROWS_PER_STATEMENT) {
      const values = aliases
        .slice(i, i + ROWS_PER_STATEMENT)
        .map((r) => `(${q(r.food_id)},${q(r.alias)},${q(normalize(r.alias))})`)
        .join(',')
      statements.push(`insert or replace into _anorm (food_id, alias, v) values ${values}`)
    }
    await d1batch(statements, { onProgress: progress })
    process.stdout.write('\n')

    await d1(
      'update food_alias set alias_norm = (select v from _anorm where _anorm.food_id = ' +
        'food_alias.food_id and _anorm.alias = food_alias.alias) where exists (select 1 from ' +
        '_anorm where _anorm.food_id = food_alias.food_id and _anorm.alias = food_alias.alias)',
    )
    await d1('drop table _anorm')
  }

  // ---- the full-text indexes ----------------------------------------------
  //
  // All or nothing. A contentless FTS5 table cannot delete a row without being
  // handed the values that row was indexed with, so there is no honest
  // incremental path here for a row whose name changed — and a half-rebuilt
  // index is worse than a stale one, because it looks fresh.
  if (!rebuildAll) {
    const [{ missing }] = await d1(
      'select count(*) missing from food where id not in (select food_id from fts_map)',
    )
    if (Number(missing) === 0) {
      console.log('full-text index is complete; pass --all to rebuild it anyway')
      return
    }
    console.log(`${missing} foods are not in the full-text index — rebuilding all of it`)
  }

  console.log('rebuilding the full-text indexes')
  await d1("insert into food_fts(food_fts) values('delete-all')")
  await d1("insert into food_trgm(food_trgm) values('delete-all')")
  await d1('delete from fts_map')

  const indexable = await d1(`select f.id, f.name, f.brand,
      (select group_concat(a.alias, ' ') from food_alias a where a.food_id = f.id) aliases
    from food f`)

  console.log(`indexing ${indexable.length} foods`)
  const mapRows = []
  const ftsRows = []
  const trgmRows = []
  indexable.forEach((f, i) => {
    const rowid = i + 1
    const aliases = f.aliases ?? ''
    mapRows.push(`(${rowid},${q(f.id)})`)
    ftsRows.push(`(${rowid},${q(f.name)},${q(f.brand ?? '')},${q(aliases)})`)
    // The trigram arm indexes one blob of everything a person might half-spell:
    // the name and every alias, normalized, because the query side is too.
    trgmRows.push(`(${rowid},${q(normalize(`${f.name} ${aliases}`))})`)
  })

  const chunks = (rows, sql) => {
    const out = []
    for (let i = 0; i < rows.length; i += ROWS_PER_STATEMENT) {
      out.push(`${sql} ${rows.slice(i, i + ROWS_PER_STATEMENT).join(',')}`)
    }
    return out
  }

  await d1batch(
    [
      ...chunks(mapRows, 'insert into fts_map (rowid, food_id) values'),
      ...chunks(ftsRows, 'insert into food_fts (rowid, name, brand, aliases) values'),
      ...chunks(trgmRows, 'insert into food_trgm (rowid, text) values'),
    ],
    { onProgress: progress },
  )
  process.stdout.write('\n')

  const [after] = await d1(`select (select count(*) from fts_map) mapped,
    (select count(*) from food) foods,
    (select count(*) from food where name_norm is null) unnormalized`)
  console.log(`done: ${after.mapped}/${after.foods} indexed, ${after.unnormalized} unnormalized`)
}

await main()
