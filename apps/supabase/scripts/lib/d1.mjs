/**
 * SQL against the catalogue's D1 database, from a script.
 *
 * The counterpart to `sql.mjs`, which does the same job for Postgres. Both exist
 * because the two halves of this app's data live in different places and neither
 * has a client library that works from here: Postgres is reachable only through
 * the Management API, and D1 only through `wrangler`.
 *
 * `wrangler d1 execute --json` prints a banner before its JSON, so the output
 * has to be found rather than parsed — hence `sliceJson` below. That is the
 * whole reason this file exists instead of a one-line exec at each call site.
 */

import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)

const WORKER_DIR = fileURLToPath(new URL('../../../cloudflare/workers/catalogue/', import.meta.url))
const DATABASE = process.env.CATALOGUE_D1 ?? 'ricecal-d1-food-catalogue'

/**
 * How much SQL to send in one `--command`.
 *
 * An argument list has an OS-level ceiling (`ARG_MAX`), and a loader building
 * one statement per dish reaches it long before it reaches anything D1 cares
 * about. Splitting on statements rather than on bytes keeps every chunk valid
 * SQL; this is only the size at which to stop adding more.
 */
const CHUNK_BYTES = 90_000

function sliceJson(stdout) {
  const start = stdout.indexOf('[')
  if (start < 0) throw new Error(`no JSON in wrangler output: ${stdout.slice(0, 400)}`)
  return JSON.parse(stdout.slice(start))
}

async function run(args) {
  const { stdout } = await exec('pnpm', ['exec', 'wrangler', ...args], {
    cwd: WORKER_DIR,
    maxBuffer: 256 * 1024 * 1024,
  })
  return stdout
}

/**
 * Every statement in a wrangler answer reported success.
 *
 * A failing statement usually takes wrangler's exit code with it, and
 * `execFile` rejects on that — but not always, and the case where it does not
 * is the dangerous one: a batch of four hundred inserts that half applied,
 * reported nothing, and left the caller believing the load finished.
 */
function assertOk(stdout) {
  const failed = sliceJson(stdout).find((r) => r.success === false)
  if (failed) throw new Error(`D1 error: ${JSON.stringify(failed).slice(0, 400)}`)
}

/** One query, returning its rows. Remote by default — that is the live one. */
export async function d1(sql, { local = false } = {}) {
  const stdout = await run([
    'd1',
    'execute',
    DATABASE,
    local ? '--local' : '--remote',
    '--json',
    '--command',
    sql,
  ])
  assertOk(stdout)
  return sliceJson(stdout).flatMap((r) => r.results ?? [])
}

/**
 * Many statements, in chunks small enough to survive an argument list.
 *
 * NOT a transaction, and callers have to be built for that: each chunk commits
 * on its own, so a failure halfway leaves the earlier ones applied. Every writer
 * here is idempotent (`insert or replace`, `delete` then `insert` for one food
 * at a time) precisely so that re-running after a failure is the recovery.
 */
export async function d1batch(statements, { local = false, onProgress } = {}) {
  let done = 0
  let chunk = []
  let bytes = 0

  const flush = async () => {
    if (!chunk.length) return
    assertOk(
      await run([
        'd1',
        'execute',
        DATABASE,
        local ? '--local' : '--remote',
        '--json',
        '--command',
        chunk.join('\n'),
      ]),
    )
    done += chunk.length
    onProgress?.(done, statements.length)
    chunk = []
    bytes = 0
  }

  for (const statement of statements) {
    const sql = statement.endsWith(';') ? statement : `${statement};`
    if (bytes + sql.length > CHUNK_BYTES) await flush()
    chunk.push(sql)
    bytes += sql.length
  }
  await flush()
  return done
}

/** A SQL string literal for SQLite. */
export const q = (value) =>
  value === null || value === undefined ? 'null' : `'${String(value).replaceAll("'", "''")}'`

/** A number, or SQL null. Keeps `0` from becoming null the way `||` would. */
export const n = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? 'null'
    : String(Number(value))
