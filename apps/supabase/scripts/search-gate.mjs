#!/usr/bin/env node
/**
 * Does the catalogue still find what a Malaysian means?
 *
 *   pnpm foods:gate                     grade it now
 *   pnpm foods:gate --save before       record a baseline
 *   pnpm foods:gate --against before    print only what MOVED
 *
 * Thirty queries and, for each, the dish somebody typing it is after. This is
 * the one gate a catalogue change has to pass, because loading data is the
 * change that can silently make the app worse: nothing errors, "nasi lemak"
 * just starts returning something else. Run `--save before`, load, then
 * `--against before`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CASES = JSON.parse(readFileSync(new URL('./search-gate.cases.json', import.meta.url), 'utf8'))
const DIR = new URL('../data/search-gate/', import.meta.url)

const URL_BASE = process.env.CATALOGUE_URL ?? 'https://catalogue.ricecal.app'
const TOKEN = process.env.CATALOGUE_TOKEN

if (!TOKEN) {
  console.error('CATALOGUE_TOKEN is not set — source .secrets/db.env first')
  process.exit(2)
}

const norm = (s) =>
  s
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const results = []
for (const { q, want } of CASES) {
  const started = Date.now()
  const res = await fetch(`${URL_BASE}/search?q=${encodeURIComponent(q)}&limit=5`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  const ms = Date.now() - started
  const body = await res.json()
  const names = (body.foods ?? []).map((f) => f.name)
  const rank = names.findIndex((n) => norm(n).includes(norm(want)))
  results.push({ q, want, rank, top: names[0] ?? '(nothing)', ms })
}

const top1 = results.filter((r) => r.rank === 0).length
const top5 = results.filter((r) => r.rank >= 0).length
const times = results.map((r) => r.ms).sort((a, b) => a - b)

console.log(
  `top-1 ${top1}/${results.length}   top-5 ${top5}/${results.length}   ` +
    `median ${times[Math.floor(times.length / 2)]}ms   slowest ${times.at(-1)}ms`,
)
for (const r of results) {
  if (r.rank !== 0) console.log(`  ${r.rank < 0 ? '✗' : '~'} ${r.q.padEnd(42)} → ${r.top}`)
}

const arg = (name) =>
  process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : null

const stats = {
  top1,
  top5,
  total: results.length,
  medianMs: times[Math.floor(times.length / 2)],
  slowestMs: times.at(-1),
}

const save = arg('save')
if (save) {
  mkdirSync(fileURLToPath(DIR), { recursive: true })
  writeFileSync(
    fileURLToPath(new URL(`${save}.json`, DIR)),
    `${JSON.stringify({ stats, results }, null, 2)}\n`,
  )
  console.log(`\nsaved baseline "${save}"`)
}

const against = arg('against')
if (against) {
  const before = JSON.parse(readFileSync(new URL(`${against}.json`, DIR), 'utf8'))
  const was = new Map(before.results.map((r) => [r.q, r]))
  console.log(`\nagainst "${against}": top-1 ${before.stats.top1} → ${top1}`)
  let moved = 0
  for (const r of results) {
    const b = was.get(r.q)
    if (!b || b.rank === r.rank) continue
    moved++
    const worse = r.rank < 0 || (b.rank >= 0 && r.rank > b.rank)
    console.log(
      `  ${worse ? 'WORSE' : 'better'}: ${r.q} — rank ${b.rank} → ${r.rank} (now "${r.top}")`,
    )
  }
  // The expected outcome of an additive load, and worth saying out loud: adding
  // three hundred thousand packaged rows moved nothing at all.
  if (!moved) console.log('  nothing moved')
}
