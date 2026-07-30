/**
 * Regenerates apps/mobile/src/lib/database.types.ts from the local stack.
 *
 *   pnpm db:types
 *
 * A plain `supabase gen types typescript --local > …` would work, except that
 * it also erases the "do not edit" banner every time — so the one warning that
 * stops someone hand-patching a column into the file survives exactly until
 * the first regeneration. Prepending it here means it cannot be lost.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Anchored to this file rather than to the working directory. The Supabase
// project moved from the repo root to apps/, and a script that resolves its
// paths from `cwd` only works when it is launched from exactly one place —
// which is not obvious from the outside and fails as a wrong-looking `supabase`
// error rather than a path error.
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const WORKDIR = fileURLToPath(new URL('../..', import.meta.url))

const OUT = `${REPO_ROOT}apps/mobile/src/lib/database.types.ts`

const BANNER = `/**
 * GENERATED FILE — do not edit.
 *
 *   pnpm db:types
 *
 * which runs \`supabase gen types typescript --local\` against the local stack,
 * so the local database must be up to date: \`pnpm db:reset\` first if you have
 * just pulled a migration. Nothing in CI checks this file against the schema,
 * so a stale copy shows up as a type error on a column that plainly exists.
 *
 * Postgres enums arrive as string-literal unions, which is the reason the
 * schema uses enums for its closed domains — \`Database['public']['Enums']['meal']\`
 * is exactly the \`Meal\` union the screens already speak.
 */

`

const generated = execFileSync(
  'supabase',
  ['gen', 'types', 'typescript', '--local', '--workdir', WORKDIR],
  {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  },
)

writeFileSync(OUT, BANNER + generated)

// `supabase gen types` formats to its own taste, not this repo's. Without this
// the file lands unformatted and `biome check .` fails the build on a file
// nobody edited. The committed copy was tidied by hand once, which works right
// up until the next regeneration.
execFileSync('npx', ['biome', 'format', '--write', OUT], { stdio: 'inherit' })

process.stdout.write(`${OUT} regenerated (${generated.split('\n').length} lines)\n`)
