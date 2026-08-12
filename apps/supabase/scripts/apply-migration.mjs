#!/usr/bin/env node
/**
 * Applies one migration file to the linked project, and records it.
 *
 * `supabase db push` is the normal route and it needs a database password this
 * machine does not have; the Management API query endpoint is what it has
 * instead (see scripts/lib/sql.mjs). The endpoint will run the file perfectly
 * well — what it will not do is tell the migration ledger that it happened, and
 * a schema change applied without its ledger row is exactly what
 * `supabase-drift` goes red on the next night. So this does both, in that
 * order, and refuses to run a file whose version is already recorded.
 *
 *   node apps/supabase/scripts/apply-migration.mjs 20260811093504_catalogue_revamp.sql
 *   node apps/supabase/scripts/apply-migration.mjs <file> --dry-run
 *
 * The version and the name come from the FILENAME rather than from arguments,
 * because the whole point is that the remote ledger and the repo agree about
 * which file was applied.
 */

import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { quote, runSql } from './lib/sql.mjs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const target = args.find((a) => !a.startsWith('--'))

if (!target) {
  console.error('usage: apply-migration.mjs <migration file> [--dry-run]')
  process.exit(1)
}

const path = resolve(
  target.includes('/') ? target : `${import.meta.dirname}/../migrations/${target}`,
)
const file = basename(path)
const match = file.match(/^(\d{14})_(.+)\.sql$/)
if (!match) {
  console.error(`${file} is not a migration filename (<14 digits>_<name>.sql)`)
  process.exit(1)
}
const [, version, name] = match

const sql = readFileSync(path, 'utf8')

const already = await runSql(
  `select 1 from supabase_migrations.schema_migrations where version = ${quote(version)}`,
)
if (already.length > 0) {
  console.log(`${version} is already in the ledger. Nothing to do.`)
  process.exit(0)
}

console.log(`${dryRun ? 'would apply' : 'applying'} ${file} (${sql.length} bytes)`)
if (dryRun) process.exit(0)

// Not wrapped in a transaction here: the endpoint runs the body as one
// implicit transaction already, and a file that opens its own would leave this
// one nesting. A failure therefore leaves nothing behind and the ledger
// unwritten, which is the state a retry expects.
await runSql(sql)

await runSql(
  `insert into supabase_migrations.schema_migrations (version, name)
   values (${quote(version)}, ${quote(name)})
   on conflict (version) do nothing`,
)

console.log(`applied and recorded ${version}`)
