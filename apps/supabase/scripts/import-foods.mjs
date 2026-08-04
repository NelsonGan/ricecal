/**
 * Loads researched dishes from JSON into the catalogue.
 *
 *   node apps/supabase/scripts/import-foods.mjs apps/supabase/data/foods/*.json
 *   node apps/supabase/scripts/import-foods.mjs --dry-run data/foods/kuih.json
 *   node apps/supabase/scripts/import-foods.mjs --update data/foods/fixes.json
 *
 * The sibling `import-catalogue.sql` is the other loader: half a million rows
 * of CSV, one psql session, a local stack. This one is for the drip — a few
 * hundred dishes at a time, written down by a researcher, arriving over and
 * over with heavy overlap between runs.
 *
 * SO THE DEDUP IS NOT HERE
 *
 * It is in `public.import_foods`, which checks the slug and the normalized name
 * against the catalogue inside the same statement that writes. A loader that
 * fetched the catalogue first and decided locally would be wrong two ways: it
 * would have to pull 457,000 names to answer a question about 200, and two
 * runs at once would each conclude the same new dish was new.
 *
 * WHAT THIS HALF DOES
 *
 * The shape. A researcher writes what they know — a name, a portion, calories,
 * macros, some aliases — and this turns that into the row `foods` wants: the
 * slug, the alias bag `search_text` indexes, the base serving at factor 1, the
 * icon resolved against the drawings that actually exist. Then it checks the
 * arithmetic, because the one error a nutrition catalogue cannot absorb is a
 * calorie figure that does not match its own macros, and no constraint in
 * Postgres is going to notice.
 *
 * INPUT
 *
 * A JSON array of dishes, or an object with a `foods` array and an optional
 * `source` every dish in the file inherits. One dish:
 *
 *   {
 *     "name":      "Nasi Lemak Ayam Goreng",   // required, the local spelling
 *     "place":     "hawker",                   // mamak|kopitiam|hawker|home|packaged
 *     "serving":   "1 plate",                  // required, what one of it is
 *     "kcal":      644,                        // required, for ONE serving
 *     "carbs_g":   80.2,
 *     "protein_g": 26.4,
 *     "fat_g":     25.9,
 *     "fibre_g":   4.1,                        // optional; omit rather than guess
 *     "sugar_g":   6.2,                        // optional
 *     "sodium_mg": 1120,                       // optional
 *     "aliases":   ["nasi lemak ayam", "椰漿飯炸雞"],
 *     "brand":     "OldTown",                  // only for a chain's own item
 *     "icon":      "dishes/nasi-lemak",        // optional, must be a real drawing
 *     "source":    "myfcd_current",            // where the numbers came from
 *     "verified":  false,                      // true only for a published figure
 *     "extra_servings": [{ "label": "Half plate", "factor": 0.5 }]
 *   }
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSql } from './lib/sql.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const ICON_ROOT = `${REPO_ROOT}apps/mobile/assets/icons`

const PLACES = new Set(['mamak', 'kopitiam', 'hawker', 'packaged', 'home'])

// Rows go in batches rather than in one statement because the payload travels
// as a SQL string literal: a whole day's research in one call is a multi-megabyte
// request that the API rejects long after the interesting work is done.
const BATCH = 150

// ---------------------------------------------------------------------------
// Normalizing
// ---------------------------------------------------------------------------

/**
 * The client-side echo of `public.search_normalize`, used for the slug and for
 * the alias bag. `name_norm` — the thing dedup actually compares — is computed
 * by the database's own trigger, so this is not the authority on identity.
 *
 * It does have to agree on TOKENS, though, and that is not cosmetic. Whatever
 * this writes into `search_text` is indexed by `to_tsvector`, and whatever a
 * user types is put through `search_normalize` before being matched against it.
 * Emit a token the query form cannot produce and the row is simply unfindable
 * by that word.
 *
 * Which is why the apostrophe splits rather than elides: Postgres turns
 * "McDonald's" into "mcdonald s", two tokens, and a client writing "mcdonalds"
 * would index a word no query ever asks for. The function's own comment claimed
 * the opposite for a while; the test in tests/06_import_foods.test.sql pins the
 * real behaviour.
 *
 * CJK survives, because `\p{L}` is not an ASCII range and half the aliases in
 * this catalogue are Chinese.
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

/**
 * Kebab-case, and ASCII only: `foods.slug` is checked against
 * `^[a-z0-9]+(-[a-z0-9]+)*$`, so a name that is entirely Chinese has no slug of
 * its own and falls back to a transliteration the caller supplied or, failing
 * that, is rejected upstream with a reason.
 */
function slugify(text) {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '')
}

let iconIndex
function icons() {
  iconIndex ??= new Map(
    readdirSync(ICON_ROOT).map((set) => [
      set,
      new Set(
        readdirSync(`${ICON_ROOT}/${set}`)
          .filter((f) => f.endsWith('.png'))
          .map((f) => f.replace(/\.png$/, '')),
      ),
    ]),
  )
  return iconIndex
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * One researched dish to one loader row, or to a rejection with a reason.
 *
 * The rejections here are the ones Postgres cannot make: a name with no ASCII
 * in it has no slug, an icon that names a drawing nobody drew renders as a
 * blank square, and calories that do not match their own macros are a number
 * somebody will diet against. Everything a constraint would catch is left to
 * the constraint — `import_foods` reports those per row too, and duplicating
 * them here only creates a second place for them to go stale.
 */
function shape(raw, fileSource) {
  const reject = (reason) => ({ ok: false, reason, name: raw?.name ?? '(unnamed)' })

  if (!raw || typeof raw !== 'object') return reject('not an object')

  const name = String(raw.name ?? '').trim()
  if (!name) return reject('no name')

  const brand = raw.brand ? String(raw.brand).trim() : null
  const place = String(raw.place ?? 'hawker').trim()
  if (!PLACES.has(place)) return reject(`place "${place}" is not a food_place`)

  const serving = String(raw.serving ?? raw.serving_label ?? '').trim()
  if (!serving) return reject('no serving: say what one of it is ("1 plate", "3 pieces")')
  if (serving.length > 40) return reject(`serving label longer than 40 characters: "${serving}"`)

  const kcal = num(raw.kcal)
  if (kcal === null || !Number.isFinite(kcal)) return reject('no kcal')
  if (kcal < 0 || kcal > 10000) return reject(`kcal ${kcal} outside 0..10000`)

  const carbs = num(raw.carbs_g) ?? 0
  const protein = num(raw.protein_g) ?? 0
  const fat = num(raw.fat_g) ?? 0
  if ([carbs, protein, fat].some((v) => !Number.isFinite(v) || v < 0)) {
    return reject('a macro is missing, negative or not a number')
  }

  // The one check with teeth. 4/4/9 is arithmetic, not an opinion, and a row
  // whose macros disagree with its own calorie figure by more than a quarter
  // was transcribed from two different sources or invented in two passes. The
  // scan cascade rejects its own estimates on exactly this margin
  // (functions/_shared/cascade.ts), so a catalogue row held to a looser
  // standard than a guess would be the wrong way round.
  if (kcal > 0) {
    const atwater = carbs * 4 + protein * 4 + fat * 9
    const drift = Math.abs(atwater - kcal) / kcal
    if (drift > 0.25) {
      return reject(
        `macros imply ${Math.round(atwater)} kcal but the row says ${Math.round(kcal)} ` +
          `(${Math.round(drift * 100)}% apart)`,
      )
    }
  }

  // Prefixed with the brand only when the name does not already carry it, which
  // is the same rule the database applies to `name_norm` — otherwise a chain
  // item lands at `mcdonalds-mcdonalds-filet-o-fish`.
  const nameNorm = normalize(name)
  const brandNorm = normalize(brand ?? '')
  const slugSource =
    raw.slug ?? (brandNorm && !nameNorm.startsWith(brandNorm) ? `${brand} ${name}` : name)
  const slug = slugify(slugSource)
  if (!slug) return reject(`no ASCII in "${name}": give an explicit "slug"`)

  let iconSet = null
  let iconName = null
  if (raw.icon) {
    const [set, ...rest] = String(raw.icon).split('/')
    const drawing = rest.join('/')
    if (!icons().get(set)?.has(drawing)) {
      // Not fatal. A wrong icon name is a research slip on an optional field,
      // and dropping the whole dish over a drawing would be a poor trade — but
      // silently keeping it would put a blank square on the row, which is the
      // failure `foods.icon_set` was made nullable to avoid.
      return {
        ...shape({ ...raw, icon: null }, fileSource),
        name,
        warning: `no icon "${raw.icon}" — imported without one`,
      }
    }
    iconSet = set
    iconName = drawing
  }

  // The bag full text matches against: the name, then every alias, each
  // normalized and deduped. Ordering is insertion order, which keeps the name
  // first and so keeps the row readable in a psql dump.
  const aliasWords = [nameNorm, ...(raw.aliases ?? []).map(normalize)].filter(Boolean)
  const searchText = [...new Set(aliasWords)].join(' ').slice(0, 900)

  const servings = [
    { slug: 'base', label: serving, factor: 1, is_default: true, position: 0 },
    ...(raw.extra_servings ?? []).map((s, i) => ({
      slug: slugify(s.slug ?? s.label) || `alt-${i + 1}`,
      label: String(s.label ?? '').trim(),
      factor: num(s.factor),
      is_default: false,
      position: i + 1,
    })),
  ]

  return {
    ok: true,
    row: {
      slug,
      name,
      brand,
      icon_set: iconSet,
      icon_name: iconName,
      place,
      kcal,
      carbs_g: carbs,
      protein_g: protein,
      fat_g: fat,
      fibre_g: num(raw.fibre_g),
      sugar_g: num(raw.sugar_g),
      sodium_mg: num(raw.sodium_mg),
      // Defaults to false, and that is not modesty: `verified` is the flag a
      // review queue sorts on, so a researched estimate claiming it would hide
      // itself from the only process that would ever check it.
      verified: raw.verified === true,
      // Both halves, when there are two. The row's own source says where the
      // NUMBER came from — a citation, which is what the column is for — and
      // the file's says which research round wrote it down. Keeping only the
      // first loses the round, and 223 rows all reading "model_estimate" with
      // no way back to the payload that produced them is not an audit trail.
      // Keeping only the second loses the citation, which is worse.
      source: [raw.source, fileSource].filter(Boolean).join(' · ') || 'research',
      search_text: searchText,
      servings,
    },
  }
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

function expand(paths) {
  const files = []
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      files.push(
        ...readdirSync(p)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .map((f) => `${p.replace(/\/$/, '')}/${f}`),
      )
    } else {
      files.push(p)
    }
  }
  return files
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const update = args.includes('--update')
  const paths = args.filter((a) => !a.startsWith('--'))

  if (paths.length === 0) {
    process.stderr.write('usage: import-foods.mjs [--dry-run] [--update] <file.json|dir> ...\n')
    process.exit(2)
  }

  const rows = []
  const rejected = []
  const warnings = []

  for (const file of expand(paths)) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const list = Array.isArray(parsed) ? parsed : (parsed.foods ?? [])
    const fileSource = Array.isArray(parsed) ? null : parsed.source

    for (const raw of list) {
      const result = shape(raw, fileSource)
      if (result.warning) warnings.push(`${basename(file)}: ${result.name} — ${result.warning}`)
      if (result.ok) rows.push(result.row)
      else rejected.push({ file: basename(file), name: result.name, reason: result.reason })
    }
    process.stdout.write(`${basename(file)}: ${list.length} dishes read\n`)
  }

  process.stdout.write(`\n${rows.length} shaped, ${rejected.length} rejected before the database\n`)
  for (const r of rejected) process.stdout.write(`  ✗ ${r.name} — ${r.reason}\n`)
  for (const w of warnings) process.stdout.write(`  ! ${w}\n`)

  if (rows.length === 0) {
    process.stdout.write('\nnothing to write\n')
    return
  }

  const outcomes = []
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    // `$payload$` dollar quoting rather than an escaped literal: the payload is
    // JSON full of quotes and backslashes, and one missed escape in a megabyte
    // is a syntax error pointing at a character offset nobody can find.
    const json = JSON.stringify(batch)
    if (json.includes('$payload$')) throw new Error('payload contains the quote delimiter')

    const call = `public.import_foods($payload$${json}$payload$::jsonb, ${update})`

    // A dry run goes all the way into the loader and is then rolled back,
    // rather than stopping at the shape check. Half of what a researcher needs
    // to know is whether the catalogue already has the dish, and that is a
    // question only the database can answer — a run that reports "108 shaped,
    // 0 rejected" and then inserts nine rows because ninety-nine were already
    // there has told them nothing they could act on.
    //
    // The rows come back through a temp table because the endpoint returns the
    // last statement that produced any, and `rollback` produces none.
    const result = await runSql(
      dryRun
        ? `begin;
           select * into temp _dry from ${call};
           select * from _dry order by idx;
           rollback;`
        : `select * from ${call}`,
    )
    outcomes.push(...result)
    process.stdout.write(
      `batch ${Math.floor(i / BATCH) + 1}: ${result.filter((r) => r.outcome === 'inserted').length} ` +
        `${dryRun ? 'would go in' : 'in'}, ` +
        `${result.filter((r) => r.outcome.startsWith('skipped')).length} already there, ` +
        `${result.filter((r) => r.outcome === 'rejected').length} rejected\n`,
    )
  }

  const tally = {}
  for (const o of outcomes) tally[o.outcome] = (tally[o.outcome] ?? 0) + 1

  process.stdout.write('\n')
  for (const [outcome, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`${String(n).padStart(6)}  ${outcome}\n`)
  }

  for (const o of outcomes.filter((r) => r.outcome === 'rejected')) {
    process.stdout.write(`  ✗ ${o.slug} — ${o.detail}\n`)
  }

  // The pairs exact matching could not decide. Printed rather than acted on:
  // see the header of 95_import_foods.sql for why no threshold separates a
  // second romanization of one dish from two dishes that share three words.
  const near = outcomes.filter((r) => r.nearest)
  if (near.length > 0) {
    process.stdout.write(`\n${near.length} inserted near something already there:\n`)
    for (const o of near) process.stdout.write(`  ~ ${o.slug}  ≈  ${o.nearest}\n`)
  }

  // The skipped rows are the interesting output, not noise: they are what the
  // next research round should be told not to look for again. Written rather
  // than printed, because there are usually more of them than of anything else.
  //
  // Named after the payload, not "the last run". Several researchers dry-run
  // their own files at the same time, and a single shared report meant each of
  // them read somebody else's verdicts — reported as "watch out, concurrent
  // rounds overwrite it", which is a bug and not a caveat.
  const stem = basename(expand(paths)[0] ?? 'import').replace(/\.json$/, '')
  const report = `${REPO_ROOT}apps/supabase/data/foods/.reports/${stem}${dryRun ? '.dry' : ''}.json`
  mkdirSync(dirname(report), { recursive: true })
  writeFileSync(report, `${JSON.stringify({ tally, rejected, outcomes }, null, 2)}\n`)
  process.stdout.write(`\nreport: ${report}\n`)
}

await main()
