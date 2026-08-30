/**
 * Grades the macros a photographed plate lands on, against a human reading.
 *
 *   pnpm bench:photos                  every case, once
 *   pnpm bench:photos --repeat=3       three passes, averaged
 *   pnpm bench:photos --grep=chicken   some of them
 *   pnpm bench:photos --save out.json  every figure, for a diff against a later run
 *
 * `eval:scan` drives the same pipeline but asks whether an entry landed in a
 * plausible band, which is the right question for "is this feature broken". It
 * could not answer the one that came in from a user: the breakdowns overstate
 * protein. Bands are loose by design, so a systematic bias of thirty percent sits
 * inside them and shows up as every case passing.
 *
 * This measures the bias instead: one reference figure per macro, and the number
 * reported is the signed mean error across the set, so "protein runs +46% and is
 * over on ten plates out of eleven" is a thing it can say. The summary is the
 * point; the per-case rows are for finding which plate to go and look at.
 *
 * The reference is a careful reading of each photograph by a person or a strong
 * model: every component named, weighed by eye against known portion sizes, and
 * priced from composition tables. It is not a weighing. Treat a 15% disagreement
 * as noise and a 40% one as a finding, and when a case looks wrong go and look at
 * the photograph rather than trusting this file. The failures this was built to
 * find are factor-of-two errors, and no reading this careful is out by that much.
 *
 * The photographs are not in the repo. They are somebody's lunch, so they live in
 * `apps/supabase/data/photo-bench/`, gitignored, one file per `file` below. Point
 * it at your own plates by dropping images there and describing them in
 * `photo-bench.cases.json`; the reference figures are the work, not the code.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import * as live from './lib/live.mjs'

const CASES_FILE = fileURLToPath(new URL('./photo-bench.cases.json', import.meta.url))
const PHOTO_DIR = fileURLToPath(new URL('../data/photo-bench/', import.meta.url))

const args = process.argv.slice(2)
const flag = (name) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=')

const grep = flag('grep')
const savePath = flag('save')
const repeat = Math.max(1, Number(flag('repeat') ?? 1))
const keep = args.includes('--keep')

const MACROS = ['kcal', 'protein_g', 'carbs_g', 'fat_g']
const pct = (got, want) => (want > 0 ? (got - want) / want : 0)
const asPct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`

/** One pass of one case through the deployed pipeline. */
async function runOne(kase, written) {
  const bytes = await readFile(`${PHOTO_DIR}${kase.file}`)
  written.photoKey = await live.upload(bytes)
  const scan = await live.scanPhoto(written.photoKey)

  if (!scan.body?.ok) throw new Error(`scan failed: ${scan.body?.error ?? scan.status}`)
  if (scan.body.food === false) throw new Error('answered "no food"')

  const ids = scan.body.entries.map((e) => e.id)
  if (!ids.length) throw new Error('scan wrote no entry')
  written.ids.push(...ids)

  // SUMMED over every entry, not read off the first. A photograph is one meal to
  // this benchmark and its reference figure is for the whole of it, but the vision
  // prompt is allowed to answer with more than one item when it thinks it sees
  // separate meals. Grading `entries[0]` against a whole-plate reference then
  // reports a large negative error that reads as the pipeline under-counting, when
  // what happened is that the harness looked at half the answer.
  const entries = await Promise.all(ids.map((id) => live.entry(id)))
  const parts = (await Promise.all(ids.map((id) => live.parts(id)))).flat()
  const items = await live.scanItems(scan.body.scanId)

  return {
    tier: items[0]?.resolved_tier ?? null,
    entries: ids.length,
    name: entries.map((e) => e.food_name).join(' + '),
    got: Object.fromEntries(MACROS.map((m) => [m, entries.reduce((t, e) => t + Number(e[m]), 0)])),
    parts: parts.map(
      (p) =>
        `${p.name} x${p.quantity} ${p.grams ?? '?'}g = ${p.kcal}kcal ${p.protein_g}P/${p.carbs_g}C/${p.fat_g}F`,
    ),
    claimed: (items[0]?.components ?? []).map(
      (c) =>
        `${c.name} x${c.count} ${c.grams}g = ${c.kcal}kcal ${c.protein_g}P/${c.carbs_g}C/${c.fat_g}F`,
    ),
    trace: scan.body.trace ?? [],
  }
}

const all = JSON.parse(await readFile(CASES_FILE, 'utf8'))
const cases = all.filter(
  (k) => !grep || `${k.file} ${k.dish}`.toLowerCase().includes(grep.toLowerCase()),
)
if (!cases.length) {
  console.error('no cases matched')
  process.exit(1)
}

console.log(`${cases.length} plates${repeat > 1 ? ` x ${repeat}` : ''}, against a read reference\n`)

const results = []
for (const kase of cases) {
  const runs = []
  for (let n = 0; n < repeat; n++) {
    const written = { ids: [], photoKey: null }
    try {
      runs.push(await runOne(kase, written))
    } catch (error) {
      console.log(`  ! ${kase.file}: ${error.message}`)
    } finally {
      if (!keep) {
        await Promise.all(written.ids.map((i) => live.removeEntry(i).catch(() => null)))
        if (written.photoKey) await live.removePhotos([written.photoKey]).catch(() => null)
      }
    }
  }
  if (!runs.length) continue

  // Averaged over the passes, because one pass of this pipeline is not a
  // measurement — the same photograph swings a long way run to run.
  const mean = Object.fromEntries(
    MACROS.map((m) => [m, runs.reduce((t, r) => t + r.got[m], 0) / runs.length]),
  )
  const errs = Object.fromEntries(MACROS.map((m) => [m, pct(mean[m], kase.reference[m])]))
  results.push({ file: kase.file, dish: kase.dish, reference: kase.reference, mean, errs, runs })

  const worst = Math.max(...MACROS.map((m) => Math.abs(errs[m])))
  const split = runs.some((r) => r.entries > 1) ? '  (came back as separate meals)' : ''
  console.log(
    `${worst > 0.4 ? '✗' : worst > 0.2 ? '~' : '✓'} ${kase.file}  tier ${runs.map((r) => r.tier).join(',')}${split}\n` +
      `    ${MACROS.map((m) => `${m.replace('_g', '')} ${mean[m].toFixed(0)}/${kase.reference[m]} ${asPct(errs[m])}`).join('   ')}`,
  )
}

// The line this file exists for. SIGNED, not absolute: a bias that is always in
// one direction is a different problem from noise of the same size, and only the
// sign tells them apart.
console.log('\n=== across the set')
for (const m of MACROS) {
  const es = results.map((r) => r.errs[m])
  const signed = es.reduce((t, e) => t + e, 0) / es.length
  const absolute = es.reduce((t, e) => t + Math.abs(e), 0) / es.length
  const over = es.filter((e) => e > 0).length
  console.log(
    `  ${m.replace('_g', '').padEnd(8)} bias ${asPct(signed).padStart(5)}   ` +
      `mean error ${(absolute * 100).toFixed(0)}%   over on ${over}/${es.length}`,
  )
}

if (savePath) {
  await writeFile(savePath, JSON.stringify({ results }, null, 2))
  console.log(`\nwrote ${savePath}`)
}
