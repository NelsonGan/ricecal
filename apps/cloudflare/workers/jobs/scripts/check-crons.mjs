// The registry and `wrangler.jsonc` must agree about which crons exist.
//
// The failure this prevents is silent and permanent: a job whose cron is not in
// `triggers.crons` is never delivered to, does not error, does not log, and the
// first sign of it is whatever the job was preventing. Nothing at runtime can
// notice, because the Worker is never woken up to notice with, so it is checked
// here and `pnpm typecheck` runs it.
//
// The other direction, a cron with no job behind it, is caught at runtime by the
// dispatcher, and is cheap to catch here too.
//
// Node strips the types off the registry natively, which is what lets this import
// the real list rather than pattern-matching the source.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { JOBS } from '../src/jobs/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = resolve(here, '../wrangler.jsonc')

/**
 * Strip comments from JSONC.
 *
 * Character by character rather than by regex, because the config is mostly
 * prose and a regex that does not understand strings would eat a `//` inside
 * one. Nothing here needs to be fast.
 */
function stripComments(source) {
  let out = ''
  let inString = false
  let inLine = false
  let inBlock = false

  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    const next = source[i + 1]

    if (inLine) {
      if (c === '\n') {
        inLine = false
        out += c
      }
      continue
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false
        i++
      }
      continue
    }
    if (inString) {
      out += c
      if (c === '\\') {
        out += next ?? ''
        i++
      } else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      continue
    }
    if (c === '/' && next === '/') {
      inLine = true
      i++
      continue
    }
    if (c === '/' && next === '*') {
      inBlock = true
      i++
      continue
    }
    out += c
  }
  return out
}

let config
try {
  config = JSON.parse(stripComments(readFileSync(configPath, 'utf8')))
} catch (error) {
  console.error(`check-crons: could not parse ${configPath}\n${error.message}`)
  process.exit(1)
}

const configured = new Set(config.triggers?.crons ?? [])
const registered = new Set(JOBS.map((job) => job.cron))

const problems = []

for (const job of JOBS) {
  if (!configured.has(job.cron)) {
    problems.push(
      `job "${job.name}" wants cron "${job.cron}", which is not in wrangler.jsonc ` +
        `triggers.crons. It would never run.`,
    )
  }
}

for (const cron of configured) {
  if (!registered.has(cron)) {
    problems.push(`cron "${cron}" is in wrangler.jsonc but no job in the registry claims it.`)
  }
}

// Two jobs on one cron is allowed — the dispatcher runs both — but it is worth
// saying out loud, because it is far more often a copied line than a decision.
const seen = new Map()
for (const job of JOBS) {
  const others = seen.get(job.cron)
  if (others) console.warn(`check-crons: "${job.name}" shares cron "${job.cron}" with "${others}"`)
  else seen.set(job.cron, job.name)
}

if (problems.length > 0) {
  console.error(`check-crons: ${problems.length} problem(s)`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`check-crons: ${JOBS.length} job(s), ${configured.size} cron(s), in agreement.`)
