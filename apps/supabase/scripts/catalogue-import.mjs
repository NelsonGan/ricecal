/**
 * Loads researched dishes from JSON payloads into the D1 catalogue.
 *
 *   pnpm foods:import apps/supabase/data/foods/singapore.json
 *   pnpm foods:import --dry-run apps/supabase/data/foods
 *   pnpm foods:import --report thailand apps/supabase/data/foods/thailand.json
 *
 * The shape check is in `lib/food-shape.mjs` and runs with no database at all,
 * so `--dry-run` tells a researcher whether their file is wrong before anything
 * is written. This half is the write, and the dedup.
 *
 * WHY THE DEDUP IS HERE NOW
 *
 * It used to be inside `public.import_foods`, deliberately: a loader that
 * fetched the catalogue first and decided locally would have had to pull
 * 457,000 names to answer a question about 200, and two runs at once would each
 * conclude the same new dish was new.
 *
 * Neither argument survived the move. The searchable catalogue is ~47,000 rows
 * — the three million packaged products are in `product`, which nothing here
 * touches — so "pull every slug and normalized name" is one query and a couple
 * of megabytes. And D1 has no stored procedures to put the check inside the
 * write, so the choice is here or nowhere. Concurrency is the one thing lost,
 * and it was never real: these payloads are loaded by one person at a time.
 *
 * IDEMPOTENT BY SLUG AND BY NAME. Re-running a payload writes nothing the
 * second time, which is what makes recovery from a half-finished run "run it
 * again" rather than a question about which rows landed.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalize } from '../../catalogue-worker/src/text.ts'
import { d1, d1batch, n, q } from './lib/d1.mjs'
import { expand, shapeFiles } from './lib/food-shape.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/**
 * What a `source_id` means for ranking and attribution.
 *
 * `source_priority` breaks a tie in the search's final sort, and `is_local`
 * feeds the bounded locale prior — so this table is where "a Malaysian
 * composition table outranks a researched guess" is actually written down.
 *
 * `is_local` is MALAYSIAN, not Asian. The neighbours' dishes belong in the
 * catalogue and should not outrank a local row for a local user, which is what
 * setting them local would do.
 */
const SOURCES = {
  research: { name: 'RiceCal researched dishes', priority: 60, local: 0 },
  hawker_my: { name: 'RiceCal hawker recipes', priority: 80, local: 1 },
  chain_menu_my: { name: 'Malaysian chain menus', priority: 70, local: 1 },
  brand_drinks_my: { name: 'Malaysian chain drinks', priority: 70, local: 1 },
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const reportName = flag('report')
const paths = args.filter((a) => !a.startsWith('--'))

if (paths.length === 0) {
  process.stderr.write(
    'usage: catalogue-import.mjs [--dry-run] [--report=name] <file.json|dir> ...\n',
  )
  process.exit(2)
}

const { rows, rejected, warnings, perFile } = shapeFiles(expand(paths))

for (const f of perFile) console.log(`${f.file}: ${f.read} dishes read`)
console.log(`\n${rows.length} shaped, ${rejected.length} rejected before the database`)
for (const r of rejected) console.log(`  ✗ ${r.name} — ${r.reason}`)
for (const w of warnings) console.log(`  ! ${w}`)

if (rows.length === 0) {
  console.log('\nnothing to write')
  process.exit(rejected.length ? 1 : 0)
}

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

console.log('\nreading what the catalogue already has')
const existing = await d1('select slug, name_norm from food')
const haveSlug = new Set(existing.map((r) => r.slug))
const haveName = new Set(existing.map((r) => r.name_norm).filter(Boolean))
console.log(`  ${existing.length} rows already there`)

const fresh = []
const skipped = []
// Within one run too: two payload files describing the same dish would
// otherwise both look new, and the second would land as a duplicate slug.
const seenSlug = new Set()
const seenName = new Set()

for (const row of rows) {
  const nameNorm = row.name_norm ?? normalize(row.name)
  if (haveSlug.has(row.slug) || seenSlug.has(row.slug)) {
    skipped.push({ ...row, why: 'slug is already in the catalogue' })
  } else if (haveName.has(nameNorm) || seenName.has(nameNorm)) {
    skipped.push({ ...row, why: 'a row with this name is already in the catalogue' })
  } else {
    seenSlug.add(row.slug)
    seenName.add(nameNorm)
    fresh.push({ ...row, name_norm: nameNorm, id: randomUUID() })
  }
}

console.log(`${fresh.length} new, ${skipped.length} already there`)

if (dryRun) {
  console.log('\n--dry-run: nothing written')
  for (const row of fresh.slice(0, 40))
    console.log(`  + ${row.slug}  ${row.name}  ${row.kcal} kcal`)
  if (fresh.length > 40) console.log(`  … and ${fresh.length - 40} more`)
} else if (fresh.length) {
  // -------------------------------------------------------------------------
  // The write
  //
  // Three tables and the two full-text indexes, in that order. Nothing here is
  // a transaction — D1 commits per statement batch — so the order matters: a
  // food with no servings renders with no portions, which is recoverable, while
  // a serving pointing at no food is a row nothing will ever read.
  // -------------------------------------------------------------------------
  const statements = []

  for (const row of fresh) {
    const source = SOURCES[row.source_id] ?? SOURCES.research
    statements.push(
      `insert into food (id, slug, name, name_norm, brand, icon_set, icon_name, place,
         kcal, carbs_g, protein_g, fat_g, fibre_g, sugar_g, sodium_mg,
         verified, popularity, is_local, source_id, source_name, source_attribution,
         source_priority)
       values (${q(row.id)}, ${q(row.slug)}, ${q(row.name)}, ${q(row.name_norm)},
         ${q(row.brand)}, ${q(row.icon_set)}, ${q(row.icon_name)}, ${q(row.place)},
         ${n(row.kcal)}, ${n(row.carbs_g)}, ${n(row.protein_g)}, ${n(row.fat_g)},
         ${n(row.fibre_g)}, ${n(row.sugar_g)}, ${n(row.sodium_mg)},
         ${row.verified ? 1 : 0}, 0, ${source.local}, ${q(row.source_id)},
         ${q(source.name)}, ${q(row.source)}, ${source.priority})`,
    )

    for (const s of row.servings) {
      statements.push(
        `insert or replace into food_serving (food_id, slug, label, factor, grams, is_default, position)
         values (${q(row.id)}, ${q(s.slug)}, ${q(s.label)}, ${n(s.factor)}, ${n(s.grams)},
           ${s.is_default ? 1 : 0}, ${n(s.position)})`,
      )
    }

    for (const alias of new Set(row.aliases)) {
      statements.push(
        `insert or replace into food_alias (food_id, alias, alias_norm)
         values (${q(row.id)}, ${q(alias)}, ${q(normalize(alias))})`,
      )
    }
  }

  console.log(`writing ${statements.length} statements`)
  await d1batch(statements, {
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
  })
  process.stdout.write('\n')

  // -------------------------------------------------------------------------
  // The full-text index, for the new rows only.
  //
  // A contentless FTS5 table cannot delete a row without the values it was
  // indexed with, so editing one in place is not on offer — but APPENDING is,
  // and every row here is new by construction. Rowids continue from the end of
  // the map, which is the one thing that must not collide.
  // -------------------------------------------------------------------------
  const [{ next }] = await d1('select coalesce(max(rowid), 0) + 1 next from fts_map')
  let rowid = Number(next)

  const map = []
  const fts = []
  const trgm = []
  for (const row of fresh) {
    const aliases = row.aliases.join(' ')
    map.push(`(${rowid},${q(row.id)})`)
    fts.push(`(${rowid},${q(row.name)},${q(row.brand ?? '')},${q(aliases)})`)
    trgm.push(`(${rowid},${q(normalize(`${row.name} ${aliases}`))})`)
    rowid++
  }

  const chunk = (values, sql, size = 400) => {
    const out = []
    for (let i = 0; i < values.length; i += size) {
      out.push(`${sql} ${values.slice(i, i + size).join(',')}`)
    }
    return out
  }

  console.log('indexing')
  await d1batch([
    ...chunk(map, 'insert into fts_map (rowid, food_id) values'),
    ...chunk(fts, 'insert into food_fts (rowid, name, brand, aliases) values'),
    ...chunk(trgm, 'insert into food_trgm (rowid, text) values'),
  ])

  const [after] = await d1(
    'select (select count(*) from food) foods, (select count(*) from fts_map) mapped',
  )
  console.log(`catalogue now holds ${after.foods} foods, ${after.mapped} indexed`)
}

// The skipped rows are the interesting output, not noise: they are what the
// next research round should be told not to look for again.
const stem = reportName ?? basename(expand(paths)[0] ?? 'import').replace(/\.json$/, '')
const report = `${REPO_ROOT}/apps/supabase/data/foods/.reports/${stem}${dryRun ? '.dry' : ''}.json`
mkdirSync(dirname(report), { recursive: true })
writeFileSync(
  report,
  `${JSON.stringify(
    {
      tally: {
        shaped: rows.length,
        inserted: dryRun ? 0 : fresh.length,
        skipped: skipped.length,
        rejected: rejected.length,
      },
      rejected,
      warnings,
      skipped: skipped.map((r) => ({ slug: r.slug, name: r.name, why: r.why })),
      inserted: fresh.map((r) => ({ slug: r.slug, name: r.name, kcal: r.kcal })),
    },
    null,
    2,
  )}\n`,
)
console.log(`\nreport: ${report}`)
