/**
 * Give catalogue rows a drawing, worked out from their own names.
 *
 *   pnpm foods:icons                    what it would do, writing nothing
 *   pnpm foods:icons --sample 60        more of the proposals, to read
 *   pnpm foods:icons --source usda_fdc  one source at a time
 *   pnpm foods:icons --grep beef        only names matching a pattern
 *   pnpm foods:icons --write            apply
 *
 * WHY THIS EXISTS
 *
 * A dish's icon is authored: `food-shape.mjs` reads it out of the research
 * payload's `"icon"` field and the loader writes it to `food.icon_set` /
 * `food.icon_name`. That works for the seven thousand dishes somebody sat down
 * and wrote, and not at all for the forty thousand imported from Open Food
 * Facts, USDA and the composition tables — which is why two rows both called
 * "Nasi Lemak" can differ only in whether anybody typed a filename beside one
 * of them.
 *
 * The matching lives in `functions/_shared/icon-match.ts`; the header there
 * explains why it is a phrase table rather than the edge functions' own
 * `guessIcon`. It sits with the edge functions rather than beside this script
 * because the barcode endpoint needs it too: `product` has no icon columns and
 * 3.2 million of them, so a packet's drawing is derived from its name at read
 * time instead of stored.
 *
 * SAFETY
 *
 * Every icon this proposes is checked against the real registry before anything
 * is written, and a name that is not offerable stops the run. That check is the
 * whole reason to have it: `icon_name` is free text in D1 (only the SET is an
 * enum in Postgres), so a typo is not an error anywhere — it is a row that
 * renders blank for ever, and looks exactly like a row that never had a drawing.
 */

import { matchIcon, PHRASE_COUNT, SCRIPT_TABLE, TABLE } from '../functions/_shared/icon-match.ts'
import { ICON_NAMES } from '../functions/_shared/icons.generated.ts'
import { ICON_LIST } from '../functions/_shared/icons.ts'
import { d1, d1batch, q } from './lib/d1.mjs'

const args = process.argv.slice(2)
const has = (name) => args.includes(`--${name}`)
const flag = (name) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? null : args[at + 1]
}

const WRITE = has('write')
const SAMPLE = Number(flag('sample') ?? 25)
const SOURCE = flag('source')
const GREP = flag('grep')

/** Which set each name belongs to, and whether it may be offered at all. */
const OFFERABLE = new Set(ICON_LIST.split(', '))
const SET_OF = new Map()
for (const set of Object.keys(ICON_NAMES)) {
  for (const name of ICON_NAMES[set]) if (!SET_OF.has(name)) SET_OF.set(name, set)
}

// -- The table is checked before the database is touched ---------------------
//
// A phrase table is written by hand and a hand-written filename is wrong sooner
// or later. Failing here costs a re-run; failing silently costs a catalogue of
// blank squares nobody can tell from rows that simply have no drawing.
const bad = []
// Both tables, and the script one especially: its phrases are in an alphabet
// nobody reviewing this file can spell-check by eye, so the registry is the
// only thing standing between a typo and a row that renders blank for ever.
for (const [phrase, icon] of [...Object.entries(TABLE), ...Object.entries(SCRIPT_TABLE)]) {
  if (icon === null) continue // a deliberate "no drawing"
  if (!SET_OF.has(icon)) bad.push(`${phrase} -> ${icon} (no such drawing)`)
  else if (!OFFERABLE.has(icon)) bad.push(`${phrase} -> ${icon} (not a meal)`)
}
if (bad.length) {
  process.stderr.write(`icon table is wrong:\n  ${bad.join('\n  ')}\n`)
  process.exit(1)
}

// -- Every drawing already in the catalogue still resolves -------------------
//
// `icon_set` and `icon_name` are two columns and nothing in D1 ties them
// together, so an update that touches one and not the other leaves a pair that
// names no file. It renders as an empty plate, which is indistinguishable from
// a row that never had a drawing — the same silent failure the table check
// above exists for, arrived at from the other direction. This caught 122 rows
// left behind by a correction pass that rewrote the name and forgot the set.
const live = await d1('select icon_set, icon_name from food where icon_name is not null')
const stale = live.filter((r) => SET_OF.get(r.icon_name) !== r.icon_set)
if (stale.length) {
  const seen = new Map()
  for (const r of stale) {
    const k = `${r.icon_set}/${r.icon_name} is really in ${SET_OF.get(r.icon_name) ?? '(no set)'}`
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  process.stderr.write(`${stale.length} rows carry an icon that resolves to nothing:\n`)
  for (const [k, n] of [...seen].sort((a, b) => b[1] - a[1])) {
    process.stderr.write(`  ${String(n).padStart(5)}  ${k}\n`)
  }
  process.exit(1)
}

const where = ['icon_name is null']
if (SOURCE) where.push(`source_id = ${q(SOURCE)}`)
if (GREP) where.push(`name like ${q(`%${GREP}%`)}`)

const rows = await d1(`select id, name, source_id from food where ${where.join(' and ')}`)
process.stdout.write(`${PHRASE_COUNT} phrases, ${rows.length} rows with no drawing\n`)

// `match` is the DRAWING's name and `row.name` is the food's. Keeping them
// under different keys is not fussiness: spreading one over the other logs
// every proposal under its icon's slug, which reads fine and reviews as
// nonsense.
const proposals = []
const bySource = new Map()
const byIcon = new Map()
for (const row of rows) {
  const stat = bySource.get(row.source_id) ?? { total: 0, hit: 0 }
  stat.total++
  const icon = matchIcon(row.name)
  if (icon) {
    const set = SET_OF.get(icon)
    if (!set) {
      process.stderr.write(`unmapped icon "${icon}" from "${row.name}"\n`)
      process.exit(1)
    }
    stat.hit++
    byIcon.set(icon, (byIcon.get(icon) ?? 0) + 1)
    proposals.push({ id: row.id, food: row.name, set, icon })
  }
  bySource.set(row.source_id, stat)
}

const pct = (n, d) => `${((n / (d || 1)) * 100).toFixed(1)}%`
process.stdout.write(
  `${proposals.length} would get one (${pct(proposals.length, rows.length)})\n\n`,
)
for (const [source, s] of [...bySource].sort((a, b) => b[1].total - a[1].total)) {
  process.stdout.write(
    `  ${source.padEnd(18)} ${String(s.hit).padStart(6)} / ${String(s.total).padEnd(7)} ${pct(s.hit, s.total).padStart(6)}\n`,
  )
}

process.stdout.write('\nmost-used drawings:\n')
for (const [icon, n] of [...byIcon].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  process.stdout.write(`  ${icon.padEnd(22)} ${n}\n`)
}

/** A spread through the proposals rather than the first N, which are one source. */
process.stdout.write('\nproposals:\n')
const step = Math.max(1, Math.floor(proposals.length / SAMPLE))
for (let i = 0; i < proposals.length && i / step < SAMPLE; i += step) {
  const p = proposals[i]
  process.stdout.write(`  ${p.food.slice(0, 62).padEnd(64)} ${p.set}/${p.icon}\n`)
}

if (!WRITE) {
  process.stdout.write('\nNothing written. Re-run with --write to apply.\n')
  process.exit(0)
}

await d1batch(
  proposals.map(
    (p) => `update food set icon_set = ${q(p.set)}, icon_name = ${q(p.icon)} where id = ${q(p.id)}`,
  ),
  { onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`) },
)
process.stdout.write('\ndone\n')
